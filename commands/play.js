const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, StreamType } = require('@discordjs/voice');
const play = require('play-dl');

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
        // Create a stream from the SoundCloud or Deezer URL
        const stream = await play.stream(song.url, { discordPlayerCompatibility: true });
        const resource = createAudioResource(stream.stream, {
            inputType: stream.type || StreamType.Arbitrary,
            inlineVolume: true
        });

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
        serverQueue.songs.shift();
        setTimeout(() => errorMsg.delete().catch(() => {}), 10_000);
        playNext(guildId, client); // Try the next song
    }
}

module.exports = {
    name: 'play',
    aliases: ['p'],
    description: 'Uses YouTube/Spotify for metadata and streams from SoundCloud/Deezer.',
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
            } else { // Default to YouTube for search terms and YouTube links
                const yt_info = await play.search(query, { limit: 1 });
                if (yt_info.length === 0) {
                    return searchMsg.edit('❌ No results found on YouTube for your query.');
                }
                const video = yt_info[0];
                metadata = { title: video.title, artist: video.channel?.name, source: 'YouTube' };
            }

            if (!metadata || !metadata.title) {
                return searchMsg.edit('❌ Could not extract song details. Please try again.');
            }

            // --- Step 2: Find a Streamable Source from SoundCloud or Deezer ---
            const streamQuery = metadata.artist ? `${metadata.artist} - ${metadata.title}` : metadata.title;
            await searchMsg.edit(`✅ Metadata found: **${metadata.title}** (from ${metadata.source}).\n🛰️ Searching for a high-quality stream on SoundCloud/Deezer...`);

            let streamUrl = null;
            // First, search on SoundCloud
            const scResults = await play.search(streamQuery, { limit: 1, source: { soundcloud: 'tracks' } });
            if (scResults.length > 0) {
                streamUrl = scResults[0].url;
            } else {
                // If not on SoundCloud, search on Deezer
                const dzResults = await play.search(streamQuery, { limit: 1, source: { deezer: 'track' } });
                if (dzResults.length > 0) {
                    streamUrl = dzResults[0].url;
                } else {
                    return searchMsg.edit(`❌ Could not find a streamable source for **${metadata.title}** on either SoundCloud or Deezer.`);
                }
            }
            
            // --- Step 3: Create the song object and manage the queue ---
            const song = {
                title: metadata.title, // The display title from YT/Spotify
                url: streamUrl,        // The streamable URL from SC/Deezer
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
                        queue.songs.shift(); // Remove the song that just finished
                        playNext(message.guild.id, client);
                    }
                });

                player.on('error', error => {
                    console.error('Player error:', error);
                    const queue = client.queues.get(message.guild.id);
                    if (queue) {
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
