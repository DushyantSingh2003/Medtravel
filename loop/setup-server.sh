#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 22.04/24.04 server for the MedTravel build loop.
# Run as root:   sudo bash loop/setup-server.sh git@github.com:<you>/medtravel.git
#
# Installs: git, jq, build tools, Docker Engine, Node.js 22 + pnpm, GitHub CLI, Claude Code (apt, stable channel).
# Creates:  non-root user "builder", SSH deploy key, repo clone in /home/builder/medtravel,
#           env file /home/builder/.config/medtravel-loop/env, systemd service "medtravel-loop" (not started).
set -euo pipefail

REPO_URL="${1:-}"
BUILD_USER="${BUILD_USER:-builder}"
HOME_DIR="/home/${BUILD_USER}"
APP_DIR="${HOME_DIR}/medtravel"

if [[ $EUID -ne 0 ]]; then echo "Run as root (sudo)." >&2; exit 1; fi
if [[ -z "$REPO_URL" ]]; then echo "Usage: sudo bash setup-server.sh <git-ssh-url>" >&2; exit 1; fi

echo "==> Base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg git jq unzip build-essential tmux htop

echo "==> Swap (helps Next.js builds on 8 GB machines)"
if ! swapon --show | grep -q .; then
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Docker Engine"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

echo "==> Node.js 22 + pnpm"
if ! command -v node >/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 22 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
corepack enable
corepack prepare pnpm@latest --activate

echo "==> GitHub CLI"
if ! command -v gh >/dev/null; then
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /etc/apt/keyrings/githubcli-archive-keyring.gpg
  chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list
  apt-get update -y && apt-get install -y gh
fi

echo "==> Claude Code (signed apt repository, stable channel)"
if ! command -v claude >/dev/null; then
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://downloads.claude.ai/keys/claude-code.asc -o /etc/apt/keyrings/claude-code.asc
  gpg --show-keys /etc/apt/keyrings/claude-code.asc | grep -q 31DDDE24DDFAB679F42D7BD2BAA929FF1A7ECACE \
    || { echo "Claude Code signing key fingerprint mismatch" >&2; exit 1; }
  echo "deb [signed-by=/etc/apt/keyrings/claude-code.asc] https://downloads.claude.ai/claude-code/apt/stable stable main" > /etc/apt/sources.list.d/claude-code.list
  apt-get update -y && apt-get install -y claude-code
fi

echo "==> Build user ${BUILD_USER} (non-root, in docker group)"
id "$BUILD_USER" >/dev/null 2>&1 || useradd -m -s /bin/bash "$BUILD_USER"
usermod -aG docker "$BUILD_USER"

echo "==> SSH deploy key"
sudo -u "$BUILD_USER" mkdir -p "${HOME_DIR}/.ssh"
if [[ ! -f "${HOME_DIR}/.ssh/id_ed25519" ]]; then
  sudo -u "$BUILD_USER" ssh-keygen -t ed25519 -N "" -C "medtravel-build-loop" -f "${HOME_DIR}/.ssh/id_ed25519"
fi
sudo -u "$BUILD_USER" bash -c "ssh-keyscan github.com >> ~/.ssh/known_hosts 2>/dev/null; sort -u -o ~/.ssh/known_hosts ~/.ssh/known_hosts"

echo "==> Env file"
ENV_DIR="${HOME_DIR}/.config/medtravel-loop"
sudo -u "$BUILD_USER" mkdir -p "$ENV_DIR"
if [[ ! -f "${ENV_DIR}/env" ]]; then
  cat > "${ENV_DIR}/env" <<'EOF'
# --- Claude authentication: set ONE of these ---
# Subscription (Pro/Max): run `claude setup-token` on any computer with a browser and paste the token here.
CLAUDE_CODE_OAUTH_TOKEN=
# Or pay-per-use API billing from the Claude Console (takes precedence over the token if both are set):
# ANTHROPIC_API_KEY=

# --- Optional notifications ---
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
# Slack/Discord-style incoming webhook
NOTIFY_WEBHOOK_URL=

# --- Optional: only needed when loop/config.json uses "mergeMode": "pr" ---
# Fine-grained GitHub token for this one repo: Contents + Pull requests read/write
GH_TOKEN=

# Keep Claude Code on the version apt installed while the loop runs
DISABLE_AUTOUPDATER=1
EOF
  chown "$BUILD_USER:$BUILD_USER" "${ENV_DIR}/env"
  chmod 600 "${ENV_DIR}/env"
fi

echo "==> Git identity"
sudo -u "$BUILD_USER" git config --global user.name "MedTravel Build Loop"
sudo -u "$BUILD_USER" git config --global user.email "build-loop@users.noreply.github.com"
sudo -u "$BUILD_USER" git config --global pull.ff only

echo "==> systemd service"
cat > /etc/systemd/system/medtravel-loop.service <<EOF
[Unit]
Description=MedTravel autonomous build loop (Claude Code)
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
User=${BUILD_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_DIR}/env
Environment=PATH=/usr/local/bin:/usr/bin:/bin:${HOME_DIR}/.local/bin
ExecStart=/usr/bin/node loop/runner.mjs run
Restart=on-failure
RestartSec=120
KillSignal=SIGINT
TimeoutStopSec=180

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload

cat <<EOF

============================================================
Setup done. Next steps (see loop/README.md for details):

1. Add this deploy key to your GitHub repo
   (Settings > Deploy keys > Add, tick "Allow write access"):

$(cat "${HOME_DIR}/.ssh/id_ed25519.pub")

2. Clone the repo as ${BUILD_USER}:
   sudo -iu ${BUILD_USER} git clone ${REPO_URL} ${APP_DIR}

3. Put your Claude token in ${ENV_DIR}/env
   sudo -iu ${BUILD_USER} nano ${ENV_DIR}/env

4. Preflight + first task by hand:
   sudo -iu ${BUILD_USER}
   cd ${APP_DIR} && set -a && . ${ENV_DIR}/env && set +a
   node loop/runner.mjs check
   node loop/runner.mjs once

5. Then let it run on its own:
   sudo systemctl enable --now medtravel-loop
   journalctl -u medtravel-loop -f
============================================================
EOF
