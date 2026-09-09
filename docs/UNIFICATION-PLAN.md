# ERMS + UCDS Unification — Implementation Plan

**Status:** Living document. Update the checkboxes as work lands.
**Last updated:** 2026-09-07
**Owner:** Fons Sabalbosa

---

## 0. What this is

One web application, two business domains:

- **UCDS** (Universe Central Database System) — Planning Personnel. Establishment register, permits, survey, eSWM, planning data. **Already exists and must keep working.**
- **ERMS** (Electronic Records Management System) — Records Personnel. Document register, records tracking, archiving, retrieval. **Currently a desktop application; we are building the web version inside UCDS.**

### Key facts established during discovery

| Fact | Detail |
|---|---|
| ERMS is a **desktop app** | There is no web codebase to port. The web ERMS is built fresh, driven by the desktop app's data model. |
| ERMS source data | `data/tb_maindata_erms.csv` — 24 columns, ~18,030 records (19,021 CSV lines; some fields contain embedded newlines, so a **real CSV parser is required**). |
| Document storage | **NAS is retained.** `File_Path` values point at `Z:\RECORDS\Database\Records Database\...` (Synology SMB share). Files are **not** migrated into GridFS. The existing `smb2` integration becomes the ERMS document-access layer. |
| Cross-domain join key | ERMS `Permit_Type_No` (ECC / CNC numbers) matches UCDS `ucds-data.ecc_cnc`. This is the real integration point. |
| Database | Single MongoDB Atlas database `universe-db` (270 MB). Native driver, no ODM. ERMS collections use the `erms-` prefix. |

---

## 1. Target architecture

**Modular monolith** inside the existing two Render deployables. No new services, no second database, no second auth system, no second UI framework.

```
Unified Web Application
│
├── Shared Platform          (owned by neither domain)
│   ├── Authentication       express-session + connect-mongo + bcrypt
│   ├── Authorization        role → domains → capabilities → year/province scope
│   ├── User Management      users, sign-up
│   ├── Org master data      org-units, provinces (PROVINCE_KEYS)
│   ├── Audit logging        app-logs (+ domain discriminator)
│   ├── Notifications        Socket.IO
│   ├── NAS storage service  smb2 — shared infrastructure, used by ERMS
│   └── App shell            layout, side menu, year switcher, theme
│
├── UCDS Domain              owns ucds-*, survey-*, postings, draft-reports
│
└── ERMS Domain              owns erms-*
```

### Non-negotiable rules

1. **Write-ownership is exclusive.** Only ERMS services write `erms-*`. Only UCDS services write `ucds-*`. Cross-domain access is read-only, through the owner's exported service.
2. **Every ERMS route carries a server-side domain guard.** Menu visibility is a consequence of entitlement, never the mechanism.
3. **`shared/` never imports from `modules/`.** Enforced by an ESLint `no-restricted-imports` rule.
4. **Additive only.** No existing UCDS collection is altered in place.

---

## 2. Database inventory (live, as of 2026-09-07)

Database: `universe-db` — 270.1 MB

### In use — keep

| Collection | Docs | Registered in `config/db.js` |
|---|---:|---|
| `ucds-data` | 17,751 | ✅ |
| `survey-data-2024` | 2,381 | ✅ |
| `survey-data-2025` | 1,171 | ✅ |
| `ucds-data-healthcare` | 1,055 | ✅ |
| `ucds-data-chemicals` | 233 | ✅ |
| `ucds-data-tsd` | 100 | ✅ |
| `ucds-data-trc` | 96 | ✅ |
| `ucds-eswm-mrf` | 193 | ✅ |
| `ucds-eswm-equipment` | 135 | ✅ |
| `ucds-eswm-ten_swm_plan` | 129 | ✅ |
| `ucds-eswm-ods` | 54 | ✅ |
| `ucds-eswm-slf` | 17 | ✅ |
| `project_type` | 208 | ✅ |
| `ucds-log` | 194 | ✅ |
| `app-logs` | 709 | ✅ |
| `survey-log` | 31 | ✅ |
| `login-status` | 45 | ✅ |
| `archive-data` | 26 | ✅ |
| `draft-reports` | 5 | ✅ |
| `postings` | 4 | ✅ |
| `year-containers` | 4 | ✅ |
| `users` | 7 | ✅ |
| `sessions` | 0 | ✅ (runtime) |
| `sign-up` | 0 | ✅ (runtime) |
| `developer-field-configs` | 0 | ✅ (runtime) |
| `pdfFiles.files` / `.chunks` | 3 / 201 | ✅ GridFS |

### Orphans — zero code references anywhere in `server/`, `front-end/src/`, `scripts/`

| Collection | Docs | Assessment |
|---|---:|---|
| `ucds-duplicates-data` | 813 | Stale snapshot. The live duplicates feature reads `ucds-data` via `yearScope` `DATASETS.duplicates`. |
| `activity_logs` | 8 | Superseded by `app-logs`. Snake_case outlier. |
| `audit-log` | 5 | Superseded by `app-logs`. |
| `encode-logs` | 0 | Empty. |

**Status:** ✅ Backed up to `backups/mongo/2026-09-07/*.json` (round-trip verified), then dropped 2026-09-07.
`universe-db` went from 31 → 27 collections; the remaining set now matches `config/db.js` exactly.
`backups/` is gitignored — the JSON files are local only, so keep them somewhere durable before wiping the machine.

### Other databases on the cluster — DO NOT TOUCH

`db-air_quality_monitoring`, `db-clientsatisfactory`, `db-hrpms`, `db-iis_monitoring`,
`db-water_quality_monitoring`, `db_eswmp`, `db-universe`, `db-universe;`

These belong to other systems. The only in-scope database is `universe-db`.
(`db-universe;` — with a trailing semicolon — appears to be an artefact of a malformed connection string. Flagged, not actioned.)

---

## 3. ERMS data model

Derived from `data/tb_maindata_erms.csv`. Follows UCDS conventions: native driver, kebab-case collection names, handles registered in `server/config/db.js`.

### CSV → `erms-records`

| CSV column | Target field | Notes |
|---|---|---|
| `Serial_No` | `serialNo` | `FSN-0000001` format. Unique business key. Indexed. |
| `Proponent_Name` | `proponentName` | |
| `Project_Title` | `projectTitle` | Text-indexed for search |
| `Permit_Type` | `permit.type` | 4 real values + `n/a` — see lookup below |
| `Permit_Type_No` | `permit.number` | **UCDS join key** (`ucds-data.ecc_cnc`). Indexed. |
| `Permit_Process_Source` | `permit.processSource` | `Online Process` / `Manual Process` |
| `Date_Amended` | `permit.dateAmended` | `Date` \| null (`n/a` → null) |
| `Date_Approved` | `permit.dateApproved` | `Date` \| null |
| `Project_Type` | `project.type` | Strip wrapping double-quotes |
| `Other_Project_Type` | `project.otherType` | |
| `Province` | `location.province` | Normalise to `PROVINCE_KEYS` |
| `City` | `location.city` | |
| `Barangay` | `location.barangay` | |
| `Street` | `location.street` | |
| `Latitude` / `Longitude` | `location.lat` / `.long` | Numeric \| null |
| `Mailing_Address` | `location.mailingAddress` | |
| `Remarks` | `remarks` | |
| `Attach_Files` | `document.fileName` | |
| `File_Path` | `document.filePath` | **NAS path — stored, not moved** |
| `File_Class` | `document.fileClass` | `Public` dominates; drives access control |
| `Date_Uploaded` | `document.uploadedAt` | Parse `Dec 6 2021 4:16PM` |
| `Uploaded_by` | `document.uploadedBy` | Reconcile against `users` where possible |
| `LogID` | `legacyLogId` | Preserved |
| — | `legacyId`, `legacySource`, `migratedAt` | Provenance |
| — | `ucdsRef` | `{ sortKey, nameSnapshot, provinceKey, capturedAt, unmatched }` |

