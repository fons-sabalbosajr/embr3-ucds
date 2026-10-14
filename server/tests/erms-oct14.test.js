import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import db from '../config/db.js';
import pm from '../modules/ucds/services/permitMatch.js';
import serialCheck from '../services/vera/serialCheck.js';
import recordService from '../modules/erms/services/recordService.js';
import provider from '../services/vera/provider.js';

const { connectToMongo, getDb } = db;

// ---------------------------------------------------------------------------
// The 14 October changes that carry logic of their own: permit numbers that
// differ only in zero padding, VERA's serial check, a record's other ECC Ref
// Nos, and the floor on VERA's model timeout. Written under test serials
// (FSN-9…, prefix __TEST) and removed afterwards.
// ---------------------------------------------------------------------------

describe('permit numbers that differ in zero padding', () => {
  const index = pm.buildIndex([{ sort_key: 'A', ecc_cnc: 'ECC-OL-R03-2017-0370' }, { sort_key: 'B', ecc_cnc: 'CNC-OL-R03-2017-0370' }]);
  it('matches spaces for dashes and missing zeros', () => {
    expect(pm.findMatch(index, 'ECC OL R3 2017 370')?.row.sort_key).toBe('A');
    expect(pm.findMatch(index, 'ECC-OL-R03-2017-00370')?.strategy).toBe('unpadded');
  });
  it('keeps the letters: an ECC is not a CNC', () => {
    expect(pm.findMatch(index, 'CNC OL R3 2017 370')?.row.sort_key).toBe('B');
  });
});

describe("VERA's serial check", () => {
  it('reports skipped numbers as ranges', () => {
    expect(serialCheck.gapsIn([1, 2, 5, 6, 9])).toEqual({ missing: 4, ranges: ['3–4', '7–8'] });
  });

  const SERIALS = ['FSN-9000001', 'FSN-9000003', 'FSN 9000004', 'FSN-9000001'];
  let saved = null;
  beforeAll(async () => {
    await connectToMongo();
    await getDb().collection('erms-records').insertMany(SERIALS.map((serialNo) => ({ serialNo, location: { province: 'aurora' }, __test: 'oct14' })));
    await getDb().collection('erms-records').insertOne({ serialNo: 'FSN-9999998 Att-00001', isAttachment: true, __test: 'oct14' });
    saved = await getDb().collection('erms-sequences').findOne({ _id: 'serialNo' });
    await getDb().collection('erms-sequences').updateOne({ _id: 'serialNo' }, { $set: { seq: 5 } }, { upsert: true });
  });
  afterAll(async () => {
    await getDb().collection('erms-records').deleteMany({ __test: 'oct14' });
    if (saved) await getDb().collection('erms-sequences').replaceOne({ _id: 'serialNo' }, saved);
    else await getDb().collection('erms-sequences').deleteOne({ _id: 'serialNo' });
    await getDb().collection(serialCheck.COLLECTION).deleteMany({ by: '__test_oct14' });
  });

  it('finds duplicates, malformed serials, orphans and a counter behind', async () => {
    const records = await serialCheck.checkUnit('records');
    const kinds = (k) => records.findings.filter((f) => f.kind === k).map((f) => f.serialNo);
    expect(kinds('duplicate')).toContain('FSN-9000001');
    expect(kinds('malformed')).toContain('FSN 9000004');
    expect(kinds('orphan')).toContain('FSN-9999998 Att-00001');
    expect(records.findings.some((f) => f.kind === 'behind' && f.fix?.sequence === 'serialNo')).toBe(true);
  });

  it('fixes a counter behind by moving it up, never down', async () => {
    await serialCheck.scan({ by: '__test_oct14' });
    const { fixed } = await serialCheck.fix({ by: '__test_oct14' });
    expect(fixed).toBeGreaterThan(0);
    const counter = await getDb().collection('erms-sequences').findOne({ _id: 'serialNo' });
    expect(counter.seq).toBeGreaterThanOrEqual(9000003);
  });
});

