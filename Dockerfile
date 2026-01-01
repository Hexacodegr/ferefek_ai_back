# Use official Bun image
FROM oven/bun:1.1.13

WORKDIR /app

COPY package.json ./
COPY tsconfig.json ./
RUN bun install

# Copy source files
COPY src ./src

# Default: run with Bun (can run TypeScript directly)
CMD ["bun", "run", "src/index.ts"]