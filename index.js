const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { Player } = require('discord-player');
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

player.extractors.loadDefault();

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
