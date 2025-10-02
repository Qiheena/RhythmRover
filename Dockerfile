# Base image: Node 20 LTS
FROM node:20-slim

# Install Python, FFmpeg and required dependencies for yt-dlp
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Create symbolic link for python command
RUN ln -s /usr/bin/python3 /usr/bin/python

# Install latest yt-dlp using pip
RUN pip3 install -U yt-dlp

# Optional: update npm to latest for better dependency resolution
RUN npm install -g npm@11.6.1

# Set working directory
WORKDIR /usr/src/app

# Copy package files first for caching
COPY package*.json ./

# Install dependencies
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
