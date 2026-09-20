# syntax=docker/dockerfile:1

# Shared, parameterized Dockerfile for every long-running app in this
# monorepo (api, web, worker-*) - build with e.g.
#   docker build --build-arg APP_NAME=@yoyo/api -t yoyo-api .
# Uses Turborepo's official pruning pattern (turbo prune <pkg> --docker) so
# each image only contains the workspace packages that app actually depends
# on, and the install layer (out/json - package.json files + lockfile only)
# is cached separately from the build layer (out/full - actual source), so
# editing one app's source doesn't invalidate every other app's install cache.
#
# Debian-slim, not Alpine: Prisma's query engine binary needs glibc/libssl,
# which Alpine's musl libc doesn't provide without extra packages.

FROM node:22-slim AS base
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
# Shared, world-readable corepack cache - otherwise the non-root `node` user
# in the runner stage can't reach the pnpm binary corepack fetched as root.
ENV COREPACK_HOME=/opt/corepack
RUN corepack enable && corepack prepare pnpm@9.12.1 --activate && chmod -R a+rX /opt/corepack

FROM base AS pruner
ARG APP_NAME
WORKDIR /app
COPY . .
RUN npx turbo prune "${APP_NAME}" --docker

FROM base AS builder
ARG APP_NAME
# Next.js inlines NEXT_PUBLIC_* vars into the client bundle at build time, not
# read at container startup like every other env var here - so it has to be
# set before `turbo run build` runs, not just at deploy time. Only @yoyo/web
# reads this; harmless no-op ARG/ENV for every other app.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
WORKDIR /app
# Install first from the pruned package.json/lockfile only - this layer is
# cached across builds unless dependencies actually change.
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
# Now bring in the pruned real source and build.
COPY --from=pruner /app/out/full/ .
RUN npx turbo run build --filter="${APP_NAME}"

FROM base AS runner
ARG APP_NAME
ENV NODE_ENV=production
ENV APP_NAME=${APP_NAME}
WORKDIR /app
COPY --chown=node:node --from=builder /app .
USER node
# `exec` replaces the shell with pnpm directly (instead of running it as a
# child the shell would otherwise need to forward SIGTERM to), so `docker
# stop` reaches the actual process and the app's graceful-shutdown hooks run
# instead of waiting out the full stop timeout.
CMD exec pnpm --filter "${APP_NAME}" start
