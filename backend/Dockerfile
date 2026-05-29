FROM node:20-alpine

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache git docker

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Compile TypeScript
RUN npm run build

# Expose API port
EXPOSE 3001

# Start the server
CMD ["npm", "start"]
