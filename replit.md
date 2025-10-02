# Discord Music Bot

## Overview

This is a Discord music bot built with Discord.js v14 and discord-player v7. The bot enables users to play music in voice channels through text commands. It supports multiple music sources through extractors (including Spotify and YouTube) and provides audio playback with queue management. The bot uses a prefix-based command system and includes features like auto-disconnect on inactivity.

## Recent Changes

**October 2, 2025**
- Implemented core bot functionality with !play (!p) command for Spotify and song name playback
- Added auto-join functionality when users execute play command
- Implemented proper auto-leave after 2 minutes of playback inactivity (triggers on playerFinish, emptyQueue, emptyChannel events)
- Set up automatic command loading from commands/* directory
- Configured environment variables with DISCORD_TOKEN
- Updated to use @discord-player/extractor with DefaultExtractors via extractors.loadMulti()

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Bot Framework
- **Discord.js v14**: Core bot framework handling Discord API interactions
- **Gateway Intents**: Configured for Guilds, GuildVoiceStates, GuildMessages, and MessageContent to enable voice and message functionality
- **Command Pattern**: Commands stored in a Collection and dynamically loaded from `/commands` directory
- **Command Aliases**: Support for command shortcuts (e.g., 'p' for 'play')

### Music Player Architecture
- **discord-player v7**: Primary music playback engine
- **Audio Quality**: Configured for highest quality audio with ytdl options (highestaudio, high watermark buffer)
- **Extractor System**: Uses `@discord-player/extractor` with DefaultExtractors for multi-source music support
- **Queue Management**: Per-guild queue system managed through discord-player's useQueue

### Voice Connection Management
- **@discordjs/voice**: Handles voice channel connections and audio streaming
- **Audio Processing**: Uses ffmpeg-static for audio encoding/decoding
- **Encryption**: libsodium-wrappers for voice encryption
- **Auto-disconnect**: Inactivity timer system that disconnects bot after 2 minutes (120000ms) of no playback

### Command System
- **Prefix-based**: Uses '!' as default command prefix (configurable)
- **Dynamic Loading**: Commands automatically loaded from `/commands` directory on startup
- **File-based Structure**: Each command is a separate module exporting name, aliases, description, and execute function
- **Message Parsing**: Splits command arguments by spaces for flexible input handling

### Configuration Management
- **Centralized Config**: `/settings/config.js` stores bot-wide settings
- **Environment Variables**: `.env` file for sensitive data (Discord token, API keys)
- **Configuration Options**:
  - Command prefix
  - Inactivity timeout duration
  - Embed color for rich messages

### Audio Features
- **Volume Control**: Default volume set to 50%
- **Self-deafening**: Bot automatically deafens itself in voice channels to reduce bandwidth
- **Queue Metadata**: Tracks requesting user, channel, and guild information
- **Multi-source Support**: Can play from Spotify, YouTube, and other sources via extractors

## External Dependencies

### Discord Services
- **Discord Bot API**: Primary integration for bot functionality (requires bot token)
- **Discord Gateway**: Real-time event system for messages and voice state changes
- **Discord Voice**: WebSocket-based voice connection for audio streaming

### Music Sources & Extractors
- **discord-player/extractor**: Abstraction layer for multiple music sources
- **play-dl**: YouTube and other platform extraction
- **Spotify API**: Indirect integration through discord-player extractors (may require credentials)
- **YouTube/SoundCloud**: Supported through DefaultExtractors

### Audio Processing
- **ffmpeg-static**: Self-contained FFmpeg binary for audio encoding
- **libsodium**: Cryptographic library for voice packet encryption

### Runtime Dependencies
- **Node.js**: JavaScript runtime environment
- **dotenv**: Environment variable management from .env file
- **file-system (fs)**: Command file loading and directory operations