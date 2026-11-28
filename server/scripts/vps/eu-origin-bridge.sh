#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# TEMPORARY. Lets the app at https://embr3-onlinesystems.cloud/e-universe
# call the API at https://e-universe.embr3-onlinesystems.cloud while the
# office server's ALLOWED_ORIGINS does not list the apex yet.
#
# The API answers cross-origin requests only from the origins in its
# ALLOWED_ORIGINS (server/config/cors.js; socket.io uses the same list). Its
# list on the office server has the subdomain but not the apex, so a browser
# blocks every API answer to the app, sign-in included. The real fix is one
# line in the office server's server/.env and a restart:
#
#   ALLOWED_ORIGINS=https://embr3-onlinesystems.cloud,https://e-universe.embr3-onlinesystems.cloud
#
# Until then, nginx on the subdomain bridges it, for the apex ONLY:
#   - a request with Origin: https://embr3-onlinesystems.cloud is passed to
#     the API as if it came from the subdomain, which the API allows;
#   - the answer's Access-Control-Allow-Origin is set back to the apex, so
#     the browser accepts it.
# Every other origin is passed through untouched, so the API still refuses
# what it refused before. Nothing is opened to other sites.
#
# Usage, as root:
#
#   bash eu-origin-bridge.sh status   # is it on; does the office API allow the apex yet
#   bash eu-origin-bridge.sh on
#   bash eu-origin-bridge.sh off      # once ALLOWED_ORIGINS is fixed on the office server
#
# It touches only E-Universe's own nginx files: it adds two files of its own
# and one include line in /etc/nginx/sites-available/e-universe (written by
# add-e-universe-site.sh; running that again also drops the include). Every
# change is checked with `nginx -t`, and a failed check is undone.
# ---------------------------------------------------------------------------
set -euo pipefail

APEX="https://embr3-onlinesystems.cloud"
SUB_HOST="e-universe.embr3-onlinesystems.cloud"
SUB="https://$SUB_HOST"
SITE=/etc/nginx/sites-available/e-universe
MAPS=/etc/nginx/conf.d/eu-origin-bridge.conf
SNIPPET=/etc/nginx/snippets/eu-origin-bridge.conf
INCLUDE="    include snippets/eu-origin-bridge.conf;  # TEMPORARY: eu-origin-bridge.sh off once ALLOWED_ORIGINS lists the apex"
ANCHOR='proxy_set_header Connection'

die() { echo "ERROR: $*" >&2; exit 1; }
step() { echo; echo "== $*"; }

[[ $EUID -eq 0 ]] || die "run as root"
[[ -f "$SITE" ]] || die "$SITE not found; run add-e-universe-site.sh first"
# The maps live in conf.d, which Ubuntu's nginx.conf loads at http level.
grep -qE '^\s*include\s+/etc/nginx/conf\.d/\*\.conf;' /etc/nginx/nginx.conf \
  || die "/etc/nginx/nginx.conf does not include conf.d/*.conf; the bridge's maps would not load"

is_on() { grep -qF "include snippets/eu-origin-bridge.conf;" "$SITE"; }

# The office API itself, past nginx: does it allow the apex yet?
office_allows_apex() {
  local up
  up="$(grep -oE 'upstream eu_api \{ server [0-9.]+:8081' "$SITE" | grep -oE '[0-9.]+:8081' || true)"
  [[ -n "$up" ]] || return 2
  curl -s -o /dev/null -D - --max-time 10 -H "Origin: $APEX" "http://$up/healthz" 2>/dev/null \
    | grep -qi "^access-control-allow-origin: $APEX"
}

# What a browser at the apex gets back through nginx.
check_through_nginx() {
  curl -s -o /dev/null -D - --max-time 15 --resolve "$SUB_HOST:443:127.0.0.1" \
    -H "Origin: $APEX" "$SUB/healthz" | grep -i '^access-control-allow-origin' | tr -d '\r' || true
}

reload_or_undo() {
  if nginx -t 2>/tmp/eu-origin-bridge.log; then
    systemctl reload nginx
  else
    cat /tmp/eu-origin-bridge.log >&2
    cp -p "$BACKUP" "$SITE"
    rm -f "$MAPS" "$SNIPPET"
    nginx -t >/dev/null 2>&1 && systemctl reload nginx
    die "nginx rejected the change; $SITE restored, bridge files removed."
  fi
}

backup() {
  mkdir -p /root/nginx-backups
  BACKUP="/root/nginx-backups/e-universe.$(date +%Y%m%d-%H%M%S)"
  cp -p "$SITE" "$BACKUP"
  echo "   backed up $SITE to $BACKUP"
}

