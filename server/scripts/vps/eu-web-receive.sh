#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Builds E-Universe front-end releases on this VPS and switches
# https://embr3-onlinesystems.cloud/e-universe to them.
#
# Installed as /usr/local/bin/eu-web-receive by setup-e-universe-web.sh. It
# runs as eu-deploy, either by hand:
#
#   sudo -u eu-deploy eu-web-receive build v1.0.0
#
# or as the forced command of the eu-deploy SSH key that GitHub Actions uses:
# the key can do what this script allows and nothing else (no shell, no
# forwarding, no pty), and the command it asked for arrives in
# SSH_ORIGINAL_COMMAND.
#
#   build <tag>                   fetch the version tag (it must be on main),
#                                 build it with the VITE_ keys in
#                                 /var/lib/eu-deploy/src/server/.env, go live
#   deploy <40-char commit sha>   a ready build (.tar.gz of dist/) on stdin
#   rollback                      back to the release before the current one
#   status                        what is live and what is kept
#
# The .env here holds the four VITE_ keys and nothing else: they are built
# into what every visitor downloads anyway. The API's secrets stay on the
# office server, and a build refuses to run if any other key appears here.
#
# Layout, all owned by eu-deploy and read by nginx:
#
#   /var/lib/eu-deploy/src                       the source checkout builds run in
#   /var/www/e-universe/web/releases/<sha>/      one build each, last 5 kept
#   /var/www/e-universe/web/public/e-universe -> releases/<sha>   what nginx serves
#   /var/www/e-universe/web/previous             sha to roll back to
#
# The switch is one rename of a symlink, so a visitor gets either the old
# build or the new one, never half of each. Each release also carries the
# previous build's hashed assets: a tab opened before the deploy still loads
# the lazy screens its old index.html refers to.
#
# Until nginx serves from disk (add-e-universe-apex.sh static), a deploy is
# staged and reported as such; nothing is checked against the live site.
# ---------------------------------------------------------------------------
set -euo pipefail
umask 022

MAIN="embr3-onlinesystems.cloud"
BASE=/var/www/e-universe/web
RELEASES="$BASE/releases"
PUBLIC="$BASE/public"
LIVE="$PUBLIC/e-universe"
SNIPPET=/etc/nginx/snippets/e-universe.conf
SRC=/var/lib/eu-deploy/src
# A Node of its own (setup-e-universe-web.sh), so the other systems' Node on
# this VPS is never upgraded or relied on.
export PATH="/opt/e-universe-node/bin:$PATH"
KEEP=5
MAX_BYTES=$((300 * 1024 * 1024))

die() { echo "ERROR: $*" >&2; exit 1; }

# One deploy, build or rollback at a time.
lock() {
  exec 9>"$BASE/.lock"
  flock -w 900 9 || die "another deploy is still running"
}

current_sha() { [[ -L "$LIVE" ]] && basename "$(readlink "$LIVE")" || true; }

# Point the live link at a release in one rename.
switch_to() {
  ln -sfn "$RELEASES/$1" "$PUBLIC/.e-universe.next"
  mv -Tf "$PUBLIC/.e-universe.next" "$LIVE"
}

serving_from_disk() { grep -qF "$PUBLIC" "$SNIPPET" 2>/dev/null; }

# The live site serves this release: its index.html names the release's entry
# script, that script loads, and a deep link falls back to the app.
verify() {
  local sha="$1" entry page code
  serving_from_disk || { echo "   staged: nginx does not serve from disk yet (run add-e-universe-apex.sh static)"; return 0; }
  entry="$(grep -oE '/e-universe/assets/[A-Za-z0-9._-]+\.js' "$RELEASES/$sha/index.html" | head -1 || true)"
  [[ -n "$entry" ]] || { echo "   index.html names no entry script" >&2; return 1; }
  for attempt in 1 2 3; do
    page="$(curl -fsS --max-time 15 --resolve "$MAIN:443:127.0.0.1" "https://$MAIN/e-universe/?deploy=$sha" || true)"
    [[ "$page" == *"$entry"* ]] && break
    sleep 2
  done
  [[ "$page" == *"$entry"* ]] || { echo "   https://$MAIN/e-universe/ does not serve the new index.html" >&2; return 1; }
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 --resolve "$MAIN:443:127.0.0.1" "https://$MAIN$entry" || true)"
  [[ "$code" == 200 ]] || { echo "   $entry -> $code" >&2; return 1; }
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 --resolve "$MAIN:443:127.0.0.1" "https://$MAIN/e-universe/login" || true)"
  [[ "$code" == 200 ]] || { echo "   /e-universe/login -> $code" >&2; return 1; }
  echo "   live: https://$MAIN/e-universe/ serves $sha"
}

prune() {
  local keep_cur keep_prev
  keep_cur="$(current_sha)"
  keep_prev="$(cat "$BASE/previous" 2>/dev/null || true)"
  # Newest first; drop everything past $KEEP except what is live or next back.
  ls -1t "$RELEASES" | { grep -E '^[0-9a-f]{40}$' || true; } | tail -n +$((KEEP + 1)) | while read -r old; do
    [[ "$old" == "$keep_cur" || "$old" == "$keep_prev" ]] && continue
    rm -rf "${RELEASES:?}/$old"
  done
  rm -rf "$RELEASES"/.incoming-* 2>/dev/null || true
}

