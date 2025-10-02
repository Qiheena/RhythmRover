//GitHub Copilot Chat Assistant

const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, StreamType } = require('@discordjs/voice');
const play = require('play-dl');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static'); // ensures ffmpeg available in render
const ytDlpPath = path.join(__dirname, '..', 'bin', 'yt-dlp'); // adjust if your structure differs
const cookiesPath = path.join('/tmp', 'yt-cookies.txt');

/**
 * Write cookies from env (base64) to a temporary file on startup if provided.
 * Do NOT commit cookies.txt to repo. Store base64 in YT_COOKIES_B64 env on Render.
 */
if (process.env.YT_COOKIES_B64) {
    try {
        fs.writeFileSync(cookiesPath, Buffer.from(process.env.YT_COOKIES_B64, 'base64'));
        console.log('YT cookies written to', cookiesPath);
    } catch (e) {
        console.warn('Failed to write YT cookies:', e);
    }
}

/**
 * Create an audio resource streaming via the bundled yt-dlp binary.
 * Attaches the spawned process to the resource as resource.process for cleanup.
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
 * Cleanup helper to kill any spawned yt-dlp process attached to resource.
 */
function killResourceProcess(resource) {
    try {
        if (resource && resource.process && !resource.process.killed) {
            resource.process.kill('SIGKILL');
        }
    } catch (e) {
        // ignore
    }
}

/**
 * Plays the next song in the queue.
 * If the queue is empty, it sets a timer to leave the voice channel due to inactivity.
 * @param {string} guildId The ID of the guild.
 * @param {object} client The Discord client instance.
 */
async function playNext(guildId, client) {
    const serverQueue = client.queues.get(guildId);

    // If queue is empty or doesn't exist, start inactivity timer
    if (!serverQueue || serverQueue.songs.length === 0) {
        if (client.inactivityTimers?.has(guildId)) {
            clearTimeout(client.inactivityTimers.get(guildId));
        }
        const timer = setTimeout(async () => {
            const currentQueue = client.queues.get(guildId);
            if (currentQueue && currentQueue.connection) {
                // cleanup any yt-dlp process
                if (currentQueue.currentResource) killResourceProcess(currentQueue.currentResource);
                currentQueue.connection.destroy();
                client.queues.delete(guildId);
                await currentQueue.textChannel.send('🛑 Left voice channel due to inactivity.');
            }
            client.inactivityTimers.delete(guildId);
        }, client.config?.inactivityTimeout || 300_000); // 5 minutes default
        
        client.inactivityTimers.set(guildId, timer);
        return;
    }

    const song = serverQueue.songs[0];

    try {
        // Try play-dl stream first (works for many YouTube links)
        let resource = null;
        try {
            const stream = await play.stream(song.url, { discordPlayerCompatibility: true });
            resource = createAudioResource(stream.stream, {
                inputType: stream.type || StreamType.Arbitrary,
                inlineVolume: true
            });
        } catch (innerErr) {
            console.warn('play.stream failed, falling back to yt-dlp:', innerErr?.message || innerErr);
            // Fallback to yt-dlp binary
            resource = createYtDlpResource(song.url);
        }

        // Ensure we clean previous resource processes
        if (serverQueue.currentResource) {
            killResourceProcess(serverQueue.currentResource);
            serverQueue.currentResource = null;
        }

        // Attach current resource for later cleanup on skip/stop
        serverQueue.currentResource = resource;

        // Set a default volume
        if (resource.volume) resource.volume.setVolume(0.7);

        serverQueue.player.play(resource);
        await serverQueue.textChannel.send(`🎵 Now playing: **${song.title}**`);

        // Clear inactivity timer when playback starts
        if (client.inactivityTimers?.has(guildId)) {
            clearTimeout(client.inactivityTimers.get(guildId));
            client.inactivityTimers.delete(guildId);
        }
    } catch (error) {
        console.error('Playback error:', error);
        const errorMsg = await serverQueue.textChannel.send(`❌ Error playing **${song.title}**. Skipping...`);
        // cleanup if fallback process present
        if (serverQueue.currentResource) killResourceProcess(serverQueue.currentResource);
        serverQueue.songs.shift();
        setTimeout(() => errorMsg.delete().catch(() => {}), 10_000);
        // proceed to next song
        playNext(guildId, client);
    }
}

