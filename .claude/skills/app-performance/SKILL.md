---
name: app-performance
description: Find and fix slowness in E-Universe, and keep it from coming back. Measures screens, API routes, VERA's data checks and fixes, and front-end bundle size against the real data with every write blocked. Use whenever someone says the app, a screen, the register, a dashboard, the Document Library or VERA's data fixing is slow, loading forever, freezing or timing out, when reviewing a change that reads a whole collection, adds a query in a loop or imports a large library, or before a release or cutover, even if they only say "it feels sluggish".
---

# E-Universe performance

Measure before changing anything. On 2026-11-04 the data itself was not the problem: 26,000 register rows and 18,000 records, 94 ms from Atlas. The cost came from work repeated per person or per record, and from code downloaded by people who never use it. Those causes are invisible when reading the code, and obvious once measured.

**What crosses the link is what costs.** The free tier offers no compression, and reading rows is throttled: the same province took 4 s and 38 s minutes apart, while a `$group` over the whole register took about 110 ms. So count in the database rather than reading rows to count them. That only helps when the answer is smaller than the rows: the register check needs a list for every row, and computing it there saved nothing, so it stayed as it was.

No one can promise an app will never slow down. What can be promised is that a regression gets noticed: a failing test, a size budget, or a line in the server log.

## 1. Measure

Start with what the running server has already seen. A Developer can open `GET /api/health/performance` for the slowest routes and the longest event-loop stall since the last restart. The server log has a `[slow request]` line for anything over `SLOW_REQUEST_MS` (3 s by default). This is real traffic, so it outranks anything below.

Then time the screens, from the repo root:

```bash
node .claude/skills/app-performance/scripts/measure.js --year=2027
node .claude/skills/app-performance/scripts/measure.js scan
```

It runs the real app against the production data, with every write replaced by a no-op, the model keys blank and `fetch` disabled, so it changes nothing and spends no tokens. It does add read load, so don't run it in a loop on the shared free cluster. It reports the time for the first and second calls, the stall, the body size and the read count.

The bundle:

```bash
cd front-end && npm run build && npm run size
```

A change that needs a full browser check is worth one: moving code into a lazy chunk can expose circular imports that a passing build will not show. Run it against the local test database, never production.

## 2. Read the numbers

| What you see | Usual cause | Fix |
|---|---|---|
| Second call as slow as the first | Same work repeated per viewer | `shortCache.cached` with `registerScopeKey`. Include anything else the answer depends on, such as the year, because years can share a register. Pass `staleMs` when only a write through the app changes the answer, so nobody waits when the window ends |
| Slow only for the first person | A cold cache | Add it to `warmRegisterCaches` in `ucdsController.js`, with the same cache key the handler uses |
| Many reads | Awaited one after another, or a query in a loop | `Promise.all`; one `$in` read plus one `bulkWrite` |
| Large body, cheap query | Sending a whole collection or unused fields | A projection or paging. For a large body that rarely changes, `Cache-Control: private, no-cache` gets a 304 |
| Large stall | Synchronous work over thousands of rows blocks everyone | Profile it first (below). Then a shared formatter or index, or yield with `setImmediate` every few hundred rows |
| Slow, but few reads | CPU, not the database | Profile it (below). `toLocaleDateString` in a loop cost 4.5 s of a 17 s check; a shared `Intl.DateTimeFormat` took about 50 times less |
| A VERA check stuck for long periods | A model timing out, not the data | `/vera-model-health` |
| A chunk over budget | A static import pulling in a large library | `lazy()` for a screen, `await import()` at the point of use |

For a chain of imports, find what first pulls the library in rather than guessing: build with `--sourcemap`, and read which packages each chunk's map contains.

**Profile before you optimise, and repeat every timing.** Over the office link to the shared cluster, one check measured anywhere from 10 s to 25 s with no code change, so a single before-and-after proves nothing. Time each phase separately at least three times. Node's `inspector` module can profile a real run in-process, with writes stubbed: functions by self time, with `(idle)` meaning it was waiting on the network. That profile is what found the formatter above, after parallel reads alone had looked like they made no difference.

## 3. Rules that keep it fast

- **Cached register answers:** key on the scope and start the key with `REGISTER_CACHE`, so any edit clears them and staff see their change at once.
- **Bulk operations:** never write per record inside a loop. Read with one `$in`, write with one `bulkWrite`. On a cluster shared with other apps this also limits the operations you add.
- **The cluster:** it's a shared free M0 where hitting the size cap blocks writes for every app on it. Don't add caches, copies, logs or indexes to it without checking the room (`npm run cutover:check`). In-memory comes first.
- **Front-end:** a library used in one action or one screen doesn't belong on the path to that screen.
- **VERA's bulk checks:** PDF checks run one at a time on purpose, to stay inside the free tier's limits. Don't parallelise them to go faster without reading the quotas first (`/vera-token-efficiency`).
- **Long VERA requests:** the front-end allows them up to 30 minutes, but a check that needs that long should report progress in batches, as `scan-text/next` does.

## 4. Prove it and keep it

Add what you fixed to `server/tests/performance-budget.test.js`. Test by counting reads, cache hits and 304s, never by milliseconds: counts are stable on any machine, and timings are not. In that file, get `shortCache` through `createRequire`, as an `import` would give you a second copy of it.

```bash
~/.cache/mongodb-binaries/mongod-x64-win32-7.0.16.exe --dbpath <scratchpad>/mongo-test-data --port 27999 --bind_ip 127.0.0.1   # in the background; create the folder first
cd server && TEST_MONGO_URI=mongodb://127.0.0.1:27999 npx vitest run tests/performance-budget.test.js
```

Lower a budget in `front-end/scripts/check-bundle-size.js` when you win room back, so it stays tight. Raise one only when the size is truly needed, and say why.

## 5. Report

Give before and after, measured the same way, in a table of what changed. State what you didn't measure, for example real writes when they were blocked, or anything over a slower network than the machine you ran on. Numbers from this script are from one machine at one time, so compare them to each other rather than treating them as the app's speed.

## Measured 2026-11-04, after the fixes (2027 register)

Use these to spot a regression. Compare against a fresh run, and update them when things change.

| What | First | Repeat |
|---|---|---|
| Dashboard stats | 0.8–2.4 s cold, 8 ms warmed | 5 ms |
| Permits summary | 1.7–3.5 s cold, 8 ms warmed | 6 ms |
| Reports (accomplishment, not in ERMS) | 4–7 s cold, under 50 ms warmed | under 50 ms |
| Province (Bulacan, 10 MB) | 2–38 s cold, 145 ms warmed | about 140 ms, or a 304 from a browser that has it |
| The whole startup warm-up | 60–110 s per year, in the background | |
| VERA register check | 5–11 s | not cached |
| VERA register links check | 3.5–7 s | not cached |
| Sign-in page download | 399 KB compressed | |
| Province screen code | 24 KB compressed, PDF libraries only on use | |

Run `measure.js --warm` for what a person gets once the server has warmed up, and without it for the cold cost. A `[slow request]` line is expected for VERA's scans, and for the first read after an edit or in the first minutes after a restart. Repeated lines for the same read are not.

Not cached on purpose: searches, and the first page of each list.

Open questions from that audit:
- The first load of a large province sends every row, and the screen filters them in the browser. Only server-side paging would remove that, and it means reworking the screen.
- `/api/ucds` (18 MB) and `/api/ucds-locations` have no caller in the front-end. They now sit under the expensive-read limit, and could be removed if nothing outside the app uses them.
- `ProvinceModal` still brings `PdfViewer` (372 KB before compression) with the province screen.
