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

# Verify source copied
RUN echo "Source files:" && ls -la src/ && echo "Package.json:" && head -5 package.json

# Compile TypeScript  
RUN npm run build && echo "Build complete" && ls -la

# Verify build output
RUN test -f dist/index.js || (echo "ERROR: dist/index.js not found!" && ls -la dist/ 2>&1 && exit 1) && echo "dist/index.js exists!"

# Expose API port
EXPOSE 3001

# Start the server
CMD ["node", "dist/index.js"]