status() {
  if is_on; then echo "   bridge: ON"; else echo "   bridge: off"; fi
  if office_allows_apex; then
    echo "   office API allows $APEX itself: yes (the bridge is no longer needed: off)"
  else
    case $? in
      2) echo "   office API: address not found in $SITE" ;;
      *) echo "   office API allows $APEX itself: no (ALLOWED_ORIGINS not fixed yet, or the office server is off)" ;;
    esac
  fi
  echo "   a browser at the apex gets: $(check_through_nginx | sed 's/^$/no Access-Control-Allow-Origin (blocked)/')"
}

on() {
  step "Bridge on"
  if office_allows_apex; then
    echo "   The office API already allows $APEX; the bridge is not needed."
    status; return
  fi

  # http level: the origin sent to the API, and the one sent back.
  cat > "$MAPS" <<NGINX
# TEMPORARY, written by server/scripts/vps/eu-origin-bridge.sh. Remove with:
#   bash eu-origin-bridge.sh off
# The apex is passed to the E-Universe API as the subdomain (which the API
# allows), and the answer is labelled for the apex again. Other origins pass
# through unchanged.
map \$http_origin \$eu_bridge_origin_up {
    default        \$http_origin;
    "$APEX"        "$SUB";
}
# Only when the API accepted the request as the subdomain.
map \$upstream_http_access_control_allow_origin \$eu_bridge_apex_acao {
    default        "";
    "$SUB"         "$APEX";
}
map \$http_origin \$eu_bridge_acao {
    default        \$upstream_http_access_control_allow_origin;
    "$APEX"        \$eu_bridge_apex_acao;
}
NGINX

  # server level, beside the other proxy_set_header lines (see the note in
  # add-e-universe-site.sh: a location-level one would replace the list).
  cat > "$SNIPPET" <<NGINX
# TEMPORARY, written by server/scripts/vps/eu-origin-bridge.sh.
proxy_set_header Origin \$eu_bridge_origin_up;
proxy_hide_header Access-Control-Allow-Origin;
add_header Access-Control-Allow-Origin \$eu_bridge_acao always;
NGINX

  if ! is_on; then
    grep -qF "$ANCHOR" "$SITE" || die "no '$ANCHOR' line in $SITE to add the include after"
    backup
    NEWSITE="$(mktemp)"
    # After the server-level Connection header, in the 443 block only.
    awk -v inc="$INCLUDE" -v anchor="$ANCHOR" '
      { print }
      index($0, anchor) && !done { print inc; done = 1 }
    ' "$BACKUP" > "$NEWSITE"
    grep -qF "include snippets/eu-origin-bridge.conf;" "$NEWSITE" || { rm -f "$NEWSITE"; die "could not build the updated $SITE; left untouched"; }
    cp "$NEWSITE" "$SITE"; rm -f "$NEWSITE"
  else
    BACKUP="$(mktemp)"; cp -p "$SITE" "$BACKUP"
  fi
  reload_or_undo
  sleep 2

  step "Check"
  local got
  got="$(check_through_nginx)"
  echo "   a browser at the apex gets: ${got:-nothing}"
  if [[ "$got" == *"$APEX"* ]]; then
    echo "   ok: the app can reach the API. Sign in at $APEX/e-universe/ to confirm."
  else
    echo "   WARNING: no apex Access-Control-Allow-Origin yet. Is the office API up?"
    echo "   curl -s $SUB/readyz"
  fi
  echo
  echo "On Monday, after fixing ALLOWED_ORIGINS on the office server and restarting"
  echo "'UCDS API':  bash eu-origin-bridge.sh status   then   bash eu-origin-bridge.sh off"
}

off() {
  step "Bridge off"
  if ! office_allows_apex; then
    echo "   WARNING: the office API does not allow $APEX itself yet. With the bridge"
    echo "   off, sign-in from the app fails until ALLOWED_ORIGINS is fixed there."
  fi
  if is_on; then
    backup
    grep -vF "include snippets/eu-origin-bridge.conf;" "$BACKUP" > "$SITE"
  else
    BACKUP="$(mktemp)"; cp -p "$SITE" "$BACKUP"
  fi
  rm -f "$SNIPPET" "$MAPS"
  reload_or_undo
  sleep 2
  echo "   removed"
  status
}

case "${1:-status}" in
  on)     on ;;
  off)    off ;;
  status) step "Origin bridge"; status ;;
  *)      die "usage: bash $0 on | off | status" ;;
esac
