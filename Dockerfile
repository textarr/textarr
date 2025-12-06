# Build stage
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source
COPY tsconfig.json ./
COPY src ./src

# Build
RUN bun build src/index.ts --outdir dist --target bun

# Production stage
FROM oven/bun:1-slim AS production

WORKDIR /app

# Install gosu for dropping privileges
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    gosu \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json bun.lock* ./

# Install production dependencies only
RUN bun install --frozen-lockfile --production

# Copy built files
COPY --from=builder /app/dist ./dist

# Copy public files (web UI)
COPY public ./public

# Copy entrypoint script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Create bun user if it doesn't exist and config directory
RUN id -u bun &>/dev/null || useradd -m -s /bin/bash bun && \
    mkdir -p /app/config

# Expose port
EXPOSE 3030

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3030/health || exit 1

# Use entrypoint to handle PUID/PGID
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["bun", "dist/index.js"]
