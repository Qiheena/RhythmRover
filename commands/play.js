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
        const searchMsg = await message.reply(`🔍 Searching...`);

        try {
            const searchResult = await client.player.search(query, {
                requestedBy: message.author,
                searchEngine: query.includes('spotify') ? 'spotify' : 
                              query.includes('soundcloud') ? 'soundcloud' : 
                              'youtube'
            });

            if (!searchResult || !searchResult.hasTracks()) {
                return searchMsg.edit('❌ No results found! Try a different search.');
            }

            await client.player.play(channel, searchResult, {
                nodeOptions: {
                    metadata: {
                        channel: message.channel,
                        client: message.guild.members.me,
                        requestedBy: message.author
                    },
                    selfDeaf: true,
                    volume: 50,
                    leaveOnEmpty: true,
                    leaveOnEmptyCooldown: 120000,
                    leaveOnEnd: false,
                    leaveOnStop: false
                }
            });

            await searchMsg.edit('✅ Added to queue!');

        } catch (error) {
            console.error('Play error:', error);
            await searchMsg.edit(`❌ Error: ${error.message || 'Could not play!'}\nTry a different song or link.`);
        }
    }
};
