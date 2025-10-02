# Base image: Node 20 LTS
FROM node:20-slim

# Set working directory
WORKDIR /usr/src/app

# Copy package files first (to leverage Docker layer caching)
COPY package*.json ./

# Install dependencies with cache
RUN npm ci --prefer-offline --no-audit --progress=false

# Copy all project files
COPY . .

# Environment variables
ENV NODE_ENV=production
ENV NODE_YT_COOKIES=""

# Run the bot
CMD ["node", "index.js"]
