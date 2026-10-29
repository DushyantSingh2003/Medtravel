# syntax=docker/dockerfile:1.7
#
# Image for the NestJS services (apps/api, apps/worker).
#
#   docker build -f infra/docker/node-service.Dockerfile --build-arg APP=api -t medtravel-api .
#   docker build -f infra/docker/node-service.Dockerfile --build-arg APP=worker -t medtravel-worker .
#
# Build context is the repository root. The final image holds only production dependencies and
# compiled output, and runs as the unprivileged `node` user.

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    TURBO_TELEMETRY_DISABLED=1 \
    DO_NOT_TRACK=1
RUN corepack enable
WORKDIR /repo

# ---- dependencies: only the lockfile is needed, so this layer is cached until it changes ----
# The package store is written into this layer on purpose (not a BuildKit cache mount): layer
# caches such as GitHub Actions' export layers but not mount contents, so a cached layer paired
# with an empty mount would make the offline install below fail. The store never reaches the
# runtime image.
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc .pnpmfile.cjs package.json ./
RUN pnpm fetch

# ---- build: compile the app and the workspace packages it depends on ----
FROM deps AS build
ARG APP
RUN test -n "$APP" || (echo "build-arg APP is required (api or worker)" >&2; exit 1)
COPY . .
RUN pnpm install --offline --frozen-lockfile
RUN pnpm turbo run build --filter=@medtravel/${APP}...
# A self-contained directory: the app, its compiled workspace packages and production
# dependencies only (no dev tooling, no sources of other apps). The Prisma CLI is kept out by
# .pnpmfile.cjs, not here: switching peer installation off would also drop *required* peers.
RUN pnpm --filter @medtravel/${APP} deploy --prod --legacy /out

# ---- runtime ----
FROM node:${NODE_VERSION}-alpine AS runtime
ENV NODE_ENV=production
# Fonts for the watermark the API writes into images (the SVG text is drawn by librsvg, which needs fontconfig and a font).
RUN apk add --no-cache fontconfig ttf-dejavu
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3001
CMD ["node", "dist/main.js"]
