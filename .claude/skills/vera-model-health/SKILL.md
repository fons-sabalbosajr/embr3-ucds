---
name: vera-model-health
description: Keep VERA's AI models answering in E-Universe. Checks which Gemini, Groq and Anthropic models can answer, and repairs the route when one is overloaded, retired, out of quota, out of credit or has a rejected key. Use whenever someone asks if VERA or its models are working, active, down or slow, when VERA answers only from the help library or says "did not respond in time", "no AI model" or "quota", when choosing or replacing a model, adding a provider or key, or before a demo or cutover, even if they only say "VERA seems off".
---

# VERA model health

VERA's models are hosted APIs. They do not go to sleep, so nothing needs to "keep them awake". Staying active here means this: at least one model on each route can answer right now, and the selected model is not making every person wait for it to fail.

Do not add keep-alive pings or a scheduled test call. Gemini's free tier has stated a limit of 20 requests a day per model, so a ping every hour would use most of one. The model-info endpoints answer the same "does this exist for this key" question without touching a generate quota.

## 1. Check, for free

From the repo root:

```bash
node .claude/skills/vera-model-health/scripts/check-models.js
```

It reads the settings and usage from the database, asks each provider about each model, and prints a verdict. It spends no tokens and writes nothing. Exit code: 0 healthy, 1 degraded, 2 down or off.

Options:
- `--list`: every model each key can reach. Use it when picking a replacement.
- `--ping=model,model`: one real call, 16 output tokens at most, to the named models.
- `--ping`: the same for every model on the routes.
- `--no-db`: environment only, when the database cannot be reached.

Ping only when the free evidence leaves a real question, such as whether a model marked FAILING has recovered, or whether a key with no recent calls works. Name the models rather than pinging all of them, and say in your report that you spent the requests. A ping is not counted on the Models tab, though the provider counts it.

"Listed" only means the model exists for this key. The `24 h` line is the evidence that it answers, so read the two together.

## 2. Diagnose and repair

| What the check shows | What it means | Repair |
|---|---|---|
| Selected model FAILING with `overloaded` or `timeout` | The vendor is struggling. Every chat waits up to 45% of its time budget before the route moves on | Propose another selected model, one with `ok` calls in the last 24 h |
| `quota_exhausted` | That model's free daily allowance is gone. Gemini's resets at midnight Pacific | Usually nothing, as the route stands in. If it recurs, see what is using the quota (`/vera-token-efficiency`) |
| `no_credit` | The Anthropic account has no balance. The whole provider rests for an hour | The owner adds credit in the Anthropic console. Until then, do not count Anthropic as a fallback |
| `auth_failed` or KEY REJECTED | Key revoked or mistyped | The owner replaces it in `server/.env`, then restarts the server |
| NOT AVAILABLE (404) | Retired, or never on this key | Pick from `--list` and update the name wherever it is set (section 3) |
| A route with few or no answering models | One more outage away from help-library answers | Add a key for another provider, or a working light or fallback model |
| PDF route thin | Groq does not read PDFs in VERA (`READS_PDF`), so scan reading has fewer fallbacks | Keep at least one working Gemini or Anthropic model |
| Verdict OFF | Master switch or the in-app toggle is off | Ask before turning it on: this switch is the spending gate |

Rests live in the running server's memory (`resting` in `provider.js`), so this script cannot see or clear them. A rest lasts at most an hour, and a restart forgets them all. A model that stays overloaded or slow rests longer each time (10, 20, 40, then 60 minutes), and the first answer it gives resets that. To clear one sooner, use **Test connection** in Admin Settings › VERA Assistant (`POST /api/vera/test`). It tries the selected model, resting or not, and stops there if it answers. If it fails, the test walks the rest of the route, resting models included, until one answers. Whichever model answers stops resting. It spends one real request per model tried, so don't use it as a monitor.

## 3. Changing a model

`resolveModel` in `server/services/vera/provider.js` decides the selected model, in this order:

1. The model saved in VERA settings (`app-config`, `_id: vera-settings`)
2. The `<PROVIDER>_MODEL` env var
3. The default in the code

So editing `.env` changes nothing while a model is saved in settings. The check output says when that is the case.

Prefer changing it on the VERA settings screen. Saving there also clears the semantic cache, and the old answers were written under the old settings. Changes to `.env` need a server restart.

The selected model, keys, and anything in production are the owner's call. Report the finding and your recommendation, then change them only once asked. Editing `app-config` directly would skip the audit log and the cache clear, so don't.

Other names to set when replacing a model: `GEMINI_FALLBACK_MODEL`, `GEMINI_LIGHT_MODEL`, `ANTHROPIC_LIGHT_MODEL`, `GROQ_LIGHT_MODEL`, `GROQ_ACCURATE_MODEL`.

A model family VERA has not seen needs code changes too, because a wrong setting fails every call to that model:
- **Anthropic:** check the regexes `isCurrentGen`, `acceptsEffort`, `thinksByDefault` and `usesServerFallback`. Read the `claude-api` skill first, since parameter support changes by model and should not be recalled from memory.
- **Gemini:** thinking is turned off only for names containing `flash`.
- **Groq:** reasoning settings apply only to names containing `gpt-oss`.
- **Any provider:** update `PUBLISHED_LIMITS` with the source and date, and `server/.env.example`.

Choosing among working models: the free tiers come first in `FALLBACK_ORDER` on purpose. Don't recommend a paid model as the selected one unless the owner has accepted the cost.

## 4. Verify a code change

```bash
~/.cache/mongodb-binaries/mongod-x64-win32-7.0.16.exe --dbpath <scratchpad>/mongo-test-data --port 27999 --bind_ip 127.0.0.1   # in the background; create the folder first
cd server && TEST_MONGO_URI=mongodb://127.0.0.1:27999 npx vitest run tests/vera-router.test.js tests/vera-model-usage.test.js
```

These tests replace `fetch`, so they call no vendor and spend nothing. Then run the check again.

## 5. Report

```
VERA models: HEALTHY | DEGRADED | DOWN | OFF
Selected: <provider / model>: <answering or why not>
Routes answering: main x/y, light x/y, accurate x/y, PDF x/y
Problems: <model: cause, evidence from the last 24 h>
Recommended: <one change, and who must make it>
Spent: <pings made, or "nothing">
```

## Running it regularly

The default check is free, so a daily run is fine. It needs `server/.env`, which is git-ignored, so it has to run on a machine that holds that file: use Windows Task Scheduler there, or `/loop` during a working session. A `/schedule` cloud agent would not have the keys. Set up a schedule only when asked.

## Secrets

Keys stay in `server/.env`. Never print them, and read that file by variable name only. The script reports key presence as set or none, and maps vendor errors to safe codes, because a vendor's raw message can repeat a key.
