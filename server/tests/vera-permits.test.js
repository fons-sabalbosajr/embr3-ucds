import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pa = require('../services/vera/permitAnalysis.js');
const lookup = require('../services/vera/lookup.js');
const laws = require('../services/vera/lawRetrieval.js');
const vera = require('../services/vera/assistant.js');

// ---------------------------------------------------------------------------
// VERA's analysis of a firm's clearances and permits against the laws: by
// rule from the register row, the same answer every time. No database.
// ---------------------------------------------------------------------------

const TODAY = new Date(2026, 9, 28); // 28 Oct 2026
const codes = (row) => pa.analyze(row, { today: TODAY }).findings.map((f) => `${f.code}/${f.kind}/${f.severity}`);

describe('reading the register', () => {
  it('reads the dates as the register writes them', () => {
    const d = (v, o) => pa.readDates(v, o).dates.map((x) => x.toISOString().slice(0, 10));
    expect(d('8/1/2030')).toEqual(['2030-07-31']);
    expect(d('5/22/2028\n8/28/2029')).toHaveLength(2);
    expect(d('12/6/2029/ 03/05/2031')).toHaveLength(2);
    expect(d('May 22, 2028')).toHaveLength(1);
    expect(d('25 Nov. 2019')).toHaveLength(1);
    expect(d('8/30/27')[0].slice(0, 4)).toBe('2027');
    expect(pa.readDates(46379).dates).toHaveLength(1); // an Excel serial day
    expect(d('Nov 2024-2027', { ranges: true })).toHaveLength(1); // a PCO's validity
    expect(pa.readDates('For checking').unreadable).toBe(true);
    expect(pa.readDates('Not Applicable').unreadable).toBe(false);
  });

  it('tells the permits apart by their numbers', () => {
    expect(pa.kindOf('PTO-OL-R03-2025-05467')).toBe('pto');
    expect(pa.kindOf('FLA-16H-03BU-015')).toBe('pto');
    expect(pa.kindOf('DP-R03-25-08358')).toBe('wwdp');
    expect(pa.kindOf('OL-GR-R3-77-057372')).toBe('hw');
    expect(pa.kindOf('OL-G-R3-49-072301')).toBe('hw');
    expect(pa.kindOf('ECC-OL-R03-2018-0200')).toBe('ecc');
    expect(pa.kindOf('03BU-0512-09-552-116A')).toBe('ecc');
    expect(pa.kindOf('COA No. 2024-RIII-23830')).toBe('pco');
    expect(pa.numbersIn('DP-R03-26-05840\nDP-R03-26-06943')).toEqual(['DP-R03-26-05840', 'DP-R03-26-06943']);
  });
});

describe('the findings', () => {
  const base = { sort_key: 'AU-00001', title: 'Test Firm', ecc_cnc: 'ECC-OL-R03-2018-0200', permit_process: 'ECC Online' };

  it('finds nothing in a firm whose permits are all in date', () => {
    expect(codes({ ...base, pto_code: 'PTO-OL-R03-2025-05467', pto_issued: '8/1/2025', pto_expiration: '8/1/2030', ra8749: 'Compliant', pco_no: '2025-RIII-36286', pco_validity: '8/19/2027' })).toEqual([]);
  });

  it('a missing discharge permit an inspector noted is serious, under RA 9275 Sec. 14 and 27', () => {
    const a = pa.analyze({ ...base, ra9275: 'Non-Compliant', v_ra9275: 'No DP, No PCO' }, { today: TODAY });
    const dp = a.findings.find((f) => f.kind === 'wwdp');
    expect(dp).toMatchObject({ code: 'missing', severity: 'high' });
    expect(dp.refs).toEqual(expect.arrayContaining([['RA9275', '14'], ['RA9275', '27'], ['RA9275', '28']]));
    expect(dp.text).toMatch(/No DP/);
    // The PCO line carries the PCO's note only.
    const pco = a.findings.find((f) => f.kind === 'pco');
    expect(pco).toMatchObject({ code: 'missing', severity: 'high' });
    expect(pco.text).toMatch(/"No PCO"/);
    expect(pco.text).not.toMatch(/No DP/);
    expect(pco.rules).toMatch(/DAO 2014-02/);
  });

  it('expired, expiring, and some of several lapsed', () => {
    expect(codes({ ...base, wwdp_code: 'DP-R03-25-08358', wwdp_expiration: '8/1/2026' })).toContain('expired/wwdp/high');
    expect(codes({ ...base, pto_code: 'PTO-OL-R03-2025-05467', pto_expiration: '12/1/2026' })).toContain('expiring/pto/medium');
    expect(codes({ ...base, pto_code: 'PTO-OL-R03-2021-1\nPTO-OL-R03-2025-2', pto_expiration: '1/1/2025\n1/1/2030' })).toContain('expired/pto/low');
  });

  it('not applicable is not missing, unless the inspector says otherwise', () => {
    expect(codes({ ...base, wwdp_code: 'Not Applicable' })).toEqual([]);
    expect(codes({ ...base, wwdp_code: 'Interconnected' })).toEqual([]);
    expect(codes({ ...base, wwdp_code: 'Not Applicable', v_ra9275: 'No DP' })).toContain('conflict/wwdp/medium');
  });

  it('register slips are entries to correct, with no law cited', () => {
    const a = pa.analyze({ ...base, wwdp_code: 'PTO-OL-R03-2025-05467', wwdp_expiration: '9/1/2027', pd1586: 'PTO-OL-R03-2026-06494' }, { today: TODAY });
    const slips = a.findings.filter((f) => f.code === 'misfiled');
    expect(slips).toHaveLength(2);
    expect(slips.every((f) => f.refs.length === 0 && f.severity === 'low')).toBe(true);
    expect(codes({ ...base, pto_code: 'PTO-OL-R03-2025-1', pto_issued: '1/1/2026', pto_expiration: '1/1/2025' })).toContain('dates/pto/low');
  });

  it('an NOV recommended with a permit on file', () => {
    expect(codes({ ...base, pto_code: 'PTO-OL-R03-2025-05467', pto_expiration: '8/1/2030', ra8749: 'Non-Compliant (Survey)' })).toContain('noncompliant/pto/medium');
  });

  it("every section cited is in the library, so VERA's answer can be verified", () => {
    const refs = pa.KINDS.flatMap((k) => [...k.basis, ...(k.penalty ? [k.penalty] : [])]);
    for (const r of refs) expect(laws.sections([r]).length, r.join(' ')).toBeGreaterThan(0);
  });
});

