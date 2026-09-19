#!/usr/bin/env bash
# Builds every app image locally (never on the VPS - see docker-compose.staging.yml's
# header comment) and pushes to GitHub Container Registry.
#
# Prerequisites:
#   - Docker logged in to ghcr.io: echo $GHCR_TOKEN | docker login ghcr.io -u <you> --password-stdin
#     (token needs the write:packages scope)
#   - GHCR_OWNER env var set if it's not "serob111" (matches docker-compose.staging.yml's default)
#
# Usage: ./scripts/build-and-push.sh [tag]
#   tag defaults to "latest"

set -euo pipefail

OWNER="${GHCR_OWNER:-serob111}"
TAG="${1:-latest}"
APPS=(api web worker-webhooks worker-messaging worker-ai worker-automations)

cd "$(dirname "$0")/.."

for app in "${APPS[@]}"; do
  image="ghcr.io/${OWNER}/yoyo-${app}:${TAG}"
  echo "==> Building ${image}"
  docker build --build-arg "APP_NAME=@yoyo/${app}" -t "${image}" .
  echo "==> Pushing ${image}"
  docker push "${image}"
done

echo "==> Done. On the VPS: docker compose -f docker-compose.staging.yml --env-file .env.staging pull && docker compose -f docker-compose.staging.yml --env-file .env.staging up -d"
