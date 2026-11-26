#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Make https://embr3-onlinesystems.cloud/e-universe open E-Universe.
#
# E-Universe itself stays on its own address, e-universe.embr3-onlinesystems.cloud
# (add-e-universe-site.sh). The main domain belongs to HRPMS and the other
# systems; serving E-Universe there would put it on their origin, where
# sign-in cookies collide and a flaw in any one system can reach the others.
# So the main domain only forwards /e-universe to the E-Universe site.
#
# The main domain's nginx site is another system's file, so this script:
#   - puts the redirect in its own snippet (/etc/nginx/snippets/e-universe-redirect.conf)
#     and adds one `include` line to that site, nothing else;
#   - backs the site file up first (/root/nginx-backups/);
#   - runs `nginx -t`, and on failure restores the backup and removes the
#     snippet, so the main domain keeps the configuration it had.
#
# Usage, as root:   bash add-e-universe-redirect.sh
# Safe to run again.
# ---------------------------------------------------------------------------
set -euo pipefail

MAIN="embr3-onlinesystems.cloud"
TARGET="https://e-universe.embr3-onlinesystems.cloud"
SNIPPET=/etc/nginx/snippets/e-universe-redirect.conf
INCLUDE_LINE="include snippets/e-universe-redirect.conf;  # E-Universe redirect (add-e-universe-redirect.sh)"

die() { echo "ERROR: $*" >&2; exit 1; }
[[ $EUID -eq 0 ]] || die "run as root"
command -v nginx >/dev/null || die "nginx is not installed"
nginx -t >/dev/null 2>&1 || die "nginx's configuration already fails 'nginx -t'; not touching it."

# The enabled site that serves the main domain.
SITE=""
for f in /etc/nginx/sites-enabled/*; do
  if grep -Eq "^\s*server_name\s+([^;]*\s)?${MAIN//./\\.}(\s|;)" "$f"; then SITE="$(readlink -f "$f")"; break; fi
done
[[ -n "$SITE" ]] || die "no enabled nginx site has server_name $MAIN"
echo "== Main domain site: $SITE"

echo "== Snippet: $SNIPPET"
mkdir -p /etc/nginx/snippets
cat > "$SNIPPET" <<NGINX
# Written by server/scripts/vps/add-e-universe-redirect.sh.
# $MAIN/e-universe opens E-Universe on its own address.
location = /e-universe { return 301 $TARGET/e-universe; }
location ^~ /e-universe/ { return 301 $TARGET\$request_uri; }
NGINX

if grep -qF "include snippets/e-universe-redirect.conf;" "$SITE"; then
  echo "   the site already includes it"
else
  mkdir -p /root/nginx-backups
  BACKUP="/root/nginx-backups/$(basename "$SITE").$(date +%Y%m%d-%H%M%S)"
  cp -p "$SITE" "$BACKUP"
  echo "== Backed up to $BACKUP"
  # After each `server_name ... embr3-onlinesystems.cloud ...;` line: the HTTPS
  # server block, and the plain-HTTP one if it has its own locations.
  awk -v line="    $INCLUDE_LINE" -v host="$MAIN" '
    { print }
    $1 == "server_name" { for (i = 2; i <= NF; i++) { h = $i; sub(/;$/, "", h); if (h == host) { print line; break } } }
  ' "$BACKUP" > "$SITE"
  if ! nginx -t 2>/tmp/e-universe-redirect-test.log; then
    cat /tmp/e-universe-redirect-test.log >&2
    cp -p "$BACKUP" "$SITE"
    rm -f "$SNIPPET"
    die "nginx rejected the change; $SITE restored from the backup, nothing else changed."
  fi
  echo "   added the include line ($(grep -c 'e-universe-redirect.conf' "$SITE") server block(s))"
fi

nginx -t >/dev/null 2>&1 || die "nginx -t fails; not reloading."
systemctl reload nginx
sleep 2

echo "== Check"
for path in /e-universe /e-universe/login; do
  loc="$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 10 --resolve "$MAIN:443:127.0.0.1" "https://$MAIN$path" || true)"
  echo "   https://$MAIN$path -> $loc"
done
echo "   HRPMS unchanged: https://$MAIN/hrpms/ -> $(curl -s -o /dev/null -w '%{http_code}' --max-time 10 --resolve "$MAIN:443:127.0.0.1" "https://$MAIN/hrpms/" || true)"
echo
echo "To undo: delete the include line from $SITE, remove $SNIPPET, then nginx -t && systemctl reload nginx."
