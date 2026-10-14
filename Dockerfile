FROM node:24.18.0-bookworm-slim AS dependencies
WORKDIR /build
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY runtime/package.json ./runtime/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm test && pnpm typecheck && pnpm build && pnpm build:runtime
# Worker-only imports and the migration runner must be available independently
# of Next's web traces; install their complete production closure in this stage.
RUN pnpm --filter duindorp-sv-runtime --prod deploy --legacy /production

FROM node:24.18.0-bookworm-slim AS runtime
WORKDIR /app
LABEL org.opencontainers.image.source="https://github.com/duindorpsv/website"
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /production/node_modules ./runtime/node_modules
COPY --from=build --chown=node:node /build/.next/standalone ./
COPY --from=build --chown=node:node /build/.next/static ./.next/static
COPY --from=build --chown=node:node /build/public ./public
COPY --from=build --chown=node:node /build/dist/runtime/*.js ./runtime/
COPY --from=build --chown=node:node /build/db/migrations ./db/migrations
COPY --chown=node:node ops/scripts/entrypoint.sh /app/entrypoint.sh
# ESM runtime bundles have .mjs names even though web server.js is CommonJS.
WORKDIR /app/runtime
RUN mv worker.js worker.mjs && mv migrate.js migrate.mjs && mv runtime-validate.js runtime-validate.mjs && mv seed.js seed.mjs && mv owner.js owner.mjs && mv provision.js provision.mjs && chmod 0555 /app/entrypoint.sh
WORKDIR /app
USER node
EXPOSE 3000
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["web"]
