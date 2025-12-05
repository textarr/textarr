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
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    wget \
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

# Create non-root user
RUN groupadd -g 1001 nodejs && \
    useradd -u 1001 -g nodejs nodejs

# Create config directory with proper permissions
RUN mkdir -p /app/config && chown nodejs:nodejs /app/config

USER nodejs

# Expose port
EXPOSE 3030

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3030/health || exit 1

# Start the application
CMD ["node", "dist/index.js"]
