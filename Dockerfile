# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS web-build
WORKDIR /workspace
RUN npm install --global pnpm@10.32.1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY web/package.json ./web/package.json
RUN pnpm install --frozen-lockfile
COPY web ./web
COPY backend/shared ./backend/shared
RUN pnpm run build:web

FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --ignore-scripts
COPY backend/contracts ./contracts
COPY backend/src ./src
COPY backend/shared ./shared
COPY backend/scripts ./scripts
COPY backend/test ./test
COPY zk /zk
COPY backend/tsconfig.json backend/hardhat.config.ts ./
RUN npm run zk:build && npm run compile && npm run build
COPY docker ./docker
RUN mkdir -p deployments cache && chown -R node:node deployments cache

# Institutional CLI tools and local EVM; not the production API image.
FROM build AS tooling
USER node
ENTRYPOINT ["node", "--import", "./docker/runtime.mjs"]
CMD ["dist/scripts/verify.js"]

FROM node:24-bookworm-slim AS production-deps
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001 WEB_DIST_DIR=/app/public TRUST_PROXY_HOPS=1
WORKDIR /app
COPY --from=production-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/artifacts ./artifacts
COPY --from=build --chown=node:node /zk /zk
COPY --from=build --chown=node:node /app/docker ./docker
COPY --from=web-build --chown=node:node /workspace/web/dist ./public
RUN mkdir -p deployments && chown node:node deployments
USER node
EXPOSE 3001
ENTRYPOINT ["node", "--import", "./docker/runtime.mjs"]
CMD ["dist/src/server.js"]
