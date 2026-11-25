---
name: app-check
description: Check the whole of E-Universe in one pass and keep this checkout in step with GitHub (fons-sabalbosajr/embr3-ucds). Covers git sync and unpushed branches, secrets in git, .env safety switches, front-end lint, build and bundle budget, unprotected routes, the unit and full test suites, and npm audit. Use whenever someone asks to check, audit, review or health-check the entire app or repo, asks "is everything OK", "is it ready", before a release, deploy, demo or cutover, after a large merge, or when they want the local repo connected to, synced with or compared against the GitHub repo, even if they only say "check the app".
---

# E-Universe app check

One command, read-only, from the repo root:

```bash
node .claude/skills/app-check/scripts/check-all.js            # everything, about 4 minutes
node .claude/skills/app-check/scripts/check-all.js --quick    # no build, no full suite, no npm audit: under a minute
node .claude/skills/app-check/scripts/check-all.js --only=repo,secrets
node .claude/skills/app-check/scripts/check-all.js --offline  # no git fetch, no npm audit
```

Groups: `repo`, `secrets`, `config`, `frontend`, `server`, `deps`. Each step prints `ok`, `warn`, `FAIL` or `skip`. The full output of every step goes to `reports/app-check/<time>/` (ignored by git), with `summary.json` alongside. It exits 1 on any FAIL.

**It changes nothing.** Git is only fetched and read. The full test suite runs only when a test database answers, and `server/tests/setup.js` refuses to start against the production cluster. Secrets are reported by `.env` key name and file, never by value. Do not print a secret value when you look into a finding either: mask it, as in `sed -E 's/(AIza.{4}).*/\1…/'`.

The one side effect is the build: `prebuild` regenerates `front-end/.env.local` from `server/.env`, as it always does.

## What each group means, and what to do

| Group / step | FAIL or warn means | Do |
|---|---|---|
| repo / origin | No remote, or not the GitHub repo | `git remote add origin https://github.com/fons-sabalbosajr/embr3-ucds.git` (or `set-url`) |
| repo / branch | Commits to push, to pull, or both | See "Keeping in step with GitHub" below |
| repo / working tree | Uncommitted changes | List them. Commit only when the person asks |
| repo / local branches | Work that exists only on this machine | Name each branch and its count. Ask before pushing it |
| secrets / tracked files | `.env`, `data/`, `backups/`, `reports/`, `docs/` or a key file is in git | `git rm --cached <file>`, then **rotate** what it held: it is already in history |
| secrets / .env values, key patterns | A live key or Atlas password is committed | Rotate the key first, then remove it. Tests use `AIzaFAKE…` and `gsk_FAKE…` stand-ins, which are skipped |
| config / BYPASS_AUTH | `true` turns off sign-in, role and year checks | FAIL when `NODE_ENV=production` (the server also refuses to start then) |
| config / SESSION_SECRET | Shorter than 32 characters | A longer random secret. Changing it signs everyone out, so agree on a time |
| frontend / lint | eslint errors | Read the **likely bugs** lines first (below) |
| frontend / build, bundle size | Import or syntax breakage, or a chunk over budget | For size, see `/app-performance` |
| frontend / fetch credentials | A `fetch` without `credentials: 'include'` | That call loses the session cookie |
| server / route guards | A non-public route has no session check | Add the guard, or add the route to `PUBLIC_ROUTES` in `server/shared/routeInventory.js` if it really is public |
| server / unit tests | Authorization, province and NAS path rules broke | These need no database. Treat any failure as real |
| server / full test suite | Skipped without a test database | Start a local `mongod`, run `npm run test:db:refresh` in `server/`, run again. Never point `TEST_MONGO_URI` at Atlas |
| deps | Known vulnerabilities in production dependencies | Critical is FAIL. `npm audit fix` (no `--force`) in that folder, then rerun the tests. Ask first |

### Reading lint

The lint count is dominated by `react/prop-types` (the app does not use PropTypes) and `no-unused-vars`. Those are noise for a health check. The script lists the errors that can break a screen or a boundary under **likely bugs**: `no-undef` (a `ReferenceError` the moment that code runs; the build does not catch it), `react-hooks/rules-of-hooks`, `no-restricted-imports` (the domain boundary rules in `.eslintrc.cjs`) and parse errors. Fix every likely bug. Report the rest as counts.

## Keeping in step with GitHub

The repo is `https://github.com/fons-sabalbosajr/embr3-ucds.git`, remote `origin`, default branch `main`. Fetch first, then compare. The `repo` group does both.

- **Behind only:** `git pull --ff-only`.
- **Ahead only:** list the commits (`git log --oneline @{u}..`), then push only when the person asks.
- **Diverged:** `git pull --rebase` keeps history straight. If it conflicts, stop and show the conflicts rather than choosing a side.
- **Never** `push --force`, `reset --hard` to the remote, or delete a branch without asking. A force-push to `main` overwrites what others pulled.
- Uncommitted work blocks a pull. Ask whether to commit it or `git stash` it first.
- `origin/PROD` is a separate deploy branch that has diverged from `main` (3 commits of its own, 109 behind, as of 2026-11-26). Do not merge or push to it as part of a sync unless asked.
- `gh` is not installed on this machine. Use plain `git` over HTTPS, and do pull requests in the browser.

## What it does not cover

- **Screens rendering:** `npm run smoke` and `npm run nav:check` in `server/` need the API and the SPA running, and they create throwaway accounts. Run them against a local or test setup when asked.
- **Speed:** `/app-performance`. **VERA's models:** `/vera-model-health`. **VERA's token use:** `/vera-token-efficiency`.
- **Cutover readiness:** `npm run cutover:check` reads the production cluster and the NAS share. Run it only when asked.

## Report

Lead with the FAILs, each with its file and line and what it breaks, then the warnings, then a one-line count of the passes. Say what was skipped and why, especially the full test suite: a run without it is not a clean bill of health. If you fixed something, say so and leave it uncommitted unless asked.

## Baseline, 2026-11-26 (main at 7e7c05d)

Use this to tell a new problem from a known one, and update it when it changes.

- repo: in sync with `origin/main`. `erms-unification` is fully merged into `main`.
- secrets: clean.
- config: `SESSION_SECRET` is 18 characters (warn).
- lint: about 2,400 problems, 2,121 of them `react/prop-types`. Likely bugs: `src/components/AuthShell.jsx:8` imports `modules/vera/VeraChat` across the domain boundary. Two `no-undef` errors in `Province.jsx` (a missing import added with the 2027 template) were fixed that day.
- build and bundle budget: pass. Route guards and unit tests: pass. Full suite: not run (no test database on this machine).
- deps: server high 3 (`body-parser`, `multer`, `zod`), moderate 3 (`express`, `nodemailer`, `qs`). Front-end high 1 (`follow-redirects`). All fixable without `--force`.
