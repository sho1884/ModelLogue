#!/usr/bin/env bash
#
# Deploy ModelLogue to the beta/staging server.
#
#   Run from the repo root:   ./deploy/deploy.sh
#
# What this does: sync the source to the server, rebuild the web image there,
# restart the stack, then verify the site and the AI gate. It never touches
# the server-only files (.env, docker-compose.override.yml).
#
# The live box is described in deploy/ENVIRONMENT.md. If the server or key
# changes, override with env vars instead of editing this file:
#   SERVER=root@1.2.3.4 SSH_KEY=~/.ssh/mykey ./deploy/deploy.sh
#
# Requirements on your machine: bash, ssh, rsync, node/npm (run `npm install`
# once first). Works on Linux, macOS, and WSL. On Windows use WSL.

set -euo pipefail

# --- Where we deploy to (defaults = the current live box) --------------------
SERVER="${SERVER:-root@162.43.92.10}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519_modellogue}"
REMOTE_DIR="${REMOTE_DIR:-/opt/modellogue}"
SITE_URL="${SITE_URL:-https://modellogue.com}"

# The stack uses THREE compose files, project name "modellogue".
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.override.yml"
SSH="ssh -i $SSH_KEY -o ConnectTimeout=20"

# Always run from the repo root (the directory above this script).
cd "$(dirname "$0")/.."

echo "==> 1/5  Local check: typecheck + unit tests (stops if anything is broken)"
npx tsc -b
npm test

echo "==> 2/5  Sync source to $SERVER:$REMOTE_DIR"
echo "         (.env and docker-compose.override.yml on the server are protected)"
rsync -az --delete -e "$SSH" \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude 'test-results' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude 'docker-compose.override.yml' \
  ./ "$SERVER:$REMOTE_DIR/"

echo "==> 3/5  Rebuild the web image on the server (takes a few minutes)"
$SSH "$SERVER" "cd $REMOTE_DIR && $COMPOSE build web"

echo "==> 4/5  Restart the whole stack"
echo "         (recreating containers can briefly race on n8n's 127.0.0.1:5678"
echo "          while the old container releases the port — so retry once after"
echo "          a short pause; expect a brief blip)"
$SSH "$SERVER" "cd $REMOTE_DIR && ($COMPOSE up -d || { echo '   port still busy, retrying in 5s...'; sleep 5; $COMPOSE up -d; })"

echo "==> 5/5  Verify"
echo "     --- containers ---"
$SSH "$SERVER" "docker ps --format '{{.Names}}\t{{.Status}}' | grep modellogue"
code=$(curl -s -o /dev/null -w '%{http_code}' "$SITE_URL/")
gate=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$SITE_URL/n8n/webhook/modellogue-chat" \
  -H 'Content-Type: application/json' -d '{}')
echo "     --- endpoints ---"
echo "     GET  $SITE_URL/             -> $code   (want 200)"
echo "     POST /n8n/webhook (no auth) -> $gate   (want 302 or 403 = AI still gated)"

fail=0
[ "$code" = "200" ] || { echo "!! Site is not healthy (expected 200)."; fail=1; }
case "$gate" in
  302|403) ;;
  200) echo "!! AI gate is OPEN (got 200) — unauthenticated calls can reach AI. Investigate before leaving."; fail=1 ;;
  *)   echo "!! Unexpected gate response ($gate)."; fail=1 ;;
esac
[ "$fail" = "0" ] || { echo "==> FAILED. See messages above."; exit 1; }

echo "==> Done. $SITE_URL is live on the new build."
