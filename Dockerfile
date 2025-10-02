# Base image: Node 20 LTS
FROM node:20-slim

# Set working directory
WORKDIR /usr/src/app

# Copy package files first to leverage Docker caching
COPY package*.json ./

# Install dependencies (works with or without package-lock.json)
RUN npm install --prefer-offline --no-audit --progress=false

# Copy all project files
COPY . .

# Environment variables
ENV NODE_ENV=production
ENV NODE_YT_COOKIES=""

# Optional: create a folder for temp cookies
RUN mkdir -p /tmp/cookies

# Run the bot
CMD ["node", "index.js"]
