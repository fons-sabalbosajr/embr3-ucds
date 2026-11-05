---
name: vera-token-efficiency
description: Maintain the parts of E-Universe that save VERA's tokens - the semantic cache, the input and output guardrails, the model router tiers, prompt and history limits, per-user and daily limits - across chat and every other VERA capability (scan reading, data checks, table builder, upload guide). Use whenever someone asks about VERA's token use, cost, quota or cache hit rate, wants to tune or debug the cache or guardrails, reports a wrong cached answer or a question wrongly refused, or changes services/vera/ code that calls a model or builds a prompt, even if they only say "VERA is using too much" or "make VERA cheaper".
---

# VERA token efficiency

Measure first, change one thing, measure again. VERA's usage is low and uneven, so a change made on instinct can easily cost answer quality and save nothing visible. The savings must never weaken what protects people's data (see Lines not to cross).

## 1. Measure

From the repo root:

```bash
node .claude/skills/vera-token-efficiency/scripts/token-audit.js --days=14
```

It shows tokens and failures by model, calls by feature, chat answers by source, cache hit rate, tokens by tier, and the help articles the model keeps answering over. It reads the database and writes nothing. Usage data is kept for 35 days. Live cache counters are in the server's memory: read them on the Models tab.

Note the sample size before concluding anything. A 0% hit rate on 7 answers says little, while the same rate on 300 is a finding.

## 2. Find the cause

| What the audit shows | Likely cause | Where to look |
|---|---|---|
| Most calls are `tools`, not chat | Data checks and scans are using the quota chat also needs | Batch size and frequency of the scans. Prefer running them after hours |
| Low cache hit rate on a good sample | Wordings fall under the threshold, retrieval returns different articles, or the partition is too narrow (page is part of it) | Run the probe with real wordings. `cacheQuery` in `assistant.js`, `partitionOf` in `semanticCache.js` |
| Same articles answered many times | Follow-ups and conversations are read but never stored; legal answers may be held back | `cacheQuery` (`write: standalone`). Or write a better help article |
| High average input tokens per answer | System prompt or history too long | `buildSystemPrompt`, `retrieve` limit, `VERA_MAX_HISTORY` |
| High output tokens on the `accurate` tier | Reasoning tokens count as output | `effort` and the extra room in `groqOnce` |
| Many `main` answers that are short help questions | `lightEnough` is too strict | `lightEnough` in `assistant.js` |
| High failure rate | A model problem, which wastes time rather than tokens | `/vera-model-health` |
| Restarts wipe the hit rate | The cache lives in process memory by design | Expected. See Lines not to cross |

## 3. What saves tokens, in the order a chat passes it

1. **Input limits:** `MAX_INPUT_CHARS` (1000) and `VERA_MAX_HISTORY` (6 turns), both in `assistant.js`.
2. **Guards** (`guardReply`): injection, pasted credentials, restricted topics and public-page rules are all answered with no model.
3. **Register counts:** `figures.registerAnswer` writes the number by rule.
4. **Out of scope, or model not allowed:** a fixed reply or the help library.
5. **Semantic cache:** the same question, asked by someone who may see the same things.
6. **Router tier:** `light`, `main` or `accurate`. Light calls also send only the last 4 history items.
7. **Effort and thinking:** low effort on Claude and Groq, thinking off on Gemini flash.
8. **Rests:** a resting model is skipped, so no request is spent on a certain refusal.
9. **Usage limits:** `*_USER_LIMIT` and `*_DAILY_LIMIT`.

The other capabilities all go through `provider.complete()`, which adds the same cache and guardrails. Their `feature` label shows on the audit:

| Capability | File | `feature` | Max tokens | Reads PDF |
|---|---|---|---|---|
| Table builder | `tableBuilder.js` | `table` | 1500 | no |
| Upload guide | `uploadGuide.js` | `upload-guide` | 700, 900 | yes |
| Scan text | `scanText.js` | `scan-text` | 900 | yes |
| Spelling in data checks | `dataCorrections.js` | `spelling-check` | 2048 (`light`) | no |
| Register links | `registerLinks.js` | `link-check` | 2048 | no |
| Project type check | `projectTypeCheck.js` | `project-type` | 400 | yes |
| Ref. No. check | `refNoCheck.js` | `ref-check` | 300 | yes |

Usage from before 2026-11-04 shows all four of those as `tools`.

A new model call belongs in `provider.complete()`, with its own `feature` name and a real `maxTokens`. Leave `cache` and `guard` on unless the call keeps its own, as the chat does.

