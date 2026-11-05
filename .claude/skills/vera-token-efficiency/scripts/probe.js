#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Does the semantic cache match what it should, and do the input guards refuse
// only what they should? Run through VERA's real answer() path, with no key,
// no database and no vendor: fetch is replaced, so it spends nothing.
//
//   node probe.js                        the cases in probe-cases.json
//   node probe.js --similarity=0.7       the same, at another threshold
//
// A threshold is a trade: every wrong "hit" is a person given someone else's
// answer, so compare both columns before changing VERA_CACHE_SIMILARITY.
// Exit code: 0 all as expected, 1 at least one not.
// ---------------------------------------------------------------------------

const path = require('path');

const SERVER = path.resolve(__dirname, '../../../../server');

// Set before anything loads, and server/.env is never read: no real key or
// database can be reached from here.
for (const name of ['ANTHROPIC_API_KEY', 'GROQ_API_KEY', 'GEMINI_FALLBACK_MODEL', 'GEMINI_LIGHT_MODEL', 'VERA_SEMANTIC_CACHE']) delete process.env[name];
process.env.GEMINI_API_KEY = 'AIzaFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE1234';
process.env.VERA_ENABLED = 'true';
process.env.MONGO_URI = 'mongodb://127.0.0.1:1/none';
const similarity = process.argv.slice(2).find((a) => a.startsWith('--similarity='));
if (similarity) process.env.VERA_CACHE_SIMILARITY = similarity.split('=')[1];

let modelCalls = 0;
global.fetch = async () => {
  modelCalls += 1;
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => ({ candidates: [{ content: { parts: [{ text: 'An answer.' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } }),
  };
};

const vera = require(path.join(SERVER, 'services/vera/assistant'));
const cache = require(path.join(SERVER, 'services/vera/semanticCache'));
const provider = require(path.join(SERVER, 'services/vera/provider'));
const guardrails = require(path.join(SERVER, 'services/vera/guardrails'));
const cases = require('./probe-cases.json');

const cfg = { provider: 'gemini', model: 'gemini-2.5-flash' };
const viewer = { realm: 'staff', role: 'records', domains: ['erms'], ermsUnits: ['records'], access: { model: true, figures: true } };
const ask = (message) => vera.answer({ message, config: cfg, viewer });

async function main() {
  let wrong = 0;
  const line = (ok, text) => {
    if (!ok) wrong += 1;
    console.log(`  ${ok ? 'ok   ' : 'WRONG'} ${text}`);
  };

  console.log(`SEMANTIC CACHE (threshold ${process.env.VERA_CACHE_SIMILARITY || 'default'})`);
  for (const c of cases.cache) {
    cache.clear();
    provider._resetRouter();
    const first = await ask(c.first);
    if (first.source !== 'model') {
      line(false, `"${c.first}" never reached the model (${first.source}), so nothing was cached to test`);
      continue;
    }
    const got = (await ask(c.second)).source === 'cache' ? 'hit' : 'miss';
    line(got === c.expect, `${got.padEnd(4)} (want ${c.expect})  "${c.first}"  /  "${c.second}"`);
  }

  console.log('\nINPUT GUARDS');
  for (const c of cases.guards) {
    cache.clear();
    const source = (await ask(c.text)).source;
    const got = source === 'guard' ? 'refused' : 'allowed';
    // A guard reply is also how an out-of-scope question ends; say which it was.
    const by = got === 'refused' ? (guardrails.looksLikeInjection(c.text) ? ' by the injection check' : ' by another guard') : '';
    // A case known to be wrong does not fail the run, and says when it is fixed.
    if (c.knownIssue && got !== c.expect) console.log(`  KNOWN ${got}${by} (want ${c.expect})  "${c.text}"  ${c.knownIssue}`);
    else line(got === c.expect, `${got}${by} (want ${c.expect})  "${c.text}"${c.knownIssue ? '  FIXED: remove knownIssue from this case' : ''}`);
  }

  console.log(`\n${wrong ? `${wrong} not as expected` : 'All as expected'}. Fake model calls made: ${modelCalls}; tokens spent: 0.`);
  process.exit(wrong ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
