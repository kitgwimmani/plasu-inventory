#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# PLASU SMIS - one-time server provisioning for a fresh Contabo VPS
# (Ubuntu 22.04 / 24.04). Run as root:
#
#   ssh root@80.241.214.47
#   git clone <REPO_URL> /opt/plasu-smis
#   bash /opt/plasu-smis/deploy/setup.sh <REPO_URL>
#
# Safe to re-run. After this finishes, deploys are just deploy/deploy.sh.
# ---------------------------------------------------------------------------
set -euo pipefail

REPO_URL="${1:-}"
BRANCH="${2:-main}"
APP_DIR="/opt/plasu-smis"
APP_USER="plasu"
NODE_MAJOR="22"

if [[ $EUID -ne 0 ]]; then
  echo "Run this as root (sudo)." >&2
  exit 1
fi
if [[ -z "$REPO_URL" && ! -d "$APP_DIR/.git" ]]; then
  echo "Usage: bash setup.sh <git-repo-url> [branch]" >&2
  exit 1
fi

echo "==> Installing base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git nginx ca-certificates gnupg ufw

echo "==> Installing Node.js ${NODE_MAJOR}.x (needs >= 22.5 for node:sqlite)"
if ! command -v node >/dev/null || [[ "$(node -p 'process.versions.node.split(".")[0]')" -lt "$NODE_MAJOR" ]]; then
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list
  apt-get update -y
  apt-get install -y nodejs
fi
node -v

echo "==> Creating service user '${APP_USER}'"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"

echo "==> Fetching application into ${APP_DIR}"
if [[ -d "$APP_DIR/.git" ]]; then
  git -C "$APP_DIR" remote set-url origin "${REPO_URL:-$(git -C "$APP_DIR" remote get-url origin)}"
else
  git clone "$REPO_URL" "$APP_DIR"
fi
git -C "$APP_DIR" fetch --prune origin
git -C "$APP_DIR" checkout "$BRANCH"
git -C "$APP_DIR" reset --hard "origin/$BRANCH"

echo "==> Preparing server/.env"
ENV_FILE="$APP_DIR/server/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  cp "$APP_DIR/server/.env.example" "$ENV_FILE"
  SECRET="$(openssl rand -hex 48)"
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${SECRET}|" "$ENV_FILE"
  echo "   generated a fresh JWT_SECRET"
else
  echo "   keeping existing $ENV_FILE"
fi

echo "==> Ownership + git safe.directory"
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"
git config --global --add safe.directory "$APP_DIR"
sudo -u "$APP_USER" git config --global --add safe.directory "$APP_DIR" || true

echo "==> Allowing ${APP_USER} to manage its own services without a password"
cat > /etc/sudoers.d/plasu-smis <<EOF
$APP_USER ALL=(root) NOPASSWD: /bin/systemctl restart plasu-smis, /bin/systemctl reload nginx, /usr/sbin/nginx -t, /bin/systemctl status plasu-smis, /usr/bin/journalctl -u plasu-smis *
EOF
chmod 440 /etc/sudoers.d/plasu-smis

echo "==> Installing systemd service"
cp "$APP_DIR/deploy/plasu-smis.service" /etc/systemd/system/plasu-smis.service
systemctl daemon-reload
systemctl enable plasu-smis

echo "==> Installing nginx site"
cp "$APP_DIR/deploy/nginx/plasu-smis.conf" /etc/nginx/sites-available/plasu-smis
ln -sf /etc/nginx/sites-available/plasu-smis /etc/nginx/sites-enabled/plasu-smis
rm -f /etc/nginx/sites-enabled/default

echo "==> Firewall (SSH + HTTP)"
ufw allow OpenSSH >/dev/null 2>&1 || true
ufw allow 'Nginx Full' >/dev/null 2>&1 || true
yes | ufw enable >/dev/null 2>&1 || true

echo "==> First build + start (deploy.sh)"
sudo -u "$APP_USER" env APP_DIR="$APP_DIR" DEPLOY_BRANCH="$BRANCH" bash "$APP_DIR/deploy/deploy.sh" || {
  # deploy.sh restarts an already-enabled service; on the very first run the
  # unit may not be started yet, so start it explicitly and retry the build bits.
  systemctl start plasu-smis
  sudo -u "$APP_USER" env APP_DIR="$APP_DIR" DEPLOY_BRANCH="$BRANCH" bash "$APP_DIR/deploy/deploy.sh"
}

systemctl restart nginx

echo
echo "=========================================================="
echo " PLASU SMIS is live:  http://80.241.214.47"
echo
echo " Default logins (CHANGE THESE IMMEDIATELY):"
echo "   superadmin@plasu.edu.ng  /  Passw0rd!"
echo
echo " Next: add the CI deploy key to ${APP_USER}'s authorized_keys"
echo " (see deploy/README.md), then push to '${BRANCH}' to auto-deploy."
echo "=========================================================="
