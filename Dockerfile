# Multi-Stage Production Dockerfile for Job Tracker Engine
# Stage 1: Build & Compile TypeScript
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json tsconfig.json ./

# Install all dependencies (including devDependencies required for compilation)
RUN npm ci

# Copy full application source code
COPY src/ ./src/
COPY config/ ./config/
COPY data/ ./data/

# Compile TypeScript into JavaScript (outputs to dist/)
RUN npm run build

# Stage 2: Minimal & Secure Production Runner
FROM node:22-alpine AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Copy package manifests and install only production dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy compiled JavaScript output from builder stage
COPY --from=builder /app/dist ./dist

# Copy runtime configuration and default baseline profiles
COPY config/ ./config/
COPY data/ ./data/

# Ensure runtime directory permissions for non-root user 'node'
RUN mkdir -p /app/data && chown -R node:node /app

# Drop root privileges and run as non-privileged system user
USER node

# Expose standard application port
EXPOSE 3000

# Docker healthcheck querying the unauthenticated readiness endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

# Launch the production Express server
CMD ["node", "dist/server.js"]
