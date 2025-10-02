# Base image: Node 20 LTS
FROM node:20-slim

# Optional: update npm to latest for better dependency resolution
RUN npm install -g npm@11.6.1

# Set working directory
WORKDIR /usr/src/app

# Copy package files first for caching
COPY package*.json ./

# Install dependencies (latest yt-dlp will be picked)
RUN npm install --prefer-offline --no-audit --progress=false

# Copy project files
COPY . .

# Environment variables
ENV NODE_ENV=production
ENV NODE_YT_COOKIES=""

# Create temp folder for cookies
RUN mkdir -p /tmp/cookies

# Run the bot
CMD ["node", "index.js"]