deploy() {
  local sha="$1" tmp prev
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || die "deploy needs a full commit sha"
  mkdir -p "$RELEASES" "$PUBLIC"
  prev="$(current_sha)"
  if [[ "$prev" == "$sha" ]]; then
    cat >/dev/null
    echo "   $sha is already live"
    verify "$sha"
    return
  fi

  tmp="$RELEASES/.incoming-$sha-$$"
  rm -rf "$tmp"; mkdir -p "$tmp"
  trap 'rm -rf "$tmp"' EXIT
  # GNU tar refuses absolute names and '..' members by default.
  head -c "$MAX_BYTES" | tar -xzf - -C "$tmp" --no-same-owner --no-same-permissions \
    || die "the build tarball could not be unpacked"
  # Only plain files and folders: a symlink in a build could make nginx serve
  # a file from elsewhere on this machine.
  if [[ -n "$(find "$tmp" ! -type f ! -type d -print -quit)" ]]; then
    die "the build contains links or special files; refused"
  fi
  [[ -f "$tmp/index.html" && -d "$tmp/assets" ]] || die "not a front-end build (no index.html or assets/)"

  # This build's own assets, then the previous build's carried forward.
  (cd "$tmp/assets" && find . -type f | sort) > "$tmp/.own-assets"
  if [[ -n "$prev" && -f "$RELEASES/$prev/.own-assets" ]]; then
    while read -r f; do
      [[ -e "$tmp/assets/$f" ]] && continue
      mkdir -p "$(dirname "$tmp/assets/$f")"
      cp -p "$RELEASES/$prev/assets/$f" "$tmp/assets/$f" 2>/dev/null || true
    done < "$RELEASES/$prev/.own-assets"
  fi

  [[ -n "${2:-}" ]] && echo "$2" > "$tmp/.version"
  rm -rf "${RELEASES:?}/$sha"
  mv "$tmp" "$RELEASES/$sha"
  trap - EXIT
  [[ -n "$prev" ]] && echo "$prev" > "$BASE/previous"
  switch_to "$sha"
  echo "   switched: ${prev:-nothing} -> $sha"

  if ! verify "$sha"; then
    if [[ -n "$prev" ]]; then
      switch_to "$prev"
      echo "$prev" > "$BASE/previous"
      die "the new build did not answer; rolled back to $prev"
    fi
    die "the new build did not answer, and there is no earlier release to go back to"
  fi
  prune
}

# The .env a build reads: present, and VITE_ keys only.
check_env() {
  local envf="$SRC/server/.env" other
  [[ -f "$envf" ]] || die "no $envf. Create it with the four VITE_ keys: nano $envf"
  other="$(grep -E '^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*[[:space:]]*=' "$envf" \
    | sed -E 's/^[[:space:]]*([A-Za-z0-9_]+).*/\1/' | grep -v '^VITE_' || true)"
  [[ -z "$other" ]] || die "$envf may hold only VITE_ keys; the API's secrets stay on the office server. Remove: $(echo $other)"
}

build() {
  local tag="$1" sha lockhash
  [[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]] || die "build needs a version tag such as v1.2.0"
  [[ -d "$SRC/.git" ]] || die "no source checkout at $SRC; run setup-e-universe-web.sh"
  command -v node >/dev/null || die "no Node at /opt/e-universe-node; run setup-e-universe-web.sh"
  check_env

  cd "$SRC"
  git fetch --quiet --force --tags origin main
  git rev-parse -q --verify "refs/tags/$tag^{commit}" >/dev/null || die "GitHub has no tag $tag (git push origin $tag)"
  sha="$(git rev-parse "refs/tags/$tag^{commit}")"
  git merge-base --is-ancestor "$sha" origin/main || die "$tag is not on main; only main is released"
  git checkout --quiet --force --detach "$sha"
  echo "   $tag = $sha, Node $(node -v)"

  cd front-end
  # npm ci only when the packages changed: it is most of a build's time.
  lockhash="$(sha256sum package-lock.json | cut -d' ' -f1)"
  if [[ "$(cat node_modules/.eu-lock-hash 2>/dev/null || true)" != "$lockhash" ]]; then
    echo "   installing packages"
    npm ci --no-audit --no-fund --loglevel=error
    echo "$lockhash" > node_modules/.eu-lock-hash
  fi
  echo "   building"
  npm run build
  tar -czf - -C dist . | deploy "$sha" "$tag"
}

rollback() {
  local prev cur
  prev="$(cat "$BASE/previous" 2>/dev/null || true)"
  cur="$(current_sha)"
  [[ -n "$prev" && -d "$RELEASES/$prev" ]] || die "no earlier release kept"
  switch_to "$prev"
  [[ -n "$cur" ]] && echo "$cur" > "$BASE/previous"
  echo "   rolled back: $cur -> $prev"
  verify "$prev"
}

version_of() { cat "$RELEASES/$1/.version" 2>/dev/null || echo "-"; }

status() {
  local cur prev
  cur="$(current_sha || true)"
  prev="$(cat "$BASE/previous" 2>/dev/null || true)"
  echo "live:     ${cur:-none} ${cur:+($(version_of "$cur"))}"
  echo "previous: ${prev:-none} ${prev:+($(version_of "$prev"))}"
  if serving_from_disk; then echo "nginx:    serves from disk"; else echo "nginx:    not yet serving from disk (add-e-universe-apex.sh static)"; fi
  echo "kept:"
  ls -1t "$RELEASES" 2>/dev/null | { grep -E '^[0-9a-f]{40}$' || true; } | while read -r r; do
    echo "          $r $(version_of "$r")"
  done
}

read -r -a CMD <<< "${SSH_ORIGINAL_COMMAND:-${*:-}}"
case "${CMD[0]:-}" in
  build)    lock; build "${CMD[1]:-}" ;;
  deploy)   lock; deploy "${CMD[1]:-}" ;;
  rollback) lock; rollback ;;
  status)   status ;;
  *)        die "allowed: build <tag> | deploy <sha> | rollback | status" ;;
esac
