# Base Node 20 LTS
FROM node:20-slim

# Set working directory
WORKDIR /usr/src/app

# Set env vars for noninteractive installs
ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=production

# Install system dependencies: ffmpeg, curl, python3 (yt-dlp may require)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    python3 \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Copy package.json (and package-lock.json if exists)
COPY package.json package-lock.json* ./

# Install dependencies (omit dev, lockfile-free)
RUN npm install --omit=dev

# Copy the rest of the bot
COPY . .

# Download latest yt-dlp binary into ./bin/
RUN mkdir -p ./bin \
  && curl -L -o ./bin/yt-dlp "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp" \
  && chmod +x ./bin/yt-dlp

# Expose port for express server (used for Render health checks)
EXPOSE 3000

# Default command
CMD ["node", "index.js"]
