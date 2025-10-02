const { useQueue } = require('discord-player');

const inactivityTimers = new Map();

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

            const { track } = await client.player.play(channel, query, {
                nodeOptions: {
                    metadata: {
                        channel: message.channel,
                        client: message.guild.members.me,
                        requestedBy: message.user
                    },
                    selfDeaf: true,
                    volume: 50,
                    leaveOnEmpty: true,
                    leaveOnEmptyCooldown: 120000,
                    leaveOnEnd: false,
                    leaveOnStop: false
                }
            });

            const queue = useQueue(message.guild.id);
            
            if (inactivityTimers.has(message.guild.id)) {
                clearTimeout(inactivityTimers.get(message.guild.id));
                inactivityTimers.delete(message.guild.id);
            }

            queue.node.on('playerStart', () => {
                if (inactivityTimers.has(message.guild.id)) {
                    clearTimeout(inactivityTimers.get(message.guild.id));
                }
            });

            queue.node.on('emptyChannel', () => {
                const timer = setTimeout(() => {
                    if (queue && queue.connection) {
                        queue.delete();
                        inactivityTimers.delete(message.guild.id);
                    }
                }, client.config.inactivityTimeout);
                
                inactivityTimers.set(message.guild.id, timer);
            });

            queue.node.on('disconnect', () => {
                if (inactivityTimers.has(message.guild.id)) {
                    clearTimeout(inactivityTimers.get(message.guild.id));
                    inactivityTimers.delete(message.guild.id);
                }
            });

            await message.channel.send(`🎵 Now playing: **${track.title}** by **${track.author}**`);

        } catch (error) {
            console.error('Play command error:', error);
            await message.reply(`❌ Error: ${error.message || 'Could not play the song!'}`);
        }
    }
};
