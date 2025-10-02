module.exports = {
    name: 'play',
    aliases: ['p'],
    description: 'Play a song from Spotify or search by name',
    async execute(message, args, client) {
        const channel = message.member?.voice?.channel;
        if (!channel) {
            return message.reply('❌ You need to be in a voice channel to play music!');
        }

        if (!args.length) {
            return message.reply('❌ Please provide a song name or Spotify link!');
        }

        const query = args.join(' ');

        try {
            await message.reply(`🔍 Searching for: **${query}**`);

            await client.player.play(channel, query, {
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

        } catch (error) {
            console.error('Play command error:', error);
            await message.reply(`❌ Error: ${error.message || 'Could not play the song!'}`);
        }
    }
};
