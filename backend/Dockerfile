# Multi-stage build for production optimization
FROM node:20-alpine AS base

# Install system dependencies for Puppeteer, yt-dlp, and ffmpeg
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    python3 \
    py3-pip \
    ffmpeg \
    && rm -rf /var/cache/apk/*

# Install yt-dlp for video transcript extraction
RUN pip3 install --no-cache-dir yt-dlp --break-system-packages

# Skip Puppeteer's Chromium download (v21+ uses PUPPETEER_SKIP_DOWNLOAD;
# keep the old name too for any bundled legacy scripts)
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Development stage
FROM base AS development
RUN npm ci
COPY . .
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
EXPOSE 3001
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "node_modules/nodemon/bin/nodemon.js", "src/server.ts"]

# Build stage
FROM base AS build
ENV NODE_ENV=development
RUN npm ci
RUN npm install -g typescript
COPY . .
RUN npm run build
# Copy SQL migration files into dist (tsc only processes .ts files)
RUN mkdir -p dist/db/migrations && cp src/db/migrations/*.sql dist/db/migrations/

# Production stage
FROM base AS production

RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

COPY --from=build /usr/src/app/dist ./dist
COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/package.json ./package.json

RUN mkdir -p logs && chown -R nodejs:nodejs logs
USER nodejs

# Give the server up to 2 min to connect to all external services before
# the first health-check fires (Qdrant/Neon cold starts can take ~60 s)
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

EXPOSE 3001
# Cap Node heap to 384 MB to stay within Render's 512 MB free-tier RAM
CMD ["node", "--max-old-space-size=384", "dist/server.js"]
