const { useQueue } = require('discord-player');

const inactivityTimers = new Map();

function clearInactivityTimer(guildId) {
    if (inactivityTimers.has(guildId)) {
        clearTimeout(inactivityTimers.get(guildId));
        inactivityTimers.delete(guildId);
    }
}

function setInactivityTimer(guildId, queue, timeout) {
    clearInactivityTimer(guildId);
    const timer = setTimeout(() => {
        if (queue && queue.connection) {
            queue.delete();
            inactivityTimers.delete(guildId);
        }
    }, timeout);
    inactivityTimers.set(guildId, timer);
}

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

            const queue = useQueue(message.guild.id);
            
            clearInactivityTimer(message.guild.id);

            queue.node.on('playerStart', () => {
                clearInactivityTimer(message.guild.id);
            });

            queue.node.on('playerFinish', () => {
                if (queue.tracks.size === 0) {
                    setInactivityTimer(message.guild.id, queue, client.config.inactivityTimeout);
                }
            });

            queue.node.on('emptyQueue', () => {
                setInactivityTimer(message.guild.id, queue, client.config.inactivityTimeout);
            });

            queue.node.on('emptyChannel', () => {
                setInactivityTimer(message.guild.id, queue, client.config.inactivityTimeout);
            });

            queue.node.on('disconnect', () => {
                clearInactivityTimer(message.guild.id);
            });

            await message.channel.send(`🎵 Now playing: **${track.title}** by **${track.author}**`);

        } catch (error) {
            console.error('Play command error:', error);
            await message.reply(`❌ Error: ${error.message || 'Could not play the song!'}`);
        }
    }
};
