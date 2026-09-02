#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# PLASU SMIS - deploy / update script
#
# Idempotent. Run it by hand on the server, or let GitHub Actions run it over
# SSH. Pulls the latest code, installs deps, rebuilds the frontend, restarts
# the API and reloads nginx, then waits for the health check.
#
#   ssh plasu@80.241.214.47 '/opt/plasu-smis/deploy/deploy.sh'
# ---------------------------------------------------------------------------
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/plasu-smis}"
BRANCH="${DEPLOY_BRANCH:-main}"

cd "$APP_DIR"

echo "==> Fetching latest code (origin/$BRANCH)"
git fetch --prune origin
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"

echo "==> Installing API dependencies"
cd "$APP_DIR/server"
npm ci --omit=dev

echo "==> Building frontend"
cd "$APP_DIR/client"
npm ci
# CI=false: don't treat lint warnings as errors. GENERATE_SOURCEMAP=false: smaller build.
CI=false GENERATE_SOURCEMAP=false npm run build

echo "==> Restarting API service"
sudo systemctl restart plasu-smis

echo "==> Testing & reloading nginx"
sudo nginx -t
sudo systemctl reload nginx

echo "==> Waiting for API health check"
for i in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:5000/api/health >/dev/null 2>&1; then
    echo "==> OK - deploy complete: http://80.241.214.47"
    exit 0
  fi
  sleep 1
done

echo "!! API did not pass health check after restart" >&2
sudo systemctl status plasu-smis --no-pager -l || true
sudo journalctl -u plasu-smis -n 40 --no-pager || true
exit 1
