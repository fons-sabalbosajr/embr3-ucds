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

  it('counts only the province sheet, and splits it into baseline firms and those added from ERMS and ECC Online', () => {
    const wb = rawBook([
      ['AU-1', 'Alpha Corp', 'Alpha Mill', 'Aurora', 'ECC-OL-R03-2017-0370', null, null],
      ['AU-2', 'Beta Inc', 'Beta Farm', 'Aurora', null, null, null],
      ['AU-3', 'Gamma', 'Gamma Resort', 'Aurora', 'CNC-R03-1405-0042', null, null],
      ['AU-4', 'Delta', 'Delta Road', 'Aurora', 'ECC-OL-R03-2026-0564', null, null],
    ]);
    // The additions log, as the Planning Unit's workbooks keep it.
    const log = XLSX.utils.aoa_to_sheet([
      ['NEW ADDITIONS LOG - AURORA'],
      ['Green rows: added from CSV tb_main_data_sept | Blue rows: added from ECC Online'],
      [],
      ['Source', 'Sheet', 'Serial_No', 'Proponent_Name', 'Project_Title', 'Barangay', 'City', 'ECC/CNC_No'],
      ['CSV tb_main_data_sept', 'AURORA', 'AU-3', 'Gamma', 'Gamma Resort', null, null, 'CNC-R03-1405-0042'],
      ['ECC Online (Oct 2025 - Sep 2026)', 'AURORA', 'AU-4', 'Delta', 'Delta Road', null, null, 'ECC-OL-R03-2026-0564'],
      ['CSV tb_main_data_sept', 'NEW - CHECK DUPLICATE', 'AU-5', 'Epsilon', 'Epsilon Farm', null, null, null],
    ]);
    log.A5.s = { patternType: 'solid', fgColor: { rgb: 'C6EFCE' } };
    log.A6.s = { patternType: 'solid', fgColor: { rgb: 'BDD7EE' } };
    XLSX.utils.book_append_sheet(wb, log, 'ADDED FIRM SUMMARY');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['INDUSTRY PROFILE'], HEADER, ['AU-5', 'Epsilon', 'Epsilon Farm', 'Aurora', null, null, null]]), 'NEW - CHECK DUPLICATE');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['INDUSTRY PROFILE'], HEADER, ['AU-6', 'Zeta', 'Zeta Lab', 'Aurora', null, null, null]]), 'HAZWASTE ID ONLY (ERMS)');
    const ws = wb.Sheets.AURORA;
    ws.A5.s = { patternType: 'solid', fgColor: { rgb: 'C6EFCE' } }; // AU-3: the ERMS addition marker
    ws.A6.s = { patternType: 'solid', fgColor: { rgb: 'BDD7EE' } }; // AU-4: the ECC Online marker
    ws.B3.s = { patternType: 'solid', fgColor: { rgb: 'FFFF00' } }; // AU-1: a real update

    const a = analyzeRaw(wb);
    expect(a.mainSheet).toBe('AURORA');
    // The log and the review sheets are not firms of the universe.
    expect(a.rows).toBe(4);
    expect(a.byCategory).toMatchObject({ main: 4, review: 2 });
    expect(a.base).toBe(2);
    expect(a.added).toEqual({ erms: 1, ecconline: 1, other: 0 });
    expect(a.units.Aurora.pending).toMatchObject({ erms: 1 });
    expect(a.units.Aurora.reviewSheets).toEqual({ 'NEW - CHECK DUPLICATE': 1, 'HAZWASTE ID ONLY (ERMS)': 1 });
    expect(a.units.Aurora.addedPermitsBy).toMatchObject({ erms: 1, ecconline: 1 });
    expect(a.additionsLog[0].markers).toEqual({ erms: 'C6EFCE', ecconline: 'BDD7EE' });
    // The addition markers are not updates: only AU-1 is highlighted.
    expect(a.colored).toBe(1);
    expect(a.units.Aurora.coloredBase).toBe(1);
    expect(a.rowColors).toEqual({ FFFF00: 1 });
  });

  it('finds the added firms after the main sheet is renumbered, by their marker or their title — not their old serial', () => {
    // The log says AU-3 came from ERMS; the sheet was re-sorted, and AU-3 is now another firm.
    const wb = rawBook([
      ['AU-1', 'Delta', 'Delta Road', 'Aurora', null, null, null], // was AU-4, blue: ECC Online
      ['AU-2', 'Gamma', 'Gamma Resort', 'Aurora', null, null, null], // was AU-3, its marker cleared
      ['AU-3', 'Alpha Corp', 'Alpha Mill', 'Aurora', null, null, null], // a baseline firm
    ]);
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['Source', 'Sheet', 'Serial_No', 'Proponent_Name', 'Project_Title'],
        ['CSV tb_main_data_sept', 'AURORA', 'AU-3', 'Gamma', 'Gamma Resort'],
        ['ECC Online (Oct 2025 - Sep 2026)', 'AURORA', 'AU-4', 'Delta', 'Delta Road'],
      ]),
      'NEW ADDITIONS LOG'
    );
    const log = wb.Sheets['NEW ADDITIONS LOG'];
    log.A2.s = { patternType: 'solid', fgColor: { rgb: 'C6EFCE' } };
    log.A3.s = { patternType: 'solid', fgColor: { rgb: 'BDD7EE' } };
    wb.Sheets.AURORA.A3.s = { patternType: 'solid', fgColor: { rgb: 'BDD7EE' } }; // Delta's marker
    const a = analyzeRaw(wb);
    expect(a.added).toEqual({ erms: 1, ecconline: 1, other: 0 });
    expect(a.base).toBe(1);
    // Delta's blue is its marker, not a highlight; Alpha (the new AU-3) is untouched.
    expect(a.units.Aurora.coloredBase).toBe(0);
    expect(a.records.find((r) => r.serial === 'AU-00003').source).toBe('base');
  });

  it('does not count "In-process", "Interconnected" or "App No." as permits, as the tracking summary does', () => {
    const a = analyzeRaw(rawBook([
      ['AU-1', 'Alpha', 'Alpha Mill', 'Aurora', 'ECC-OL-R03-2017-0370', 'PTO-OL-R03-2025-00001', null],
      ['AU-2', 'Beta', 'Beta Farm', 'Aurora', 'ECC-OL-R03-2018-0001', 'In-process', null],
      ['AU-3', 'Gamma', 'Gamma Road', 'Aurora', null, 'App No. 12345', null],
    ]));
    expect(a.units.Aurora.permits).toMatchObject({ ecc: 2, pto: 1 });
    expect(a.units.Aurora.pendingPermits.pto).toBe(2);
  });

  it('reads a newly issued list\'s application type: new or renewal', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['App No.', 'Certificate No.', 'Date Approved', 'Application Type', 'PROVINCE'],
        ['1', 'PTO-OL-R03-2025-08621-R', '12/16/2025', 'Renewal', 'BATAAN'],
        ['2', 'PTO-OL-R03-2025-08843', '12/26/2025', 'New - Regular', 'PAMPANGA'],
      ]),
      'CONSOLIDATED'
    );
    const a = analyzePermits(wb);
    expect(Object.values(a.keyType).sort()).toEqual(['new', 'renewal']);
    expect(a.byKind).toEqual({ pto: 2 });
  });

  it('tells a newly issued permit\'s kind from its number', () => {
    const { permitKind } = analyzeModule;
    const kind = (v) => permitKind(permitKey(v));
    expect(kind('ECC-OL-R03-2026-0564')).toBe('ecc');
    expect(kind('CNC-R03-1405-0042')).toBe('ecc');
    expect(kind('PTO-OL-R03-2025-08621-R')).toBe('pto');
    expect(kind('DP-R03-25-09433')).toBe('wwdp');
    expect(kind('OL-G-R3-14-078404')).toBe('haz');
    expect(kind('OL-GR-R3-08-001234')).toBe('haz');
    expect(kind('OL-TR-R3-14-002068')).toBe('tsd');
    expect(kind('OL-TP-R3-08-004988')).toBe('trc');
    const a = analyzePermits(permitsBook([['Road', 'Aurora', '9/27/2026', 'ECC-OL-R03-2026-0564', 'Approved'], ['Mill', 'Aurora', '9/27/2026', 'PTO-OL-R03-2025-08621', 'Approved']]));
    expect(a.byKind).toEqual({ ecc: 1, pto: 1 });
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

describe('the Data Visualization tab', () => {
  it('reads the year of an ECC/CNC from its date or from the shapes of its number', () => {
    const { eccYear } = analyzeModule;
    expect(eccYear('3/14/2019', 'ECC-OL-R03-2016-0002')).toBe(2019);
    expect(eccYear(null, 'ECC-OL-R03-2016-0002')).toBe(2016);
    expect(eccYear(null, 'R03-02032016-3825')).toBe(2016);
    expect(eccYear(null, '03BU-0512-29-577-120A')).toBe(2005);
    expect(eccYear(null, 'III-0105-123-456A')).toBe(2001);
    expect(eccYear(null, 'R3-0809-277-1213')).toBe(2008);
    expect(eccYear(null, 'not a number')).toBe(null);
  });

  it('searches the firms the last look kept by permit number, name or title, by province', async () => {
    const { _cache: cache, vizFirms } = tracker;
    const season = 'viz-test-season';
    cache.set(`${season}:raw:a.xlsx`, {
      kind: 'raw',
      records: [
        { serial: 'BU-00001', unit: 'Bulacan', name: 'Alpha', title: 'Alpha Mill', ecc: 'ECC-OL-R03-2016-0002', lat: 14.8, lng: 120.9 },
        { serial: 'TA-00002', unit: 'Tarlac', name: 'Beta', title: 'Beta Farm', ecc: 'CNC-R03-1405-0042', lat: 15.4, lng: 120.6 },
        { serial: 'ECP1STSEM-1', unit: 'ECP · 1st sem', name: 'Gamma', title: 'Gamma Road', ecc: null },
      ],
    });
    try {
      expect((await vizFirms({ season })).total).toBe(2); // the ECP list left out
      expect((await vizFirms({ season, unit: 'Tarlac' })).rows.map((r) => r.serial)).toEqual(['TA-00002']);
      expect((await vizFirms({ season, q: 'ecc ol r03 2016' })).rows[0].serial).toBe('BU-00001');
      expect((await vizFirms({ season, q: 'beta farm' })).total).toBe(1);
      // The table's rows carry no coordinates.
      expect((await vizFirms({ season })).rows[0].lat).toBeUndefined();
    } finally {
      cache.delete(`${season}:raw:a.xlsx`);
    }
  });
});

describe('the workbooks being edited now', () => {
  it('lists a workbook Excel saved in the last minutes, newest first, and drops it after', () => {
    const now = Date.parse('2026-10-17T05:00:00Z');
    const file = (name, minutesAgo, extra = {}) => ({ _id: name, name, kind: 'raw', meta: { modifiedAt: new Date(now - minutesAgo * 60000), modifiedBy: 'Planning Officer', version: '9.0' }, current: { counts: { units: { Bulacan: {} } } }, ...extra });
    const list = tracker.editingNow([file('a.xlsx', 1), file('b.xlsx', 4), file('c.xlsx', 12), file('d.xlsx', 2, { missing: true })], now);
    expect(list.map((e) => e.name)).toEqual(['a.xlsx', 'b.xlsx']);
    expect(list[0]).toMatchObject({ units: ['Bulacan'], by: 'Planning Officer', version: '9.0' });
  });

  it("lists the firms Aurora first, in the provinces' order, then by serial", async () => {
    const { _cache: cache, vizFirms } = tracker;
    const season = 'order-test-season';
    cache.set(`${season}:raw:x.xlsx`, {
      kind: 'raw',
      records: [
        { serial: 'TA-00002', unit: 'Tarlac' },
        { serial: 'AU-00010', unit: 'Aurora' },
        { serial: 'HC-00001', unit: 'Healthcare Industries' },
        { serial: 'AU-00002', unit: 'Aurora' },
        { serial: 'BU-00001', unit: 'Bulacan' },
      ],
    });
    try {
      expect((await vizFirms({ season })).rows.map((r) => r.serial)).toEqual(['AU-00002', 'AU-00010', 'BU-00001', 'TA-00002', 'HC-00001']);
    } finally {
      cache.delete(`${season}:raw:x.xlsx`);
    }
  });
});

describe('the public link', () => {
  it('opens only while it is on and before its end date', () => {
    const { shareOpen } = tracker;
    const now = new Date('2026-10-17T00:00:00Z');
    expect(shareOpen({ enabled: true, token: 'x'.repeat(24) }, now)).toBe(true);
    expect(shareOpen({ enabled: false, token: 'x'.repeat(24) }, now)).toBe(false);
    expect(shareOpen({ enabled: true, token: 'x'.repeat(24), expiresAt: new Date('2026-10-16T00:00:00Z') }, now)).toBe(false);
    expect(shareOpen({ enabled: true, token: 'x'.repeat(24), expiresAt: new Date('2026-11-01T00:00:00Z') }, now)).toBe(true);
    expect(shareOpen(null, now)).toBe(false);
  });

  it('answers an unknown or malformed token with the same 404', async () => {
    await expect(tracker.publicOverview('../../etc')).rejects.toMatchObject({ status: 404 });
    await expect(tracker.publicOverview('')).rejects.toMatchObject({ status: 404 });
    // The public map too: no dots, no firm, for a link that does not open.
    await expect(tracker.publicPoints('../../etc')).rejects.toMatchObject({ status: 404 });
    await expect(tracker.publicFirm('not a token', 'AU-00001')).rejects.toMatchObject({ status: 404 });
  });
});

describe("VERA's tracking notes", () => {
  const { notesFor, figuresLines } = nodeRequire('../services/progressTracker/notes.js');
  const figures = nodeRequire('../services/vera/figures.js');
  const unit = (name, o) => ({
    unit: name, group: 'province', rows: 0, base: 0, added: { erms: 0, ecconline: 0, other: 0 }, pending: { erms: 0, ecconline: 0, other: 0 },
    addedPermitsBy: { erms: 0, ecconline: 0, other: 0 }, permits: {}, addedPermits: {}, review: 0, reviewSheets: {}, duplicate: 0, delisting: 0, deletion: 0,
    coloredBase: 0, notModified: 0, colours: [], issued: 0, inRaw: 0, ...o,
  });
  const matrix = [
    unit('Aurora', { rows: 732, base: 551, added: { erms: 150, ecconline: 31, other: 0 }, coloredBase: 30, notModified: 521, review: 5, reviewSheets: { 'NEW - CHECK DUPLICATE': 5 } }),
    unit('Tarlac', { rows: 3141, base: 2000, added: { erms: 1000, ecconline: 141, other: 0 }, coloredBase: 800, notModified: 1200, colours: [{ family: 'orange', rows: 40, shades: [] }] }),
  ];
  const summary = { raw: { rows: 3873, base: 2551, additions: { erms: 1150, ecconline: 172, other: 0 } }, permits: { issued: 10, inRaw: 4 } };

  it('names the province furthest behind, what waits for review, and colours without a meaning', () => {
    const notes = notesFor({ matrix, summary, legend: {} }).map((x) => x.text).join('\n');
    expect(notes).toMatch(/2,551 baseline, 1,150 added from ERMS and 172 from ECC Online/);
    expect(notes).toMatch(/Aurora is furthest behind on highlighting: 5%/);
    expect(notes).toMatch(/5 firms are waiting on review sheets/);
    expect(notes).toMatch(/orange on 40 rows in Tarlac/);
    expect(notesFor({ matrix, summary, stale: true })[0].tone).toBe('warn');
  });

  it('gives VERA the figures on the tracker screen whatever the question', () => {
    expect(figures.wantsFigures('which province is behind?', 'progress-tracker')).toBe(true);
    expect(figures.wantsFigures('which province is behind?', 'dashboard')).toBe(false);
    expect(figures.topicsOf('how many firms were added from ECC Online?').progress).toBe(true);
    const text = figuresLines({ season: { name: 'S', status: 'active', open: true }, summary: { raw: { ...summary.raw, byCategory: {} }, permits: summary.permits }, matrix, notes: [] }).join('\n');
    expect(text).toMatch(/Aurora \[Monitoring Plan\]: 732 firms = 551 \+ 150 ERMS \+ 31 ECC Online/);
  });
});

describe('the old tracker, live: province matrix and colour legend', () => {
  it('counts a row under its province, or under the 2027 list that spans the provinces', () => {
    const { unitOf } = analyzeModule;
    expect(unitOf('AU-0012', 'Aurora')).toBe('Aurora');
    expect(unitOf('BU-0034', null)).toBe('Bulacan');
    expect(unitOf('HC-BU-0012', 'Bulacan')).toBe('Healthcare Industries');
    expect(unitOf('HCCL-PA-3', 'Pampanga')).toBe('Healthcare Industries');
    expect(unitOf('HCCP-NE-1', 'Nueva_Ecija')).toBe('Chemical permits');
    expect(unitOf('TRC-TA-2', 'Tarlac')).toBe('TSD / TRC');
    // A province cell naming several provinces does not make a column of its own.
    expect(unitOf('ECP1STSEM-4', 'Bataan, Pampanga, Zambales')).toBe('(no province)');
  });

  it('gives a workbook its per-province counts and rows per colour', () => {
    const a = analyzeRaw(rawBook([['AU-1', 'Firm A', 'Farm A', 'Aurora', 'ECC-OL-R03-2020-0001', '', ''], ['AU-2', 'Firm B', 'Farm B', 'Aurora', '', '', '']], { duplicates: [['AU-3', 'Firm C', 'Farm C', 'Aurora', '', '', '']] }));
    expect(a.units.Aurora).toMatchObject({ rows: 2, duplicate: 1, withPermit: 1 });
    expect(a.units.Aurora.permits.ecc).toBe(1);
  });

  it('matches the workbooks\' fill shades to the legend\'s colour families, light and dark shades as one', () => {
    const { colourFamily } = tracker;
    // Shades found in the 2026 RAW files.
    expect(colourFamily('FFFF00')).toBe('yellow');
    // Peach / beige fold into orange, sky blue into blue: fewer colours, the shades listed under each.
    expect(colourFamily('FBE3D6')).toBe('orange');
    expect(colourFamily('CAEEFB')).toBe('blue');
    expect(colourFamily('BDD7EE')).toBe('blue');
    expect(colourFamily('D9F2D0')).toBe('green');
    expect(colourFamily('C6EFCE')).toBe('green');
    expect(colourFamily('00B050')).toBe('green');
    expect(colourFamily('D1D1D1')).toBe('gray');
    expect(colourFamily('D86ECC')).toBe('pink');
    expect(colourFamily('F2AA84')).toBe('orange');
    expect(colourFamily('FF0000')).toBe('red');
  });

  it('watches a season from its opening, with the baseline following the files until the start', () => {
    const now = new Date('2026-10-16T00:00:00Z');
    const season = { status: 'active', startsAt: new Date('2026-10-19T00:00:00Z'), endsAt: new Date('2026-10-22T00:00:00Z') };
    expect(tracker.isWatched(season, now)).toBe(true);
    expect(tracker.isPreSeason(season, now)).toBe(true);
    expect(tracker.isOpen(season, now)).toBe(false);
    expect(tracker.isWatched(season, new Date('2026-10-23T00:00:00Z'))).toBe(false);
    expect(tracker.isWatched({ ...season, status: 'closed' }, now)).toBe(false);
  });
});
