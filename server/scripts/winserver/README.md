# E-Universe on the office Windows Server

How the office server PC (`emb3winsrvr2019`, in the server room) becomes the
machine that runs E-Universe around the clock, published at
**https://e-universe.embr3-onlinesystems.cloud**.

```
staff anywhere ──HTTPS──▶ VPS nginx (72.61.125.232) ──Tailscale──▶ this server ──LAN──▶ NAS
                          server/scripts/vps/                       UCDS API :8081
                                                                    UCDS Web :5173
```

- The NAS stays on the office LAN. Port 445 is never exposed; only this server
  opens the shares.
- The share passwords are saved, encrypted, in the database (Admin › Storage
  Configuration). The API writes them into this server's Windows vault on
  every start and on every save, so nobody types them on the server.
- The web and API ports accept only tailnet addresses, which means only the
  VPS. Office staff use the domain too.

Run everything in an **elevated PowerShell** on the server, in this order.

## 1. Software

```powershell
winget install OpenJS.NodeJS.LTS
winget install Git.Git
winget install NSSM.NSSM
```

Open a new PowerShell afterwards so `node`, `git` and `nssm` are on PATH.

## 2. The code

```powershell
git clone https://github.com/fons-sabalbosajr/embr3-ucds.git C:\ucds\embr3-ucds
cd C:\ucds\embr3-ucds\server;    npm ci
cd C:\ucds\embr3-ucds\front-end; npm ci
```

## 3. `server\.env`

Copy the developer laptop's `server\.env` to `C:\ucds\embr3-ucds\server\.env`
by USB or another private route, never by chat or email. Then change only
these lines:

| Key | Value |
|---|---|
| `ALLOWED_ORIGINS` | `https://e-universe.embr3-onlinesystems.cloud` |
| `VITE_API_BASE_URL` | `https://e-universe.embr3-onlinesystems.cloud` |
| `SESSION_SECRET` | a new one: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `BYPASS_AUTH` | `false` |
| `NODE_ENV` | remove the line; the services set `production` |

Keep these **exactly as on the laptop**:

- `CONFIG_ENCRYPTION_KEY`: the stored NAS passwords are encrypted with it.
  With a different key the server cannot read them, and Storage Configuration
  reports them as unreadable.
- `MONGO_URI`: the same database.

Then build the front-end. The build copies the `VITE_*` keys and bakes in the
domain:

```powershell
cd C:\ucds\embr3-ucds\front-end; npm run build
```

If MongoDB Atlas › Network Access uses an IP list, add the office's public
address.

## 4. Prepare the server

```powershell
cd C:\ucds\embr3-ucds\server\scripts\winserver
.\1-prepare.ps1
```

This sets up folders and firewall rules for 5173 and 8081 from the tailnet
only, turns off sleep and hibernate, adds the NAS share aliases
(`records-nas` and the others → `10.14.76.167`), and checks that the NAS
answers on the LAN.

In the BIOS/UEFI, set **Restore on AC power loss → Power On**.

## 5. Tailscale

```powershell
.\2-tailscale.ps1
```

This renames the node to `ucds-server` and keeps it connected when nobody is
signed in ("run unattended"). The NAS route it already advertises for the
developer laptop is left alone.

Then, at https://login.tailscale.com/admin/machines → `ucds-server`:

- **Edit ACL tags** → add `tag:ucds-server` and keep `tag:nas-bridge`
- check that **Key expiry** is disabled

## 6. Services

```powershell
.\3-services.ps1
```

This creates the local account `ucds-svc` (it asks for a password; keep it in
the office password store), and installs **UCDS API** and **UCDS Web** as
services that start with Windows and restart if they stop. Logs go to
`C:\ucds\logs`.

Check:

- `Get-Service "UCDS API","UCDS Web"` → both Running
- http://localhost:8081/healthz answers
- `C:\ucds\logs\api.out.log` contains
  `[NAS] Windows credentials restored: records, legal, laboratory`

## 7. Point the VPS here

On the VPS:

```bash
bash add-e-universe-site.sh ucds-server
```

The script ends with `/healthz -> 200`. From then on the site no longer
depends on the developer laptop.

## 8. Verify

- From a phone off the office Wi-Fi: open the domain, sign in, open a scanned
  document.
- Admin › Storage Configuration › Test connection: Records, Legal and
  Laboratory all pass.
- Restart the server and **do not sign in to it**. Within a few minutes the
  site answers again and documents open.
- Storage › Availability: set the schedule to always on, so staff are not told
  that files are only available on weekdays.

## The developer laptop afterwards

Restore its `server\.env` from `server\.env.bak-2026-11-26-domain` and develop
with `npm run dev` as before. It keeps `tag:ucds-server`, so off-site it still
reaches the NAS through this server's bridge route.

## Updating E-Universe

When only front-end or server code changed (no `package-lock.json` in the
`git pull` output), skip `npm ci`: pull, build, and restart the affected
service.

When a `package-lock.json` changed, stop both services first. `npm ci`
deletes and reinstalls `node_modules`, and Windows will not delete files a
running service holds open (the password-hashing module, for one), so it
fails with EPERM. The site shows its "temporarily unavailable" page for the
few minutes this takes.

```powershell
cd C:\ucds\embr3-ucds
git pull
nssm stop "UCDS API"; nssm stop "UCDS Web"
cd server;       npm ci
cd ..\front-end; npm ci; npm run build
nssm start "UCDS API"; nssm start "UCDS Web"
```

## Rotating a NAS password

1. Change it on the Synology (DSM).
2. Straight away, enter it in **Admin › Storage Configuration** and click
   Save. The server's vault is updated and a connection test runs.

Documents fail to open only in the time between the two steps.

## If something goes wrong

| Symptom | Look at |
|---|---|
| The site shows "temporarily unavailable" | Is the server on? `Get-Service "UCDS API"`; `tailscale status` shows `ucds-server` online |
| Sign-in succeeds, then nothing works | `ALLOWED_ORIGINS` and `VITE_API_BASE_URL` both the https domain; front-end rebuilt after changing them |
| Documents will not open | `api.out.log` for the `[NAS]` line; Storage Configuration › Test connection |
| "password unreadable" in Storage Configuration | `CONFIG_ENCRYPTION_KEY` differs from the machine that saved it. Restore it, or re-save the password |

**Rollback:** on the VPS, `bash add-e-universe-site.sh embr3-fons` points the
site back at the developer laptop (with both of its terminals running).
