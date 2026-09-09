# Running UCDS on the office network

The application is served from a machine on the LAN rather than a hosting
provider. This matters for two reasons beyond convenience:

- **The records share is reachable.** `Z:\RECORDS\…` is a drive mapped on office
  workstations. A cloud host could never resolve it; a machine on the same
  network can, which is what makes ERMS document access possible at all.
- **The session cookie must not be `Secure`.** Over plain HTTP a browser
  silently discards a `Secure` cookie: sign-in appears to succeed and every
  request afterwards is unauthenticated. The server works this out from
  `ALLOWED_ORIGINS` and warns at startup if the two disagree — see
  `config/security.js`.

---

## 1. Configure `server/.env`

```ini
PORT=8081
NODE_ENV=development          # see the note on production below

MONGO_URI=<atlas connection string>
SESSION_SECRET=<at least 16 characters>

# Every origin the browser will use. The API refuses others.
ALLOWED_ORIGINS=http://10.14.76.250:5173,http://localhost:5173

# Used to build password-reset links, so it must be the address people type.
SERVER_URL=http://10.14.76.250:5173

# The address the browser calls. Copied to front-end/.env.local automatically.
VITE_API_BASE_URL=http://10.14.76.250:8081
VITE_CRYPTOJS_ENCRYPTION_KEY=<any random string>

BYPASS_AUTH=false
ERMS_MODULE_ENABLED=false     # true once Records personnel have signed off
```

> **Never end a value with a semicolon.** `dotenv` keeps it as part of the
> value, so `BYPASS_AUTH=true;` reads as `"true;"` — off by accident, and
> "tidying" the file later turns it on. The same bug produced unusable
> password-reset links and stopped reset email sending entirely. The server
> warns at startup if it finds any.

Replace `10.14.76.250` with this machine's address (`ipconfig`, or
`node -e "console.log(require('os').networkInterfaces())"`).

---

## 2. Start both services

```bash
cd server     && npm run dev     # API on :8081, listening on 0.0.0.0
cd front-end  && npm run dev     # SPA on :5173, --host is already set
```

`npm run dev` in `front-end` runs `sync-env` first, which copies the `VITE_*`
keys from `server/.env` into `front-end/.env.local`. **Re-run it after changing
the IP**, or the browser will keep calling the old address.

Colleagues open `http://10.14.76.250:5173`.

---

## 3. Check it before telling anyone it works

```bash
curl http://10.14.76.250:8081/healthz            # {"status":"ok"}
curl http://10.14.76.250:8081/readyz             # {"db":"ok"}
curl -o /dev/null -w "%{http_code}\n" \
     http://10.14.76.250:8081/api/ucds/count     # 401 — auth is live
cd server && npm run audit:routes                # 0 unprotected routes
cd server && npm run walkthrough                 # per-role capability matrix
```

### Check the screens too

```bash
cd front-end && npx vite build && npx vite preview --host --port 5173
cd server     && npm run smoke -- --base=http://10.14.76.250:5173
cd server     && npm run smoke -- --base=http://10.14.76.250:5173 --themes
```

`--themes` adds a second pass over four representative screens in **both
themes** at desktop, tablet and phone widths, failing on anything that overflows
without a way to scroll to it. It is slower, so it is a flag rather than the
default — run it after any change to layout or CSS.

`smoke` drives a real browser through every screen as each role and writes
screenshots to `reports/screenshots/`. **Run it against a production build, not
the dev server** — PurgeCSS and minification only apply to a build, and two of
the bugs this has caught existed solely there.

Startup should print **no warnings**. If it does, read them — each one describes
a configuration that will fail in a way that is hard to diagnose from the
symptom.

---

## Windows Firewall

Inbound TCP 8081 and 5173 must be allowed, or other machines see a timeout
while the server looks perfectly healthy locally. Once, as administrator:

```powershell
New-NetFirewallRule -DisplayName "UCDS API"  -Direction Inbound -Protocol TCP -LocalPort 8081 -Action Allow
New-NetFirewallRule -DisplayName "UCDS Web"  -Direction Inbound -Protocol TCP -LocalPort 5173 -Action Allow
```

---

## The IP will change

`10.14.76.250` is a DHCP lease on Wi-Fi. When it changes, everything above
breaks at once — the SPA calls a dead API, CORS rejects the new origin, and
reset links point at the old host.

Before this is anything but a pilot, do one of:

- reserve a **static IP** or a DHCP reservation for this machine, **and** put it
  on Ethernet rather than Wi-Fi; or
- give it a **DNS name** (`ucds.embr3.local`) and use that everywhere instead.

The second is better: the name survives an address change, and it is what you
would put on an HTTPS certificate later.

---

## About `NODE_ENV=production`

Setting it on a plain-HTTP LAN deployment is **safe but not useful**: the cookie
logic already refuses to mark the cookie `Secure` when the origins are not
HTTPS, so nothing breaks. What it does change is that a short `SESSION_SECRET`
becomes fatal rather than a warning, and `BYPASS_AUTH=true` refuses to start.

Leave it as `development` while the deployment is still moving. Set it to
`production` once the address is stable and the secret is long — the stricter
failures are worth having then.

---

## If you move to HTTPS later

Put a reverse proxy (IIS, nginx, Caddy) in front, terminate TLS there, and:

- set `ALLOWED_ORIGINS` to the `https://` addresses — the cookie then becomes
  `SameSite=None; Secure` on its own, no other change needed;
- confirm `app.set('trust proxy', 1)` still runs before the session middleware
  in `server/app.js`, or Express will not see the proxy's TLS and will decline
  to issue a `Secure` cookie.

---

## Not using a hosting provider

`render.yaml` was removed when this moved to the LAN. If you ever go back:

```bash
git log --oneline --diff-filter=D -- render.yaml   # find the commit
git show <commit>^:render.yaml > render.yaml
```

Note that the Render topology put the SPA and API on **different hosts**, which
is why the cookie logic has a cross-site branch at all.