describe('counting the register, by rule (no model)', () => {
  const tb = require('../services/vera/tableBuilder.js');
  const rows = [
    { sort_key: 'PA-1', title: 'A', city: 'City of San Fernando', province: 'Pampanga', wwdp_code: 'DP-R03-25-00001\nDP-R03-26-00002', ra9275: 'Compliant' },
    { sort_key: 'PA-2', title: 'B', city: 'San_Fernando', province: 'Pampanga', wwdp_code: 'Not Applicable', ra9275: 'Non-Compliant' },
    { sort_key: 'PA-3', title: 'C', city: 'Angeles', province: 'Pampanga', wwdp_code: 'DP-R03-25-00003', ra9275: 'Non-Compliant' },
    { sort_key: 'TA-1', title: 'D', city: 'Tarlac City', province: 'Tarlac', wwdp_code: '', ra9275: 'Non-Compliant' },
  ];
  // A stand-in register: the conditions are tested in JS whatever the query says.
  const col = {
    collectionName: `test-${Math.random()}`,
    distinct: async (k) => [...new Set(rows.map((r) => r[k]).filter(Boolean))],
    find: () => ({ async *[Symbol.asyncIterator]() { yield* rows.map((r) => ({ ...r })); } }),
  };
  const dev = { permission: 'developer' };
  const count = async (q) => (await tb.countFor(q, { col, user: dev, year: 2027, today: TODAY }))?.total ?? null;

  it('"how may WWDP in San Fernando, Pampanga" — the city however it is written, and the permits held', async () => {
    const r = await tb.countFor('how may WWDP in San Fernando Pampanga in 2027 Monitoring Plan?', { col, user: dev, year: 2027, today: TODAY });
    expect(r.total).toBe(1); // "Not Applicable" holds no permit
    expect(r.answer).toMatch(/\*\*1\*\* establishment .*\*\*2\*\* WWDP numbers/);
    expect(r.answer).toMatch(/City \/ municipality is San Fernando/);
  });

  it('reads a law by its number, and "No. of" is not "no permit"', async () => {
    expect(await count('how many firms are non-compliant under RA 9275 in Pampanga?')).toBe(2);
    expect(await count('No. of WWDP in Pampanga?')).toBe(2);
  });

  it('tells a CNC from an ECC: by the number, or by the permit process for the old numbers', async () => {
    rows.push(
      { sort_key: 'PA-4', title: 'E', city: 'Angeles', province: 'Pampanga', ecc_cnc: 'CNC-OL-R03-2019-02-00097', permit_process: 'CNC Online' },
      { sort_key: 'PA-5', title: 'F', city: 'Angeles', province: 'Pampanga', ecc_cnc: '03PA-0302-01-007-120A', permit_process: 'CNC Manual' },
      { sort_key: 'PA-6', title: 'G', city: 'Angeles', province: 'Pampanga', ecc_cnc: 'ECC-OL-R03-2018-0200', permit_process: 'ECC Online' },
      { sort_key: 'PA-7', title: 'H', city: 'Angeles', province: 'Pampanga', ecc_cnc: '03PA-0508-18-127', permit_process: 'ECC Manual' }
    );
    try {
      expect(await count('exact count of CNC of Pampanga')).toBe(2);
      expect(await count('how many ECC in Pampanga?')).toBe(2);
      expect(await count('how many ECC/CNC in Pampanga?')).toBe(4);
    } finally {
      rows.length = 4;
    }
  });

  it('reads the years asked, and follows a count with "how about…" through the chain', () => {
    const vc = require('../controllers/veraController.js');
    expect(vc.yearsIn('how about in 2024, 25 and 26 containers?')).toEqual([2024, 2025, 2026]);
    expect(vc.yearsIn('2024-26')).toEqual([2024, 2026]);
    expect(vc.yearsIn('in 25 cities')).toEqual([]);
    const history = [{ role: 'user', content: 'give me the exact count of CNC of Pampanga in the 2027 container.' }, { role: 'assistant', content: '…' }, { role: 'user', content: 'how about in 2024, 25 and 26 containers?' }];
    const q1 = vc.countQuestionOf('how about in 2024, 25 and 26 containers?', history);
    expect(q1).toMatch(/CNC of Pampanga/);
    expect(vc.yearsIn(q1)).toEqual([2024, 2025, 2026]);
    const q2 = vc.countQuestionOf('and Tarlac?', [...history, { role: 'assistant', content: '…' }, { role: 'user', content: 'and Tarlac?' }]);
    expect(q2).toMatch(/Tarlac/);
    expect(q2).not.toMatch(/Pampanga/);
    expect(vc.yearsIn(q2)).toEqual([2024, 2025, 2026]);
    // Not a follow-up: a question of its own.
    expect(vc.countQuestionOf('how do I print the report?', history)).toBe(null);
  });

  it('leaves to the ordinary path what it cannot read whole, and what is no count', async () => {
    expect(await count('How many valid permits are there?')).toBe(null);
    expect(await count('how do I upload a scan?')).toBe(null);
  });
});

