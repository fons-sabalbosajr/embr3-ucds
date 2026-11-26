#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Publish E-Universe at https://<subdomain> through the nginx already running
# on the shared EMB R3 VPS, beside HRPMS, OCSM and the other systems.
#
#   staff anywhere ──HTTPS──▶ VPS nginx ──Tailscale──▶ office server PC (E-Universe) ──LAN──▶ NAS
#
# E-Universe runs on the office server PC, next to the NAS; its share
# passwords stay in that machine's Windows vault (rotated from Storage
# Configuration, restored at every start). This VPS only terminates HTTPS and
# passes requests along. It never reaches the NAS: the tailnet policy lets
# tag:ucds-proxy open the E-Universe server's ports 5173 and 8081 and nothing
# else (docs/tailscale-policy.hujson, Part 3).
#
# This VPS serves other live systems, so the script is additive only:
#   - it writes its own files (sites-available/e-universe, a webroot and an
#     offline page) and never edits another site's configuration;
#   - every nginx change is checked with `nginx -t` before a reload, and on a
#     failed check its own file is removed again, so the other sites keep
#     running on the configuration they had;
#   - the firewall gains one rule (Tailscale's UDP port) and loses none;
#   - Tailscale does not take over DNS (--accept-dns=false); the office server
#     is addressed by its tailnet IP, so nothing else on this machine resolves
#     names any differently.
#
# Prerequisites:
#   1. Cloudflare DNS: an A record for the subdomain -> this VPS, set to
#      "DNS only" (grey cloud). Cloudflare's proxy ends any request at 100 s
#      and caps uploads at 100 MB; VERA's bulk checks run longer and ERMS
#      uploads go to 256 MB.
#   2. tag:ucds-proxy in the tailnet policy.
#
# Usage, as root:
#
#   bash add-e-universe-site.sh <upstream> [subdomain]
#
#   <upstream>   the E-Universe server on the tailnet: its machine name
#                (e.g. ucds-server) or its 100.x address
#   [subdomain]  default e-universe.embr3-onlinesystems.cloud
#
# Safe to run again.
# ---------------------------------------------------------------------------
set -euo pipefail

UPSTREAM_IN="${1:-}"
SITE="${2:-e-universe.embr3-onlinesystems.cloud}"
TS_HOSTNAME="ucds-front-door"
CONF=/etc/nginx/sites-available/e-universe
LINK=/etc/nginx/sites-enabled/e-universe
WEBROOT=/var/www/e-universe
LE_LIVE="/etc/letsencrypt/live/$SITE"

die() { echo "ERROR: $*" >&2; exit 1; }
step() { echo; echo "== $*"; }

