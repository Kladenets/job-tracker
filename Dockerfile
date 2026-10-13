# Multi-Stage Production Dockerfile for Job Tracker Engine
# Stage 1: Build & Compile TypeScript
FROM node:24.19.0-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json tsconfig.json ./
COPY scripts/copy-db-migrations.cjs ./scripts/copy-db-migrations.cjs

# Install all dependencies (including devDependencies required for compilation)
RUN npm install --global npm@12.2.0 && npm ci

# Copy full application source code
COPY src/ ./src/
COPY index.html vite.config.ts ./

# Compile TypeScript into JavaScript (outputs to dist/)
RUN npm run build

# Stage 2: Minimal & Secure Production Runner
FROM node:24.19.0-slim AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV PYTHON_PATH=/opt/jobspy-venv/bin/python

# Copy package manifests and install only production dependencies
COPY package*.json ./
RUN npm install --global npm@12.2.0 && npm ci --omit=dev && npm cache clean --force

# Install the Python runtime and the JobSpy bridge dependencies in an isolated environment.
COPY requirements.txt ./requirements.txt
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-venv \
  && rm -rf /var/lib/apt/lists/* \
  && python3 -m venv /opt/jobspy-venv \
  && /opt/jobspy-venv/bin/python -m pip install --no-cache-dir -r requirements.txt

# Copy compiled JavaScript output from builder stage
COPY --from=builder /app/dist ./dist
COPY scripts/jobspy_cli.py ./scripts/jobspy_cli.py

# Prepare ignored runtime storage and permissions for non-root user 'node'.
RUN mkdir -p /app/data && chown -R node:node /app

# Drop root privileges and run as non-privileged system user
USER node

# Expose standard application port
EXPOSE 3000

# Docker healthcheck querying the unauthenticated readiness endpoint without extra curl/wget packages.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]

# Launch the production Express server
CMD ["node", "dist/server.js"]
