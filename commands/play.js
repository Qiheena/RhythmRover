module.exports = {
    name: 'play',
    aliases: ['p'],
    description: 'Play a song from Spotify or search by name',
    async execute(message, args, client) {
        const channel = message.member?.voice?.channel;
        if (!channel) {
            return message.reply('❌ You need to be in a voice channel!');
        }

        if (!args.length) {
            return message.reply('❌ Please provide a song name or link!');
        }

        const query = args.join(' ');
        const searchMsg = await message.reply(`🔍 Searching for best match...`);

        try {
            const isSpotify = query.includes('spotify.com') || query.includes('spotify:');
            const isSoundCloud = query.includes('soundcloud.com');
            
            const searchEngine = isSpotify ? 'spotify' : 
                                isSoundCloud ? 'soundcloud' : 
                                'soundcloud';

            const searchResult = await client.player.search(query, {
                requestedBy: message.author,
                searchEngine: searchEngine
            });

            if (!searchResult || !searchResult.hasTracks()) {
                return searchMsg.edit('❌ No results found! Try a different search.');
            }

            const track = searchResult.tracks[0];

            await client.player.play(channel, searchResult, {
                nodeOptions: {
                    metadata: {
                        channel: message.channel,
                        client: message.guild.members.me,
                        requestedBy: message.author
                    },
                    selfDeaf: true,
                    volume: 70,
                    leaveOnEmpty: true,
                    leaveOnEmptyCooldown: 120000,
                    leaveOnEnd: false,
                    leaveOnStop: false
                }
            });

            await searchMsg.edit(`✅ **${track.title}** by ${track.author}\n🎵 Playing best quality audio`);

        } catch (error) {
            console.error('Play error:', error);
            await searchMsg.edit(`❌ Could not play: ${error.message || 'Unknown error'}\nTry a different song.`);
        }
    }
};
