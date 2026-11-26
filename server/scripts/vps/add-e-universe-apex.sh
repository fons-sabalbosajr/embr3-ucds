#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Serve E-Universe at https://embr3-onlinesystems.cloud/e-universe — the app
# opens there and stays there (no redirect to the subdomain).
#
#   staff ──HTTPS──▶ VPS nginx (apex) ──Tailscale──▶ office server :5173 (built app)
#
# What goes where, and why:
#   - The built front-end is served under /e-universe/ from the office server's
#     "UCDS Web" (vite preview), whose base is /e-universe/ (front-end/vite.config.js).
#     Everything it serves — pages, /e-universe/assets/*, sw.js, the manifest —
#     lives under that one path, so nothing collides with HRPMS, OCSM and the
#     other systems that own the rest of embr3-onlinesystems.cloud.
#   - The API stays on the subdomain, https://e-universe.embr3-onlinesystems.cloud
#     (add-e-universe-site.sh). Its paths (/api, /socket.io, /uploads, and the
#     bare API routes) sit at the root, where they WOULD collide here, and its
#     sign-in cookie must not land on the shared apex origin next to HRPMS.
#     The app calls it cross-origin (VITE_API_BASE_URL -> the subdomain), which
#     the server already allows: ALLOWED_ORIGINS lists the apex, and the cookie
#     is SameSite=None; Secure. Long VERA checks and 256 MB uploads also avoid
#     Cloudflare's proxy limits by going to the DNS-only subdomain.
#
# The apex nginx site belongs to another system (HRPMS), so this script is
# additive only, exactly like add-e-universe-redirect.sh was:
#   - it writes its own snippet (/etc/nginx/snippets/e-universe.conf) and adds
#     at most one `include` line to the main site, nothing else;
#   - it backs the main site up first (/root/nginx-backups/);
#   - it runs `nginx -t`, and on failure restores the backup and removes the
#     snippet, so the main domain keeps the configuration it had;
#   - it supersedes the old redirect: if the main site still includes
#     e-universe-redirect.conf, that line is swapped for the new include and the
#     old snippet is removed.
#
# Prerequisites: add-e-universe-site.sh has already run on this VPS (Tailscale
# is joined as tag:ucds-proxy, so the office server's :5173 is reachable).
#
# Usage, as root:
#
#   bash add-e-universe-apex.sh <upstream>
#
#   <upstream>   the E-Universe office server on the tailnet: its machine name
#                (e.g. ucds-server) or its 100.x address
#
# Safe to run again.
# ---------------------------------------------------------------------------
set -euo pipefail

UPSTREAM_IN="${1:-}"
MAIN="embr3-onlinesystems.cloud"
WEBROOT=/var/www/e-universe
SNIPPET=/etc/nginx/snippets/e-universe.conf
OLD_SNIPPET=/etc/nginx/snippets/e-universe-redirect.conf
INCLUDE_LINE="include snippets/e-universe.conf;  # E-Universe at /e-universe (add-e-universe-apex.sh)"

die() { echo "ERROR: $*" >&2; exit 1; }
step() { echo; echo "== $*"; }

[[ $EUID -eq 0 ]] || die "run as root"
[[ -n "$UPSTREAM_IN" ]] || die "usage: bash $0 <upstream>   (e.g. ucds-server)"
[[ "$UPSTREAM_IN" =~ ^[A-Za-z0-9.-]+$ ]] || die "'$UPSTREAM_IN' does not look like a machine name or address"
command -v nginx >/dev/null || die "nginx is not installed"
nginx -t >/dev/null 2>&1 || die "nginx's configuration already fails 'nginx -t'; not touching it."