### Collections

| Collection | Purpose |
|---|---|
| `erms-records` | The document register — one doc per `Serial_No` |
| `erms-permit-types` | Lookup: ECC (Original), ECC (Amended), CNC, HW Generator Registration |
| `erms-file-classes` | Lookup: Public / (others discovered during profiling) |
| `erms-tracking` | Append-only custody & routing history (new capability) |
| `erms-id-map` | `{ collection, legacyId, newId }` — makes import idempotent |

### Indexes (created with the collections — UCDS has almost none; do not repeat that)

- `erms-records`: `serialNo` (unique), `permit.number`, `permit.type`, `location.province`, `document.uploadedAt`, text index on `projectTitle` + `proponentName`
- `erms-tracking`: `recordId`, `createdAt`
- `erms-id-map`: `(collection, legacyId)` unique

---

## 4. Authorization model

Replaces **three** overlapping models with one.

| Facet | Field | Purpose |
|---|---|---|
| Role | `permission` | Coarse. Already enforced — keep the field, extend the vocabulary. |
| Domains | `domains: ['ucds' \| 'erms' \| 'admin']` | **New.** Which domains may this user enter. |
| Capabilities | `capabilities: { canManageData, … }` | Named flags. Replaces the positional `permissions[]` array. |
| Scope | `assignedYears`, province keys | **Unchanged** — already correct. |

### Roles

| Role | Domains | Scope |
|---|---|---|
| Developer | ucds, erms, admin | All years, all provinces, system config |
| Administrator | ucds, erms, admin | All years, all provinces, no developer functions |
| Records Personnel | erms | Year-independent; province scope applies to firm lookup |
| Planning Personnel | ucds | Assigned years, assigned provinces |
| Viewer | per assignment | Read-only |

**Backfill rule:** every existing user → `domains: ['ucds']`, existing booleans copied into `capabilities`. Current behaviour must be bit-for-bit unchanged.

---

## 5. Routing

| Path | Guards | Status |
|---|---|---|
| `/universe-central-database-system/*` | public | unchanged |
| `/select-year` | Protected | unchanged |
| `/universe/dashboard` | Protected → Year | domain-aware landing |
| `/universe/province/*`, `/survey`, `/healthcare`, `/chemicals`, `/tsd`, `/trc`, `/mbu`, `/eswm-database/*`, `/planning-unit/*`, `/extract` | Protected → Year → `ucds` | paths unchanged |
| `/universe/erms/dashboard`, `/records`, `/records/:serialNo`, `/documents`, `/tracking`, `/archive`, `/reports`, `/search` | Protected → `erms` | **new** |
| `/universe/admin/users`, `/roles`, `/audit`, `/system-config` | Protected → `admin` | consolidated |
| `/universe/nas/*` | Protected | **renamed** from `/universe/erms/*` |

**Namespace collision:** `/api/erms/*` and `/universe/erms/*` are currently the NAS file browser. They must be renamed to `nas` before the real ERMS module ships, or routes collide silently.

---

## 6. Phases

### Phase 0 — Discovery ✅ DONE

- [x] UCDS codebase audit
- [x] Live database inventory
- [x] ERMS source data received (`data/tb_maindata_erms.csv`)
- [x] ERMS confirmed as desktop app — web build, not a port
- [x] NAS confirmed retained as document store
- [x] Plan saved to repo

### Phase 1 — Namespace, hygiene & cleanup ✅ DONE

- [x] Back up the four orphan collections to `backups/mongo/2026-09-07/`
- [x] Drop orphans: `ucds-duplicates-data`, `activity_logs`, `audit-log`, `encode-logs`
- [x] `/api/erms/*` → `/api/nas/*`, with `/api/erms/*` kept as deprecated aliases (`Deprecation` + `Link` headers)
- [x] `/universe/erms/*` → `/universe/nas/*`, legacy paths `<Navigate>`-redirected
- [x] `server/routes/ermsRoutes.js` → `nasRoutes.js`; `controllers/ermsController.js` → `nasController.js`
- [x] `menu-ZERMS/` → `menu-nas/` with `dashboard/ browser/ settings/ messages/ storage/`; `ERMS*` components → `Nas*`
- [x] `menu-records/` → `menu-register-config/` (flattened; `RecordsConfig` → `RegisterConfig`, `RecordsActivity` → `RegisterActivity`)
- [x] `menu-archive/` → `menu-duplicates/` (`ArchiveData` → `DuplicatesData`)
- [x] Deleted dead `front-end/src/pages/` (8 files, imported nowhere)
- [x] Deleted 8 empty (0-byte) unused CSS files
- [x] Root `.gitignore` added (`backups/`, `node_modules/`, `.env`)
- [x] `.erms` CSS class → `.nas`

**Bugs found and fixed in passing**

- `Universe.jsx` imported `./menu-records/recordsactivity/…` but the directory was `recordsActivity/`. Case-insensitive on Windows, **build-breaking on Linux** — i.e. the Render static build. Resolved by the flattening rename.
- `ERMSStorageConfigModal.jsx` logged the SMB **password in cleartext** to the browser console (`console.log("➡️ Attempting login with payload:", payload)`). Removed.

**Deferred to Phase 5 (deliberately):** moving `menu-*` into `modules/ucds/` and `shared/`. Phase 1 frees the namespace; Phase 5 does the structural move, in rename-only commits.

**Verification**

- `vite build` — ✅ passes (883 modules)
- All 29 server route/controller modules `require()` cleanly
- `nasRoutes` registers 4 canonical + 4 deprecated paths
- ESLint on new/renamed files: 92 → 4 problems, and those 4 are pre-existing `react/prop-types` on files that were only renamed

**Gate:** ✅ UCDS behaves identically; the `erms` namespace is free.
**Rollback:** revert the commit; restore collections from `backups/mongo/2026-09-07/`.

### Phase 2 — Security fixes ✅ DONE

- [x] NAS credentials moved out of the session into a server-side service account (`NAS_*`, legacy `ERMS_NAS_*` still accepted). The SMB login form and `POST /api/nas/login` are **removed** — users never handle SMB credentials.
- [x] Purge `sessions` documents holding `erms_credentials` / `nas_credentials` (found 0; script is re-runnable)
- [x] `cookie.secure` + `SameSite` derived from `NODE_ENV`, both env-overridable
- [x] Hard-fail on `BYPASS_AUTH` in production (`warnIfAuthBypassed` → `assertAuthNotBypassed`); `bypassEnabled()` also returns false in production as defence in depth
- [x] Path traversal in `nasController.viewPdf` fixed via `safeSharePath()`
- [x] `helmet` + `express-rate-limit` added; all four unauthenticated auth endpoints limited
- [x] `/api/nas/*` now requires an authenticated session — including `env-status`, which was previously open and probed the share for anonymous callers
- [x] `server/.env.example` documenting every key

