import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import XLSX from 'xlsx';

import db from '../config/db.js';
import analyzeModule from '../services/progressTracker/analyze.js';
import { createRequire } from 'module';

// Through Node's own require, as the tracker loads them: the stand-in for
// SharePoint has to be the instance the tracker calls.
const nodeRequire = createRequire(import.meta.url);
const sharepoint = nodeRequire('../services/progressTracker/sharepoint.js');
const tracker = nodeRequire('../services/progressTracker/index.js');

const { connectToMongo, getDb } = db;
const { analyzeRaw, analyzePermits, permitKey } = analyzeModule;

// ---------------------------------------------------------------------------
// The Progress Tracker: what a workbook counts as, and a season followed
// through a save — against a stand-in for SharePoint, never the real one.
// ---------------------------------------------------------------------------

const HEADER = ['Serial_No', 'Proponent_Name', 'Project_Title', 'Province', 'ECC/CNC\nPermit_Reference_No.', 'PTO_CODE', 'Remarks/Recommendations'];
const rawBook = (rows, { duplicates = [] } = {}) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['INDUSTRY PROFILE'], HEADER, ...rows]), 'AURORA');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEADER, ...duplicates]), 'DUPLICATE');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Column1'], ['Academy']]), 'Industry_Classification');
  return wb;
};
const permitsBook = (rows) => {
  const wb = XLSX.utils.book_new();
  const head = [['Run date'], [], ['ProjectName', 'province', 'Date Approved', 'ReferenceNo', 'Status']];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([...head, ...rows]), 'Sheet1');
  // The same permits again on a province sheet: counted once.
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([...head, ...rows.slice(0, 1)]), 'AURORA');
  return wb;
};
const bytes = (wb) => XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

describe('reading a RAW universe workbook', () => {
  it('counts rows, permits by kind, and the rows coloured as updated (in the permits or anywhere)', () => {
    const wb = rawBook(
      [
        ['AU-1', 'Alpha Corp', 'Alpha Mill', 'Aurora', 'ECC-OL-R03-2017-0370', 'PTO-1', null],
        ['AU-2', 'Beta Inc', 'Beta Farm', 'AURORA', null, null, 'For monitoring'],
        ['AU-3', null, null, 'Aurora', null, null, null], // no title, no name: not a firm
      ],
      { duplicates: [['AU-9', 'Gamma', 'Gamma Mill', 'Aurora', null, null, null]] }
    );
    const ws = wb.Sheets.AURORA;
    ws.E3.s = { patternType: 'solid', fgColor: { rgb: 'FFFF00' } }; // AU-1's ECC: an updated permit
    ws.G4.s = { patternType: 'solid', fgColor: { rgb: 'CAEEFB' } }; // AU-2's remarks
    const a = analyzeRaw(wb);
    expect(a.rows).toBe(2);
    expect(a.byCategory).toMatchObject({ main: 2, duplicate: 1 });
    expect(a.permits).toMatchObject({ ecc: 1, pto: 1 });
    expect(a.withPermit).toBe(1);
    expect(a.colored).toBe(2);
    expect(a.coloredPermit).toBe(1);
    expect(a.colors).toEqual({ FFFF00: 1, CAEEFB: 1 });
    expect(a.provinces).toEqual({ Aurora: 2 });
    expect(Object.keys(a.fingerprints)).toEqual(['AU-00001', 'AU-00002']);
    expect(a.keys).toContain(permitKey('ECC-OL-R3-2017-370'));
  });

  it('reads a newly issued permits list once, however many sheets repeat it', () => {
    const a = analyzePermits(permitsBook([['Road', 'Aurora', '9/27/2026', 'ECC-OL-R03-2026-0564', 'Approved'], ['Resort', 'Bataan', '9/21/2026', 'ECC-OL-R03-2026-0538', 'Approved']]));
    expect(a.rows).toBe(2);
    expect(a.provinces).toEqual({ Aurora: 1, Bataan: 1 });
  });

  it('compares permit numbers loosely', () => {
    expect(permitKey('ECC-OL-R03-2017-0370')).toBe(permitKey('ecc ol RO3 2017 370'));
  });
});

