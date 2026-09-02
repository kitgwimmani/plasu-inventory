#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# PLASU SMIS - deploy / update script  (pm2 + nginx-static setup)
#
# Idempotent. Run it by hand on the server, or let GitHub Actions run it over
# SSH. Pulls the latest code, installs deps, rebuilds the frontend, reloads the
# API under pm2, then waits for the health check.
#
#   ssh deploy@80.241.214.47 '~/plasu/plasu-inventory-deployed/deploy/deploy.sh'
#
# Override defaults with env vars: APP_DIR, DEPLOY_BRANCH, PM2_APP
# ---------------------------------------------------------------------------
set -euo pipefail

# Make node / npm / pm2 reachable in a non-interactive SSH session (nvm, global bins).
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
export PATH="$PATH:/usr/local/bin:/usr/bin:$HOME/.npm-global/bin:$HOME/node_modules/.bin"

APP_DIR="${APP_DIR:-$HOME/plasu/plasu-inventory-deployed}"
BRANCH="${DEPLOY_BRANCH:-main}"
PM2_APP="${PM2_APP:-plasu-smis}"

cd "$APP_DIR"

echo "==> Fetching latest code (origin/$BRANCH)"
git fetch --prune origin
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"

echo "==> Installing API dependencies"
( cd "$APP_DIR/server" && npm ci --omit=dev )

echo "==> Building frontend"
( cd "$APP_DIR/client" && npm ci && CI=false GENERATE_SOURCEMAP=false npm run build )

echo "==> Reloading API under pm2"
pm2 startOrReload "$APP_DIR/deploy/ecosystem.config.js" --update-env
pm2 save

echo "==> Waiting for API health check"
for i in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:5000/api/health >/dev/null 2>&1; then
    echo "==> OK - deploy complete: http://80.241.214.47"
    exit 0
  fi
  sleep 1
done

echo "!! API did not pass health check after reload" >&2
pm2 logs "$PM2_APP" --lines 40 --nostream || true
exit 1