# ---------------------------------------------------------------------------
step "Office server on the tailnet"
command -v tailscale >/dev/null || die "tailscale is not installed; run add-e-universe-site.sh first"
if [[ "$UPSTREAM_IN" =~ ^100\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  UPSTREAM="$UPSTREAM_IN"
else
  UPSTREAM="$(tailscale ip -4 "$UPSTREAM_IN" 2>/dev/null | head -1 || true)"
  [[ -n "$UPSTREAM" ]] || die "no tailnet machine called '$UPSTREAM_IN'. Check 'tailscale status', or pass its 100.x address."
fi
echo "   E-Universe server: $UPSTREAM_IN = $UPSTREAM"
if curl -fsS --max-time 10 "http://$UPSTREAM:5173/e-universe/" >/dev/null 2>&1; then
  echo "   its web app answers over the tailnet"
else
  echo "   WARNING: http://$UPSTREAM:5173/e-universe/ did not answer. Continuing; visitors"
  echo "   will see the 'temporarily unavailable' page until 'UCDS Web' is running there."
fi

# ---------------------------------------------------------------------------
step "The enabled site that serves $MAIN"
SITE=""
for f in /etc/nginx/sites-enabled/*; do
  if grep -Eq "^\s*server_name\s+([^;]*\s)?${MAIN//./\\.}(\s|;)" "$f"; then SITE="$(readlink -f "$f")"; break; fi
done
[[ -n "$SITE" ]] || die "no enabled nginx site has server_name $MAIN"
echo "   $SITE"

# The offline page (shared with the subdomain site) must exist for error_page.
[[ -f "$WEBROOT/offline.html" ]] || die "$WEBROOT/offline.html is missing; run add-e-universe-site.sh first"

# ---------------------------------------------------------------------------
step "Snippet: $SNIPPET"
mkdir -p /etc/nginx/snippets
cat > "$SNIPPET" <<NGINX
# Written by server/scripts/vps/add-e-universe-apex.sh — edit there, not here.
# $MAIN/e-universe serves the E-Universe web app from the office server
# ($UPSTREAM_IN) over the tailnet. The API stays on the subdomain.
# vite preview only answers its own host name, so Host is set to localhost:5173.

# Bare path -> the app's base.
location = /e-universe { return 301 /e-universe/; }

# Hashed build files never change: cache them hard.
location ^~ /e-universe/assets/ {
    proxy_pass http://$UPSTREAM:5173;
    proxy_set_header Host localhost:5173;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_hide_header Cache-Control;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
}

# Pages, sw.js, the manifest and the other static files under the base.
location ^~ /e-universe/ {
    proxy_pass http://$UPSTREAM:5173;
    proxy_http_version 1.1;
    proxy_set_header Host localhost:5173;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    # An office server that is off should show the offline page quickly.
    proxy_connect_timeout 5s;
    proxy_read_timeout 60s;
    error_page 502 503 504 /eu-apex-offline.html;
}
location = /eu-apex-offline.html { root $WEBROOT; try_files /offline.html =503; internal; }
NGINX

# ---------------------------------------------------------------------------
step "Include it from the main site (additive, with backup and rollback)"
if grep -qF "include snippets/e-universe.conf;" "$SITE"; then
  echo "   the site already includes it"
else
  mkdir -p /root/nginx-backups
  BACKUP="/root/nginx-backups/$(basename "$SITE").$(date +%Y%m%d-%H%M%S)"
  cp -p "$SITE" "$BACKUP"
  echo "   backed up to $BACKUP"
  if grep -qF "include snippets/e-universe-redirect.conf;" "$SITE"; then
    # Supersede the old redirect: swap its include line for the new one.
    sed "s#^\(\s*\)include snippets/e-universe-redirect\.conf;.*#\1$INCLUDE_LINE#" "$BACKUP" > "$SITE"
    echo "   replaced the old redirect include"
  else
    # Add the include after each `server_name ... embr3-onlinesystems.cloud ...;`.
    awk -v line="    $INCLUDE_LINE" -v host="$MAIN" '
      { print }
      $1 == "server_name" { for (i = 2; i <= NF; i++) { h = $i; sub(/;$/, "", h); if (h == host) { print line; break } } }
    ' "$BACKUP" > "$SITE"
    echo "   added the include ($(grep -c 'e-universe.conf' "$SITE") server block(s))"
  fi
  if ! nginx -t 2>/tmp/e-universe-apex-test.log; then
    cat /tmp/e-universe-apex-test.log >&2
    cp -p "$BACKUP" "$SITE"
    rm -f "$SNIPPET"
    die "nginx rejected the change; $SITE restored from the backup, nothing else changed."
  fi
fi

nginx -t >/dev/null 2>&1 || die "nginx -t fails; not reloading."
systemctl reload nginx
# The old redirect snippet is no longer referenced; remove it so it cannot be
# re-included by mistake.
[[ -f "$OLD_SNIPPET" ]] && ! grep -rqF "e-universe-redirect.conf" /etc/nginx/sites-enabled/ && rm -f "$OLD_SNIPPET" && echo "   removed the old $OLD_SNIPPET"
sleep 2

# ---------------------------------------------------------------------------
step "Check"
for path in /e-universe /e-universe/ /e-universe/login; do
  out="$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 15 --resolve "$MAIN:443:127.0.0.1" "https://$MAIN$path" || true)"
  echo "   https://$MAIN$path -> $out"
done
echo "   HRPMS unchanged: https://$MAIN/hrpms/ -> $(curl -s -o /dev/null -w '%{http_code}' --max-time 10 --resolve "$MAIN:443:127.0.0.1" "https://$MAIN/hrpms/" || true)"
echo
echo "On the office server PC, in server/.env, the apex must be an allowed origin"
echo "(the API is cross-origin from it); VITE_API_BASE_URL stays the subdomain:"
echo "   ALLOWED_ORIGINS=https://$MAIN,https://e-universe.$MAIN"
echo
echo "To undo: delete the include line from $SITE, remove $SNIPPET, then nginx -t && systemctl reload nginx."