**New env keys** — set these or `/api/nas/*` returns 503:
`NAS_SHARE`, `NAS_USERNAME`, `NAS_PASSWORD`, `NAS_DOMAIN`.
Optional: `SESSION_COOKIE_SAMESITE`, `SESSION_COOKIE_SECURE`.

**Session cookie behaviour**

| `NODE_ENV` | `secure` | `sameSite` |
|---|---|---|
| production | `true` | `none` |
| otherwise | `false` | `lax` |

`SameSite=None; Secure` is required because the static SPA and the API are separate Render services on different hosts, so the cookie travels cross-site. `app.set('trust proxy', 1)` was moved **above** the session middleware — without it Express cannot see Render's TLS termination and refuses to set a Secure cookie. Override both vars if you ever deploy SPA and API on one origin.

**Helmet configuration.** CSP, frameguard and COEP/COOP are deliberately off, and CORP is `cross-origin`. This process serves PDFs that the SPA embeds in an iframe from another origin; `X-Frame-Options: SAMEORIGIN` or a default CSP would block that. Framing a JSON API is not a clickjacking vector — there is no UI to click through. HSTS, `nosniff`, `Referrer-Policy` and `X-Powered-By` removal all apply.

**Bug fixed in passing:** `DatabaseSettings.jsx` fetched `/api/nas/env-status` as a **relative** URL, which in a deployed environment resolves against the static site and never reaches the API. Now uses `API_BASE_URL`.

**Verification**

