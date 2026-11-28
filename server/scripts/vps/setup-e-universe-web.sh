#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Prepare this VPS to build and serve the E-Universe front-end, so the app at
# https://embr3-onlinesystems.cloud/e-universe is served from this machine's
# disk instead of through the tailnet from the office server.
#
#   sudo -u eu-deploy eu-web-receive build v1.0.0     by hand, or
#   GitHub Actions ──SSH (eu-deploy key)──▶ "build <tag>"   on a version tag
#        │
#        ▼
#   /var/lib/eu-deploy/src (git checkout of the tag, server/.env = VITE_ keys)
#        │ npm run build
#        ▼
#   /var/www/e-universe/web ──▶ nginx: /e-universe/
#
# The API is not affected: it stays on the office server, next to the NAS and
# SQL Server, behind e-universe.embr3-onlinesystems.cloud.
#
# What it does, additive only like the other scripts in this folder:
#   - creates the account eu-deploy, with no password and no sudo;
#   - installs a Node of its own in /opt/e-universe-node (checked against
#     nodejs.org's checksums). The Node the other systems use is not touched;
#   - clones the repository to /var/lib/eu-deploy/src and creates
#     src/server/.env with the four VITE_ keys to fill in (nano);
#   - installs eu-web-receive as /usr/local/bin/eu-web-receive;
#   - creates a deploy key for GitHub Actions and allows it for eu-deploy
#     ONLY as the forced command eu-web-receive, with every SSH extra turned
#     off (restrict). It prints the key once; it is then deleted here.
#
# It does not change nginx. After the first build, switch the site over with
# add-e-universe-apex.sh static.
#
# Usage, as root:
#
#   bash setup-e-universe-web.sh            # first time, or to update the receiver
#   bash setup-e-universe-web.sh --new-key  # replace the deploy key
#
# Safe to run again; the key is only replaced with --new-key, and an
# existing .env is never overwritten.
# ---------------------------------------------------------------------------
set -euo pipefail

REPO="https://github.com/fons-sabalbosajr/embr3-ucds.git"
USER_NAME=eu-deploy
HOME_DIR=/var/lib/eu-deploy
SRC="$HOME_DIR/src"
ENV_FILE="$SRC/server/.env"
BASE=/var/www/e-universe/web
RECEIVER=/usr/local/bin/eu-web-receive
NODE_DIR=/opt/e-universe-node
NODE_LINE=24
NEW_KEY=0
[[ "${1:-}" == "--new-key" ]] && NEW_KEY=1

die() { echo "ERROR: $*" >&2; exit 1; }
step() { echo; echo "== $*"; }
as_deploy() { sudo -u "$USER_NAME" -H "$@"; }

[[ $EUID -eq 0 ]] || die "run as root"
command -v nginx >/dev/null || die "nginx is not installed"
[[ "$(uname -m)" == x86_64 ]] || die "this script installs the x64 Node; this machine is $(uname -m)"

# ---------------------------------------------------------------------------
step "Account $USER_NAME"
if ! id "$USER_NAME" >/dev/null 2>&1; then
  useradd --system --home-dir "$HOME_DIR" --create-home --shell /bin/bash "$USER_NAME"
  echo "   created"
else
  echo "   exists"
fi
# '*': no password can ever match, but the account is not "locked", which
# sshd would refuse even for a key.
usermod -p '*' "$USER_NAME"
id -nG "$USER_NAME" | grep -qwE 'sudo|admin|wheel' && die "$USER_NAME must not be in an admin group"

# ---------------------------------------------------------------------------
step "Node $NODE_LINE for E-Universe builds only ($NODE_DIR)"
if "$NODE_DIR/bin/node" -v 2>/dev/null | grep -q "^v$NODE_LINE\."; then
  echo "   $("$NODE_DIR/bin/node" -v) already installed"
else
  TMP_NODE="$(mktemp -d)"
  URL="https://nodejs.org/dist/latest-v$NODE_LINE.x"
  curl -fsSL "$URL/SHASUMS256.txt" -o "$TMP_NODE/SHASUMS256.txt"
  FILE="$(grep -oE "node-v$NODE_LINE\.[0-9]+\.[0-9]+-linux-x64\.tar\.xz" "$TMP_NODE/SHASUMS256.txt" | head -1)"
  [[ -n "$FILE" ]] || die "could not find the Node $NODE_LINE download at $URL"
  curl -fsSL "$URL/$FILE" -o "$TMP_NODE/$FILE"
  (cd "$TMP_NODE" && grep "  $FILE\$" SHASUMS256.txt | sha256sum -c --quiet -) || die "the Node download does not match its checksum"
  rm -rf "$NODE_DIR"; mkdir -p "$NODE_DIR"
  tar -xJf "$TMP_NODE/$FILE" -C "$NODE_DIR" --strip-components=1
  rm -rf "$TMP_NODE"
  echo "   $("$NODE_DIR/bin/node" -v) installed"
fi

