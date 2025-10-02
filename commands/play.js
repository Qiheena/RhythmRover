const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const play = require('play-dl');

async function playNext(guildId, client) {
    const serverQueue = client.queues.get(guildId);
    if (!serverQueue || serverQueue.songs.length === 0) {
        if (client.inactivityTimers.has(guildId)) {
            clearTimeout(client.inactivityTimers.get(guildId));
        }
        const timer = setTimeout(() => {
            if (serverQueue && serverQueue.connection) {
                serverQueue.connection.destroy();
                client.queues.delete(guildId);
            }
        }, client.config.inactivityTimeout);
        client.inactivityTimers.set(guildId, timer);
        return;
    }

    const song = serverQueue.songs[0];

    try {
        const stream = await play.stream(song.url);
        const resource = createAudioResource(stream.stream, {
            inputType: stream.type,
            inlineVolume: true
        });
        
        resource.volume.setVolume(0.7);
        
        serverQueue.player.play(resource);
        serverQueue.textChannel.send(`🎵 Now playing: **${song.title}**`);
        
        if (client.inactivityTimers.has(guildId)) {
            clearTimeout(client.inactivityTimers.get(guildId));
            client.inactivityTimers.delete(guildId);
        }
    } catch (error) {
        console.error('Playback error:', error);
        serverQueue.textChannel.send('❌ Error playing this song, skipping...');
        serverQueue.songs.shift();
        playNext(guildId, client);
    }
}

module.exports = {
    name: 'play',
    aliases: ['p'],
    description: 'Play a song from Spotify, SoundCloud, or by searching',
    async execute(message, args, client) {
        const voiceChannel = message.member?.voice?.channel;
        if (!voiceChannel) {
            return message.reply('❌ You need to be in a voice channel!');
        }

        if (!args.length) {
            return message.reply('❌ Please provide a song name or link!');
        }

        const query = args.join(' ');
        const searchMsg = await message.reply(`🔍 Searching for best match...`);

        try {
            let songInfo;
            
            if (play.sp_validate(query)) {
                const spotifyData = await play.spotify(query);
                if (spotifyData.type === 'track') {
                    const searchQuery = `${spotifyData.name} ${spotifyData.artists.map(a => a.name).join(' ')}`;
                    const searchResults = await play.search(searchQuery, { limit: 1, source: { youtube: 'video' } });
                    if (searchResults.length > 0) {
                        songInfo = await play.video_info(searchResults[0].url);
                    }
                }
            } else if (play.so_validate(query)) {
                songInfo = await play.soundcloud(query);
            } else {
                const searchResults = await play.search(query, { limit: 1, source: { youtube: 'video' } });
                if (searchResults.length > 0) {
                    songInfo = await play.video_info(searchResults[0].url);
                }
            }

            if (!songInfo) {
                return searchMsg.edit('❌ No results found! Try a different search.');
            }

            const song = {
                title: songInfo.video_details?.title || 'Unknown',
                url: songInfo.video_details?.url || query
            };

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
                    const queue = client.queues.get(message.guild.id);
                    if (queue) {
                        queue.songs.shift();
                        playNext(message.guild.id, client);
                    }
                });

                player.on('error', error => {
                    console.error('Player error:', error);
                    const queue = client.queues.get(message.guild.id);
                    if (queue) {
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
                    songs: [song]
                };

                client.queues.set(message.guild.id, serverQueue);
                await searchMsg.edit(`✅ **${song.title}**\n🎵 Playing best quality audio`);
                playNext(message.guild.id, client);
            } else {
                serverQueue.songs.push(song);
                await searchMsg.edit(`✅ Added to queue: **${song.title}**`);
            }

        } catch (error) {
            console.error('Play error:', error);
            await searchMsg.edit(`❌ Error: ${error.message || 'Could not play!'}\nTry a different song.`);
        }
    }
};
