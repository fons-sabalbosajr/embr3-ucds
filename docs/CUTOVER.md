# Parallel operation and cutover

Phases 10 and 11. Unlike everything before it, this is mostly a procedure for
people to run rather than code to write. The tooling exists; the decisions do
not belong to it.

**The irreversible step is freezing the desktop application.** Everything before
that can be undone by setting `ERMS_MODULE_ENABLED=false`.

---

## Before you start

These are not optional, and none of them is a code change.

- [ ] **Planning personnel have clicked through UCDS.** Phase 5a moved 225
      files. The build proves imports resolve; it says nothing about whether the
      province tab panes render or the IC/CIC/ICIR generators still work.
- [ ] **Records personnel have used the ERMS screens** with
      `ERMS_MODULE_ENABLED=true`, while the desktop app still works, and can
      complete a real filing end to end.
- [ ] **The 36 flagged records have decisions** — `reports/erms-data-quality.csv`.
- [ ] **Planning has seen the 6,602 unmatched permits**, or has explicitly
      accepted 63.5% as the working match rate —
      `reports/erms-unmatched-permits.csv`.
- [x] **Document access.** ✅ Decided and built — the server reaches the share
      over SMB. See "Documents" below and `NAS-ARCHITECTURE.md`.
- [ ] **The read-only NAS account exists on the Synology.** Provisioned on the
      appliance, not from this repo — `NAS-ARCHITECTURE.md` has the steps.
      Until it does, the deployment uses an account with more rights than it
      needs.
- [ ] **`nas-coverage` still reports ~98%.** Run it the morning of the freeze.
      A drop means the server has lost the share, and a parallel period where
      nobody can open a document proves nothing.
- [ ] **The server has a stable address** — see `DEPLOYMENT.md`. A DHCP lease
      that moves during the parallel period will look exactly like an outage.

---

## Documents — resolved: the server reaches the share

**Decided in Phase 7.** Of the three options below, the first was taken. The
record for why the other two were not:

- *Browser uploads to the server* would have orphaned 18,067 existing paths and
  moved every scan into GridFS — a migration of the files themselves, on top of
  the metadata migration already done.
- *Hybrid* would have meant two retrieval paths to maintain forever, for a
  benefit that only materialises if the share goes away.

The share is not going away, and the server sits on the same network as it, so
the first option is both the smallest change and the closest to what Records
staff already do. What it needed was not configuration but a rewrite: the SMB
library in the codebase had not worked since Node 18, and 26.7% of the paths
were longer than Windows will open without a long-path prefix. See
[`NAS-ARCHITECTURE.md`](NAS-ARCHITECTURE.md).

**Open document** and **Download** are live on the record detail. A clerk asks
for a document by record; the server resolves the path and streams the file.

The original reasoning is kept below, because the constraint it describes is
still what shapes the design.

<details>
<summary>Why this was a design question, not a setting</summary>



The WinForms ERMS reached the scans through **`Z:\`, a drive mapped on each
workstation**. That works because the application and the person run on the same
machine: the app opens a path the user's own session can already see.

A web application cannot do that, and the stored paths show why —
`Z:\RECORDS\Database\Records Database\…` means nothing to a server, and a
browser cannot read a local drive letter either. There are three plausible
replacements, and they differ in more than configuration:

| Approach | What changes |
|---|---|
| **Server reaches the share over SMB** | The server needs a service account and the UNC root behind `Z:`. Closest to today's behaviour; the `nas` routes and `safeSharePath` already exist for it. Requires the server to sit where it can see the share. |
| **Browser uploads to the server** | Files stop living on the share. Storage moves to GridFS or disk, and the existing 18,067 paths become historical references. A bigger change, but it removes the mapped-drive dependency entirely. |
| **Hybrid** | Existing scans stay on the share and are opened as today; new uploads go to the server. Two retrieval paths to maintain. |

The migration deliberately **stored the paths rather than moving the files**, so
none of these is foreclosed. `document.filePath` keeps the original value and
`document.sharePath` the drive-letter-stripped remainder.

The migration deliberately stored the paths rather than moving the files, so
none of these was foreclosed. That is what made the decision reversible, and it
is why `document.filePath` still keeps the original `Z:\…` value alongside the
resolved `document.sharePath`.

</details>

---

## Phase 10 — parallel operation

### 1. Turn the module on

```ini
ERMS_MODULE_ENABLED=true
```

Restart. Confirm: `curl -o /dev/null -w "%{http_code}" http://<host>:8081/api/erms/records`
returns `401` rather than `404` — the routes exist and are guarded.

### 2. Take a baseline

```bash
cd server
node scripts/migrate-erms/divergence.js --file=../data/<fresh-export>.csv
```

Expect **no divergence**. If there is any at this point, the database and the
desktop app already disagree and that must be resolved before going further,
not after.

### 3. Freeze the desktop application

Set it read-only for everyone. **This is the step you cannot quietly undo** —
from here the web module is the only place records are created.

> Running both writable is the one configuration guaranteed to produce
> divergence, and the only one where the answer to "which copy is right?" is
> genuinely unknown. If the desktop app cannot be frozen yet, do not start the
> parallel period — wait.

### 4. Check daily

```bash
cd server
node scripts/migrate-erms/divergence.js --file=../data/<todays-export>.csv --report
```

| Finding | Means | Do |
|---|---|---|
| **web-only** | records created in the web module | nothing — expected |
| **source-only** | in one side, not the other | the export is stale, or the desktop app was written to after the freeze. Find out which. |
| **conflicting** | same serial, different values | both systems were edited. Someone decides which is right; the tool will not choose. |

Exits non-zero on anything but web-only, so it can run unattended.
Details land in `reports/erms-divergence.csv`.

Run for **2–4 weeks**. The point is not the elapsed time but covering a full
working cycle — month-end, a busy filing week, a leave period.

### 5. Ready to cut over when

- [ ] No unexplained divergence for two consecutive weeks
- [ ] No P1 issues raised by Records personnel for two consecutive weeks
- [ ] Records personnel say they would rather use the web module

That last one is a real gate. If people are working around it, the migration
is not finished regardless of what the checks say.

---

## Phase 11 — retirement

Only after a full validation cycle.

1. **Final export and backup** of the desktop application's data.
2. **Restore-test the backup.** A backup nobody has restored is a hope, not a
   backup.
3. **Archive it off this machine**, and record the retention period. A records
   system's own archive is not an arbitrary call — it falls under the agency's
   retention schedule like anything else.
4. Only then decommission the desktop application.

Keep `reports/` and `backups/mongo/` for the same period. Both are gitignored,
so they exist on one machine only until someone copies them somewhere durable.

---

## If it goes wrong

| When | Do |
|---|---|
| During parallel operation | `ERMS_MODULE_ENABLED=false`, unfreeze the desktop app. It has stayed authoritative throughout, so nothing is lost but the records entered in the web module — which `divergence.js` will list. |
| After cutover, before retirement | Same, plus re-import: `stage.js --apply --db=universe-db` is idempotent and upserts on `serialNo`, so a re-run corrects rather than duplicates. |
| After retirement | Restore from the archived backup. This is why step 2 above says restore-test it. |

Dropping `erms-records` and `erms-id-map` removes the module's data entirely.
No UCDS collection was ever modified by any of this, so UCDS is unaffected in
every case.
