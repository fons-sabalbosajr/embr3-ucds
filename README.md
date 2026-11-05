# E-Universe

**Unified Information and Records Management System — DENR Environmental Management Bureau, Region III**

E-Universe brings two systems EMB Region III ran separately into one web application:

- **Universe Central DB (UCDS)** — the Planning Unit's register of establishments, by province and by year: permits, monitoring, legal actions, and the year's other datasets.
- **ERMS** — the electronic records of the **Records**, **Legal Services** and **Laboratory** units: 18,000+ filed records and their scanned documents on the office NAS, replacing the desktop ERMS.

It also serves the **E-Universe Document Portal** (`/e-universe/document-portal`). This is a public page where anyone asks for a scanned office document, chats with the unit that keeps it, and reads it on the page once approved. No account is needed.

Staff sign in once and see the parts their account is set up for. **VERA**, the built-in assistant, explains how everything works, on the portal too.

> Internal system for official use by EMB Region III, deployed on the office network. The Document Portal is its only public page. Everything else needs a staff account.

---

## Contents

- [Features](#features)
- [The Document Portal](#the-document-portal)
- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Testing](#testing)
- [Operational scripts](#operational-scripts)
- [VERA, the assistant](#vera-the-assistant)
- [Security](#security)
- [Capacity](#capacity)
- [Deployment](#deployment)
- [Working with the database](#working-with-the-database)

---

## Features

**Universe Central DB (Planning)**
- Year containers (2024 Data, 2025 Data, …) with a year picker; locked and hidden years.
- The **Monitoring Plan** per province: the establishment register with its permit, monitoring and legal tabs, edit history, and new IDs assigned per province.
- Data quality on the header bell: establishments missing required details, and ECC/CNC numbers filed on more than one establishment.
- Dashboard: permit monitoring (PTO, WWDP, PCO expiry), the monitoring calendar, bulletin postings.
- Each year's other datasets, plus folders and tables staff add themselves.
- Read-only links to the ERMS records filed against an establishment. Anyone outside the Records Unit asks for the scan in the Document Portal.

**ERMS (Records, Legal Services, Laboratory)**
- **Document Library**: search by FSN, permit number, proponent or project title; filters; "needs review".
- **Upload record**: the next FSN is claimed on save; permit numbers checked against the register as you type; scans filed on the NAS in the desktop system's folder layout (province › year range › year › project), with a folder picker.
- **Upload document** for Legal (NOV, technical conference, order/resolution, payment, attachments) and Laboratory (test results, COC, draft analysis, memo, receipts, calibration). Forms are defined in configuration and laid out in tabs.
- Autocomplete from values already on file. A known docket fills in its company; a COC number fills in its firm.
- Documents are **view-only** in an in-app PDF viewer, for the unit that keeps them. Everyone else asks in the **Document Portal**. The old in-app request inbox and the Share button are gone.
- **Portal Requests** (Records, Legal and Laboratory menus): each unit decides the portal requests for its own documents and can message the requester. The Developer and administrators see every unit's requests.
- Custody tracking that cannot be edited after the fact, archive boxes, sealing and disposal records.
- Per-unit working rules: required fields, duplicate rules, classifications.

**Document Portal (public)**: see [The Document Portal](#the-document-portal)
- Find any office document with a scan (Records Unit permits and certificates, Legal Services and Laboratory documents), grouped and colour-coded by kind.
- A room of 50 seats with a waiting line, FOI and Data Privacy terms, per-unit decisions, live updates, a temporary chat, and a view-only reader.

**Platform**
- One account model across both domains: role → domains → capabilities → province and year scope.
- Admin Settings: user accounts and approval, sign-in history, organizational units, register configuration, ERMS configuration, storage containers, VERA.
- Per-person appearance: theme, accent, navigation style, density.
- Real-time presence: sign-ins and sign-outs are pushed to open screens.
- One sign-in per browser tab: several accounts can be open at once in different tabs.
- Notices pushed live to every screen and device of the people they concern, with a bell of action items scoped to the account.

---

## The Document Portal

`/e-universe/document-portal` is a page outside the application, with no sign-in. It replaces the old ERMS Share and Document Requests features.

**For the person asking**
1. **Find the document.** Search by reference or docket number (ECC or permit number, Legal docket, Laboratory reference), title or company. Only documents with a scan are listed. Results are grouped by kind, each in its own colour: ECC, CNC, PTO, DP, HW and other Records Unit documents use the Planning side's law colours, and Legal Services and Laboratory have their own.
2. **Say who you are.** Choose EMB Region III employee, government employee of another agency, student or private citizen. Then give your name, designation (suggested from HRPMS for employees), purpose and desired duration. Members of the public also give a contact and the kind of valid ID they will present. Three days is the recommended maximum for them.
3. **Agree to the terms.** Employees see **Data Privacy** (RA 10173) only. Everyone else sees **Freedom of Information** (EO No. 2, s. 2016) first, then Data Privacy. Each step must be scrolled to the end and ticked. The accepted wording's version is recorded with the request.
4. **Wait in the room.** It holds **50** at a time; a full room gives a waiting line with an estimate, and people are seated automatically. Other visitors see only unnamed seats and clocks.
5. **Read it here** once approved: only the approved pages are sent, in a view-only reader. Access ends at the approved time, or **24 hours after the first opening**, whichever comes first.

**For the units** (ERMS › *unit* › Portal Requests)
- Each unit decides the requests for **its own** documents. The Developer and an Administrator with ERMS decide for every unit. Decisions cover a duration and all or some pages, with a note. A unit can also end someone's access early.
- A new request reaches the deciders as a live notice and on the bell. An undecided request gives up its seat after a day.
- **Messages:** staff and the requester can write to each other about one request. The conversation is **deleted after 12 idle hours** (a MongoDB TTL index). The audit trail records that a message was sent, never what it said.
- The **Developer** alone can change an approved seat (time left, pages, a per-seat **Download** button) and the **room settings**:
  - **Closed on weekends** (on by default): Saturdays and Sundays, Philippine time. No requests, no document opened. A waiting request's day to be decided counts weekdays only.
  - **Watermark** (off by default): print the reader's name, computer and time on every page. Off, pages are shown clean.
- The history keeps how every request ended, by whom, and why. Endings no one pressed a button for (time up, lapsed) also go to the audit trail.

**Safeguards**
- A browser is recognised by an **httpOnly ticket cookie**; only its SHA-256 is stored. One active request per browser, at most 3 per address. Every public route is rate limited.
- Every change needs the `X-Portal-Request` header (a CSRF guard). Search never returns file names or share paths.
- Unapproved pages never leave the server: the PDF is rebuilt with the approved pages only, and its metadata is stripped.
- The public routes are listed explicitly in `PUBLIC_ROUTES` (`server/shared/routeInventory.js`). A new public route fails the route test until it is added on purpose.

Code: `server/modules/portal/` (services: `portalService`, `portalChat`, `portalSettings`, `portalTerms`, `portalDocument`) and `front-end/src/modules/portal/`. Collections: `portal-requests`, `portal-chats`, and `app-config` › `portal-settings`.

---

## Architecture

A **modular monolith**: one API, one single-page app, one database, and two business domains that own their own data. The Document Portal is a module mounted alongside ERMS.

```mermaid
flowchart LR
  B[Staff browser<br/>React 18 + Ant Design 5] -->|HTTPS / Socket.IO| API[Express API<br/>Node 20+]
  P[Public visitor<br/>Document Portal page] -->|HTTPS / Socket.IO<br/>ticket cookie| API
  API --> UCDS[UCDS module<br/>register, years, datasets]
  API --> ERMS[ERMS module<br/>records, units, documents]
  API --> PORTAL[Portal module<br/>room, requests, chat]
  API --> SH[Shared platform<br/>auth, audit, org units,<br/>cache, presence, notices, VERA]
  UCDS --> DB[(MongoDB Atlas<br/>universe-db)]
  ERMS --> DB
  PORTAL --> DB
  SH --> DB
  PORTAL -.designations.-> HR[(db-hrpms<br/>same cluster)]
  ERMS -->|SMB over tailnet| BR[Office server<br/>NAS bridge] --> NAS[(Synology NAS<br/>scanned documents)]
  PORTAL -->|approved pages only| BR
  SH -->|optional| LLM[Anthropic / Gemini<br/>VERA phrasing]
```

Rules the code holds to:
- **Write ownership is exclusive.** Only ERMS writes `erms-*`; only UCDS writes `ucds-*`; only the portal writes `portal-*`. Each domain reads the other only through that domain's own exported service.
- **Every route carries a server-side guard** (`requireDomain`, `requireRole`, `authenticateSession`). A hidden menu item is never the access control. `npm run audit:routes` fails on any unguarded route not explicitly declared public.
- **Documents stay on the NAS.** Records store paths; the server streams the file and decides who may open it.

**Stack**
| Layer | Technology |
|---|---|
| Front end | React 18, Vite 6, Ant Design 5, TanStack Query, Socket.IO client |
| API | Node.js 20+, Express, express-session (sessions in MongoDB), Socket.IO, Zod validation, helmet, express-rate-limit |
| Data | MongoDB Atlas, native driver (no ODM) |
| Documents | Synology NAS over SMB, reached through the office Windows Server (Tailscale subnet route) |
| Assistant | Anthropic Claude (official `@anthropic-ai/sdk`) or Google Gemini — optional |
| Tests | Vitest + Supertest; Playwright for browser smoke runs and screenshots |

---

## Repository layout

```
front-end/                React SPA
  src/modules/            feature modules: ucds/, erms/, portal/, admin/, settings/, storage/, vera/
  src/shared/             cross-cutting UI: session transport, feedback, hooks
  src/components/         app shell: side menu, header, footer, auth pages
server/                   Express API
  modules/ucds, modules/erms   the two domains (routes, controllers, services)
  modules/portal          the public Document Portal and the units' portal desk
  controllers/, routes/   platform endpoints (auth, users, years, NAS, VERA, …)
  services/               authorization, NAS storage and bridge, presence, VERA
  shared/                 error handling, validation, short-lived cache, route inventory
  scripts/                operations: audits, migration, cutover, load test, backups
  tests/                  integration suite (Vitest + Supertest)
scripts/                  env sync and checks used by the front-end build
```

Not in git, deliberately: `server/.env`, `data/` (source extracts with personal data), `backups/`, `reports/`, `docs/` (internal runbooks).

---

## Getting started

**Prerequisites:** Node.js 20 or later, access to the MongoDB Atlas cluster, and (for documents) the office network or the tailnet. For running the tests you also need a local MongoDB (see [Testing](#testing)).

```bash
git clone https://github.com/fons-sabalbosajr/embr3-ucds.git
cd embr3-ucds

# API
cd server
cp .env.example .env        # then fill it in — see Configuration
npm install
npm run dev                 # http://localhost:8081

# SPA, in another terminal
cd ../front-end
npm install
npm run dev                 # http://localhost:5173 (served on the LAN with --host)
```

`npm run dev` and `npm run build` in `front-end/` first copy the `VITE_*` keys from `server/.env` into `front-end/.env.local` (`scripts/sync-env.js`). Only `VITE_*` keys reach the browser bundle; secrets never do.

Accounts are requested from the sign-in page and approved by an administrator under **Admin Settings › User Accounts**. `npm run seed:test-users` creates the test accounts named in `.env`.

---

## Configuration

Everything is in `server/.env`; **`server/.env.example` documents every key.** The important groups:

| Group | Keys |
|---|---|
| Core | `MONGO_URI`, `PORT`, `SERVER_URL`, `SESSION_SECRET`, `ALLOWED_ORIGINS`, `VITE_API_BASE_URL` |
| Documents (NAS) | `NAS_ROOT` / `NAS_SHARE`, `NAS_USERNAME`, `NAS_DOMAIN`, `NAS_BASE_DIR`, `NAS_LEGACY_PREFIXES`, `NAS_ENABLED`, `CONFIG_ENCRYPTION_KEY` |
| ERMS and the Document Portal | `ERMS_MODULE_ENABLED` (the portal is mounted with ERMS) |
| HRPMS designations (portal) | `HRPMS_DB_NAME` (default `db-hrpms`, read on the `MONGO_URI` cluster); `MONGO_URI_HRPMS` only if HRPMS lives elsewhere |
| Mail | `EMAIL_USER`, `EMAIL_PASS` |
| VERA | `AUTOMATION_AGENT_ENABLED`, `ANTHROPIC_*`, `GEMINI_*`, `AUTOMATION_AGENT_USER_LIMIT`, `AUTOMATION_AGENT_DAILY_LIMIT` |
| Tests | `TEST_MONGO_URI`, `TEST_MONGO_DB_NAME` |

Storage containers (one per unit's share) and their credentials can also be managed in the app (Admin Settings › Storage Configuration, developer accounts). Their credentials are stored encrypted with `CONFIG_ENCRYPTION_KEY`.

Two settings live in the app, not in `.env`: the Document Portal's room settings (weekend closure, watermark) on the Developer's Portal Requests page, and VERA's office website (Admin Settings › VERA Assistant).

The server warns loudly at startup about common mistakes: a `Secure` session cookie over plain HTTP, `NAS_BASE_DIR` set to a drive letter, and stray semicolons in `.env`.

---

## Testing

```bash
cd server
npm test
```

The suite is an **integration** suite: it tests province scoping, the domain boundary, year containers and the Document Portal (room, terms, per-unit decisions, chat, weekend closure) against real data. It **never runs against production**. `tests/setup.js` points it at `TEST_MONGO_URI` (a local MongoDB on `127.0.0.1:27017` by default) and refuses the production cluster. Every test makes its own fixtures, so an empty test database is enough.

```bash
# one-time: a local MongoDB on 127.0.0.1:27017, then copy production's working collections into it
npm run test:db:refresh               # reads production, writes only to the test server
npm run test:db:refresh -- --resume   # after a dropped connection, keeps what is already copied
```

The suite also switches VERA's model off, so tests never spend money on an AI provider.

A few NAS tests need the share to be reachable. While the NAS bridge is offline, they time out; that is the network, not the code.

---

## Operational scripts

Run from `server/`.

| Command | Purpose |
|---|---|
| `npm run audit:routes` | List every route and its guards; non-zero exit on an unguarded route |
| `npm run walkthrough` | Per-role capability matrix against a running server |
| `npm run smoke` | Drive a real browser through every screen per role; screenshots to `reports/screenshots/` |
| `node scripts/load-test.js` | Replay recorded screens for N users against the **test** database (`--users=100 --think=30-60`, `--burst`, `--cost`) |
| `npm run cutover:check` | ERMS cutover readiness gate, including cluster storage headroom |
| `npm run daily-check -- --csv=<export>` | Compare the desktop ERMS export with the web records during the parallel period |
| `npm run reconcile` | Re-run the ERMS migration data gates |
| `npm run nas:coverage` | How many records' documents resolve on the share |
| `npm run size` (in `front-end/`, after a build) | Fail when a main chunk passes its compressed-size budget |
| `GET /api/health/performance` (Developer) | The slowest routes and longest event-loop stall since the server started; anything over `SLOW_REQUEST_MS` (default 3 s) is also written to the log |
| `node scripts/backup-collections.js` | Back up collections as Extended JSON, verified by read-back and SHA-256 |
| `node scripts/drop-backed-up.js` | Drop only collections a verified backup manifest lists (dry run unless `--apply`) |

---

## VERA, the assistant

**VERA** (Virtual Environmental Response Assistant) is the floating **Ask VERA** button on every screen. It is the same assistant, look and approach as in the EMB Region III DTRMS, with its own E-Universe knowledge.

- **Answers from a built-in help library** about how E-Universe works: where a screen is, how to file a document, what a setting does. With an AI model switched on, the same knowledge is phrased conversationally, with follow-ups.
- **Knowledge follows the account.** Planning accounts get the register articles, the ERMS units get the document articles, administrators get configuration, and developers get internals.
- **No data access.** VERA cannot read any record, establishment, permit or document. Only the question, the recent conversation and the name of the current screen are sent to the model.
- **Guards run on the server before any model is reached.** Secrets, keys and environment values are refused for every role. How the system is built is answered only for developers. Off-topic questions are declined.
- **Exact figures for staff.** Asked "how many…", VERA quotes live counts for the records the account can see (Records, Legal, Laboratory, the Central DB register, Document Portal requests, accounts for administrators). These come from the same functions the dashboards use.
- **Sign-in page surface** (off by default). A separate, tiny knowledge base: requesting an account, signing in, resetting a password. It never confirms whether an account exists, refuses every lookup, and is rate limited per address.
- **Document Portal surface** (on by default). VERA introduces herself in one short line and explains finding, requesting and reading any office document. She can quote what the portal itself shows anyone: how many documents can be requested, and what its search box finds. She sees no request or person, and never what a document contains.
- **No counts for the public, beyond those portal totals.** On the sign-in page a question asking for a number gets no figure, only the office website (Admin Settings › VERA Assistant › Office website). This is checked on the server before any model is reached. The portal never gives a count of requests.
- **Keys live only in `server/.env`.** They are never stored in the database or sent to a browser. The master switch is `AUTOMATION_AGENT_ENABLED` (or `VERA_ENABLED`). Without it VERA still works, from the help library, at no cost.
- **Limits:** per person per day and for the whole office per day; a duplicate-submit guard.
- **Questions and answers are never stored.** The activity log keeps metadata only: who, when, which screen, which articles matched, model or library, tokens and time.

Configure it in **Admin Settings › VERA Assistant**: the on/off switch, provider (Anthropic or Gemini), model, limits, welcome messages, the public surfaces, the office website, **Test connection**, and the **Activity Log**. To extend its knowledge, edit `server/services/vera/knowledge.js`. Put articles in the right tier, because the tier is the access decision. `tests/vera.test.js` covers the guards and retrieval.

---

## Security

- **Sessions:** server-side (MongoDB), one per browser tab. Cookie flags follow the transport (`Secure` only over HTTPS). Unchanged sessions are re-saved at most every 10 minutes.
- **Authorization:** every API route is domain- or role-gated on the server, and the route inventory test makes a missing guard fail the build. Province and year scope are applied inside the services.
- **Sign-in rate limit:** 20 attempts per account per address per 15 minutes, plus a ceiling per address, so an office behind one NAT is not locked out by one person's typos. Password reset never reveals whether an address has an account.
- **Documents** are streamed by the server and opened view-only. Inside the app, access is by domain, unit and province. Every open or refusal is written to the audit trail.
- **The Document Portal** is the only public surface. Each browser has its own httpOnly ticket, changes need the portal header, every route is rate limited, and only approved pages are sent. See [The Document Portal](#the-document-portal).
- **Secrets** live only in `server/.env`. NAS credentials saved in the app are encrypted at rest. VERA's keys are never stored or returned.
- **Audit:** one trail (`app-logs`) across both domains, with a domain field.

---

## Capacity

Tested with `scripts/load-test.js`, replaying the requests real screens make, recorded from the app in a browser, for a mixed office population: Planning, Admin, Records, Legal and Laboratory.

| Scenario | Result |
|---|---|
| 100 users, realistic pace (a screen every 30–60 s) | request p95 **99 ms**; slowest screen p95 0.74 s; ~39 database operations/s; 2.7 Mbit/s |
| 100 users, 5× faster than real use | request p95 138 ms; every screen p95 under 1 s; no errors |
| 150 users, 5× faster than real use | request p95 204 ms; slowest screen p95 1.1 s; no errors |
| 100 people pressing Sign in at the same instant | all signed in; worst 1.26 s |

How it scales: expensive shared reads (dashboards, the register check, permit monitoring, province data, year containers) are computed once per scope and shared briefly (`server/shared/services/shortCache.js`), and cleared by the writes that change them. Polling pauses in hidden tabs. Presence is pushed over Socket.IO, and the libuv thread pool is sized for password checks and NAS file access.

---

## Deployment

E-Universe runs on the **office LAN**. The NAS is reachable only from there, through the office Windows Server, which advertises the NAS into the tailnet.

- **API:** `npm start` in `server/` (`node server.js`), on port 8081 by default. It also runs the Document Portal's clock: ending approvals on time and seating the waiting line.
- **Document Portal:** served by the same SPA at `/e-universe/document-portal`. Whoever should reach it must be able to reach the server's address. Today that is the office network.
- **SPA:** `npm run build` in `front-end/` produces `front-end/dist/`. Set `VITE_API_BASE_URL` to the API's address first.
- **NAS bridge:** the office server must be on and signed in to Tailscale. When it is off, a banner says so and documents are unavailable; everything else keeps working.
- Give the server a **stable address** (a DHCP reservation or static IP). The build and the CORS allow-list name it.

---

## Working with the database

`universe-db` sits on a **free-tier MongoDB Atlas cluster (512 MB) shared with other EMB applications.** At the cap Atlas blocks writes for **every** application on the cluster.

- **Never** put copies, staging databases or bulk test data on it. Use a local MongoDB (`TEST_MONGO_URI`).
- `npm run cutover:check` reports the cluster's storage headroom.
- Back up before dropping anything: `backup-collections.js`, then `drop-backed-up.js` against the verified manifest.
- Collection names carry their domain: `ucds-*`, `erms-*`, `portal-*` (`portal-requests`, and `portal-chats`, which empties itself after 12 idle hours), plus shared platform collections (`users`, `app-config`, `app-logs`, `year-containers`, `org-units`, `sessions`, …).
- `db-hrpms` on the same cluster belongs to HRPMS. E-Universe only reads the unit names from it.
