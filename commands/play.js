const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, StreamType } = require('@discordjs/voice');
const play = require('play-dl');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static'); // ensures ffmpeg is available on Render
const ytDlpPath = path.join(__dirname, '..', 'bin', 'yt-dlp'); // adjust path if needed
const cookiesPath = path.join('/tmp', 'yt-cookies.txt');

/**
 * Write cookies from env (base64) to a temporary file on startup if provided.
 */
if (process.env.YT_COOKIES_B64) {
    try {
        fs.writeFileSync(cookiesPath, Buffer.from(process.env.YT_COOKIES_B64, 'base64'));
        console.log('✅ YT cookies written to', cookiesPath);
    } catch (e) {
        console.warn('❌ Failed to write YT cookies:', e);
    }
}

/**
 * Create an audio resource streaming via the bundled yt-dlp binary.
 */
function createYtDlpResource(url) {
    const args = [
        '--no-playlist',
        '--rm-cache-dir',
        '-f', 'bestaudio[ext=m4a]/bestaudio/best',
        '-o', '-', // output to stdout
    ];

    if (fs.existsSync(cookiesPath)) {
        args.push('--cookies', cookiesPath);
    }

    args.push(url);

    const proc = spawn(ytDlpPath, args, { stdio: ['ignore', 'pipe', 'inherit'] });
    proc.on('error', e => console.error('yt-dlp spawn error:', e));
    const resource = createAudioResource(proc.stdout, { inputType: StreamType.Arbitrary, inlineVolume: true });
    resource.process = proc;
    return resource;
}

/**
 * Kill yt-dlp process if attached.
 */
function killResourceProcess(resource) {
    try {
        if (resource?.process && !resource.process.killed) {
            resource.process.kill('SIGKILL');
        }
    } catch (e) {
        // ignore
    }
}

/**
 * Play next song in queue or leave channel after inactivity.
 */
async function playNext(guildId, client) {
    const serverQueue = client.queues.get(guildId);

    if (!serverQueue || serverQueue.songs.length === 0) {
        if (client.inactivityTimers?.has(guildId)) clearTimeout(client.inactivityTimers.get(guildId));

        const timer = setTimeout(async () => {
            const currentQueue = client.queues.get(guildId);
            if (currentQueue && currentQueue.connection) {
                if (currentQueue.currentResource) killResourceProcess(currentQueue.currentResource);
                currentQueue.connection.destroy();
                client.queues.delete(guildId);
                await currentQueue.textChannel.send('🛑 Left voice channel due to inactivity.');
            }
            client.inactivityTimers.delete(guildId);
        }, client.config?.inactivityTimeout || 300_000); // 5min default

        client.inactivityTimers.set(guildId, timer);
        return;
    }

    const song = serverQueue.songs[0];

    try {
        let resource = null;

        // try play-dl first
        try {
            const stream = await play.stream(song.url, { discordPlayerCompatibility: true });
            resource = createAudioResource(stream.stream, {
                inputType: stream.type || StreamType.Arbitrary,
                inlineVolume: true
            });
        } catch (err) {
            console.warn('play-dl failed, falling back to yt-dlp:', err?.message || err);
            resource = createYtDlpResource(song.url);
        }

        // cleanup old resource
        if (serverQueue.currentResource) killResourceProcess(serverQueue.currentResource);

        serverQueue.currentResource = resource;
        if (resource.volume) resource.volume.setVolume(0.7);

        serverQueue.player.play(resource);
        await serverQueue.textChannel.send(`🎵 Now playing: **${song.title}**`);

        if (client.inactivityTimers?.has(guildId)) {
            clearTimeout(client.inactivityTimers.get(guildId));
            client.inactivityTimers.delete(guildId);
        }
    } catch (error) {
        console.error('Playback error:', error);
        if (serverQueue.textChannel) {
            const msg = await serverQueue.textChannel.send(`❌ Error playing **${song.title}**, skipping...`);
            setTimeout(() => msg.delete().catch(() => {}), 10_000);
        }
        if (serverQueue.currentResource) killResourceProcess(serverQueue.currentResource);
        serverQueue.songs.shift();
        playNext(guildId, client);
    }
}

module.exports = {
    name: 'play',
    aliases: ['p'],
    description: 'Plays music from YouTube/Spotify/SC/DZ with yt-dlp fallback.',
    async execute(message, args, client) {
        const voiceChannel = message.member?.voice?.channel;
        if (!voiceChannel) return message.reply('❌ You must join a voice channel first!');
        if (!args.length) return message.reply('❌ Please provide a song name or link!');

        const query = args.join(' ');
        const searchMsg = await message.reply('🔍 Searching...');

        try {
            let metadata = null;
            const isSpotify = query.includes('spotify.com');
            const isYouTube = play.yt_validate(query) !== false;

            // metadata detection
            if (isSpotify && play.sp_validate(query)) {
                const sp = await play.spotify(query);
                metadata = { title: sp.name, artist: sp.artists?.[0]?.name, source: 'Spotify' };
            } else if (isYouTube) {
                try {
                    const info = await play.video_info(query);
                    metadata = { title: info.video_details.title, artist: info.video_details.author?.name, url: info.video_details.url, source: 'YouTube' };
                } catch {
                    const yt = await play.search(query, { limit: 1, source: 'yt_search' });
                    if (yt?.length) metadata = { title: yt[0].title, artist: yt[0].channel?.name, url: yt[0].url, source: 'YouTube' };
                }
            } else {
                const yt = await play.search(query, { limit: 1, source: 'yt_search' });
                if (yt?.length) metadata = { title: yt[0].title, artist: yt[0].channel?.name, url: yt[0].url, source: 'YouTube' };
            }

            if (!metadata) return searchMsg.edit('❌ Could not find song info.');

            await searchMsg.edit(`✅ Found: **${metadata.title}** (${metadata.source})`);

            const song = { title: metadata.title, url: metadata.url || query };

            let serverQueue = client.queues.get(message.guild.id);

            if (!serverQueue) {
                const connection = joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: message.guild.id,
                    adapterCreator: message.guild.voiceAdapterCreator,
                    selfDeaf: true
                });

                const player = createAudioPlayer();
                player.on(AudioPlayerStatus.Idle, () => {
                    const q = client.queues.get(message.guild.id);
                    if (q) {
                        if (q.currentResource) killResourceProcess(q.currentResource);
                        q.songs.shift();
                        playNext(message.guild.id, client);
                    }
                });

                player.on('error', err => {
                    console.error('Player error:', err);
                    const q = client.queues.get(message.guild.id);
                    if (q) {
                        if (q.currentResource) killResourceProcess(q.currentResource);
                        q.textChannel.send('⚠️ Player error, skipping...').catch(() => {});
                        q.songs.shift();
                        playNext(message.guild.id, client);
                    }
                });

                connection.subscribe(player);

                serverQueue = {
                    textChannel: message.channel,
                    voiceChannel,
                    connection,
                    player,
                    songs: [song],
                    currentResource: null
                };

                client.queues.set(message.guild.id, serverQueue);
                playNext(message.guild.id, client);
            } else {
                serverQueue.songs.push(song);
                await searchMsg.edit(`✅ Added to queue: **${song.title}**`);
            }
        } catch (err) {
            console.error('Main play error:', err);
            await searchMsg.edit(`❌ Unexpected error: ${err.message || err}`);
        }
    }
};