# ---------------------------------------------------------------------------
step "Source checkout ($SRC)"
command -v git >/dev/null || { apt-get update -qq && apt-get install -y -qq git; }
if [[ ! -d "$SRC/.git" ]]; then
  as_deploy git clone --quiet "$REPO" "$SRC"
  echo "   cloned"
else
  as_deploy git -C "$SRC" fetch --quiet --force --tags origin main
  echo "   fetched"
fi

if [[ ! -f "$ENV_FILE" ]]; then
  cat > "$ENV_FILE" <<'ENV'
# E-Universe front-end build keys for this VPS (eu-web-receive build).
# ONLY the VITE_ keys: they are built into the app every visitor downloads.
# The API's secrets (MONGO_URI, SESSION_SECRET, CONFIG_ENCRYPTION_KEY, NAS,
# email, AI keys) stay on the office server; a build refuses to run if any
# other key appears here. Copy the three values from the laptop's server/.env.
VITE_API_BASE_URL=https://e-universe.embr3-onlinesystems.cloud
VITE_CRYPTOJS_ENCRYPTION_KEY=
VITE_GOOGLE_MAPS_API_KEY=
VITE_MAPTILER_KEY=
ENV
  echo "   created $ENV_FILE: fill it in with nano"
else
  echo "   $ENV_FILE exists (left as it is)"
fi
chown "$USER_NAME:$USER_NAME" "$ENV_FILE"
chmod 600 "$ENV_FILE"

# ---------------------------------------------------------------------------
step "Folders and the receiver"
mkdir -p "$BASE/releases" "$BASE/public"
chown -R "$USER_NAME:$USER_NAME" "$BASE"
chmod 755 /var/www/e-universe "$BASE" "$BASE/releases" "$BASE/public"
# Always main's copy, whatever tag the checkout is on.
RX_TMP="$(mktemp)"
as_deploy git -C "$SRC" show origin/main:server/scripts/vps/eu-web-receive.sh > "$RX_TMP"
[[ -s "$RX_TMP" ]] || die "could not read eu-web-receive.sh from main"
install -o root -g root -m 755 "$RX_TMP" "$RECEIVER"
rm -f "$RX_TMP"
echo "   $RECEIVER installed; builds go to $BASE"

# ---------------------------------------------------------------------------
step "Deploy key for GitHub Actions"
SSH_DIR="$HOME_DIR/.ssh"
AUTH="$SSH_DIR/authorized_keys"
install -d -o "$USER_NAME" -g "$USER_NAME" -m 700 "$SSH_DIR"
touch "$AUTH"; chown "$USER_NAME:$USER_NAME" "$AUTH"; chmod 600 "$AUTH"

if [[ $NEW_KEY -eq 1 || ! -s "$AUTH" ]]; then
  KEYTMP="$(mktemp -d)"
  trap 'rm -rf "$KEYTMP"' EXIT
  ssh-keygen -q -t ed25519 -N '' -C "github-actions-e-universe" -f "$KEYTMP/key"
  echo "restrict,command=\"$RECEIVER\" $(cat "$KEYTMP/key.pub")" > "$AUTH"
  HOST_IP="$(hostname -I | awk '{print $1}')"
  echo
  echo "   For CI/CD. Save both now; the private key is deleted from this machine"
  echo "   when this script ends (run again with --new-key if it is lost)."
  echo "   GitHub: the repository > Settings > Environments > production >"
  echo "   Environment secrets."
  echo
  echo "   VPS_SSH_KEY  (the whole block, both BEGIN and END lines):"
  echo
  cat "$KEYTMP/key"
  echo
  echo "   VPS_KNOWN_HOSTS:"
  echo
  echo "$HOST_IP $(cut -d' ' -f1,2 /etc/ssh/ssh_host_ed25519_key.pub)"
  echo
  echo "   And a repository variable (Settings > Secrets and variables > Actions >"
  echo "   Variables): VPS_HOST = $HOST_IP"
else
  echo "   already set (run with --new-key to replace it)"
fi

# ---------------------------------------------------------------------------
step "SSH lets $USER_NAME in"
SSHD="$(sshd -T 2>/dev/null || true)"
if grep -qi '^allowusers ' <<<"$SSHD" && ! grep -i '^allowusers ' <<<"$SSHD" | grep -qw "$USER_NAME"; then
  echo "   WARNING: sshd has AllowUsers without $USER_NAME. Add it in /etc/ssh/sshd_config"
  echo "   (or a file in /etc/ssh/sshd_config.d/), then: sshd -t && systemctl reload ssh"
elif grep -qi '^pubkeyauthentication no' <<<"$SSHD"; then
  echo "   WARNING: sshd has PubkeyAuthentication no; the deploy key cannot be used"
else
  echo "   ok"
fi

# ---------------------------------------------------------------------------
step "Status"
as_deploy "$RECEIVER" status | sed 's/^/   /'
echo
echo "Next:"
echo "   nano $ENV_FILE"
echo "   sudo -u $USER_NAME -H $RECEIVER build <tag>     e.g. v1.0.0"
echo "   bash add-e-universe-apex.sh static              once, after the first build"