describe('a season followed through a save', () => {
  const files = new Map();
  const put = (source, path, wb, version) => files.set(`${source}|${path}`, { buf: bytes(wb), version });
  const RAW = 'https://example.sharepoint.com/:f:/g/raw';
  const PERMITS = 'https://example.sharepoint.com/:f:/g/permits';
  let season;

  beforeAll(async () => {
    await connectToMongo();
    for (const c of ['progress-seasons', 'progress-files', 'progress-baselines', 'progress-events']) await getDb().collection(c).deleteMany({});
    vi.spyOn(sharepoint, 'list').mockImplementation(async (link) => {
      const source = link === RAW ? 'raw' : 'permits';
      return {
        root: '/x',
        files: [...files.entries()]
          .filter(([k]) => k.startsWith(`${source}|`))
          .map(([k, v]) => ({ path: k.split('|')[1], name: k.split('|')[1].split('/').pop(), size: v.buf.length, modifiedAt: new Date(), version: v.version, etag: `"${k}",${v.version}`, modifiedBy: 'Planning Officer' })),
      };
    });
    vi.spyOn(sharepoint, 'download').mockImplementation(async (link, path) => files.get(`${link === RAW ? 'raw' : 'permits'}|${path}`).buf);

    put('raw', 'MONITORING_PLAN_RAW/2026_UNIVERSE_AURORA_RAW.xlsx', rawBook([
      ['AU-1', 'Alpha Corp', 'Alpha Mill', 'Aurora', 'ECC-OL-R03-2017-0370', null, null],
      ['AU-2', 'Beta Inc', 'Beta Farm', 'Aurora', null, null, null],
    ]), '1.0');
    put('permits', 'ECC/ECC 2026.xlsx', permitsBook([['Alpha', 'Aurora', '1/1/2026', 'ECC-OL-R03-2017-0370', 'Approved'], ['New Road', 'Aurora', '9/27/2026', 'ECC-OL-R03-2026-0564', 'Approved']]), '1.0');
    put('permits', 'ECC/Extracted from CO/region 3 ecc approved.xlsx', permitsBook([['Old', 'Aurora', '1/1/2010', 'ECC-R03-2010-0001', 'Approved']]), '1.0');

    const now = Date.now();
    season = await tracker.createSeason(
      {
        name: 'Test season',
        startsAt: new Date(now - 86400000),
        endsAt: new Date(now + 86400000),
        sources: [{ key: 'raw', kind: 'raw', label: 'RAW', link: RAW }, { key: 'permits', kind: 'permits', label: 'Permits', link: PERMITS }],
      },
      { username: 'test' }
    );
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    for (const c of ['progress-seasons', 'progress-files', 'progress-baselines', 'progress-events']) await getDb().collection(c).deleteMany({});
  });

  it('takes the baseline on the first look, then counts what a save added, changed and encoded', async () => {
    const first = await tracker.poll(await tracker.currentSeason());
    expect(first.errors).toEqual([]);
    let o = await tracker.overview();
    expect(o.season.baselineAt).toBeTruthy();
    expect(o.summary.raw).toMatchObject({ baselineRows: 2, rows: 2, added: 0, modified: 0, permitsBaseline: 1 });
    // One of the two newly issued ECCs is in the RAW file; the Central Office extract is reference only.
    expect(o.summary.permits).toMatchObject({ issued: 2, inRaw: 1, files: 1 });
    expect(o.files.find((f) => /Extracted/.test(f.path)).reference).toBe(true);

    // The Planning Unit saves: the new ECC written on a new firm, AU-2's title corrected.
    put('raw', 'MONITORING_PLAN_RAW/2026_UNIVERSE_AURORA_RAW.xlsx', rawBook([
      ['AU-1', 'Alpha Corp', 'Alpha Mill', 'Aurora', 'ECC-OL-R03-2017-0370', null, null],
      ['AU-2', 'Beta Inc', 'Beta Farms', 'Aurora', null, null, null],
      ['AU-3', 'Road Office', 'New Road', 'Aurora', 'ECC-OL-R03-2026-0564', null, null],
    ]), '2.0');
    const r = await tracker.poll(await tracker.currentSeason());
    expect(r.changed).toBe(1);
    o = await tracker.overview();
    expect(o.summary.raw).toMatchObject({ baselineRows: 2, rows: 3, added: 1, modified: 1, permitsBaseline: 1, permitsNow: 2 });
    expect(o.summary.raw.bySection.profile).toBe(1);
    expect(o.summary.permits).toMatchObject({ issued: 2, inRaw: 2 });
    const save = o.events.find((e) => e.kind === 'save');
    expect(save).toMatchObject({ version: '2.0', modifiedBy: 'Planning Officer', delta: { rows: 1, added: 1, modified: 1, permits: 1 } });

    // Nothing saved since: nothing read again.
    const again = await tracker.poll(await tracker.currentSeason());
    expect(again.changed).toBe(0);
    expect(sharepoint.download).toHaveBeenCalledTimes(4);
  });

  it('refuses a season without dates in order, or a source that is not SharePoint', async () => {
    await expect(tracker.createSeason({ name: 'x', startsAt: '2026-10-10', endsAt: '2026-10-01' })).rejects.toMatchObject({ status: 400 });
    await expect(tracker.updateSeason(String(season._id), { sources: [{ kind: 'raw', link: 'https://evil.example.com/f' }] })).rejects.toMatchObject({ status: 400 });
  });
});
