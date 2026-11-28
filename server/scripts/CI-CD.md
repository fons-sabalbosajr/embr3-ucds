# E-Universe CI/CD

How a release reaches https://embr3-onlinesystems.cloud/e-universe.

```
git push            ──▶ GitHub Actions: check (tests, route guards, lint, build, budget)

git push origin v1.2.0 ──▶ check ─┬─▶ deploy-web ──SSH "build v1.2.0"──▶ VPS: git checkout v1.2.0,
                                  │                                       npm run build with its .env,
                                  │                                       go live at /e-universe/
                                  │
                                  └─◀── office server, every 3 min: "newest tag, check passed?"
                                        yes ─▶ git pull, npm ci, sql:migrate, restart UCDS API
```

- **Releases are version tags.** Pushing to `main` only runs the checks.
  Pushing a tag such as `v1.2.0` releases it. The tag must be on `main`.
- **Front-end: built and served on the VPS.** Its keys are in a `.env` on the
  VPS that you edit with `nano`: the four `VITE_` keys and nothing else.
  They are built into what every visitor downloads anyway. GitHub holds no
  app keys at all.
- **API: stays on the office server.** It reads the NAS through Windows and
  writes to SQL Server on that machine, and its secrets (`MONGO_URI`,
  `SESSION_SECRET`, `CONFIG_ENCRYPTION_KEY`, NAS, email, AI keys) never leave
  it. The VPS build refuses to run if any of them appears in its `.env`.
- **The office server pulls; nothing connects to it.** The repository is
  public, so no workflow runs on a machine of ours.
- **Both sides roll back on their own.** The VPS switches back if the new
  build does not answer. The office server returns to the previous commit if
  the API fails `/healthz` or `/readyz`.

---

## First release, by hand

### 1. Laptop: push the code

```bash
git push origin main
```

### 2. Laptop: tag the first release

```bash
git tag -a v1.0.0 -m "First release served from the VPS"
git push origin v1.0.0
```

GitHub Actions runs `check` on it. `deploy-web` is skipped until step 9.

### 3. VPS: set up (as root)

```bash
mkdir -p /root/e-universe && cd /root/e-universe
for f in setup-e-universe-web.sh add-e-universe-apex.sh; do
  curl -fsSLO "https://raw.githubusercontent.com/fons-sabalbosajr/embr3-ucds/main/server/scripts/vps/$f"
done
bash setup-e-universe-web.sh
```

This creates the `eu-deploy` account, a Node used only by these builds
(`/opt/e-universe-node`; the Node of the other systems is not touched), the
source checkout, the `.env` template, and the receiver. It also prints a
deploy key. You can ignore that key for now; step 9 makes a fresh one.

### 4. VPS: the `.env`

```bash
nano /var/lib/eu-deploy/src/server/.env
```

`VITE_API_BASE_URL` is already filled in. Copy the other three values from
the laptop's `server/.env`:

```ini
VITE_API_BASE_URL=https://e-universe.embr3-onlinesystems.cloud
VITE_CRYPTOJS_ENCRYPTION_KEY=<the laptop's value, exactly; a different one makes what browsers stored unreadable>
VITE_GOOGLE_MAPS_API_KEY=<the laptop's value>
VITE_MAPTILER_KEY=<the laptop's value>
```

Nothing else goes in this file.

### 5. VPS: build v1.0.0

```bash
sudo -u eu-deploy -H eu-web-receive build v1.0.0
```

It takes a few minutes the first time, while it installs packages. It ends
with `staged: nginx does not serve from disk yet`. Visitors still get the
office server's copy.

### 6. VPS: serve the app from disk

```bash
cd /root/e-universe && bash add-e-universe-apex.sh static
```

It backs up the main site's nginx file, rewrites only
`/etc/nginx/snippets/e-universe.conf`, runs `nginx -t` before reloading, and
checks `/e-universe/`, `/e-universe/login` and HRPMS.

### 7. Check

- Open https://embr3-onlinesystems.cloud/e-universe/, sign in, and open a
  scanned document.
- On the VPS: `sudo -u eu-deploy -H eu-web-receive status` shows
  `live: … (v1.0.0)` and `nginx: serves from disk`.

### 8. Office server: the API at v1.0.0

In an elevated PowerShell on `emb3winsrvr2019`:

```powershell
cd C:\ucds\embr3-ucds
git pull
nssm stop "UCDS API"
cd server; npm ci; npm run sql:migrate
nssm start "UCDS API"
```

Then check that http://localhost:8081/healthz answers. This is the manual
update from [winserver/README.md](winserver/README.md).

---

## Switching CI/CD on

### 9. GitHub: the deploy key

