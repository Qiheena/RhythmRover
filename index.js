require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
const play = require('play-dl');
const fs = require('fs');
const path = require('path');
const config = require('./settings/config');

// Render ke liye express server import
require('./247/server');

// ====== Play-dl ko YT cookies ke saath configure karna ======
(async () => {
    if (process.env.YT_COOKIES_B64) {
        try {
            const cookieData = Buffer.from(process.env.YT_COOKIES_B64, 'base64').toString('utf-8');
            const cookiePath = '/tmp/yt-cookies.txt';
            fs.writeFileSync(cookiePath, cookieData);
            await play.setToken({
                youtube: {
                    cookie: cookiePath
                }
            });
            console.log('✅ YouTube cookies applied successfully');
        } catch (err) {
            console.error('❌ Failed to apply YouTube cookies:', err);
        }
    } else {
        console.warn('⚠️ No YT_COOKIES_B64 found in env');
    }
})();

// ====== Discord Client Setup ======
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.commands = new Collection();
client.config = config;
client.queues = new Map();
client.inactivityTimers = new Map();

// ====== Commands Loader ======
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    client.commands.set(command.name, command);
    console.log(`✅ Loaded command: ${command.name}`);
}

// ====== Bot Events ======
client.once('ready', () => {
    console.log(`🤖 Bot is online as ${client.user.tag}`);
    client.user.setActivity('!play for music', { type: 3 });
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
        console.error(`❌ Error executing command ${commandName}:`, error);
        message.reply('❌ There was an error!');
    }
});

// ====== Bot Login ======
client.login(process.env.DISCORD_TOKEN);
