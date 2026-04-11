FROM oven/bun:1.2.19-alpine AS builder
WORKDIR /app

COPY ./package.json ./bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

FROM oven/bun:1.2.19-alpine AS runner
WORKDIR /app

# Create non-root user for security
RUN addgroup -S copilot && adduser -S copilot -G copilot

COPY ./package.json ./bun.lock ./
RUN bun install --frozen-lockfile --production --ignore-scripts --no-cache

COPY --from=builder /app/dist ./dist

# Create data directory for config persistence
RUN mkdir -p /data && chown -R copilot:copilot /data

# Switch to non-root user
USER copilot

# Environment variables
ENV NODE_ENV=production
ENV PORT=4141
# Config will be stored in /data volume
ENV XDG_DATA_HOME=/data

EXPOSE 4141

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --spider -q http://127.0.0.1:${PORT:-4141}/ || exit 1

COPY --chmod=755 entrypoint.sh /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
