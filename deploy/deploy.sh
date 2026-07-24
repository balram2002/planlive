#!/usr/bin/env bash
# =============================================================================
# liveWAB — build and (re)start the production stack.
#
#   ./deploy/deploy.sh          pull latest code, rebuild, restart
#   ./deploy/deploy.sh --no-git rebuild from the working tree as-is
#
# Run from the project root on the VPS.
# =============================================================================
set -Eeuo pipefail

cd "$(dirname "$0")/.."

RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'; NC=$'\033[0m'
info()  { echo "${GREEN}==>${NC} $*"; }
warn()  { echo "${YELLOW}==>${NC} $*"; }
fail()  { echo "${RED}==> $*${NC}" >&2; exit 1; }

[[ -f .env.production ]] || fail \
  ".env.production not found. Copy deploy/env.production.example and fill it in."

# A half-filled env file produces a container that starts and then 500s on
# every request, which is a confusing way to find out. Check the essentials.
info "Checking required variables…"
missing=()
while IFS= read -r key; do
  value="$(grep -E "^${key}=" .env.production | head -1 | cut -d= -f2- | tr -d '"' | xargs || true)"
  [[ -z "$value" ]] && missing+=("$key")
done <<'KEYS'
NEXT_PUBLIC_APP_URL
DATABASE_URL
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
KEYS

if (( ${#missing[@]} > 0 )); then
  fail "Missing or empty in .env.production: ${missing[*]}"
fi

if [[ "${1:-}" != "--no-git" ]]; then
  info "Pulling latest code…"
  git pull --ff-only
fi

# Build args come from this file — export them for `docker compose build`.
set -a
# shellcheck disable=SC1091
source .env.production
set +a

info "Building images…"
docker compose build

info "Starting services…"
docker compose up -d --remove-orphans

info "Waiting for the app to report healthy…"
for i in {1..30}; do
  status="$(docker inspect --format='{{.State.Health.Status}}' livewab-web 2>/dev/null || echo starting)"
  if [[ "$status" == "healthy" ]]; then
    info "Healthy after ${i}0s."
    break
  fi
  if [[ "$status" == "unhealthy" ]]; then
    docker compose logs --tail=50 web
    fail "Container is unhealthy — see the logs above."
  fi
  sleep 10
  [[ $i -eq 30 ]] && { docker compose logs --tail=50 web; fail "Timed out waiting for health."; }
done

# Untagged layers from previous builds add up fast on a 100GB VPS disk.
info "Pruning dangling images…"
docker image prune -f >/dev/null

info "Deployed. Current state:"
docker compose ps
warn "Verify: curl -sS https://livewab.planwab.com/api/health"
