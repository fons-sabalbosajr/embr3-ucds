import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const laws = require('../services/vera/lawRetrieval.js');
const vera = require('../services/vera/assistant.js');
const provider = require('../services/vera/provider.js');
const corpus = require('../services/vera/laws/corpus.json');

// ---------------------------------------------------------------------------
// VERA's law library: the enacted text of seven environmental laws, retrieved
// for legal questions only, cited, and checked after the model answers. No
// database, no vendor: fetch is replaced where a model is needed.
// ---------------------------------------------------------------------------

const ids = (q) => laws.find(q).chunks.map((c) => c.id);

describe('the corpus', () => {
  it('holds the seven laws, every section, as enacted', () => {
    const byId = Object.fromEntries(corpus.laws.map((l) => [l.id, l.sectionCount]));
    // The section counts of the laws as enacted.
    expect(byId).toEqual({ PD1586: 12, RA8749: 56, RA9275: 36, RA6969: 20, RA9003: 66, RA9729: 26, RA9512: 10 });
    const s28 = corpus.laws.find((l) => l.id === 'RA9275').chunks.find((c) => c.id === 'RA9275-s28-p1');
    expect(s28.heading).toBe('Fines, Damages and Penalties');
    expect(s28.text).toMatch(/Ten thousand pesos \(P10,000\.00\) nor more than Two hundred thousand pesos \(P200,000\.00\)/);
  });
});

describe('retrieval', () => {
  it('answers a named section of a named law', () => {
    expect(ids('Section 28 of RA 9275')).toEqual(['RA9275-s28-p1', 'RA9275-s28-p2']);
  });

  it('brings the penalties section to a question about fines', () => {
    expect(ids('What is the fine for selling leaded gasoline?')).toContain('RA8749-s47');
    expect(ids('What is the penalty for discharging wastewater under the Clean Water Act?')).toEqual(expect.arrayContaining(['RA9275-s28-p1', 'RA9275-s28-p2']));
  });

  it('reads "ECC" as the decree spells it', () => {
    expect(ids('Who needs an ECC under PD 1586?')).toContain('PD1586-s4');
  });

  it('keeps out of how-to questions and the system\'s own legal-sounding words', () => {
    for (const q of ['How do I upload a scanned ECC?', 'how do I add an attachment to a notice of violation?', 'When is the technical conference for the NOV?', 'How many establishments are in Bulacan?']) {
      expect(ids(q), q).toEqual([]);
    }
  });
});

describe('checking an answer against the law it was given', () => {
  const given = laws.find('Section 28 of RA 9275').chunks;

  it('passes citations and amounts that are in the text', () => {
    const r = laws.verify('A fine of not less than P10,000.00 nor more than P200,000.00 per day (R.A. No. 9275, Sec. 28).', given);
    expect(r.unverified).toEqual([]);
    expect(r.cited).toContain('RA9275:28');
  });

  it('names a section and an amount that are not', () => {
    const r = laws.verify('Under R.A. No. 9275, Sec. 99 the fine is P5,000,000.00.', given);
    expect(r.unverified).toEqual(expect.arrayContaining(['R.A. No. 9275, Sec. 99', 'the amount P5,000,000.00']));
    expect(laws.footer(given, r)).toMatch(/⚠ Not found in the law text VERA was given/);
  });
});

describe('VERA answering a legal question', () => {
  const saved = {};
  const staff = { realm: 'staff', role: 'planning', domains: ['ucds'], access: { model: true, figures: true } };
  beforeAll(() => {
    for (const n of ['GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'GROQ_API_KEY', 'VERA_ENABLED']) saved[n] = process.env[n];
    process.env.GEMINI_API_KEY = 'AIzaFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE1234';
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GROQ_API_KEY;
    provider._resetRouter();
  });
  afterAll(() => {
    for (const [n, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[n];
      else process.env[n] = v;
    }
    vi.unstubAllGlobals();
  });

  it('without a model, quotes the section itself with its citation', async () => {
    process.env.VERA_ENABLED = 'false';
    const r = await vera.answer({ message: 'What does Section 28 of RA 9275 say about fines?', viewer: staff, config: {} });
    expect(r.source).toBe('fallback');
    expect(r.answer).toMatch(/^From R\.A\. No\. 9275 \(Philippine Clean Water Act of 2004\), Sec\. 28/);
    expect(r.answer).toMatch(/P10,000\.00/);
  });

  it('gives the model the law text, and flags what it cites beyond it', async () => {
    process.env.VERA_ENABLED = 'true';
    let sent = null;
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      sent = JSON.parse(init.body);
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({ candidates: [{ content: { parts: [{ text: 'The fine is P10,000.00 to P200,000.00 a day (R.A. No. 9275, Sec. 28); see also R.A. No. 9275, Sec. 77.' }] } }] }) };
    }));
    const r = await vera.answer({ message: 'What is the penalty under Section 28 of RA 9275?', viewer: staff, config: { provider: 'gemini', model: 'gemini-2.5-flash' } });
    expect(sent.systemInstruction.parts[0].text).toMatch(/LAW TEXT \(the enacted text, verbatim\)/);
    expect(sent.systemInstruction.parts[0].text).toMatch(/\[R\.A\. No\. 9275, Sec\. 28/);
    expect(r.tier).toBe('accurate');
    expect(r.unverified).toEqual(['R.A. No. 9275, Sec. 77']);
    expect(r.answer).toMatch(/⚠ Not found in the law text VERA was given, so not confirmed: R\.A\. No\. 9275, Sec\. 77/);
    expect(r.answer).toMatch(/Sources \(the enacted text\): R\.A\. No\. 9275 \(Philippine Clean Water Act of 2004\), Sec\. 28/);
  });
});
