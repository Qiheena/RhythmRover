# Base image: Node 20 LTS
FROM node:20-slim

# Set working directory
WORKDIR /usr/src/app

# Copy package files first
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all project files
COPY . .

# Use environment variable for token
# (Render me dashboard se pass karenge)
ENV NODE_ENV=production

# Run the bot
CMD ["node", "index.js"]
