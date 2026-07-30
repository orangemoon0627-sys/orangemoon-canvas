FROM oven/bun:1.3.13 AS build

WORKDIR /app
COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile --cache-dir=/root/.bun/install/cache
COPY tsconfig.json ./
COPY src ./src
RUN bun run build

# 云端镜像不会加载本地 Codex/MCP 入口，移除其二进制与构建期依赖。
RUN rm -rf \
    node_modules/@openai \
    node_modules/@modelcontextprotocol \
    node_modules/@types \
    node_modules/@esbuild \
    node_modules/esbuild \
    node_modules/tsx \
    node_modules/typescript

FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV CANVAS_AGENT_MODE=cloud
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

USER node
EXPOSE 17371
CMD ["node", "dist/index.js"]