module.exports = {
    name: 'play',
    aliases: ['p'],
    description: 'Uses YouTube/Spotify for metadata and streams with yt-dlp fallback.',
    async execute(message, args, client) {
        const voiceChannel = message.member?.voice?.channel;
        if (!voiceChannel) {
            return message.reply('❌ You need to be in a voice channel to play music!');
        }

        if (!args.length) {
            return message.reply('❌ Please provide a song name or a YouTube/Spotify link!');
        }

        const query = args.join(' ');
        const searchMsg = await message.reply('🔍 Searching for song metadata...');

        try {
            let metadata;
            const isSpotify = query.includes('spotify.com');
            const isYouTube = play.yt_validate(query) !== false;

            // --- Step 1: Get Metadata from YouTube or Spotify ---
            if (isSpotify) {
                if (play.sp_validate(query)) {
                    const sp_data = await play.spotify(query);
                    metadata = { title: sp_data.name, artist: sp_data.artists?.[0]?.name, source: 'Spotify' };
                } else {
                    return searchMsg.edit('❌ The provided Spotify link is invalid.');
                }
            } else if (isYouTube) {
                // If the user pasted a YouTube link, get video info directly
                try {
                    const info = await play.video_info(query);
                    metadata = { title: info.video_details.title, artist: info.video_details.author?.name, source: 'YouTube', url: info.video_details.url || query };
                } catch (e) {
                    // fallback to searching if direct info fails
                    const yt_info = await play.search(query, { limit: 1, source: 'yt_search' });
                    if (!yt_info || yt_info.length === 0) {
                        return searchMsg.edit('❌ No results found on YouTube for your query.');
                    }
                    const video = yt_info[0];
                    metadata = { title: video.title, artist: video.channel?.name, source: 'YouTube', url: video.url };
                }
            } else {
                // For plain search terms, explicitly search YouTube only
                const yt_info = await play.search(query, { limit: 1, source: 'yt_search' });
                if (!yt_info || yt_info.length === 0) {
                    return searchMsg.edit('❌ No results found on YouTube for your query.');
                }
                const video = yt_info[0];
                metadata = { title: video.title, artist: video.channel?.name, source: 'YouTube', url: video.url };
            }

            if (!metadata || !metadata.title) {
                return searchMsg.edit('❌ Could not extract song details. Please try again.');
            }

            // --- Step 2: Find a Streamable Source from SoundCloud/Deezer or fallback to YouTube ---
            const streamQuery = metadata.artist ? `${metadata.artist} - ${metadata.title}` : metadata.title;
            await searchMsg.edit(`✅ Metadata found: **${metadata.title}** (from ${metadata.source}).\n🛰️ Searching for a high-quality stream...`);

            let streamUrl = null;

            // Try SoundCloud explicitly (only if desired). Use explicit provider string 'sc_search'
            try {
                const scResults = await play.search(streamQuery, { limit: 1, source: 'sc_search' });
                if (scResults && scResults.length > 0) {
                    streamUrl = scResults[0].url;
                }
            } catch (err) {
                console.warn('SoundCloud search failed:', err?.message || err);
            }

            // If not found, try Deezer explicitly
            if (!streamUrl) {
                try {
                    const dzResults = await play.search(streamQuery, { limit: 1, source: 'dz_search' });
                    if (dzResults && dzResults.length > 0) {
                        streamUrl = dzResults[0].url;
                    }
                } catch (err) {
                    console.warn('Deezer search failed:', err?.message || err);
                }
            }

            // If still no streamable SC/DZ, fallback to YouTube URL (metadata may already have URL)
            if (!streamUrl) {
                if (metadata.url) streamUrl = metadata.url;
                else {
                    const ytFallback = await play.search(streamQuery, { limit: 1, source: 'yt_search' });
                    if (ytFallback && ytFallback.length > 0) streamUrl = ytFallback[0].url;
                }
            }

            if (!streamUrl) {
                return searchMsg.edit(`❌ Could not find a streamable source for **${metadata.title}**.`);
            }
            
            // --- Step 3: Create the song object and manage the queue ---
            const song = {
                title: metadata.title,
                url: streamUrl,
            };

            let serverQueue = client.queues.get(message.guild.id);

            if (!serverQueue) {
                const connection = joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: message.guild.id,
                    adapterCreator: message.guild.voiceAdapterCreator,
                    selfDeaf: true,
                });

                const player = createAudioPlayer();

                player.on(AudioPlayerStatus.Idle, () => {
                    const queue = client.queues.get(message.guild.id);
                    if (queue) {
                        // cleanup process of currentResource if any
                        if (queue.currentResource) {
                            killResourceProcess(queue.currentResource);
                            queue.currentResource = null;
                        }
                        queue.songs.shift(); // Remove the song that just finished
                        playNext(message.guild.id, client);
                    }
                });

                player.on('error', error => {
                    console.error('Player error:', error);
                    const queue = client.queues.get(message.guild.id);
                    if (queue) {
                        // cleanup process
                        if (queue.currentResource) {
                            killResourceProcess(queue.currentResource);
                            queue.currentResource = null;
                        }
                        queue.textChannel.send('An error occurred with the player, skipping to the next song.').catch(console.error);
                        queue.songs.shift();
                        playNext(message.guild.id, client);
                    }
                });

                connection.subscribe(player);

                serverQueue = {
                    textChannel: message.channel,
                    voiceChannel: voiceChannel,
                    connection: connection,
                    player: player,
                    songs: [song],
                    currentResource: null,
                };

                client.queues.set(message.guild.id, serverQueue);
                await searchMsg.edit(`✅ Added to queue: **${song.title}**\n*Now starting playback...*`);
                playNext(message.guild.id, client);
            } else {
                serverQueue.songs.push(song);
                await searchMsg.edit(`✅ Added to queue: **${song.title}**`);
            }

        } catch (error) {
            console.error('Main play error:', error);
            await searchMsg.edit(`❌ An unexpected error occurred: ${error.message}`).catch(() => {});
        }
    }
};
