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
  it('one number and proponent at two places, or for two projects, is for a person to check', () => {
    const at = (barangay, projectTitle = 'Test Plant') => ({ proponentName: 'Acme Corp', projectTitle, permit: { type: 'cnc' }, location: { city: 'Baler', barangay } });
    expect(dup.judge('records', [{ serialNo: 'A', ...at('Maligaya') }, { serialNo: 'B', ...at('Linglingay') }]).verdict).toBe('review');
    expect(dup.judge('records', [{ serialNo: 'A', ...at('Suklayin', 'Flood Control Dike Phase 1') }, { serialNo: 'B', ...at('Suklayin', 'Farm to Market Road Rehabilitation') }]).verdict).toBe('review');
    expect(dup.judge('records', [{ serialNo: 'A', ...at('Suklayin') }, { serialNo: 'B', ...at('') }]).verdict).toBe('duplicate');
  });
});

describe("VERA's reading of a Legal Services or Laboratory group", () => {
  const ltr = (serialNo, fileName, fields = {}) => ({ serialNo, docType: 'ltr', fields: { firmName: 'Baler Bay', dateOfSampling: new Date('2022-01-24'), ...fields }, document: { fileName, sharePath: `LAB/${fileName}` } });
  it('a scan holding several test reports is one entry per report', () => {
    const v = dup.judge('laboratory', [ltr('L1', '2022PC-0088-0093 BALER BAY.pdf'), ltr('L2', '2022PC-0088-0093 BALER BAY.pdf')]);
    expect(v.verdict).toBe('legitimate');
    const over = dup.judge('laboratory', [1, 2, 3].map((i) => ltr(`L${i}`, '2022PC-1007-1008 LAMAO RIVER.pdf')));
    expect(over.verdict).toBe('review');
    expect(dup.judge('laboratory', [ltr('L1', '2021PC-0049 SMC POWER PLANT.pdf'), ltr('L2', '2021PC-0049 SMC POWER PLANT.pdf')]).verdict).toBe('duplicate');
  });
  it('a revised report, with a later date reported, is a document of its own', () => {
    const v = dup.judge('laboratory', [ltr('L1', '2026A-0085 LEONG HUP.pdf', { dateReported: new Date('2026-04-19') }), ltr('L2', '2026A-0085 LEONG HUP.pdf', { dateReported: new Date('2026-05-05') })]);
    expect(v.verdict).toBe('legitimate');
  });
  it('keeps the entry that holds a date the other lacks', () => {
    const order = (serialNo, resolutionDateIssued) => ({ serialNo, docType: 'ordres', fields: { companyName: 'Refit Electronic Tech Inc', docketNo: 'EMBR3-2023-ZA-58', resolutionDateIssued }, document: { fileName: 'For Resolution.pdf', sharePath: 'LEGAL/For Resolution.pdf' } });
    const v = dup.judge('legal', [order('FSN-0000002', null), order('FSN-0000008', new Date('2023-06-07'))]);
    expect(v).toMatchObject({ verdict: 'duplicate', keep: 'FSN-0000008', setAside: ['FSN-0000002'] });
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