describe('the register check and Ask VERA', () => {
  it('groups the findings for review, the most serious first', () => {
    const c = pa.collector({ today: TODAY, maxSamples: 5 });
    c.add({ sort_key: 'A-1', ecc_cnc: 'ECC-1-2018-0200', wwdp_code: 'DP-R03-25-1', wwdp_expiration: '1/1/2026' });
    c.add({ sort_key: 'A-2', ecc_cnc: '', permit_process: 'ECC Online' });
    const g = Object.fromEntries(c.groups().map((x) => [x.key, x]));
    expect(g.expired.count).toBe(1);
    expect(g.expired.law).toMatch(/R\.A\. No\. 9275, Sec\. 14/);
    expect(g['permit-missing'].samples[0].sort_key).toBe('A-2');
  });

  it('a permit question about a firm is a lookup; one about a kind of firm is not', () => {
    expect(lookup.searchTermsOf('Is AU-00012 compliant?')).toMatchObject({ code: 'AU-00012', permitAsk: true });
    expect(lookup.searchTermsOf('what permits is San Jose Green Energy missing?')).toMatchObject({ words: ['san', 'jose', 'green', 'energy'], permitOnly: true });
    // The law named is not part of the name.
    expect(lookup.searchTermsOf('is ABC Poultry compliant with RA 9275?').words).toEqual(['abc', 'poultry']);
  });

  it('catches a date or a permit number the model made up', () => {
    const file = pa.dossier({ sort_key: 'AU-1', pto_code: 'PTO-OL-R03-2026-07009-R', pto_issued: '9/27/2026', pto_expiration: '9/27/2031' }, { today: TODAY }).text;
    // The live slip of 28 Oct 2026: an expiry "2 years from issue", in non-breaking hyphens.
    expect(pa.verifyFacts('PTO‑OL‑R03‑2026‑07009‑R, issued 27 Sep 2026, expires 27 Sep 2028.', file)).toEqual(['the date Sep 27, 2028']);
    expect(pa.verifyFacts('Its discharge permit DP-R03-25-99999 is missing.', file)).toEqual(['the number DP-R03-25-99999']);
    expect(pa.verifyFacts('The PTO PTO-OL-R03-2026-07009-R is valid until Sep 27, 2031.', file)).toEqual([]);
  });

  it("the permit file's law sections reach the model, and its rule", () => {
    const row = { sort_key: 'AU-00058', title: 'CHOWKING BALER', ecc_cnc: 'CNC-OL-R03-2019-02-00097', v_ra9275: 'No DP' };
    const file = pa.dossier(row, { today: TODAY, register: '2027 register' });
    expect(file.text).toMatch(/PERMIT FILE — AU-00058/);
    expect(file.text).toMatch(/HIGH — No Wastewater Discharge Permit/);
    expect(file.refs).toEqual(expect.arrayContaining([['RA9275', '14']]));
    const ctx = vera.contextFor({ realm: 'staff', role: 'staff', domains: ['ucds'] }, '', {});
    const law = laws.merge(laws.sections(file.refs));
    const prompt = vera.buildSystemPrompt({ page: '', hits: [], ctx, figures: { text: file.text, asOf: 'now', lookup: true, permits: 1, lawRefs: file.refs }, law });
    expect(prompt).toMatch(/PERMIT FILE: the LIVE FIGURES include/);
    expect(prompt).toMatch(/\[R\.A\. No\. 9275, Sec\. 14/);
  });
});