describe("a record's other ECC Ref Nos", () => {
  const SERIAL = 'FSN-9100001';
  afterAll(async () => {
    await getDb().collection('erms-records').deleteMany({ serialNo: SERIAL });
  });
  it('keeps each with its date approved, and finds the record by any of them', async () => {
    await connectToMongo();
    await getDb().collection('erms-records').insertOne({ serialNo: SERIAL, proponentName: 'Oct14 Test', projectTitle: 'Test', permit: { type: 'ecc-original', number: 'ECC-OL-R03-1999-9001' }, location: { province: 'aurora' }, document: {} });
    await recordService.updateRecord(SERIAL, { permit: { refs: [{ number: 'ECC-OL-R03-2001-9002', dateApproved: '2001-02-03', label: 'Amendment' }, { number: '' }] } }, { username: 'test', writableProvinces: null });
    const stored = await getDb().collection('erms-records').findOne({ serialNo: SERIAL });
    expect(stored.permit.number).toBe('ECC-OL-R03-1999-9001');
    expect(stored.permit.refs).toHaveLength(1);
    expect(stored.permit.refs[0]).toMatchObject({ number: 'ECC-OL-R03-2001-9002', label: 'Amendment' });
    expect(stored.permit.refs[0].dateApproved).toBeInstanceOf(Date);
  });
});

describe("VERA's model timeout", () => {
  it('is never below 45s for Gemini or a model that thinks before answering', () => {
    expect(provider.resolveTimeoutMs({ provider: 'anthropic', model: 'claude-opus-5-5', requestTimeoutMs: 15000 })).toBe(45000);
    expect(provider.resolveTimeoutMs({ provider: 'gemini', requestTimeoutMs: 15000 })).toBe(45000);
    expect(provider.resolveTimeoutMs({ provider: 'anthropic', model: 'claude-haiku-4-5', requestTimeoutMs: 15000 })).toBe(15000);
  });
});

describe('moving a scan to another record', () => {
  const FROM = 'FSN-9200001';
  const TO = 'FSN-9200002';
  const BUSY = 'FSN-9200003';
  beforeAll(async () => {
    await connectToMongo();
    await getDb().collection('erms-records').insertMany([
      { serialNo: FROM, proponentName: 'Wrongly Filed', projectTitle: 'X', permit: { number: 'ECC-OL-R03-1999-9101' }, location: { province: 'aurora' }, document: { fileName: 'ECC-OL-R03-1999-9102 Zyxwv Quarry.pdf', sharePath: 'a/b.pdf', fileClass: 'Public' } },
      { serialNo: TO, proponentName: 'Zyxwv Quarry Corp', projectTitle: 'Zyxwv Quarry', permit: { number: 'ECC-OL-R03-1999-9102' }, location: { province: 'aurora' }, document: {} },
      { serialNo: BUSY, proponentName: 'Zyxwv Quarry Corp', projectTitle: 'Zyxwv Quarry Two', permit: { number: 'ECC-OL-R03-1999-9103' }, location: { province: 'aurora' }, document: { fileName: 'other.pdf' } },
    ]);
  });
  afterAll(async () => {
    await getDb().collection('erms-records').deleteMany({ serialNo: { $in: [FROM, TO, BUSY] } });
  });

  it('suggests the record named in the file, the one without a scan first', async () => {
    const { suggestions } = await recordService.moveSuggestions(FROM, null);
    expect(suggestions[0].serialNo).toBe(TO);
    expect(suggestions.find((s) => s.serialNo === BUSY)?.hasDocument).toBe(true);
  });

  it('moves the scan, and refuses a record that has its own', async () => {
    await expect(recordService.moveDocument(FROM, BUSY, { username: 'test' })).rejects.toMatchObject({ code: 'TARGET_HAS_DOCUMENT' });
    const res = await recordService.moveDocument(FROM, TO, { username: 'test' });
    expect(res).toMatchObject({ from: FROM, to: TO });
    const [from, to] = await Promise.all([FROM, TO].map((s) => getDb().collection('erms-records').findOne({ serialNo: s })));
    expect(to.document).toMatchObject({ fileName: 'ECC-OL-R03-1999-9102 Zyxwv Quarry.pdf', sharePath: 'a/b.pdf', movedFrom: FROM });
    expect(from.document).toMatchObject({ fileName: null, sharePath: null, movedTo: TO });
  });
});
