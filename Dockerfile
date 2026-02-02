# Use lightweight Node image
FROM node:18-slim

# Create app directory
WORKDIR /usr/src/app

# Install dependencies
COPY package*.json ./
RUN npm install --production

# Bundle app source
COPY . .

# Presence Registry Port
EXPOSE 3000

# Start the engine
CMD [ "node", "index.js" ]
