# syntax=docker/dockerfile:1.7
#
# Image for the Next.js apps (apps/web, apps/portal), built as a standalone server.
#
#   docker build -f infra/docker/next-app.Dockerfile --build-arg APP=web \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.example.com -t medtravel-web .
#
# NEXT_PUBLIC_* values are compiled into the browser bundle, so they are build arguments:
# build one image per environment.

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    TURBO_TELEMETRY_DISABLED=1 \
    DO_NOT_TRACK=1 \
    NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo

# The package store is written into this layer on purpose (not a BuildKit cache mount): layer
# caches such as GitHub Actions' export layers but not mount contents, so a cached layer paired
# with an empty mount would make the offline install below fail. The store never reaches the
# runtime image.
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc .pnpmfile.cjs package.json ./
RUN pnpm fetch

FROM deps AS build
ARG APP
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
RUN test -n "$APP" || (echo "build-arg APP is required (web or portal)" >&2; exit 1)
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_OUTPUT=standalone
COPY . .
RUN pnpm install --offline --frozen-lockfile
RUN pnpm turbo run build --filter=@medtravel/${APP}...

FROM node:${NODE_VERSION}-alpine AS runtime
ARG APP
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    APP_DIR=apps/${APP}
WORKDIR /app
# The standalone output mirrors the monorepo layout, so the server lives at apps/<app>/server.js.
COPY --from=build --chown=node:node /repo/apps/${APP}/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/${APP}/.next/static ./apps/${APP}/.next/static
COPY --from=build --chown=node:node /repo/apps/${APP}/public ./apps/${APP}/public
USER node
EXPOSE 3000
CMD ["sh", "-c", "exec node ${APP_DIR}/server.js"]
