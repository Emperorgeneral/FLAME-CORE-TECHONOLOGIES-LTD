FROM node:20-alpine

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache git docker

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Compile TypeScript
RUN npm run build && ls -la dist/ && echo "Build complete"

# Expose API port
EXPOSE 3001

# Verify build succeeded
RUN test -f dist/index.js || (echo "ERROR: dist/index.js not found!" && ls -la dist/ && exit 1)

# Start the server
CMD ["node", "dist/index.js"]