On the VPS:

```bash
cd /root/e-universe && bash setup-e-universe-web.sh --new-key
```

In GitHub, open the repository's **Settings**:

| Where | Name | Value |
|---|---|---|
| Environments → New environment `production` → Environment secrets | `VPS_SSH_KEY` | the whole key block, `BEGIN` and `END` lines included |
| same | `VPS_KNOWN_HOSTS` | the `72.61.125.232 ssh-ed25519 …` line |
| same environment → **Environment variables** | `VPS_HOST` | `72.61.125.232` |

From then on every version tag deploys. Optional, on the
`production` environment: **Deployment tags** `v*` only, and **Required
reviewers** if each release should wait for your approval.

### 10. Office server: automatic API updates

```powershell
cd C:\ucds\embr3-ucds\server\scripts\winserver
.\5-auto-update.ps1
Start-ScheduledTask "E-Universe update"; Get-Content C:\ucds\logs\update.log -Tail 20
```

The checkout must be on `main` with no edited tracked files. `update.ps1`
refuses to touch it otherwise, and logs why.

### 11. Later: retire "UCDS Web" on the office server

After a few releases without needing the fallback:

```powershell
Stop-Service "UCDS Web"; Set-Service "UCDS Web" -StartupType Manual
```

---

## Every release after that

```bash
git push origin main                 # checks run; nothing is released
git tag -a v1.0.1 -m "What changed"
git push origin v1.0.1               # released
```

- **About 5 minutes:** `check` passes, then the VPS builds the tag and switches
  to it. The new front-end reaches everyone on their next page load
  (`index.html` is never cached).
- **Within 3 more minutes:** if `server/` changed, the office API restarts on
  the tag. Visitors see "temporarily unavailable" for the seconds of the
  restart, or for a few minutes when `server/package-lock.json` changed.

The front-end goes live a few minutes before the API. If new screens need a
new endpoint, release the server change first and the screens in the next
tag.

Version numbers: `v1.0.1` for fixes, `v1.1.0` for new features, `v2.0.0` for
a change staff must be told about.

## Rolling back

| What | How |
|---|---|
| Front-end, one release back | On the VPS: `sudo -u eu-deploy -H eu-web-receive rollback`. The last 5 releases are kept |
| Front-end, a specific version | On the VPS: `sudo -u eu-deploy -H eu-web-receive build v1.0.0` |
| Front-end from the office again | `bash add-e-universe-apex.sh ucds-server` (start "UCDS Web" first if it is retired) |
| API | Fix it and release a new tag. Or, on the server: `Disable-ScheduledTask "E-Universe update"`, `git reset --keep <tag>`, `Restart-Service "UCDS API"` |

A SQL migration stays applied after a rollback. Migrations are written to be
additive.

## When something is wrong

| Symptom | Look at |
|---|---|
| `deploy-web` skipped | It runs for version tags only (`v1.2.0`), not for pushes to `main` |
| `Set the VPS_HOST variable` | `VPS_HOST` is missing from the `production` environment's variables (step 9) |
| `Permission denied (publickey)` | `VPS_SSH_KEY` pasted whole? Run `setup-e-universe-web.sh --new-key` and paste it again |
| `Host key verification failed` | `VPS_KNOWN_HOSTS` must match `/etc/ssh/ssh_host_ed25519_key.pub` on the VPS |
| `may hold only VITE_ keys` | Remove the named keys from the VPS `.env` |
| `Missing required client env keys` | A value is empty in the VPS `.env` (step 4) |
| `did not answer; rolled back` | `nginx -t`, `/var/log/nginx/error.log`. The previous build is live again |
| API not updating | `C:\ucds\logs\update.log`: "waiting for CI", "CI … failure", "tracked files are changed", or a rollback |
| Pages load, sign-in fails | `ALLOWED_ORIGINS` on the office server must list `https://embr3-onlinesystems.cloud` (the apex) first, then the subdomain; restart "UCDS API". Until it can be fixed, `bash eu-origin-bridge.sh on` on the VPS bridges it, and `bash eu-origin-bridge.sh status` says when it can come `off` |

## Files

| File | Runs on |
|---|---|
| `.github/workflows/ci-deploy.yml` | GitHub |
| `front-end/scripts/lint-likely-bugs.mjs` | GitHub, and `npm run lint:bugs` locally |
| `server/scripts/vps/setup-e-universe-web.sh`, `eu-web-receive.sh` | VPS |
| `server/scripts/vps/add-e-universe-apex.sh` (`static` or `<upstream>`) | VPS |
| `server/scripts/winserver/update.ps1`, `5-auto-update.ps1` | Office server |
