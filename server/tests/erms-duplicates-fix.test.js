import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import db from '../config/db.js';
import dup from '../services/vera/duplicateFix.js';

const { connectToMongo, getDb } = db;

// ---------------------------------------------------------------------------
// VERA's quick fix on Settings › Duplicates: her reading of a group, fixing a
// document filed twice (keep one, move the scan to it, set the other aside),
// and restoring what was set aside. Test serials (FSN-94…) and a permit
// number no real record has; removed afterwards.
// ---------------------------------------------------------------------------

const NUMBER = 'ECC-OL-R03-1999-9401';
const SERIALS = ['FSN-9400001', 'FSN-9400002'];

describe("VERA's reading of a duplicate group", () => {
  it('an original and its amendment are legitimate', () => {
    const v = dup.judge('records', [
      { serialNo: 'A', proponentName: 'Acme Corp', permit: { type: 'ecc-original' } },
      { serialNo: 'B', proponentName: 'Acme Corp', permit: { type: 'ecc-amended' } },
    ]);
    expect(v.verdict).toBe('legitimate');
  });
  it('different proponents under one number are for a person to check', () => {
    const v = dup.judge('records', [
      { serialNo: 'A', proponentName: 'Acme Quarry Corp', permit: { type: 'cnc' } },
      { serialNo: 'B', proponentName: 'Bayanihan Poultry Farm', permit: { type: 'cnc' } },
    ]);
    expect(v.verdict).toBe('review');
  });
  it('two different scans of one document are for a person to check', () => {
    const v = dup.judge('records', [
      { serialNo: 'A', proponentName: 'Acme Corp', permit: { type: 'cnc' }, document: { sharePath: 'x/1.pdf' } },
      { serialNo: 'B', proponentName: 'Acme Corp', permit: { type: 'cnc' }, document: { sharePath: 'x/2.pdf' } },
    ]);
    expect(v.verdict).toBe('review');
  });
  it('the same document twice keeps the one with the scan', () => {
    const v = dup.judge('records', [
      { serialNo: 'A', proponentName: 'Acme Corp', permit: { type: 'cnc' } },
      { serialNo: 'B', proponentName: 'ACME CORP.', permit: { type: 'cnc' }, document: { sharePath: 'x/1.pdf' } },
    ]);
    expect(v).toMatchObject({ verdict: 'duplicate', keep: 'B', setAside: ['A'] });
  });
});

describe('fixing a document filed twice', () => {
  beforeAll(async () => {
    await connectToMongo();
    await getDb().collection('erms-records').insertMany([
      { serialNo: SERIALS[0], proponentName: 'Dupfix Test Corp', projectTitle: 'Test', permit: { type: 'cnc', number: NUMBER }, location: { province: 'aurora' }, document: { fileName: 'dupfix.pdf', sharePath: 'test/dupfix.pdf' } },
      { serialNo: SERIALS[1], proponentName: 'Dupfix Test Corp', projectTitle: 'Test', permit: { type: 'cnc', number: NUMBER }, location: { province: 'aurora' }, document: {} },
    ]);
  });
  afterAll(async () => {
    await getDb().collection('erms-records').deleteMany({ serialNo: { $in: SERIALS } });
    await getDb().collection(dup.SET_ASIDE).deleteMany({ serialNo: { $in: SERIALS } });
  });

  it('keeps the entry with the scan, sets the other aside, and restores it', async () => {
    const group = (await dup.review('records')).find((g) => g.value === NUMBER);
    expect(group).toMatchObject({ verdict: 'duplicate', keep: SERIALS[0], setAside: [SERIALS[1]] });

    const result = await dup.fix('records', [group.key], { username: 'test' });
    expect(result.setAside).toBe(1);
    expect(await getDb().collection('erms-records').findOne({ serialNo: SERIALS[1] })).toBeNull();
    expect((await dup.review('records')).some((g) => g.value === NUMBER)).toBe(false);

    expect((await dup.restore('records', SERIALS[1])).ok).toBe(true);
    expect(await getDb().collection('erms-records').findOne({ serialNo: SERIALS[1] })).not.toBeNull();
  });
});
