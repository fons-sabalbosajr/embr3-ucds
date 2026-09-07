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

### Phase 2 — Security fixes

- [ ] Move NAS credentials out of the session into server-side env config (`NAS_*` / legacy `ERMS_NAS_*`, already read by `envStatus`)
- [ ] Purge existing `sessions` documents containing `erms_credentials` / `nas_credentials`
- [ ] `cookie.secure: true` when `NODE_ENV === 'production'`
- [ ] Hard-fail on `BYPASS_AUTH` when `NODE_ENV === 'production'`
- [ ] **Path traversal in `nasController.viewPdf`** — `req.query.file` goes straight to `smb2.readFile()` with no normalisation, so `../` escapes the share root. Constrain to the share and reject any path that normalises outside it. *(Found in Phase 1; deliberately left alone there to keep that phase rename-only and cleanly revertable.)*
- [ ] Add `helmet` and rate limiting on auth endpoints

**Gate:** no plaintext credentials at rest; no auth bypass reachable in production; no traversal out of the NAS share.

### Phase 3 — Authorization unification

- [ ] `services/authorization.js`: add `DOMAINS`, `domainsOf()`, `capabilitiesOf()`, `requireDomain()`
- [ ] `GET /api/auth/me` → `{ user, role, domains, capabilities, provinces, assignedYears, activeYear }`
- [ ] Backfill all 7 users → `domains: ['ucds']` + named `capabilities`
- [ ] Rewrite `SideMenu.jsx` off the positional `permissions[]` array
- [ ] Apply `requireDomain('ucds')` to existing UCDS routes (no-op, proves the mechanism)
- [ ] Tests: 403 on missing domain, 401 unauthenticated, developer passes all, backfill is behaviour-neutral

**Gate:** every existing user's access unchanged; positional array gone from the codebase.

### Phase 4 — Shared platform

- [ ] Central Express error handler
- [ ] Zod validation helper at the route boundary
- [ ] `domain` discriminator on `app-logs`
- [ ] `org-units` promoted to shared master data
- [ ] Vitest + Supertest covering the auth/authz layer
- [ ] `modules/` + `shared/` skeleton + ESLint import-boundary rule

**Gate:** auth has test coverage; boundary violations fail lint.

### Phase 5 — UCDS stabilisation

- [ ] Move `menu-*` folders into `modules/ucds/` (rename-only commits)
- [ ] Add missing indexes on hot query paths
- [ ] Consolidate admin routes under `/universe/admin/*`
- [ ] Full UCDS regression pass

**Gate:** signed off by Planning personnel before ERMS work begins.

### Phase 6 — ERMS data migration

- [ ] Profile the CSV (uniqueness, value distributions, date-format variants, path validity)
- [ ] Build `server/scripts/migrate-erms/` — profile → stage → transform → import → reconcile
- [ ] Import into `universe-db-staging` first; **production untouched**
- [ ] Reconcile: counts match, `serialNo` unique, dates parsed, provinces mapped
- [ ] Match `permit.number` → `ucds-data.ecc_cnc`; report unmatched to Planning

**Gate:** all reconciliation checks pass against staging.

### Phase 7 — ERMS module build

Behind `ERMS_MODULE_ENABLED`. Read-only surfaces before write surfaces.

- [ ] Reference data (permit types, file classes)
- [ ] Records register — list, search, filter, detail (read-only)
- [ ] Document access via NAS (view / download)
- [ ] Records CRUD (first write path — legacy desktop app goes read-only here)
- [ ] Tracking & routing
- [ ] Archiving & retention
- [ ] ERMS dashboard & reports

**Gate:** each module accepted by Records personnel before the next begins.

### Phase 8 — Cross-domain integration

- [ ] ERMS record → UCDS establishment link (read-only, via `registryService`)
- [ ] UCDS establishment → ERMS record count panel (read-only, degrades silently)
- [ ] Backfill `ucdsRef` on migrated records

**Gate:** match rate agreed acceptable; unmatched set triaged.

### Phase 9 — Validation

- [ ] Functional walkthrough per role
- [ ] Data reconciliation re-run against production
- [ ] **Security test: every ERMS endpoint called as a Planning user must return 403**
- [ ] UI review, both themes, real devices

**Gate:** zero endpoints answer without a domain check.

### Phase 10 — Parallel operation & cutover

- [ ] Desktop ERMS set to read-only
- [ ] 2–4 weeks parallel with daily delta checks
- [ ] Remove feature flag
- [ ] User training

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
| 4 | Official records classification / retention schedule (NAP or agency-issued)? | Phase 7 archiving |
| 5 | Is there a cutover deadline tied to a budget cycle? | Phase 10 sequencing |

---

## 9. Reference

- Architecture blueprint (full rationale): https://claude.ai/code/artifact/01d97b9e-a2af-4cba-8371-ebd57d30b21e
- ERMS source data: `data/tb_maindata_erms.csv`
- Year partitioning: `server/services/yearScope.js`
- Authorization: `server/services/authorization.js`, `server/middleware/auth.js`