[[ $EUID -eq 0 ]] || die "run as root"
[[ -n "$UPSTREAM_IN" ]] || die "usage: bash $0 <upstream> [subdomain]"
[[ "$UPSTREAM_IN" =~ ^[A-Za-z0-9.-]+$ ]] || die "'$UPSTREAM_IN' does not look like a machine name or address"
[[ "$SITE" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || die "'$SITE' does not look like a domain name"
command -v nginx >/dev/null || die "nginx is not installed"
command -v certbot >/dev/null || die "certbot is not installed"
nginx -t >/dev/null 2>&1 || die "nginx's configuration is already failing 'nginx -t'. Fix that first; this script will not reload on top of it."

# Reload only after a passing check; otherwise take our file back out.
safe_reload() {
  if nginx -t 2>/tmp/e-universe-nginx-test.log; then
    systemctl reload nginx
  else
    cat /tmp/e-universe-nginx-test.log >&2
    rm -f "$LINK"
    nginx -t >/dev/null 2>&1 && systemctl reload nginx
    die "nginx rejected the E-Universe site; it has been removed again and the other sites are unchanged."
  fi
}

# ---------------------------------------------------------------------------
step "DNS: $SITE must point straight at this VPS (Cloudflare: DNS only)"
MY_IPS=" $(hostname -I) "
# Asked of public DNS (Cloudflare's 1.1.1.1, over HTTPS), not this machine's
# resolver: what matters is what the Internet sees, because that is what
# Let's Encrypt checks. The provider's resolver may still hold a "no such
# name" answer from before the record existed, for up to the zone's negative
# TTL (30 minutes on Cloudflare), and nothing on this machine can clear it.
# getent is the fallback only if 1.1.1.1 cannot be reached. Failures are
# absorbed (|| true): under pipefail they would end the script without a word.
DNS_IPS="$( { curl -fsS --max-time 10 -H 'accept: application/dns-json' \
  "https://1.1.1.1/dns-query?name=$SITE&type=A" || true; } \
  | grep -oE '"data":"[0-9.]+"' | grep -oE '[0-9.]+' | sort -u | tr '\n' ' ')"
if [[ -z "$DNS_IPS" ]]; then
  DNS_IPS="$( { getent ahostsv4 "$SITE" || true; } | awk '{print $1}' | sort -u | tr '\n' ' ')"
fi
[[ -n "$DNS_IPS" ]] || die "$SITE does not resolve yet. In Cloudflare: DNS > Add record > A, name e-universe, IPv4 72.61.125.232, Proxy status DNS only. Then run again."
MATCH=""
for ip in $DNS_IPS; do
  if [[ "$MY_IPS" == *" $ip "* ]]; then MATCH="$ip"; fi
done
if [[ -z "$MATCH" ]]; then
  die "$SITE resolves to $DNS_IPS, not this VPS. If those are Cloudflare addresses, switch the record to 'DNS only' (grey cloud) and run again."
fi
echo "   $SITE -> $MATCH (this VPS)"

# ---------------------------------------------------------------------------
step "Tailscale (joins as $TS_HOSTNAME, tag:ucds-proxy; DNS left alone)"
if ! command -v tailscale >/dev/null; then
  curl -fsSL https://tailscale.com/install.sh | sh
fi
if ! tailscale status >/dev/null 2>&1; then
  echo "   Sign in with the tailnet's admin account when the link appears."
  tailscale up --hostname="$TS_HOSTNAME" --advertise-tags=tag:ucds-proxy --accept-dns=false
else
  tailscale set --hostname="$TS_HOSTNAME" --accept-dns=false
fi
# Direct connections instead of a relay: lower latency to the office.
ufw status | grep -q '41641/udp' || ufw allow 41641/udp comment 'Tailscale direct connections' >/dev/null

if [[ "$UPSTREAM_IN" =~ ^100\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  UPSTREAM="$UPSTREAM_IN"
else
  UPSTREAM="$(tailscale ip -4 "$UPSTREAM_IN" 2>/dev/null | head -1 || true)"
  [[ -n "$UPSTREAM" ]] || die "no tailnet machine called '$UPSTREAM_IN'. Check 'tailscale status', or pass its 100.x address."
fi
echo "   E-Universe server: $UPSTREAM_IN = $UPSTREAM"

if curl -fsS --max-time 10 "http://$UPSTREAM:8081/healthz" >/dev/null; then
  echo "   its API answers over the tailnet"
else
  echo "   WARNING: http://$UPSTREAM:8081/healthz did not answer (office server off, not tagged"
  echo "   tag:ucds-server, or the policy not applied). Continuing; visitors will see the"
  echo "   'temporarily unavailable' page until it answers."
fi

# ---------------------------------------------------------------------------
step "Offline page and certificate webroot"
mkdir -p "$WEBROOT/.well-known/acme-challenge"
cat > "$WEBROOT/offline.html" <<'HTML'
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>E-Universe is temporarily unavailable</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:linear-gradient(160deg,#0f1a2a,#1a3150);color:#eef2f8;padding:24px}main{max-width:520px;text-align:center}h1{font-size:22px;margin:0 0 12px}p{line-height:1.6;color:rgba(238,242,248,.78)}</style></head>
<body><main><h1>E-Universe is temporarily unavailable</h1>
<p>The office server that runs E-Universe is not reachable right now, usually because of a power or internet interruption at the office. Please try again in a few minutes.</p>
<p>Environmental Management Bureau &middot; Region III</p></main></body></html>
HTML

# ---------------------------------------------------------------------------
step "Certificate for $SITE (Let's Encrypt, renewed by certbot's timer)"
if [[ ! -f "$LE_LIVE/fullchain.pem" ]]; then
  # Port 80 only, to answer the certificate check.
  cat > "$CONF" <<NGINX
# E-Universe — temporary, until its certificate exists. Rewritten by
# server/scripts/vps/add-e-universe-site.sh.
server {
    listen 80;
    server_name $SITE;
    location ^~ /.well-known/acme-challenge/ { root $WEBROOT; }
    location / { return 503; }
}
NGINX
  ln -sf "$CONF" "$LINK"
  safe_reload
  certbot certonly --webroot -w "$WEBROOT" -d "$SITE" --non-interactive --agree-tos \
    --register-unsafely-without-email --keep-until-expiring \
    --deploy-hook "systemctl reload nginx"
fi
[[ -f "$LE_LIVE/fullchain.pem" ]] || die "no certificate was issued for $SITE"

SSL_OPTS=""
[[ -f /etc/letsencrypt/options-ssl-nginx.conf ]] && SSL_OPTS="include /etc/letsencrypt/options-ssl-nginx.conf;"
SSL_DH=""
[[ -f /etc/letsencrypt/ssl-dhparams.pem ]] && SSL_DH="ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;"

# ---------------------------------------------------------------------------
step "The E-Universe site"
cat > "$CONF" <<NGINX
# E-Universe at https://$SITE
# Written by server/scripts/vps/add-e-universe-site.sh — edit there, not here.
# Everything is proxied over the tailnet to the office server ($UPSTREAM_IN).
# Every name below starts with eu_ so nothing collides with the other sites.

upstream eu_api { server $UPSTREAM:8081; keepalive 16; }   # Express API
upstream eu_web { server $UPSTREAM:5173; keepalive 8; }    # vite preview of the build

map \$http_upgrade \$eu_connection { default upgrade; '' ''; }

# /login, /register and /reset-password are both the API's POST and the web
# app's old-bookmark redirects, so a request a browser makes as a page load
# goes to the web app and anything else to the API.
map "\$request_method:\$http_accept" \$eu_root_upstream {
    default                     eu_api;
    "~^(GET|HEAD):.*text/html"  eu_web;
}
# vite preview only answers its own host name.
map \$eu_root_upstream \$eu_root_host {
    eu_web   "localhost:5173";
    default  \$host;
}

server {
    listen 80;
    server_name $SITE;
    location ^~ /.well-known/acme-challenge/ { root $WEBROOT; }
    location / { return 301 https://\$host\$request_uri; }
}

server {
    listen 443 ssl;
    server_name $SITE;

    ssl_certificate     $LE_LIVE/fullchain.pem;
    ssl_certificate_key $LE_LIVE/privkey.pem;
    $SSL_OPTS
    $SSL_DH

    # ERMS accepts scans up to 256 MB.
    client_max_body_size 260m;

    # All proxy headers live here, at server level. A proxy_set_header inside a
    # location would replace this whole list rather than add to it, silently
    # dropping X-Forwarded-Proto (no Secure cookie, so no sign-in) and the
    # websocket headers. Locations choose the Host through \$eu_host instead.
    set \$eu_host \$host;
    proxy_http_version 1.1;
    proxy_set_header Host              \$eu_host;
    proxy_set_header X-Real-IP         \$remote_addr;
    proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Upgrade           \$http_upgrade;
    proxy_set_header Connection        \$eu_connection;
    # An office server that is off should show the offline page at once, not
    # after a minute; long answers (VERA's checks) may take up to 30 minutes.
    proxy_connect_timeout 5s;
    proxy_send_timeout    1800s;
    proxy_read_timeout    1800s;

    error_page 502 503 504 /eu-offline.html;
    location = /eu-offline.html { root $WEBROOT; try_files /offline.html =503; internal; }

    # --- The API: /api and everything it serves outside /api, from its live
    # router (shared/routeInventory). Always the API, even as a page load, so
    # a document opened in a new tab still reaches it.
    location ^~ /api/ {
        proxy_buffering off;              # documents stream as they are read
        proxy_pass http://eu_api;
    }
    location ^~ /socket.io/ {
        proxy_read_timeout 3600s;
        proxy_pass http://eu_api;
    }
    location ^~ /uploads/ {
        proxy_pass http://eu_api;
    }
    location ~ ^/(healthz|readyz|archive-data|auth-check|check-auth|check-data|current-user|generate-custom-icir|generate-icir|protected-route|save-draft-report|save-draft-report-survey|ucds|ucds-data)(/|\$) {
        proxy_pass http://eu_api;
    }

    # --- The built front-end. Hashed file names never change.
    location ^~ /assets/ {
        set \$eu_host "localhost:5173";
        proxy_pass http://eu_web;
        proxy_hide_header Cache-Control;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
    }
    location ~ ^/(sw\.js|manifest\.webmanifest|index\.html|[^/]+\.(png|svg|ico))\$ {
        set \$eu_host "localhost:5173";
        proxy_pass http://eu_web;
    }

    # --- Everything else: page loads to the web app, the rest to the API.
    location / {
        set \$eu_host \$eu_root_host;
        proxy_pass http://\$eu_root_upstream;
    }
}
NGINX
ln -sf "$CONF" "$LINK"
safe_reload
echo "   nginx serves https://$SITE"

# ---------------------------------------------------------------------------
step "Check from this VPS"
# Straight to this machine's nginx (--resolve), so a stale answer in the
# provider's resolver cannot make a working site look broken.
code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 --resolve "$SITE:443:127.0.0.1" "https://$SITE/healthz" || true)"
case "$code" in
  200) echo "   https://$SITE/healthz -> 200: the office server answers through the front door" ;;
  503) echo "   https://$SITE/healthz -> 503: the front door works; the office server is not answering yet" ;;
  *)   echo "   https://$SITE/healthz -> $code" ;;
esac

step "Done"
echo "   On the office server PC, in server/.env, then rebuild the front-end (npm run build):"
echo "     ALLOWED_ORIGINS=https://$SITE"
echo "     VITE_API_BASE_URL=https://$SITE"
[[ -f /var/run/reboot-required ]] && echo "   This VPS has updates waiting for a restart; schedule one when the other systems can take a short break."
exit 0
