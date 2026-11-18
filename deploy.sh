#!/usr/bin/env bash
# Sync inventory from TCGplayer, build the image on this Pi, push it, and
# tell ONCE to roll it out.
#
#   npm run deploy                   sync + build + push + update tcg.atomic10.studio
#   HOST=other.example.com ./deploy.sh
#
# First time only (after a successful push):
#   once deploy ghcr.io/jameson13b/card-table:latest \
#     --host cards.example.com \
#     --env CAMPFIRE_POST_URL='https://chat.atomic10.studio/rooms/<id>/<bot-key>/messages'
#
# Pushing needs `docker login ghcr.io` (a GitHub token with write:packages),
# and the package must be public (or pass --registry-username/password to once).
set -euo pipefail
cd "$(dirname "$0")"

IMAGE="${IMAGE:-ghcr.io/jameson13b/card-table:latest}"
HOST="${HOST:-tcg.atomic10.studio}"

echo "→ Syncing inventory with TCGplayer"
npm run sync

echo "→ Type-checking"
npx tsc -b

echo "→ Building $IMAGE"
docker build -t "$IMAGE" .

echo "→ Pushing $IMAGE"
docker push "$IMAGE"

if [[ -n "$HOST" ]]; then
  echo "→ Updating ONCE app at $HOST"
  once update "$HOST" --image "$IMAGE"
else
  echo "✓ Pushed. ONCE auto-updates installed apps, or run: once update <host> --image $IMAGE"
fi
