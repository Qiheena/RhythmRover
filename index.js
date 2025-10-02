const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { Player } = require('discord-player');
const { DefaultExtractors } = require('@discord-player/extractor');
const fs = require('fs');
const path = require('path');
const config = require('./settings/config');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const player = new Player(client, {
    ytdlOptions: {
        quality: 'highestaudio',
        highWaterMark: 1 << 25
    }
});

(async () => {
    await player.extractors.loadMulti(DefaultExtractors);
})();

client.commands = new Collection();
client.player = player;
client.config = config;

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    client.commands.set(command.name, command);
    console.log(`✅ Loaded command: ${command.name}`);
}

const inactivityTimers = new Map();

player.events.on('playerStart', (queue, track) => {
    if (inactivityTimers.has(queue.guild.id)) {
        clearTimeout(inactivityTimers.get(queue.guild.id));
        inactivityTimers.delete(queue.guild.id);
    }
    queue.metadata.channel.send(`🎵 Now playing: **${track.title}** by **${track.author}**`);
});

player.events.on('playerFinish', (queue) => {
    if (queue.tracks.size === 0) {
        const timer = setTimeout(() => {
            if (queue && queue.deleted === false) {
                queue.delete();
            }
            inactivityTimers.delete(queue.guild.id);
        }, config.inactivityTimeout);
        inactivityTimers.set(queue.guild.id, timer);
    }
});

player.events.on('emptyQueue', (queue) => {
    const timer = setTimeout(() => {
        if (queue && queue.deleted === false) {
            queue.delete();
        }
        inactivityTimers.delete(queue.guild.id);
    }, config.inactivityTimeout);
    inactivityTimers.set(queue.guild.id, timer);
});

player.events.on('emptyChannel', (queue) => {
    const timer = setTimeout(() => {
        if (queue && queue.deleted === false) {
            queue.delete();
        }
        inactivityTimers.delete(queue.guild.id);
    }, config.inactivityTimeout);
    inactivityTimers.set(queue.guild.id, timer);
});

player.events.on('disconnect', (queue) => {
    if (inactivityTimers.has(queue.guild.id)) {
        clearTimeout(inactivityTimers.get(queue.guild.id));
        inactivityTimers.delete(queue.guild.id);
    }
});

player.events.on('playerError', (queue, error) => {
    console.error(`Player error: ${error.message}`);
    queue.metadata.channel.send('❌ There was an error playing this track!');
});

client.once('ready', () => {
    console.log(`🤖 Bot is online as ${client.user.tag}`);
    client.user.setActivity('!play for music', { type: 'LISTENING' });
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith(config.prefix)) return;

    const args = message.content.slice(config.prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    const command = client.commands.get(commandName) || 
                   client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));

    if (!command) return;

    try {
        await command.execute(message, args, client);
    } catch (error) {
        console.error(`Error executing command ${commandName}:`, error);
        message.reply('There was an error executing that command!');
    }
});

client.login(process.env.DISCORD_TOKEN);
