FROM node:22-bookworm-slim AS base
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl libssl3 ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS dependencies
COPY package.json package-lock.json ./
COPY prisma/schema.prisma ./prisma/schema.prisma
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npm ci
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npm run prisma:generate

FROM dependencies AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && find dist -name '*.map' -delete

FROM base AS production-dependencies
COPY package.json package-lock.json ./
RUN PRISMA_SKIP_POSTINSTALL_GENERATE=true npm ci --omit=dev --omit=optional \
    && test ! -d node_modules/prisma \
    && test ! -d node_modules/typescript
COPY --from=dependencies /app/node_modules/.prisma ./node_modules/.prisma

FROM base AS migrate
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node docker/entrypoint.mjs ./docker/entrypoint.mjs
USER node
ENTRYPOINT ["node", "docker/entrypoint.mjs"]
CMD ["node", "node_modules/prisma/build/index.js", "migrate", "deploy"]

FROM dependencies AS test
COPY --chown=node:node tsconfig.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node tests ./tests
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node docker ./docker
ENV NODE_ENV=test
USER node
ENTRYPOINT ["node", "docker/entrypoint.mjs"]
CMD ["npm", "test"]

FROM base AS runtime
ENV NODE_ENV=production PORT=3001
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
COPY --chown=node:node docker/entrypoint.mjs ./docker/entrypoint.mjs
USER node
EXPOSE 3001
ENTRYPOINT ["node", "docker/entrypoint.mjs"]
CMD ["node", "dist/index.js"]