Settings: `VERA_SEMANTIC_CACHE`, `VERA_CACHE_TTL_MS` (12 h), `VERA_CACHE_MAX` (500 each for chat and for the other calls, so a scan batch can't push out chat answers), `VERA_CACHE_SIMILARITY` (0.8, floor 0.5), `VERA_MODEL_ROUTING`, `VERA_CROSS_PROVIDER_FALLBACK`. Saving VERA settings clears the cache. A connection test does not.

## 4. Test a cache or guardrail change at zero cost

```bash
node .claude/skills/vera-token-efficiency/scripts/probe.js
node .claude/skills/vera-token-efficiency/scripts/probe.js --similarity=0.7
```

The probe runs real questions through VERA's real `answer()` path with `fetch` replaced. It never reads `server/.env`, so it can't reach a vendor or the database. Cases are in `scripts/probe-cases.json`:
- A `cache` case states whether a rewording should `hit` or `miss`.
- A `guards` case states whether a message should be `refused` or `allowed`.
- `knownIssue` marks a case that is wrong today. It doesn't fail the run, and the probe tells you when it gets fixed.

When someone reports a wrong cached answer or a wrong refusal, add it as a case first and watch it fail. Then change the code and add a matching test to `server/tests/vera-router.test.js`. The probe has only one test viewer and one test config, so partition rules across roles belong in those tests.

The article match does much of the cache's work: the current cases gave the same results at 0.5 and at 0.8, so loosening the threshold on its own may not raise the hit rate. Test with real wordings before changing it. Keep the bias towards a miss. A miss costs one model call, while a wrong hit gives someone an answer to a different question for up to 12 hours.

The same applies to guards. A false refusal costs a person their answer and a missed injection risks data, so widen `INJECTION_RE` and the output screens carefully, and check that ordinary register language still passes.

Then run the suite (no vendor calls, nothing spent):

```bash
~/.cache/mongodb-binaries/mongod-x64-win32-7.0.16.exe --dbpath <scratchpad>/mongo-test-data --port 27999 --bind_ip 127.0.0.1   # in the background; create the folder first
cd server && TEST_MONGO_URI=mongodb://127.0.0.1:27999 npx vitest run tests/vera-router.test.js tests/vera-model-usage.test.js tests/vera.test.js
```

## Lines not to cross

Each of these exists to protect people or data. A token saving is never a reason to weaken one, and removing one needs the owner's explicit decision.

- **Partition:** cached answers stay within realm, role, domains, ERMS unit and page, so a Developer's answer never reaches an Encoder.
- **Not cached:** live figures, record searches and answers that depend on a conversation are personal or live.
- **Not remembered:** an answer with a redaction, a legal answer with an unverified citation, a tool answer cut off at the length limit.
- **Negation:** "can I" and "can't I" never match.
- **Order:** guards run before the cache and before any model. Output screening runs before anything is stored or shown.
- **Data fence:** `DATA_FENCE` stays on tool calls, since scanned pages and register values can contain text that reads like instructions.
- **Process memory only:** no question or answer goes to disk or the database. A persistent cache would break that promise in the README and logs, and would add writes to a shared free Atlas cluster.
- **Usage counters:** keep them in batches (`modelUsage.flush`), never one write per call.

## Prompt caching on Anthropic

`completeAnthropic` sends no `cache_control`, and `buildSystemPrompt` changes with the page, articles and figures. Whether provider-side prompt caching would pay off here is untested. Read the `claude-api` skill before trying it, and split the stable part of the prompt from the changing part first. Note that Anthropic has been out of credit and is currently only a late fallback, so it may not be worth doing yet.

## Known gaps, as of 2026-11-04

Check each still holds before relying on it. Remove an entry once it is fixed.

- Tokens are not kept per feature, only calls, so the audit can show which check is called most but not which costs most.
- Cached tool answers return before `usage.record`, so their savings appear only in the server's live `stats()`.

## 5. Report

```
Period: <days>, sample: <model calls, chat answers>
Tokens: <total, biggest model, biggest feature by calls>
Without a model: <x of y chats>; cache hit rate: <x%>
Finding: <the one thing costing the most, with its numbers>
Recommended: <one change, expected effect, what it risks>
Verified: <probe and test results, or "not run">
```

Give tokens, not money, unless you have checked current prices (`claude-api` skill for Anthropic, the provider's page for others). Most of VERA's use is on free tiers, where the limit that bites is requests a day.
