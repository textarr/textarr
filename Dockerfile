# Build stage
FROM node:22-slim AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci

# Copy source
COPY tsconfig.json ./
COPY src ./src

# Build
RUN npm run build

# Production stage
FROM node:22-slim AS production

WORKDIR /app

# Install build dependencies for native modules (sodium-native, bcrypt)
# Also install gosu for dropping privileges
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    wget \
    gosu \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json package-lock.json* ./

# Install production dependencies only
RUN npm ci --omit=dev

# Remove build dependencies to reduce image size
RUN apt-get update && apt-get remove -y python3 make g++ && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

# Copy built files
COPY --from=builder /app/dist ./dist

# Copy public files (web UI)
COPY public ./public

# Copy entrypoint script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Use existing node user (UID/GID 1000) - will be modified at runtime to match PUID/PGID

# Create config directory
RUN mkdir -p /app/config

# Expose port
EXPOSE 3030

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3030/health || exit 1

# Use entrypoint to handle PUID/PGID
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
