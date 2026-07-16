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

# --- Where we deploy to ------------------------------------------------------
# The real server IP and key are NOT committed. Put them in an untracked
# deploy/server.local.sh (gitignored; copy deploy/server.local.sh.example),
# which this script sources if present. Or just export them for one run:
#   SERVER=root@1.2.3.4 SSH_KEY=~/.ssh/mykey ./deploy/deploy.sh
if [ -f "$(dirname "$0")/server.local.sh" ]; then
  # shellcheck disable=SC1091
  source "$(dirname "$0")/server.local.sh"
fi
SERVER="${SERVER:-root@<SERVER_IP>}"
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

# Services that MOUNT their source (docker-compose.prod.yml: `./tools/<x>:/app:ro`)
# instead of baking it into an image. `up -d` only recreates a container when its
# *config* changes, and a rsync'd source file is not config — so these keep
# serving the code they loaded at startup, from a file that no longer exists on
# disk. The deploy then passes: the site is up, the gate still answers, and
# nothing reports that half the box ignored the release.
#
# Seen for real: an nswitch parser fix rsynced fine, `docker exec grep` found the
# new line inside the container, and the API still returned the old error for
# four more days' uptime. `restart` re-execs the process, which is all it takes.
#
# auth-verify is on this list too, and it is the AI gate — stale security code
# is the version of this you do not want to find out about later.
echo "==> 4b/5 Restart the source-mounted services (their code is not in an image)"
$SSH "$SERVER" "cd $REMOTE_DIR && $COMPOSE restart nswitch-api auth-verify"

echo "==> 5/5  Verify"
echo "     --- containers ---"
$SSH "$SERVER" "docker ps --format '{{.Names}}\t{{.Status}}' | grep modellogue"
code=$(curl -s -o /dev/null -w '%{http_code}' "$SITE_URL/")
gate=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$SITE_URL/n8n/webhook/modellogue-chat" \
  -H 'Content-Type: application/json' -d '{}')
# The site root is co-located content, not this repo (see ENVIRONMENT.md), so
# a 200 on / says nothing about the app or the APIs. Ask each thing that this
# deploy actually touched to do its job, not just to answer.
app=$(curl -s -o /dev/null -w '%{http_code}' "$SITE_URL/app/")
nsw=$(curl -s "$SITE_URL/nswitch/health" | head -c 200)
echo "     --- endpoints ---"
echo "     GET  $SITE_URL/             -> $code   (want 200)"
echo "     GET  $SITE_URL/app/         -> $app   (want 200 = the SPA this repo builds)"
echo "     POST /n8n/webhook (no auth) -> $gate   (want 302 or 403 = AI still gated)"
echo "     GET  /nswitch/health        -> $nsw"

fail=0
[ "$code" = "200" ] || { echo "!! Site is not healthy (expected 200)."; fail=1; }
[ "$app" = "200" ] || { echo "!! The app at /app is not healthy (expected 200)."; fail=1; }
case "$nsw" in
  *'"status"'*'"ok"'*) ;;
  *) echo "!! nswitch is not answering (it mounts its source — did the restart above run?)."; fail=1 ;;
esac
case "$gate" in
  302|403) ;;
  200) echo "!! AI gate is OPEN (got 200) — unauthenticated calls can reach AI. Investigate before leaving."; fail=1 ;;
  *)   echo "!! Unexpected gate response ($gate)."; fail=1 ;;
esac
[ "$fail" = "0" ] || { echo "==> FAILED. See messages above."; exit 1; }

echo "==> Done. $SITE_URL is live on the new build."
