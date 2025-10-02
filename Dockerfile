# Use official Node LTS
FROM node:20-slim

# Set working dir
WORKDIR /usr/src/app

# Use noninteractive for apt
ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=production

# Install system deps: curl, ca-certificates, ffmpeg (yt-dlp needs ffmpeg for some formats)
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    python3 \
    ffmpeg \
  && rm -rf /var/lib/apt/lists/*

# Copy package manifest(s) and install deps
COPY package.json package-lock.json* ./
# For dev builds you can replace `--only=production` with full install
RUN npm ci --only=production

# Copy rest of the app
COPY . .

# Create bin folder and download yt-dlp binary (latest release)
RUN mkdir -p ./bin \
  && curl -L -o ./bin/yt-dlp "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp" \
  && chmod +x ./bin/yt-dlp

# Ensure node_modules/.bin/ffmpeg-static can be used (optional)
# If you prefer system ffmpeg, ffmpeg-static isn't necessary. Keeping both is safe.

# Expose the port your server listens on (server.js uses process.env.PORT || 3000)
EXPOSE 3000

# Default command
CMD ["node", "index.js"]