- Path traversal: 14 malicious inputs rejected (`../`, `..\`, absolute, UNC, drive-qualified, null byte), 4 legitimate paths accepted
- Rate limiting: 20× `401` then `429` with `RateLimit-*` and `Retry-After` headers
- `BYPASS_AUTH=true` + `NODE_ENV=production` → exits 1
- Unauthenticated `/api/nas/files`, `/view-pdf`, `/env-status` → `401`
- Deprecated `/api/erms/*` aliases still route and carry `Deprecation` + `Link`
- `POST /api/erms/login` → `404` (endpoint removed)
- Helmet headers present on live responses; `vite build` passes; 29 server modules load

**Gate:** ✅ no plaintext credentials at rest; no auth bypass reachable in production; no traversal out of the NAS share.
**Rollback:** revert the commit. No schema or data changes were made, so nothing to restore.

### Phase 3 — Authorization unification ✅ DONE

- [x] `services/authorization.js`: `ROLES` (developer/admin/records/planning/viewer), `DOMAINS`, `domainsOf()`, `hasDomain()`, `capabilitiesOf()`, `CAPABILITY_KEYS`
- [x] `requireDomain()` middleware in `middleware/auth.js`, alongside `requireDeveloper` / `requireYearManager`
- [x] `GET /api/auth/me` → `{ user, role, permission, domains, capabilities, provinceAccess, provinces, assignedYears, authorizedYears, activeYear }`
- [x] Backfill all 7 accounts (`scripts/migrate-authorization.js`, dry-run by default, idempotent)
- [x] Positional `permissions[]` array removed from **all 12** consumers, not just `SideMenu`
- [x] `requireDomain('ucds')` applied to ucds, survey, swm, sector, posting and draft-report routers
- [x] Integration tests: 28/28

#### 🔴 Security bug found and fixed: province scope was inverted

Per-province grants are stored two ways — `true`/`false` on some accounts, `'readWrite'`/`'view'`/`'none'` on others. `userProvinceKeys()` tested `user[k] === true`, so **every string-valued account resolved to zero province keys**. And `provinceFilter([])` returned `null`, which `provinceScoped()` reads as *unrestricted*.

Net effect: three viewers scoped to one or three provinces were reading the **entire 17,751-document register**.

Two independent fixes, either of which would have been enough:

1. `accessLevel()` normalises both representations, so string grants resolve correctly.
2. `provinceFilter([])` now returns a deny-all filter. An empty grant denies instead of permitting.

Verified end to end: a Bataan-only viewer now returns **1,510 of 17,751** documents.

#### 🔴 Unauthenticated endpoints closed

`swmRoutes` had **no auth middleware at all**, and several sector/draft-report routes were open:

| Endpoint | Was | Now |
|---|---|---|
| `GET /api/swm-plan-data` | open to anyone | 401 / 403 |
| `GET /api/swm-plan-stats` | open to anyone | 401 / 403 |
| `GET /api/healthcare` | open to anyone | 401 / 403 |
| `GET /api/chemicals` | open to anyone | 401 / 403 |
| `GET /api/tsd` | open to anyone | 401 / 403 |
| `PUT /api/update-swm-plan-data/:id` | protected only by `logActivity` returning 401 | 401 / 403 |
| `POST /save-draft-report(-survey)` | ditto, and only *after* multer buffered the upload | 401 / 403 |

#### Effective access changes

| Account | Role | Before | After |
|---|---|---|---|
| `asabalbosa` | developer | all | all (unchanged) |
| `merlinda` | admin | all | all (unchanged) |
| `gcabalar` | viewer | bataan | bataan (unchanged) |
| `mjulluice`, `aypatdu` | viewer | all | all (they hold all 7 — unchanged) |
| **`pemu_pampanga`** | viewer | **all 7 (bug)** | **aurora, bulacan, pampanga** |
| **`pemu_tarlac`** | viewer | **all 7 (bug)** | **aurora, pampanga, tarlac** |

Two accounts are genuinely restricted — to what their own permission record always said. Everything else is unchanged, so the gate holds for every account whose access was correct to begin with.

**Verification**

- 28/28 integration tests against a live server, using throwaway accounts that are deleted afterwards
- Province scope: 1,510 of 17,751 documents for a Bataan-only viewer
- Backfill idempotent (second run reports 0 of 7)
- `vite build` passes; 39 server modules load

**Gate:** ✅ positional array gone; domain boundary enforced server-side; access unchanged except where it was wrong.
**Rollback:** revert the commit and restore `backups/mongo/2026-09-07/users.pre-phase3.json`. Note this restores the province bug.

### Phase 4 — Shared platform ✅ DONE

**Backend**

- [x] `shared/middleware/errorHandler.js` — `AppError`, typed helpers, JSON 404 for unmatched `/api` paths, terminal handler that never leaks a stack trace or an internal message
- [x] `shared/middleware/validate.js` — Zod at the route boundary, returning per-field errors
- [x] `shared/services/orgUnits.js` — shared master data with alias resolution
- [x] `domain` discriminator on `app-logs`
- [x] `server/app.js` split from `server.js` so the app can be driven without a listener, cron job or Socket.IO
- [x] Vitest + Supertest — **67 tests, all passing**

**Frontend (Ant Design 5 + Pro Components + react-query — no new UI dependencies)**

- [x] `auth/DomainGuard.jsx` — renders a domain's screens or an explanation
- [x] `shared/components/Forbidden.jsx` — AntD `Result` 403
- [x] `modules/admin/OrgUnits.jsx` — full CRUD, react-query, AntD `Table`/`Modal`/`Form`/`Tag`, alias management, per-field API errors surfaced as messages
- [x] `api/orgUnitService.js` with `describeApiError()` flattening the Zod error shape
- [x] Domain-aware sidebar: UCDS sections gated on the `ucds` domain, a **Records (ERMS)** section on `erms`, admin sections on `admin`
- [x] `/universe/admin/org-units` and the `/universe/erms/*` subtree wired behind `DomainGuard`
- [x] `modules/` + `shared/` skeleton with `modules/README.md` stating the rules

**ESLint import-boundary rule** — verified by probe files that were made to fail, then removed:

| Rule | Enforced |
|---|---|
| `shared/` and `auth/` must not import from `modules/` | ✅ |
| `modules/ucds/` must not import from `modules/erms/` | ✅ |
| `modules/erms/` must not import from `modules/ucds/` | ✅ |

`no-restricted-imports` matches the **literal import string**, not the resolved path, so each rule lists the relative forms (`../ucds/**`, `../../ucds/**`) as well as `**/modules/ucds/**`. Without those the rule silently passes on exactly the import a sibling module would write.

**Org-units migration** — `scripts/migrate-org-units.js`, applied and idempotent. 5 distinct division strings → 6 units, hierarchy inferred:

```
ORD                  office     (implied parent)
ORD-PEMU             division   (implied parent)
ORD-PEMU-BATAAN      section
ORD-PEMU-PAMPANGA    section
ORD-PEMU-TARLAC      section
ORD-PISMU            division   alias: "ORD - PISMU"
```

The `division` field on user documents is deliberately untouched; aliases make the old spellings resolve.

**Test coverage** (`npm test` in `server/`)

| Suite | Tests | Covers |
|---|---:|---|
| `authorization.test.js` | 16 | roles, domain defaults, explicit narrowing, unknown-domain rejection, capability precedence, container intersection |
| `provinces.test.js` | 16 | both grant representations, deny-all on empty, `provinceScoped` merge and aggregation behaviour — the Phase 3 escalation, asserted |
| `nas-path.test.js` | 8 | traversal, absolute/UNC/drive paths, null bytes, real record paths, org-code normalisation |
| `domain-boundary.test.js` | 27 | HTTP: unauthenticated access, entitlement payload, province restriction, cross-domain 403, JSON 404 |

**Gate:** ✅ auth and the domain boundary have real coverage; boundary violations fail lint.
**Rollback:** revert the commit; drop the `org-units` collection. No existing collection was modified.

### Phase 5 — UCDS stabilisation ✅ DONE (pending human regression pass)

**5a — structural move** (commit `c78ee53`, rename-only: 225 renames, 4 edits)

| From | To |
|---|---|
| `menu-{province,survey,healthcare,chemicals,tsd,trc,mbu,eswm,planning,legal,extract,register-config,duplicates}` | `modules/ucds/*` |
| `menu-developer` | `modules/admin/developer` |
| `menu-component/Dashboard` | `modules/ucds/dashboard` |
| `menu-component/{Admin,UserAccounts,AccountPermission,UserAccountModal,SignAccountModal,Posting}` | `modules/admin/*` |
| `menu-nas` | `shared/nas-browser` |

Done with a codemod that resolves each relative specifier against the file's old directory and recomputes it from the new one — so extensionless imports, directory imports resolving to `index.*`, CSS, and the paths reaching outside `src` into `data/utils` all stayed correct. 212 specifiers rewritten; the build passed first time.

**`src/components/` deliberately not moved.** 103 inbound references against no domain-boundary benefit — it is already shared by everything. The lint rule was extended to cover it anyway, which surfaced two real couplings:

| File | Imports | Why it is debt |
|---|---|---|
| `components/SideMenu.jsx` | `modules/ucds/province/DataContext` | The shared layout drives province selection, but that state lives in a UCDS context that also fetches the register. Fix: lift "selected province" into shared navigation state, leave the fetching in UCDS. |
| `components/AiNotification/PopOverNotification.jsx` | `modules/ucds/province/ProvinceModal` | A shared popover opens a UCDS screen. |

Both are `eslint-disable`d with a comment naming the fix, so they stay visible and **no new coupling can appear**.

**5b — indexes** (`scripts/migrate-indexes.js`, dry-run by default, idempotent)

`universe-db` had exactly **one** index beyond the automatic `_id`: a text index on `ucds-data.description`, created lazily by a controller. Every other query was a collection scan — including the province filter applied to all 17,751 register documents on every scoped read, and the username lookup on every login.

**34 indexes created**, every key taken from a filter or sort that appears in the code. Unique indexes are checked for existing duplicates first and skipped with a report rather than failing halfway; none were blocked.

Verified with `explain('executionStats')`:

| Query | Plan | Docs examined |
|---|---|---:|
| province scope filter | `IXSCAN` | 1,510 (was a 17,751 scan) |
| `sort_key` lookup | `IXSCAN` | 0 |
| `ecc_cnc` lookup (the ERMS join key) | `IXSCAN` | 1 |
| `username` login lookup | `IXSCAN` | 1 |

`users.username` and `users.email` are now **unique**, which is correctness, not just speed — nothing previously stopped a duplicate account being created.

**5b — admin route consolidation**, all behind `DomainGuard('admin')`, with legacy paths redirecting:

| Legacy | Now |
|---|---|
| `/universe/accounts` | `/universe/admin/users` |
| `/universe/activity-log` | `/universe/admin/audit` |
| `/universe/posting` | `/universe/admin/posting` |
| `/universe/developer/*` | `/universe/admin/developer/*` |
| — | `/universe/admin/org-units` |

**Verification:** `vite build` passes, 0 boundary violations, 67/67 server tests pass, no stale links to the old admin paths.

**Gate:** ⚠️ Automated checks pass. A **human click-through by Planning personnel is still outstanding** — the build proves imports resolve, not that screens behave. See below.

**Rollback:** revert the two commits. Indexes can be dropped without data loss; no document was modified.

### Phase 6 — ERMS data migration ✅ DONE (staging)

**Pipeline** — `server/scripts/migrate-erms/`

| Script | Does |
|---|---|
| `profile.js` | Measures the extract. Reads and writes nothing. |
| `stage.js` | Transforms and upserts into `universe-db-staging`. `--apply` to write, `--db=` to target. |
| `reconcile.js` | 10 gates + the UCDS link. `--write-refs`, `--report`. Exits non-zero on failure. |
| `lib/{source,transform,match}.js` | Parsing, row→document, register matching. |

**The extract:** 19,022 physical lines → **18,067 records** (954 lines absorbed into quoted fields — it cannot be split on newlines). `Serial_No` is 100% present and 100% unique. 37 rows are `FSN-####### Att-#####`, i.e. a second document filed against an existing record, not a record of their own.

**Reconciliation — 10/10 gates pass**

| Gate | Result |
|---|---|
| source count = staged count | 18,067 = 18,067 |
| `serialNo` unique | 18,067 distinct |
| id-map has one row per record | 18,067 |
| legacy id preserved | 0 missing |
| every province mapped | 0 unmapped |
| every permit type recognised | 0 unrecognised |
| every document has a share-relative path | 0 missing |
| every attachment resolves to a parent | 36/36 |

**Data quality: 36 records (0.2%) flagged**, all unparseable dates. Month misspellings (`Arpil`, `Ocotber`, `Ocotober`) are corrected automatically by edit-distance match, capped at distance 2 and refused when ambiguous. What remains is **deliberately not guessed**:

```
"Poultry Farm"              a project type in the date column
"R03-1308-0330"             a permit number in the date column
"16 December 20211"         2011 or 2021 — not ours to decide
"30 June 201130 June 2011"  duplicated value
```

Raw values are preserved on the document and exported to `reports/erms-data-quality.csv` for Records personnel.

#### The cross-domain link — 63.1%

This is the finding that matters, because it is the justification for unifying at all.

| Permit type | Matched | Rate |
|---|---|---|
| ecc-original | 8,190 / 9,090 | **90.1%** |
| ecc-amended | 2,233 / 2,630 | **84.9%** |
| cnc | 745 / 5,222 | 14.3% |
| hw-generator | 238 / 1,125 | 21.2% |
| **total** | **11,406 / 18,067** | **63.1%** |

A naive `ecc_cnc` equality join gave 57.8%. Three structural facts raised it to 63.1%:

1. **A register cell can hold several permit numbers** — `"03BU-0403-07-203-120A, CNC-OL-R03-2017-10-01090"`. Each is now indexed separately.
2. **Hazardous-waste registrations are not in `ecc_cnc` at all** — they are in `haz_id`. Indexing it took hw-generator from 0.2% to 21.2%.
3. **Prefix conventions differ** — ERMS writes `R03-2017-0370`, the register writes `ECC-OL-R03-2017-0370`.

Matching is layered exact → punctuation-insensitive → digits-only (≥8 digits), and **every layer refuses an ambiguous key** — one resolving to more than one establishment — so a looser rule can never invent a link. 92% of matches are exact; only 6.8% rely on the digits fallback.

**The remaining 37% is a business finding, not a migration defect.** ERMS holds 5,222 CNC records while only ~1,135 register entries mention a CNC number at all. The two systems were maintained independently and the register simply does not cover everything ERMS has. Exported to `reports/erms-unmatched-permits.csv` for Planning.

**Tests:** 33 new (100 total). They cover the ambiguity guard, the refusal to guess at bad dates, multi-value cell splitting, and the three permit-type misspellings.

**Verification:** production has **no `erms-*` collections** — everything lives in `universe-db-staging`.

**Gate:** ✅ all reconciliation checks pass against staging.
**Rollback:** drop `universe-db-staging`. Production was never written to.

### Phase 7 — ERMS module build ✅ DONE

Behind `ERMS_MODULE_ENABLED`. Read-only surfaces before write surfaces.

- [x] Reference data (permit types, provinces, uploaders) — `GET /api/erms/filter-options`
- [x] Records register — list, search, filter, sort, paginate, detail (read-only)
- [x] ERMS dashboard
- [x] Cross-domain read API (`countForFirm`, `listForFirm`)
- [x] Records create and update (first write path)
- [x] Tracking & routing — append-only custody history
- [x] Archiving & retention — boxes, sealing, disposal recording
- [x] ERMS reports — four reports with CSV export
- [x] Document access via NAS — full note in [`NAS-ARCHITECTURE.md`](NAS-ARCHITECTURE.md)

#### Write path

| Endpoint | Notes |
|---|---|
| `POST /api/erms/records` | Serial allocated atomically from `erms-sequences` |
| `PATCH /api/erms/records/:serialNo` | Nested objects merge, they do not replace |
| `POST /api/erms/records/:serialNo/tracking` | Append-only — no PATCH, no DELETE |
| `PUT /api/erms/records/:serialNo/box` | File into or remove from a box |
| `POST/PATCH /api/erms/boxes[/:code]` | Create, seal, record a disposal |
| `GET /api/erms/reports/:key` | `?format=csv` for the full set |

**Write authorization is two-layered.** `canManageData` — the capability that already means "may modify data", reused rather than inventing an ERMS-only flag — plus a per-province check against the record's own province using `userWritableProvinceKeys`. A `view` grant reads a province; only `readWrite` changes it. On update, **both** the current and the target province are checked, so a record cannot be moved out of the user's reach.

**Disposal is recorded, never performed.** Marking a box disposed requires naming the approving authority, and the records stay in the database. The paper goes; the trail does not.

**Tracking is append-only by design.** A custody trail that can be edited is not a custody trail. A mistake is corrected by recording a correction, and a test asserts no edit or delete route exists.

#### 🐛 Two bugs found during this phase

1. **Serial allocation returned `FSN-undefined`.** The counter document had a field named `value`, which collides with the driver's legacy `{ value: doc }` result wrapper — `result.value.value` was `undefined`. The field is now `seq`, both driver result shapes are handled, and a non-numeric sequence throws instead of inserting. One malformed record reached production and was removed.
2. **The Phase 2 rate limiter throttled the test suite** (20 logins / 15 min). Now skipped when `NODE_ENV=test` only, and the suites reuse one session per user instead of signing in per test.

#### ⚠️ Incident during cleanup

While removing the malformed record I used the filter `/^FSN-\d+$/`, which does not match the legitimate attachment serials (`FSN-0000206 Att-00012`). **37 valid records were deleted.** They were restored immediately by re-running `stage.js --apply --db=universe-db` and `reconcile.js --write-refs`; the count returned to 18,067 with 10/10 gates and all 37 attachments present.

The recovery worked because the import is idempotent and upserts on `serialNo` — the property built in Phase 6 precisely so a re-run corrects rather than duplicates. The lesson is narrower: an ad-hoc cleanup should target the exact known-bad key, not a pattern.

**UI** — `RecordFormModal` (create and edit share one form), `TrackingPanel` (timeline plus a movement dialog), `BoxAssignment`, `ArchiveBoxes`, `ErmsReports`. Actions appear only where `writableProvinces` says the API would accept them.

**Tests:** 33 new (160 total). They cover the capability and province refusals, serial uniqueness under concurrency, permit-number conflict, nested-merge on update, the raw-date clearing when a flagged value is corrected, custody calculation, overdue loans clearing on return, sealed boxes refusing records, disposal requiring an authority, and CSV export.

**Gate:** ⚠️ built and tested, documents included; **acceptance by Records personnel still outstanding**.

#### The rename

The application is now **E-Universe — Unified Information and Records Management System**.

Display names only: `<title>`, the landing page, the sidebar logo, Help. **Deliberately not renamed** — `SITE_BASE` stays `/universe-central-database-system`, because changing it breaks every saved bookmark and every password-reset link already sitting in someone's inbox; collections keep their `erms-*` / `ucds-*` names; the `logo-ucds` CSS class stays, because PurgeCSS matches class names literally and renaming it would drop the rule from the production bundle — the same failure mode Phase 9 already hit once.

**Production import.** Staging reconciled 10/10, so the same pipeline was run against `universe-db`: 18,067 records, 11,465 linked, 36 flagged. Additive only — `erms-records` and `erms-id-map` are new collections; nothing existing was touched. `universe-db` went 27 → 30 collections (`org-units` + the two `erms-*`).

**Backend** — `server/modules/erms/`

```
modules/erms/
├── index.js                      isEnabled(), routes, and the read API
├── routes.js                     every route: authenticateSession → requireDomain('erms')
├── controllers/recordController.js
└── services/recordService.js     the ONLY writer of erms-*
```

| Endpoint | Purpose |
|---|---|
| `GET /api/erms/dashboard` | totals, link rate, breakdowns, recent uploads |
| `GET /api/erms/filter-options` | permit types, provinces, uploaders — scoped |
| `GET /api/erms/records` | list with search, filters, sort, pagination |
| `GET /api/erms/records/:serialNo` | one record plus its attachments |

`ERMS_MODULE_ENABLED=false` means the routes are **not registered at all** — that is the rollback for the whole module, and it needs no code change.

**Province scope for Records personnel.** ERMS routes never call `resolveYearContext` (records are not year-scoped), so `req.provinceKeys` is never set. The scope is derived from the account directly using the same helpers UCDS uses, with the same fail-closed rule: **an account with no province granted sees nothing**, not everything. A filter can narrow within the grant but never widen it — asking for a province outside the grant falls back to the grant. An out-of-scope record answers **404, not 403**, so the API does not confirm that a record exists to someone who may not see it.

**Frontend** — `front-end/src/modules/erms/`, on Ant Design 5 + react-query. No new UI dependencies.

| Screen | Notes |
|---|---|
| Dashboard | Four stat cards, permit-type and province distributions as proportion bars, recent uploads. Tooltips explain what "not linked" and "needs review" actually mean. |
| Records list | Server-side pagination and sorting, search across serial / permit number / proponent / project, filters for permit type, province, uploader, register-link status and review-needed. |
| Record detail | Full record, the register link with how it was matched, attachments, and any unparseable value shown **as the original text** rather than hidden. |

Sidebar lists only Dashboard and Records — linking to unbuilt screens would just lead to a "not built yet" page.

#### ✅ Opening documents — unblocked

Full note: [`NAS-ARCHITECTURE.md`](NAS-ARCHITECTURE.md). A clerk opens a document from its record; the server resolves the stored path inside the configured share and streams it. No workstation needs `Z:` mapped and no credential reaches a browser.

Four findings, each of which changed the design:

| Found | Consequence |
|---|---|
| **The `smb2` package cannot run on Node 22.** It builds an NTLMv1 response, which needs DES, which OpenSSL 3 removed — every call died with `ERR_OSSL_EVP_UNSUPPORTED`. Last published 2018. | The NAS feature was **already 100% non-functional**. Replaced with native `fs` over a UNC path: the server is Windows on the same network, so the OS is already an SMB client. That also gives real streaming and range requests instead of buffering whole files, and removes a dead dependency rather than swapping in another. |
| **26.7% of paths exceed the 260-character `MAX_PATH` limit**, and Windows reports those as *file not found* rather than as an error. | A first coverage measurement said **0 of 400** resolved and looked like catastrophic data loss. With the `\\?\UNC\` prefix the same sample resolved **98.7%**. The prefix also disables path normalisation, so validation has to run *before* it is applied — `resolveSharePath()` does, then re-checks containment. |
| **`/api/nas/*` required only `authenticateSession`.** | Authentication with no authorization: any signed-in user could read **any file on the share** by supplying a path. The Phase 9 sweep passed it because the sweep checks that a guard exists, not that it is sufficient. The path-taking route is now deleted rather than guarded, and the rest is developer-only plus an emailed code. |
| **The four `nas/*` screens sat outside every `DomainGuard`**, and the sidebar offered them to any Admin or Records user. | Both fixed — a `RoleGuard`, and the menu entry now requires the developer role. |

Coverage is measured, not assumed: `node scripts/nas-coverage.js` reports **98.3% of a 300-record sample resolving to a real file**. The rest are directories that no longer exist, including one row whose path contains `Bulacan\Bulacan` — a fault in the original data.

Two drive letters appear in the legacy data, `Z:` (18,065 rows) and **`N:` (2 rows)**, so the prefix is configurable and a hard-coded `Z:` would have silently lost two records.

**Verified end to end** against a real migrated record: a 59 MB scan at a 287-character path returns correct metadata, streams in ~4s, answers `206` to a range request, downloads with its filename, and writes an audit entry that names the record but **not** the UNC path — the path would publish the internal host to everyone who can read a log.

**Tests:** 22 new (127 total), covering the domain refusal, the fail-closed province scope, the filter-cannot-widen rule, 404-not-403 for out-of-scope records, validation rejections, and that the module exposes **no write API** to other domains. The suite skips itself with a warning if the flag is off, rather than reporting misleading 404s.

**Gate:** ⚠️ read-only surfaces built and tested; **acceptance by Records personnel still outstanding**.
**Rollback:** `ERMS_MODULE_ENABLED=false`. To also remove the data, drop `erms-records` and `erms-id-map`; no UCDS collection was modified.

### Phase 8 — Cross-domain integration ✅ DONE

- [x] ERMS record → UCDS establishment link, read-only via `registryService`
- [x] UCDS establishment → ERMS records panel, read-only, degrades silently
- [x] Backfill `ucdsRef` on migrated records *(done in Phase 6)*

**One matcher, two access patterns.** `scripts/migrate-erms/lib/match.js` moved to `modules/ucds/services/permitMatch.js`. The migration and the runtime now share it, so a link made when a clerk saves a record agrees with one made during the import **by construction** rather than by two implementations happening to behave alike. A test asserts the agreement, including the matched strategy.

#### 🐌 A performance problem, and why the obvious fix was wrong

The first implementation built the permit index over the whole register per request. It timed out at 30s. Measuring rather than assuming:

| Step | Time |
|---|---|
| Mongo server-side execution | **12 ms** |
| Transferring 16,193 rows to the client | **38,000 ms** |
| `buildIndex` over them | 83 ms |
| 1,000 lookups against the index | 2 ms |

The query was never slow — **transferring the register was**. Caching would have hidden it behind a 40-second first request and a stale window. Instead a lookup now fetches *candidates* first: a tolerant regex on the permit number's digit groups, returning a handful of rows in ~100 ms, and the same matcher decides among them.

Verified against 8 migrated records: **8/8 agreement** on both establishment and strategy, ~70 ms each. A test asserts the candidate set stays under 50 rows and under 1% of the register, so the full-scan cannot creep back.

#### Integration points

| | UCDS → ERMS | ERMS → UCDS |
|---|---|---|
| **Endpoint** | `GET /api/ucds/establishments/:sortKey/records` | `GET /api/erms/register/{search,resolve}` |
| **Requires** | `ucds` domain | `erms` domain |
| **Direction** | read-only | read-only |
| **Trigger** | Records tab on the establishment modal | as the clerk types a permit number |
| **On failure** | `{ available: false }` and **200** | no match shown as information, not an error |

**Degradation is deliberate.** A user without the `erms` domain, or a deployment with the module off, gets `available: false` and a 200 — a planning screen must never break because the records module is unavailable to that person. The panel then renders nothing at all. A genuine 5xx inside the records module is caught and degraded the same way.

**Neither domain gained a write path into the other.** `ucds.read` exposes `resolveByPermitNumber`, `findBySortKey`, `search`. `erms.read` exposes `countForFirm`, `listForFirm`. Tests assert both surfaces are exactly that.

**Linking on save.** A new or corrected permit number resolves its establishment at write time. If the register is momentarily unavailable the record still saves, unlinked — a clerk filing a document is not blocked by a lookup.

#### UI

- **Records tab** on the UCDS establishment modal, linking through to the records list filtered by `?linkedTo=<sortKey>` (a real filter, not a text search).
- **Live register feedback** in the ERMS record form: as a permit number is typed it says which establishment it will link to, or states plainly that none carries it — *"That is common — the register does not cover every record"*, so nobody "fixes" a permit number that was correct.

**Tests:** 18 new (178 total) — degradation for a user without the domain, 403 for the wrong domain, 404 for an unknown establishment, resolver agreement with the migration, candidate bounding, and both read-only surfaces.

**Gate:** ✅ integration live; match rate measured at 63.5% and the unmatched set exported for Planning.
**Rollback:** revert the commit. `ERMS_MODULE_ENABLED=false` also disables the panel, which then renders nothing.

### Phase 9 — Validation 🟡 automated parts done; human pass outstanding

- [x] Security sweep over **every** route, not just ERMS
- [x] Data reconciliation re-run against production — **10/10 gates**
- [x] Per-role functional walkthrough (`npm run walkthrough`)
- [x] UI review, **both themes** and three breakpoints — automated
- [ ] UI review on **real devices** — **requires a person**
- [ ] Functional walkthrough of the screens — **requires a person**

#### 🔴 The sweep found 20 unprotected routes

Rather than hand-checking ERMS endpoints, `shared/routeInventory.js` walks the **live Express router** and describes every route with its guards. Reading route files by hand is exactly what let these sit open:

| Routes | Was | Exposure |
|---|---|---|
| `/api/dev/*` — **14 endpoints** | no auth middleware at all | `GET /api/dev/activity-logs` returned the **audit trail** — usernames, paths, request bodies — to anonymous callers. `GET /api/dev/introspect/ucds-data/fields` returned **sampled register values including firm names and addresses**. `DELETE /api/dev/activity-logs/:id` let anyone **remove audit entries**; `POST/DELETE /api/dev/pdf-forms` let anyone upload or delete form templates. |
| `/generate-icir/:id` and 3 more | no auth | Report generation for any guessable record id. |
| `GET /api/files/:filename` | no auth | Any GridFS file by name. |

All confirmed by calling them against a running server — they answered **200**. Now `401`. `/healthz` and `/readyz` are on an explicit public allowlist, which a new public route must be added to consciously.

#### 🐛 The inspector found a flaw in itself

The first sweep reported ERMS routes as session-only. `requireDomain()` returns an **anonymous** closure, so it was invisible to a name-based inspector — a domain-gated route looked unguarded. Naming the factory-produced middleware (`requireDomain`, `requireRole`, `validate`) fixed the audit and made stack traces name the middleware that rejected a request.

Worth noting: the sweep's *first* result was wrong in the safe direction — it under-reported protection. A name-based inspector could equally miss a *missing* guard, which is why the test also calls every route rather than only reading the stack.

#### The `/api/erms/*` NAS aliases are gone

Phase 1 kept them for one release. The sweep found they answered a **Planning user** — they sit under the ERMS namespace but are NAS routes, so they bypassed the domain boundary. Removed; the front end has called `/api/nas/*` since Phase 1, and nothing referenced them.

#### Route inventory — 174 routes

| Protection | Count |
|---|---:|
| domain-gated | 108 |
| session only | 40 |
| role-gated (developer / year-manager) | 17 |
| public by declaration | 9 |
| **unprotected** | **0** |

Full listing: `reports/route-audit.txt` (`npm run audit:routes`).

#### Per-role walkthrough

| | Planning | Records | Read-only | Admin |
|---|---|---|---|---|
| establishment register | allowed | **refused** | allowed | allowed |
| healthcare data | allowed | **refused** | allowed | allowed |
| ERMS dashboard / records / boxes / reports | **refused** | allowed | **refused** | allowed |
| search register from ERMS | **refused** | allowed | **refused** | allowed |
| shared org units (read) | allowed | allowed | allowed | allowed |
| create an org unit | refused | refused | refused | **allowed** |
| developer settings | refused | refused | refused | refused |

An Administrator is refused Developer Settings **by design** — the plan's role table gives Administrators user, role, audit and year management, and explicitly no developer functions.

#### Tooling added

| Command | Does |
|---|---|
| `npm run audit:routes` | Full route/guard listing; exits non-zero on an unprotected route |
| `npm run audit:routes:unprotected` | Just the problems — suitable for CI |
| `npm run walkthrough` | Per-role capability matrix against a running server |
| `npm run reconcile` | Re-runs the 10 data gates against production |

`tests/route-protection.test.js` makes the sweep permanent: it calls **every** route unauthenticated, every ERMS route as a Planning user, every UCDS domain route as a Records user, and every developer route as a Planning user. A route added with its guard missing fails the suite.

**Tests:** 7 new (185 total).

#### UI validation — `npm run smoke`

The gap outstanding since Phase 5a is now largely closed by machine.
`scripts/smoke.mjs` drives a real browser: it signs in as a throwaway account
per role, visits every screen that role should reach, and fails on a blank page,
an error boundary or an uncaught exception. Screenshots land in
`reports/screenshots/`.

**26/26 screens render.** The Phase 5a restructure did not break them.

Run it against a **production build** (`vite build` + `vite preview`), not the
dev server — two of the four bugs below exist only in a built bundle.

It found four real bugs, none introduced by this project:

| Bug | Effect |
|---|---|
| `YearProvider` fetches once at mount, on the login page, and 401s | First sign-in from a fresh browser showed **"No year containers assigned"**. Login navigates client-side, so nothing refetched. Only looked fine in development because a hard refresh remounts the provider. |
| `axios.get(" ${API_BASE_URL}/api/sign-up")` — double quotes, not backticks | **User Accounts crashed outright** with `rawData.some is not a function`: the literal path hit the SPA's history fallback, so `dataSource` got an HTML string. |
| Bare `fetch()` without `credentials: "include"` | `axios.defaults.withCredentials` does not apply to `fetch`, which defaults to `same-origin` — and the SPA and API are different origins. The header showed **"Error: User not found"** on every screen, for every user. |
| PurgeCSS extractor did not treat `$`/`{` as separators | `` `logo-icon-img${…}` `` extracted as one token, so `.logo-icon-img` was **deleted from the production bundle**. The logo rendered at intrinsic size over the menu. Production-only; PurgeCSS does not run in development. |

Also closed: the UCDS routes had no client-side `DomainGuard`, so a Records user
typing a UCDS URL saw a shell with failing requests instead of a refusal. They
are now wrapped as three layout-route groups, and `/universe` redirects by
domain so a Records clerk lands on their own dashboard.

#### Themes and breakpoints

`npm run smoke -- --themes` re-walks four representative screens in **both
themes** across desktop (1440), tablet (1024) and phone (480), and fails on
horizontal overflow. Splitting the old line 676 in two matters: the themes and
the breakpoints are measurable, a real device is not, so only the second half is
still blocked on a person.

Measuring meant first making the two things measurable at all:

| Found | Why it mattered |
|---|---|
| The theme choice was **not persisted** — `useState("dark")` with no storage | Every reload threw away the user's choice, so "review both themes" had no stable state to review. Now in `localStorage` under `ucds-theme`, which also lets the smoke run set the theme before load instead of clicking a toggle 24 times. |
| `.profile_container` overflowed to **794px at a 480px viewport** | The header holds a `white-space: nowrap` date/name/division line. On a phone it pushed the avatar and theme toggle off-screen — **there was no way to sign out**. The text is now hidden below 768px; the name is still in the avatar popover. |
| `AvatarWithName` rendered the words **"Loading..."**, then an **empty box** for any user with no avatar | Text in the header reflowed the toolbar on every navigation, and new accounts got a blank slot. Replaced with a same-size initial-letter placeholder covering the loading, error and no-avatar cases. |

Two things the first run reported were **not** defects, and saying so is the
point of the exercise:

- A **wide data table** inside a horizontally scrolling wrapper is how a table
  is supposed to behave on a narrow screen. `layoutIssues()` now walks ancestors
  and ignores anything reachable by scrolling — otherwise the check trains you
  to ignore it.
- The **"Loading..."** text appeared in all 24 theme screenshots but none of the
  main-loop ones. The theme loop was missing the main loop's `networkidle`
  settle, so it photographed an in-flight state. The endpoint answers `200` in
  milliseconds; there was no hang. The wait is now in both loops.

**Gate:** ✅ zero endpoints answer without a domain check — enforced, not asserted.
✅ every screen renders for the roles that should reach it.
✅ 50/50 screens clean across both themes × three breakpoints.
⚠️ Still outstanding, and still human: **a real device** (an emulated 480px
viewport is not a phone — touch targets, on-screen keyboards and real DPI are
not simulated), and **a Records clerk completing a real filing end to end**. The
smoke test proves a screen renders; it cannot tell you the workflow makes sense.

### Phase 10 — Parallel operation & cutover 🟡 tooling ready; the phase is a procedure

**Full runbook: [`CUTOVER.md`](CUTOVER.md).**

- [x] Divergence checker built and proven to detect drift
- [x] **Document access working** — the prerequisite, see Phase 7
- [x] Daily check reduced to one command — `npm run daily-check`
- [x] Training material written — [`RECORDS-USER-GUIDE.md`](RECORDS-USER-GUIDE.md)
- [ ] Read-only NAS account provisioned on the Synology — **on the appliance, not in this repo**
- [ ] Desktop ERMS set to read-only — **the irreversible step**
- [ ] 2–4 weeks parallel with daily delta checks
- [ ] Remove feature flag
- [ ] Training delivered

**Document access was a prerequisite, not a parallel task.** A two-to-four week
trial of a records system in which nobody can open a scan proves nothing —
staff would return to the desktop app on the first day and the period would
measure nothing except how long they tolerated it. That is why Phase 7's NAS
work came first.

**What is left is not code.** Freezing the desktop app is an irreversible
decision, the parallel period is elapsed time, and training is people in a
room. The tooling for all three is built and the material is written.

**`npm run divergence -- --file=<export>.csv`** compares a fresh desktop export
against `erms-records`, reusing the Phase 6 transform so the two sides are
compared like for like. Three findings:

| Finding | Means |
|---|---|
| **web-only** | created in the web module — expected |
| **source-only** | in one side only. The export is stale, or the desktop app was written to after the freeze. |
| **conflicting** | same serial, different values. Both systems were edited; a person decides which is right. |

Exits non-zero on anything but web-only, so it can run unattended. Baseline
against the current export: **no divergence, 18,067 = 18,067**.

A clean result proves nothing by itself — a checker that always said "clean"
would look identical. The classification is extracted into `lib/compare.js` and
**12 tests show it detecting** each kind of drift: a record missing from either
side, the same record edited differently, dates compared by value rather than
object identity, and the web-owned fields (`ucdsRef`, `archive`, `dataQuality`,
timestamps) correctly ignored so they do not flag every record.

**This phase cannot start yet**, and not for a technical reason:
`ERMS_MODULE_ENABLED=false`, so there is no ERMS running to be parallel with.
The order that unblocks it is in `CUTOVER.md` — the UCDS click-through, then
Records personnel using the module while the desktop app still works, and only
then the freeze.

### Phase 11 — Legacy retirement

- [ ] Final backup, restore-tested
- [ ] Archive off-platform, retention period documented
- [ ] Decommission desktop ERMS

---

## 7. What NOT to do

1. No second authentication system. No JWT alongside sessions.
2. No second UI framework. Ant Design 5 only.
3. No second `users` collection, audit log, or notification system.
4. Neither domain writes the other's collections. Ever.
5. No sync job, no event bus, no denormalised cross-domain counters. One process, one database — a function call is enough.
6. ERMS records are **not** year-scoped. Records have their own lifecycle; year containers model annual cycles. Register ERMS datasets as `SHARED` in `yearScope`.
7. Do not reproduce the dual legacy/`/api` path pattern. One canonical path per new route.
8. Never write ERMS documents to `server/uploads/` — that disk does not survive a Render redeploy.
9. No route protected only by a hidden menu item.
10. No whole-frontend restructure in one commit. Rename-only commits, moved opportunistically.
11. Do not migrate the NAS files. Paths are referenced, not moved.
12. Do not touch the other databases on the cluster.

---

## 8. Open items

| # | Question | Blocks |
|---|---|---|
| 1 | Confirm drop list for the four orphan collections | Phase 1 |
| 2 | Are Records personnel already UCDS account holders, or a new user population? | Phase 3 backfill |
| 3 | Is the `Z:\` NAS path reachable from the Render-hosted server, or only from the office LAN? | Phase 7 document access |
| ~~3b~~ | ~~Where exactly is the share root?~~ ⏸️ **On hold by decision, and reframed.** The WinForms app reached scans through `Z:\`, a drive mapped on each *workstation* — the app and the user shared a machine. A web application cannot do that, so this is a flow to design rather than a root to configure. Three options and their trade-offs are in [`CUTOVER.md`](CUTOVER.md#documents--why-this-is-a-design-question-not-a-setting). The migration stored paths rather than moving files, so none is foreclosed. | Document access only |
| ~~3c~~ | ~~Are the hazardous-waste series the same registry?~~ ✅ **Answered:** one series; an `M` in the `GR` marks a manually generated HWG id. Implemented as a structural `hwKey()` layer in the matcher — hw-generator went 21.2% → **26.4%**. The remaining gap is coverage, not the rule: ~825 of 1,125 ERMS HWG ids have no `haz_id` counterpart at all, and 1,310 of the register's 4,807 `haz_id` values are placeholders (`In-process`, `NODATA`, `App.No:…`, and one reading "The project didn't exist. No development was done."). Worth a Planning data-quality pass. | — |
| 4 | Official records classification / retention schedule (NAP or agency-issued)? | Phase 7 archiving |
| 5 | Is there a cutover deadline tied to a budget cycle? | Phase 10 sequencing |

---

## 9. Reference

- Architecture blueprint (full rationale): https://claude.ai/code/artifact/01d97b9e-a2af-4cba-8371-ebd57d30b21e
- ERMS source data: `data/tb_maindata_erms.csv`
- Year partitioning: `server/services/yearScope.js`
- Authorization: `server/services/authorization.js`, `server/middleware/auth.js`
