#!/usr/bin/env bash
# ============================================================================
# DigitalSMM backend deploy + verify + rollback (runs ON the VPS).
#
# Usage:   bash scripts/backend-deploy.sh <commit-sha>
# Depends: docker compose (docker-compose.prod.yml), backend/.env with the
#          real secrets, and a locally built image tagged with a previous
#          sha (kept by .deployed-sha) so rollback never needs a rebuild.
#
# Flow:
#   1. Build the new immutable image  digitalsmm-prod-backend:<sha>
#   2. Recreate the container from it
#   3. Verify /api/ready with retries (configurable below)
#   4. SUCCESS → write .deployed-sha → Telegram 🟢
#   5. FAIL    → roll back to the previous known-good image (no rebuild),
#                verify again, Telegram 🟠/🚨
#
# Telegram credentials are read from backend/.env (TELEGRAM_BOT_TOKEN /
# TELEGRAM_CHAT_ID) — they never need to be duplicated anywhere else.
# ============================================================================
set -euo pipefail

SHA="${1:?usage: backend-deploy.sh <commit-sha>}"
cd "$(dirname "$0")/.."

COMPOSE=(docker compose -f docker-compose.prod.yml)
IMAGE="digitalsmm-prod-backend"
MARKER=".deployed-sha"
VERIFY_URL="http://127.0.0.1:4000/api/ready"
RETRIES="${DEPLOY_RETRIES:-15}"      # 15 × 5s ≈ 75s of startup grace
RETRY_SLEEP="${DEPLOY_RETRY_SLEEP:-5}"
ROLLBACK_RETRIES="${ROLLBACK_RETRIES:-10}"

PREV=""
[[ -f "$MARKER" ]] && PREV="$(cat "$MARKER")"

# ---- Telegram (best effort, never fails the deploy) ----
notify() {
  local msg="$1"
  local token="" chat=""
  if [[ -f backend/.env ]]; then
    token="$(grep -E '^TELEGRAM_BOT_TOKEN=' backend/.env | head -1 | cut -d= -f2- || true)"
    chat="$(grep -E '^TELEGRAM_CHAT_ID=' backend/.env | head -1 | cut -d= -f2- || true)"
  fi
  if [[ -n "$token" && -n "$chat" ]]; then
    curl -fsS -m 10 -X POST "https://api.telegram.org/bot${token}/sendMessage" \
      -H 'Content-Type: application/json' \
      -d "{\"chat_id\":\"${chat}\",\"text\":\"${msg}\",\"disable_web_page_preview\":true}" \
      >/dev/null 2>&1 || true
  fi
}

# ---- Readiness probe with retries: 0 = ready ----
probe() {
  local tries="$1"
  for _ in $(seq 1 "$tries"); do
    if curl -fsS -m 10 "$VERIFY_URL" >/dev/null 2>&1; then
      return 0
    fi
    sleep "$RETRY_SLEEP"
  done
  return 1
}

echo "[deploy] Building digitalsmm-prod-backend:${SHA}"
export IMAGE_TAG="$SHA"
"${COMPOSE[@]}" build backend

echo "[deploy] Starting ${SHA:0:12}"
"${COMPOSE[@]}" up -d --force-recreate backend

echo "[deploy] Verifying readiness (up to $((RETRIES * RETRY_SLEEP))s)"
if probe "$RETRIES"; then
  echo "$SHA" > "$MARKER"
  notify "🟢 DigitalSMM Backend deployed ${SHA:0:12} (${SHA})"
  echo "[deploy] SUCCESS"
  exit 0
fi

# ---- Deployment failed → automatic rollback to the previous known-good ----
PREV_LABEL="${PREV:-none}"
echo "[deploy] FAILED — rolling back to ${PREV_LABEL}"
notify "🔴 DigitalSMM Backend deploy FAILED (${SHA:0:12}) — health check failed. Rolling back to ${PREV_LABEL:0:12}"

if [[ -n "$PREV" ]] && docker image inspect "${IMAGE}:${PREV}" >/dev/null 2>&1; then
  export IMAGE_TAG="$PREV"
  "${COMPOSE[@]}" up -d --no-build --force-recreate backend

  echo "[deploy] Verifying rollback (${PREV:0:12})"
  if probe "$ROLLBACK_RETRIES"; then
    echo "$PREV" > "$MARKER"
    notify "🟠 DigitalSMM Backend rollback SUCCESS — running ${PREV:0:12}"
    echo "[deploy] ROLLED BACK to ${PREV}"
    exit 1
  fi
fi

notify "🚨 CRITICAL — DigitalSMM backend recovery FAILED (${SHA:0:12}). Manual intervention required."
echo "[deploy] CRITICAL — recovery failed, manual intervention required" >&2
exit 1
