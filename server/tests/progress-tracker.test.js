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
/** A newly issued list's row coloured as the masterlist holder does: every cell of it (`row` 1-based). */
const fillRow = (ws, row, fgColor) => {
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let c = range.s.c; c <= range.e.c; c++) {
    const ref = XLSX.utils.encode_cell({ r: row - 1, c });
    (ws[ref] ||= { t: 'z' }).s = { patternType: 'solid', fgColor };
  }
};

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

  it('counts a list by its province worksheets\' rows, as they count themselves — a number on two rows is two', () => {
    const head = ['App No.', 'Certificate No.', 'Establishment Name', 'MUNICIPALITY/CITY', 'PROVINCE'];
    const wb = XLSX.utils.book_new();
    const aurora = XLSX.utils.aoa_to_sheet([head, ['1', 'DP-R03-26-00001', 'Baler Clinic', 'BALER', 'AURORA'], ['2', 'DP-R03-26-00002', 'Bay Resort', 'BALER', 'AURORA']]);
    fillRow(aurora, 2, { rgb: '00B050' });
    fillRow(aurora, 3, { rgb: 'FFFF00' });
    XLSX.utils.book_append_sheet(wb, aurora, 'AURORA (2)');
    // The same certificate number on two rows (two establishments): two entries.
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head, ['3', 'DP-R03-26-00003', 'Mill A', 'TARLAC CITY', 'TARLAC'], ['4', 'DP-R03-26-00003', 'Mill B', 'CAPAS', 'TARLAC']]), 'TARLAC (2) ');
    // The summary sheet repeats every row: not counted again.
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head, ['1', 'DP-R03-26-00001'], ['2', 'DP-R03-26-00002'], ['3', 'DP-R03-26-00003'], ['4', 'DP-R03-26-00003']]), 'CONSOLIDATED');
    const a = analyzePermits(wb);
    expect(a).toMatchObject({ rows: 4, permits: 3, colored: 2, provinces: { Aurora: 2, Tarlac: 2 } });
    expect(a.entries.map((e) => [e.sheet, e.row, e.city])).toEqual([['AURORA (2)', 2, 'BALER'], ['AURORA (2)', 3, 'BALER'], ['TARLAC (2) ', 2, 'TARLAC CITY'], ['TARLAC (2) ', 3, 'CAPAS']]);
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

describe('validation: rows highlighted without their newly issued permits', () => {
  const { unvalidatedHighlights, bulkHighlight } = analyzeModule;
  const fill = (ws, ref, rgb) => (ws[ref].s = { patternType: 'solid', fgColor: { rgb } });

  const raw = () => {
    const wb = rawBook([
      ['AU-1', 'Delta Builders', 'Delta Road Widening', 'Aurora', null, null, null], // its new ECC not written in
      ['AU-2', 'Gamma Resorts', 'Gamma Beach Resort', 'Aurora', 'ECC-OL-R03-2026-0600', null, null], // its new ECC written in
      ['AU-3', 'Sari Store', 'Sari Sari Store', 'Aurora', null, null, null], // a name on two rows
      ['AU-4', 'Sari Store', 'Sari Sari Store', 'Aurora', null, null, null],
      ['AU-5', 'Omega Mills', 'Omega Rice Mill', 'Aurora', null, null, null], // not coloured
    ]);
    const ws = wb.Sheets.AURORA;
    for (const r of [3, 4, 5]) fill(ws, `B${r}`, 'C6E0B4');
    return analyzeRaw(wb);
  };
  const permits = analyzePermits(
    permitsBook([
      ['Delta Road Widening', 'Aurora', '9/27/2026', 'ECC-OL-R03-2026-0564', 'Approved'],
      ['Gamma Beach Resort', 'Aurora', '9/27/2026', 'ECC-OL-R03-2026-0600', 'Approved'],
      ['Sari Sari Store', 'Aurora', '9/27/2026', 'ECC-OL-R03-2026-0601', 'Approved'],
      ['Omega Rice Mill', 'Aurora', '9/27/2026', 'ECC-OL-R03-2026-0602', 'Approved'],
    ])
  );

  it('reads whom each newly issued permit was issued to', () => {
    expect(permits.keyNames[permitKey('ECC-OL-R03-2026-0564')]).toEqual(['deltaroadwidening']);
    expect(permits.keyLabel[permitKey('ECC-OL-R03-2026-0564')]).toBe('Delta Road Widening');
  });

  it('flags a row coloured since the baseline whose firm has a newly issued permit nowhere in the RAW data', () => {
    const a = raw();
    const flagged = unvalidatedHighlights([{ id: 'f', checks: a.checks, baseHighlights: {}, fingerprints: a.fingerprints, baseFingerprints: a.fingerprints }], [permits]);
    expect(flagged.f.map((r) => r.serial)).toEqual(['AU-00001']);
    expect(flagged.f[0]).toMatchObject({ sheet: 'AURORA', row: 3, unit: 'Aurora', fill: 'C6E0B4', unchanged: true, missing: [{ permit: permitKey('ECC-OL-R03-2026-0564'), kind: 'ecc', label: 'Delta Road Widening' }] });
  });

  it('leaves a row coloured as it was at the baseline, or a permit of another province', () => {
    const a = raw();
    const asBefore = unvalidatedHighlights([{ id: 'f', checks: a.checks, baseHighlights: a.highlights }], [permits]);
    expect(asBefore).toEqual({});
    const elsewhere = { ...permits, keyProvince: Object.fromEntries(permits.keys.map((k) => [k, 'Bataan'])) };
    expect(unvalidatedHighlights([{ id: 'f', checks: a.checks, baseHighlights: {} }], [elsewhere])).toEqual({});
  });

  it('reads the permits the masterlist holder coloured on a newly issued list, once however many sheets repeat them', () => {
    const wb = permitsBook([
      ['Delta Road Widening', 'Aurora', '9/27/2026', 'ECC-OL-R03-2026-0564', 'Approved'],
      ['Gamma Beach Resort', 'Aurora', '9/27/2026', 'ECC-OL-R03-2026-0600', 'Approved'],
    ]);
    // Row 4 of Sheet1 (Delta) coloured; the AURORA sheet repeats Delta, uncoloured.
    fillRow(wb.Sheets.Sheet1, 4, { rgb: 'FFFF00' });
    const a = analyzePermits(wb);
    expect(a.colored).toBe(1);
    expect(a.coloredByKind).toEqual({ ecc: 1 });
    expect(a.rowColors).toEqual({ FFFF00: 1 });
    expect(a.highlights).toEqual({ [permitKey('ECC-OL-R03-2026-0564')]: 'FFFF00' });
    expect(a.keyAt[permitKey('ECC-OL-R03-2026-0564')]).toEqual({ sheet: 'Sheet1', row: 4 });
  });

  it('flags a permit coloured on its list since the baseline that is not in the RAW data', () => {
    const { unencodedHighlights } = analyzeModule;
    const delta = permitKey('ECC-OL-R03-2026-0564');
    const gamma = permitKey('ECC-OL-R03-2026-0600');
    const list = { ...permits, id: 'list', highlights: { [delta]: 'FFFF00', [gamma]: 'FFFF00' }, keyAt: { [delta]: { sheet: 'Sheet1', row: 4 } } };
    // Both yellow (new permit, written in): Gamma's ECC is in the RAW data; Delta's is not.
    const flagged = unencodedHighlights([{ ...list, baseHighlights: {} }], new Set([gamma]));
    expect(flagged.list).toHaveLength(1);
    expect(flagged.list[0]).toMatchObject({ reason: 'notEncoded', family: 'yellow', sheet: 'Sheet1', row: 4, unit: 'Aurora', title: 'Delta Road Widening', fill: 'FFFF00', missing: [{ permit: delta, kind: 'ecc' }] });
    // Coloured as it was at the baseline: left.
    expect(unencodedHighlights([{ ...list, baseHighlights: list.highlights }], new Set([gamma]))).toEqual({});
  });

  it('reads red as "firm not in the universe": expected missing from the RAW data, a mismatch when it is there', () => {
    const { unencodedHighlights } = analyzeModule;
    const delta = permitKey('ECC-OL-R03-2026-0564');
    const gamma = permitKey('ECC-OL-R03-2026-0600');
    // Red (C00000, the workshop's): Delta not in the RAW data — as it should be; Gamma in it — a mismatch.
    const list = { ...permits, id: 'list', highlights: { [delta]: 'C00000', [gamma]: 'C00000' }, baseHighlights: {} };
    const flagged = unencodedHighlights([list], new Set([gamma]));
    expect(flagged.list.map((r) => [r.missing[0].permit, r.reason])).toEqual([[gamma, 'redInRaw']]);
    // A colour the workshop does not use (blue) is not judged.
    expect(unencodedHighlights([{ ...list, highlights: { [delta]: 'BDD7EE' } }], new Set())).toEqual({});
  });

  it("gives each permit on a newly issued list its standing, by the workshop's colours", () => {
    const { permitStatus, colourFamily } = analyzeModule;
    // The workshop sheet's colours.
    expect(['B3F5D6', 'FF66CC', 'FFFF33', 'C00000'].map(colourFamily)).toEqual(['green', 'pink', 'yellow', 'red']);
    expect(permitStatus(null, false)).toBe('todo');
    expect(permitStatus(null, true)).toBe('unmarked');
    expect(permitStatus('green', true, true)).toBe('ok');
    expect(permitStatus('green', true, false)).toBe('greenButNew');
    expect(permitStatus('pink', false)).toBe('notEncoded');
    expect(permitStatus('yellow', true)).toBe('ok');
    expect(permitStatus('red', false)).toBe('ok');
    expect(permitStatus('red', true)).toBe('redInRaw');
    // Orange — the red firm since added to the RAW data — must be in it.
    expect(permitStatus('orange', true)).toBe('ok');
    expect(permitStatus('orange', false)).toBe('notEncoded');
    expect(permitStatus('blue', true)).toBe('otherColour');
  });

  it('counts a list with its healthcare firms on their own sheet as the WWDP list is counted: the province and Healthcare sheets row by row, not the summary or a sheet beside it', () => {
    const head = ['App #', 'Province', 'Sub Type', 'HW GR No.', 'Name of Company'];
    const wb = XLSX.utils.book_new();
    const rows = {
      GENERAL: [['1', 'BATAAN', 'New', 'OL-G-R3-08-000001', 'Bataan Foods Inc'], ['2', 'BATAAN', 'New', 'OL-G-R3-08-000002', 'Bataan Medical Center'], ['3', 'TARLAC', 'Renewal', 'OL-G-R3-69-000003', 'Tarlac Mills Corp']],
      BATAAN: [['1', 'BATAAN', 'New', 'OL-G-R3-08-000001', 'Bataan Foods Inc']],
      TARLAC: [['3', 'TARLAC', 'Renewal', 'OL-G-R3-69-000003', 'Tarlac Mills Corp']],
      Healthcare: [['2', 'BATAAN', 'New', 'OL-G-R3-08-000002', 'Bataan Medical Center']],
      // Issued after the season's period, on its own sheet: not counted.
      'OCTOBER 2026': [['9', 'TARLAC', 'New', 'OL-G-R3-69-000009', 'Late Corp']],
    };
    for (const [name, r] of Object.entries(rows)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head, ...r]), name);
    const a = analyzePermits(wb);
    expect(a.rows).toBe(3);
    expect(a.entries.map((e) => e.k).sort()).toEqual(['OL-G-R3-8-1', 'OL-G-R3-8-2', 'OL-G-R3-69-3'].sort());
    expect(a.entries.find((e) => e.k === 'OL-G-R3-8-2')).toMatchObject({ healthcare: true, province: 'Bataan' });
    expect(a.byKind).toEqual({ haz: 3 });
  });

  it('counts sanitary landfills as the province sheet does, and marks them apart: by their name, project or PSIC — not their address', () => {
    const head = ['App No.', 'Certificate No.', 'Establishment Name', 'PSIC Code', 'Address', 'PROVINCE'];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        head,
        ['1', 'DP-R03-26-00001', 'Orani Sanitary Landfill', 'Waste disposal', 'Orani', 'BATAAN'],
        ['2', 'DP-R03-26-00002', 'San Juan Land Fill', 'Waste disposal', 'Balanga', 'BATAAN'],
        ['3', 'DP-R03-26-00003', 'LGU Mariveles', 'Sanitary landfill for domestic wastes only', 'Mariveles', 'BATAAN'],
        ['4', 'DP-R03-26-00004', 'Corner Diner', 'Restaurants', 'Beside the old landfill road', 'BATAAN'],
      ]),
      'BATAAN (4)'
    );
    const a = analyzePermits(wb);
    // AURORA (44) is 44: every row on the sheet counted.
    expect(a.rows).toBe(4);
    expect(a.landfills).toBe(3);
    expect(a.entries.filter((e) => e.landfill).map((e) => e.k)).toEqual(['1', '2', '3'].map((n) => permitKey(`DP-R03-26-0000${n}`)));
    expect(a.sheets[0]).toMatchObject({ rows: 4, landfills: 3 });
  });

  it("counts each permit in the masterlist under the province whose sheet it is on — its healthcare firms included — and the lists' healthcare sheet apart", () => {
    const { masterlistUnitOf, healthcareIndex } = analyzeModule;
    const index = healthcareIndex([[{ unit: 'Healthcare Industries', keys: ['DP-R3-26-1'], title: 'Mercy General Hospital' }]]);
    // On the AURORA sheet, marked healthcare and on the healthcare RAW list: still Aurora's.
    expect(masterlistUnitOf({ k: 'DP-R3-26-1', kind: 'wwdp', province: 'Aurora', onProvinceSheet: true, healthcare: true }, index)).toBe('Aurora');
    // On the list's own Healthcare sheet (its Province cell says Aurora): Healthcare.
    expect(masterlistUnitOf({ k: 'OL-G-R3-1', kind: 'haz', province: 'Aurora', onProvinceSheet: false, healthcare: true }, index)).toBe('Healthcare Industries');
    // A TSD list without province sheets.
    expect(masterlistUnitOf({ k: 'OL-T-R3-1', kind: 'tsd', province: 'Bataan', onProvinceSheet: false }, index)).toBe('TSD / TRC');
    // A province sheet's row is that province's, whatever its Province cell says.
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Certificate No.', 'Establishment Name', 'PROVINCE'], ['DP-R03-26-00009', 'Misfiled Corp', 'BATAAN']]), 'AURORA (1)');
    expect(analyzePermits(wb).entries[0]).toMatchObject({ province: 'Aurora', onProvinceSheet: true });
  });

  it("judges a list's PSIC Code by the RAW data's standard classification: healthcare when the healthcare lists' firms carry it", () => {
    const { healthcareIndex, healthcareUnitOf, notHealthcareByPsic } = analyzeModule;
    const vocab = [['Animal Production', 'Clinic', 'Hospital', 'Nursing Home', 'Medical Laboratory', 'Treatment and disposal of hazardous waste', 'Blood Service Facility', 'Commercial Building']];
    const records = [
      [
        ...Array.from({ length: 5 }, () => ({ unit: 'Healthcare Industries', industry: 'Clinic' })),
        ...Array.from({ length: 4 }, () => ({ unit: 'Healthcare Industries', industry: 'Hospital' })),
        ...Array.from({ length: 3 }, () => ({ unit: 'Healthcare Industries', industry: 'Medical Laboratory' })),
        ...Array.from({ length: 3 }, () => ({ unit: 'TSD / TRC', industry: 'Treatment and disposal of hazardous waste' })),
        ...Array.from({ length: 6 }, () => ({ unit: 'Tarlac', industry: 'Animal Production' })),
        ...Array.from({ length: 2 }, () => ({ unit: 'Pampanga', industry: 'Nursing Home' })),
      ],
    ];
    const index = healthcareIndex([], records, vocab);
    expect(index.classify('Animal production')).toEqual({ label: 'Animal Production', healthcare: false });
    // Several named: a healthcare one decides (not Nursing Home, a province's here).
    expect(index.classify('Hospitals, clinics, nursing homes and other human health and residential care activities')).toMatchObject({ healthcare: true });
    expect(index.classify('Other human health activities - medical laboratories inside and outside of medical facilities')).toEqual({ label: 'Medical Laboratory', healthcare: true });
    expect(index.classify('Treatment and disposal of hazardous')).toMatchObject({ healthcare: true });
    expect(index.classify('Treatment and disposal of non-hazardous waste')).toBeNull();
    // A health establishment by its name, though no RAW firm carries it yet.
    expect(index.classify('Blood Service Facility')).toEqual({ label: 'Blood Service Facility', healthcare: true });
    // On the standard list, not a health establishment by name, and no RAW firm carries it: not judged.
    expect(index.classify('Commercial Building')).toEqual({ label: 'Commercial Building', healthcare: null });
    // The basis, to show.
    expect(index.classify.healthcareClasses).toEqual(['Blood Service Facility', 'Clinic', 'Hospital', 'Medical Laboratory', 'Nursing Home', 'Treatment and disposal of hazardous waste']);
    // One word naming nothing on the list exactly: not judged.
    expect(index.classify('Commercial')).toBeNull();
    // Marked healthcare on the list, PSIC Animal production: not healthcare, and the mark to check.
    const farm = { k: 'DP-R3-26-1', kind: 'wwdp', healthcare: true, psic: 'Animal production' };
    expect(healthcareUnitOf(farm, index)).toBeNull();
    expect(notHealthcareByPsic(farm, index)).toBe('Animal Production');
    // Unmarked, PSIC a healthcare classification: healthcare.
    expect(healthcareUnitOf({ k: 'DP-R3-26-2', kind: 'wwdp', psic: 'Hospitals, clinics, nursing homes and other human health' }, index)).toBe('Healthcare Industries');
    // Marked, PSIC not judged: the mark stands.
    expect(healthcareUnitOf({ k: 'DP-R3-26-3', kind: 'wwdp', healthcare: true, psic: 'Commercial' }, index)).toBe('Healthcare Industries');
  });

  it('still counts a province sheet the Planning Unit has renamed ("Done | AURORA (44)") as that province\'s', () => {
    const head = ['App No.', 'Healthcare / TSD / TRC Firm', 'Certificate No.', 'Establishment Name', 'PROVINCE'];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([head, ['1', 'Yes', 'DP-R03-26-00001', 'Baler Clinic', 'AURORA'], ['2', null, 'DP-R03-26-00002', 'Baler Resort', 'AURORA']]),
      'Done | AURORA (2)'
    );
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head, ['3', null, 'DP-R03-26-00003', 'Orani Mill', 'BATAAN']]), 'BATAAN (1)');
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([head, ['1', 'Yes', 'DP-R03-26-00001', 'Baler Clinic', 'AURORA'], ['2', null, 'DP-R03-26-00002', 'Baler Resort', 'AURORA'], ['3', null, 'DP-R03-26-00003', 'Orani Mill', 'BATAAN']]),
      'CONSOLIDATED'
    );
    const a = analyzePermits(wb);
    expect(a.sheets.map((s) => s.province)).toEqual(['Aurora', 'Bataan', null]);
    expect(a.rows).toBe(3);
    // Every row of the renamed sheet is Aurora's, its healthcare firm too.
    expect(a.entries.filter((e) => e.onProvinceSheet && e.province === 'Aurora')).toHaveLength(2);
  });

  it("cuts a sheet's range to its table, a stray value far below it left out (PAMPANGA: A1:CD306963 for 6,000 firms)", () => {
    const { trimRange } = analyzeModule;
    const ws = XLSX.utils.aoa_to_sheet([
      ['Serial_No', 'Proponent_Name', 'Project_Title'],
      ['PA-0001', 'A Corp', 'A Plant'],
      [null, null, null],
      ['PA-0003', 'C Corp', 'C Plant'],
    ]);
    // A stray value 300,000 rows down.
    XLSX.utils.sheet_add_aoa(ws, [['x']], { origin: 'B300000' });
    expect(ws['!ref']).toBe('A1:C300000');
    expect(trimRange(ws)).toBe(300000 - 4);
    expect(ws['!ref']).toBe('A1:C4');
    // A table without a stray value is left as it is.
    const plain = XLSX.utils.aoa_to_sheet([['a', 'b'], ['c', 'd']]);
    expect(trimRange(plain)).toBe(0);
    expect(plain['!ref']).toBe('A1:B2');
  });

  it('reads a fill picked from the theme palette as Excel shows it: the theme colour with its tint', () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['App No.', 'Certificate No.', 'Establishment Name', 'PROVINCE'],
      ['1', 'DP-R03-26-00001', 'A Corp', 'AURORA'],
      ['2', 'DP-R03-26-00002', 'B Corp', 'AURORA'],
      ['3', 'DP-R03-26-00003', 'C Corp', 'AURORA'],
    ]);
    // Accent 3 (196B24), 80% lighter — as the file keeps it: no RGB, a theme number and a tint.
    fillRow(ws, 2, { theme: 6, tint: 0.7999816888943144 });
    // White, 15% darker.
    fillRow(ws, 3, { theme: 0, tint: -0.1499984740745262 });
    // An RGB fill, as before.
    fillRow(ws, 4, { rgb: 'FFFF00' });
    XLSX.utils.book_append_sheet(wb, ws, 'AURORA (3)');
    wb.Themes = { themeElements: { clrScheme: ['FFFFFF', '000000', 'E8E8E8', '0E2841', '156082', 'E97132', '196B24', '0F9ED5', 'A02B93', '4EA72E'].map((rgb) => ({ rgb })) } };
    const a = analyzePermits(wb);
    const fill = (n) => a.entries.find((e) => e.k === permitKey(`DP-R03-26-0000${n}`)).fill;
    expect(fill(1)).toBe('C2F1C8');
    expect(fill(2)).toBe('D9D9D9');
    expect(fill(3)).toBe('FFFF00');
  });

  it("does not take a column shaded down the sheet for highlighting (the HWG ID list's HW GR No., \"White, Darker 5%\")", () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['App #', 'Region', 'Province', 'Sub Type', 'Date Issued', 'HW GR No.', 'Name of Company', 'Company Address'],
      ['1', 'Region 3', 'AURORA', 'New', 'June 1, 2026', 'OL-G-R3-77-000001', 'A Corp', 'Baler'],
      ['2', 'Region 3', 'AURORA', 'New', 'June 2, 2026', 'OL-G-R3-77-000002', 'B Corp', 'Baler'],
      ['3', 'Region 3', 'AURORA', 'New', 'June 3, 2026', 'OL-G-R3-77-000003', 'C Corp', 'Baler'],
    ]);
    // The HW GR No. column shaded on every row: formatting.
    for (const r of [2, 3, 4]) ws[`F${r}`].s = { patternType: 'solid', fgColor: { theme: 0, tint: -0.0499893185216834 } };
    // One row coloured by the masterlist holder, across the row.
    fillRow(ws, 3, { rgb: 'FFFF00' });
    XLSX.utils.book_append_sheet(wb, ws, 'AURORA');
    wb.Themes = { themeElements: { clrScheme: ['FFFFFF', '000000'].map((rgb) => ({ rgb })) } };
    const a = analyzePermits(wb);
    expect(a.rows).toBe(3);
    expect(a.colored).toBe(1);
    expect(a.rowColors).toEqual({ FFFF00: 1 });
  });

  it('takes a list whose permits are nine in ten on a larger list for a working copy of it', () => {
    const { copiesOf } = analyzeModule;
    const big = Array.from({ length: 50 }, (_, i) => `DP-R3-26-${i}`);
    const copies = copiesOf([
      { id: 'dp', name: 'MASTERLIST_DP.xlsx', keys: big, rows: 52 },
      { id: 'stephen', name: 'RED HIGHLIGHTED - STEPHEN.xlsx', keys: big.slice(0, 20), rows: 20 },
      { id: 'pto', name: 'MASTERLIST_PTO.xlsx', keys: ['PTO-R3-1', 'PTO-R3-2', 'DP-R3-26-1'], rows: 3 },
      { id: 'empty', name: 'Book.xlsx', keys: [], rows: 0 },
    ]);
    expect(copies).toEqual({ stephen: 'MASTERLIST_DP.xlsx' });
    // Two identical lists: one of them is counted.
    expect(Object.keys(copiesOf([{ id: 'a', name: 'A', keys: big, rows: 50 }, { id: 'b', name: 'B', keys: big, rows: 50 }]))).toHaveLength(1);
  });

  it('counts a healthcare firm\'s newly issued permit under its healthcare list, apart from the Monitoring Plan', () => {
    const { healthcareIndex, healthcareUnitOf } = analyzeModule;
    const index = healthcareIndex([
      [
        { unit: 'Healthcare Industries', keys: ['DP-R3-26-10'], title: 'Mercy General Hospital', name: 'Mercy Inc' },
        { unit: 'Chemical permits', keys: [], title: 'Acme Chemicals Corporation', name: null },
      ],
      // A province's row: not the healthcare universe.
      [{ unit: 'Bataan', keys: ['DP-R3-26-11'], title: 'Bataan Rice Mill', name: null }],
    ]);
    expect(healthcareUnitOf({ k: 'OL-T-R3-1', kind: 'tsd' }, index)).toBe('TSD / TRC');
    expect(healthcareUnitOf({ k: 'DP-R3-26-10', kind: 'wwdp' }, index)).toBe('Healthcare Industries');
    expect(healthcareUnitOf({ k: 'DP-R3-26-12', kind: 'wwdp', title: 'Acme Chemicals Corporation' }, index)).toBe('Chemical permits');
    expect(healthcareUnitOf({ k: 'DP-R3-26-13', kind: 'wwdp', healthcare: true }, index)).toBe('Healthcare Industries');
    expect(healthcareUnitOf({ k: 'DP-R3-26-11', kind: 'wwdp', title: 'Bataan Rice Mill' }, index)).toBeNull();
    // A PSIC description alone does not make it healthcare.
    expect(healthcareUnitOf({ k: 'DP-R3-26-14', kind: 'pto', psic: 'Office building with no hazardous materials' }, index)).toBeNull();
  });

  it('reads the healthcare / TSD / TRC mark from its column — Yes (in any copy of the column) or blank — or from the list\'s own Healthcare sheet', () => {
    const { healthcarePsic } = analyzeModule;
    const wb = XLSX.utils.book_new();
    const head = ['Healthcare / TSD / TRC Universe', 'App No.', 'Certificate No.', 'Establishment Name', 'PSIC Code', 'PROVINCE', 'Healthcare / TSD / TRC Universe'];
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        head,
        ['Yes', '1', 'DP-R03-26-00001', 'Mercy Hospital', 'Hospitals, clinics, nursing homes and other human health', 'BATAAN', null],
        ['Yes', '2', 'DP-R03-26-00002', 'Big Piggery Farm', 'Animal production', 'BATAAN', null], // Yes on a farm: doubtful
        [null, '3', 'DP-R03-26-00003', 'Town Resort', 'Hotels, motels, resorts', 'BATAAN', 'yes'], // the second copy of the column
        [null, '4', 'DP-R03-26-00004', 'Corner Diner', 'Restaurants', 'BATAAN', null],
      ]),
      'BATAAN (4)'
    );
    // A province sheet without the column: not marked.
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['App No.', 'Certificate No.', 'Establishment Name', 'PROVINCE'], ['5', 'DP-R03-26-00005', 'Rice Mill', 'TARLAC']]), 'TARLAC (1)');
    // The list's own Healthcare sheet (the HWG ID list keeps its healthcare firms there): every row on it marked.
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['App No.', 'Certificate No.', 'Establishment Name', 'PROVINCE'], ['6', 'DP-R03-26-00006', 'City Clinic', 'TARLAC']]), 'Healthcare');
    const a = analyzePermits(wb);
    const key = (n) => permitKey(`DP-R03-26-0000${n}`);
    expect(Object.keys(a.keyHealthcare).sort()).toEqual([key(1), key(2), key(3), key(6)].sort());
    expect(a.keyReviewed[key(4)]).toBe(true);
    expect(a.keyReviewed[key(5)]).toBeUndefined();
    expect(a).toMatchObject({ healthcare: 4, healthcareReviewed: 5 });
    expect(a.sheets.map((s) => s.healthcareMark)).toEqual(['column', null, 'sheet']);
    // What each permit is for, its industry and where, for See more.
    expect(a.keyTitle[key(1)]).toBe('Mercy Hospital');
    expect(a.keyPsic[key(2)]).toBe('Animal production');
    expect(healthcarePsic(a.keyPsic[key(1)])).toBe(true);
    expect(healthcarePsic(a.keyPsic[key(2)])).toBe(false);
    expect(healthcarePsic(undefined)).toBe(null);

    // Only the column: a TSD list without it marks nothing, nor does a row's colour.
    const tsd = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(tsd, XLSX.utils.aoa_to_sheet([['App No.', 'Province', 'Sub Type', 'Registration No.', 'Name of Company'], ['1', 'BULACAN', 'Renewal', 'OL-TR-R3-14-002068', 'Waste Movers']]), 'Sheet1');
    expect(analyzePermits(tsd)).toMatchObject({ healthcare: 0, healthcareReviewed: 0 });
    const coloured = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['Healthcare / TSD / TRC Firm', 'Certificate No.', 'Establishment Name', 'PROVINCE'],
      ['Yes', 'DP-R03-26-00011', 'Mercy Hospital', 'BATAAN'], // Yes, coloured green by the workshop's legend
      [null, 'DP-R03-26-00012', 'Town Resort', 'BATAAN'], // blank, coloured blue: not marked
    ]);
    ws.A2.s = { patternType: 'solid', fgColor: { rgb: 'B3F5D6' } };
    ws.B3.s = { patternType: 'solid', fgColor: { rgb: '00B0F0' } };
    XLSX.utils.book_append_sheet(coloured, ws, 'BATAAN');
    const c = analyzePermits(coloured);
    expect(c.healthcare).toBe(1);
    expect(Object.keys(c.keyHealthcare)).toEqual([permitKey('DP-R03-26-00011')]);
  });

  it('leaves out the ECP monitoring list, which is not part of the updating', () => {
    const row = { serial: 'ECP1STSEM-1', sheet: '1ST SEM 2026_ECP_monitoring', row: 3, title: 'Delta Road Widening', name: 'Delta Builders', keys: [], hl: 'FFFF00' };
    const ecp = [{ id: 'ecp', checks: [{ ...row, unit: 'ECP · 1st sem' }], baseHighlights: {} }];
    expect(unvalidatedHighlights(ecp, [permits])).toEqual({});
    // The same row on a province's list is flagged.
    const province = [{ id: 'au', checks: [{ ...row, unit: 'Aurora' }], baseHighlights: {} }];
    expect(Object.keys(unvalidatedHighlights(province, [permits]))).toEqual(['au']);
  });

  it('warns of a save that colours a block of rows nobody changed, not of rows worked on one by one', () => {
    const serials = Array.from({ length: 30 }, (_, i) => `AU-${i}`);
    const fp = Object.fromEntries(serials.map((s) => [s, 'a.b.c.d']));
    const before = { highlights: {}, fingerprints: fp };
    const now = { highlights: Object.fromEntries(serials.map((s) => [s, 'FFFF00'])), fingerprints: fp };
    expect(bulkHighlight(before, now, 2)).toMatchObject({ rows: 30, unchanged: 30, minutes: 2 });
    // The same rows over an hour: someone working through them.
    expect(bulkHighlight(before, now, 60)).toBe(null);
    // Rows that were edited as they were coloured.
    expect(bulkHighlight(before, { ...now, fingerprints: Object.fromEntries(serials.map((s) => [s, 'x.b.c.d'])) }, 2)).toBe(null);
    // The tracker's own light blue (its Office Script).
    expect(bulkHighlight(before, { ...now, highlights: Object.fromEntries(serials.map((s) => [s, '9DD9F3'])) }, 2)).toBe(null);
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
    // Being edited, and what the save wrote in: one ECC — "encoding" on the ECC tile only.
    const raw = o.editing.find((e) => e.kind === 'raw');
    expect(raw.encoded).toEqual({ ecc: 1 });

    // Nothing saved since: nothing read again.
    const again = await tracker.poll(await tracker.currentSeason());
    expect(again.changed).toBe(0);
    expect(sharepoint.download).toHaveBeenCalledTimes(4);
  });

  it('warns when a row is highlighted without its newly issued permit, and clears once it is written in', async () => {
    const seasonId = String(season._id);
    const rawId = `${seasonId}:raw:MONITORING_PLAN_RAW/2026_UNIVERSE_AURORA_RAW.xlsx`;
    // The workbooks here are written without their fills (SheetJS's free
    // build does not write styles), so the colouring Excel would have saved
    // is set on the reading the tracker keeps in memory.
    const colourBeta = () => {
      const c = tracker._cache.get(rawId);
      const row = c.checks.find((x) => x.serial === 'AU-00002');
      row.hl = '00B050';
      c.highlights = { ...c.highlights, 'AU-00002': '00B050' };
    };
    put('permits', 'PTO/PTO 2026.xlsx', permitsBook([['Beta Farms', 'Aurora', '10/1/2026', 'PTO-OL-R03-2026-00099', 'Approved']]), '1.0');
    // Beta Farms not written in yet; uncoloured, nothing to warn of.
    put('raw', 'MONITORING_PLAN_RAW/2026_UNIVERSE_AURORA_RAW.xlsx', rawBook([
      ['AU-1', 'Alpha Corp', 'Alpha Mill', 'Aurora', 'ECC-OL-R03-2017-0370', null, null],
      ['AU-2', 'Beta Inc', 'Beta Farms', 'Aurora', null, null, null],
      ['AU-3', 'Road Office', 'New Road', 'Aurora', 'ECC-OL-R03-2026-0564', null, null],
    ]), '3.0');
    await tracker.poll(await tracker.currentSeason());
    expect((await tracker.overview()).validation.flagged).toBe(0);

    // Beta Farms coloured as updated, its new PTO still not written in.
    colourBeta();
    const warnings = await tracker.checkValidation(seasonId);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ kind: 'warning', check: 'unvalidated', rows: 1, modifiedBy: 'Planning Officer' });
    const o = await tracker.overview(seasonId);
    expect(o.validation).toMatchObject({ flagged: 1 });
    expect(o.validation.files[0].rows[0]).toMatchObject({ serial: 'AU-00002', row: 4, missing: [{ permit: permitKey('PTO-OL-R03-2026-00099'), kind: 'pto' }] });
    // The notice names the firm and the permit it is missing.
    expect(tracker.noticeOf(warnings[0])).toMatchObject({ title: 'Progress Tracker: highlighted without validating' });
    expect(tracker.noticeOf(warnings[0]).body).toMatch(/Beta Farms: PTO-OL-R3-2026-99/);
    // Looked at again: still flagged, nobody told twice.
    expect(await tracker.checkValidation(seasonId)).toHaveLength(0);

    // The masterlist holder colours Beta Farms' PTO on its list — as written
    // in — but it is not in the RAW data yet.
    const listId = `${seasonId}:permits:PTO/PTO 2026.xlsx`;
    const pto = permitKey('PTO-OL-R03-2026-00099');
    const list = tracker._cache.get(listId);
    Object.assign(list, { highlights: { [pto]: 'FFFF00' }, baseHighlights: {} });
    // …and on its row, which the counts read.
    for (const e of list.entries) if (e.k === pto) e.fill = 'FFFF00';
    const listed = await tracker.checkValidation(seasonId);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ check: 'unencoded', rows: 1, notEncoded: 1, redInRaw: 0, name: 'PTO 2026.xlsx' });
    expect(tracker.noticeOf(listed[0])).toMatchObject({ title: 'Progress Tracker: highlight does not match the RAW data' });
    expect(tracker.noticeOf(listed[0]).body).toMatch(/1 highlighted green, pink or yellow \(written in\) but not in the RAW data/);
    // The tile's "See more": the PTO on its list, yellow, not in the RAW data yet.
    const detail = await tracker.issuedDetail('pto');
    expect(detail.files[0]).toMatchObject({ name: 'PTO 2026.xlsx', issued: 1, byStatus: { notEncoded: 1 } });
    expect(detail.files[0].rows[0]).toMatchObject({ permit: pto, firm: 'Beta Farms', title: 'Beta Farms', province: 'Aurora', family: 'yellow', inRaw: false, status: 'notEncoded' });
    expect((await tracker.overview(seasonId)).validation).toMatchObject({ flagged: 1, unencoded: 1 });

    // The PTO written in: the warning clears.
    put('raw', 'MONITORING_PLAN_RAW/2026_UNIVERSE_AURORA_RAW.xlsx', rawBook([
      ['AU-1', 'Alpha Corp', 'Alpha Mill', 'Aurora', 'ECC-OL-R03-2017-0370', null, null],
      ['AU-2', 'Beta Inc', 'Beta Farms', 'Aurora', null, 'PTO-OL-R03-2026-00099', null],
      ['AU-3', 'Road Office', 'New Road', 'Aurora', 'ECC-OL-R03-2026-0564', null, null],
    ]), '4.0');
    await tracker.poll(await tracker.currentSeason());
    colourBeta();
    expect(await tracker.checkValidation(seasonId)).toHaveLength(0);
    const after = await tracker.overview(seasonId);
    expect(after.validation).toMatchObject({ flagged: 0, unencoded: 0 });
    // The Highlighting tab's count: the PTO highlighted on its list, and in the RAW data.
    expect(after.summary.permits).toMatchObject({ colored: 1, coloredInRaw: 1 });
    expect(after.summary.permits.byKind.pto).toMatchObject({ colored: 1, coloredInRaw: 1, rowColors: { FFFF00: { rows: 1, inRaw: 1 } }, families: { yellow: { rows: 1, inRaw: 1, shades: { FFFF00: 1 } } } });
    expect(after.matrix.find((u) => u.unit === 'Aurora')).toMatchObject({ issuedColored: 1, issuedFamilies: { yellow: { rows: 1, inRaw: 1 } } });
    // Per city or municipality too (this list has no city column: "(no city)").
    expect(after.matrix.find((u) => u.unit === 'Aurora').issuedByKind.pto.cities).toMatchObject({ '(no city)': { issued: 1, colored: 1, families: { yellow: { rows: 1 } } } });
    // No healthcare mark on these lists: every permit is the Monitoring Plan's.
    expect(after.summary.permits.byKind.pto.scopes).toMatchObject({ plan: { issued: 1, inRaw: 1, colored: 1 } });
    expect(after.summary.permits.byKind.pto.scopes.healthcare).toBeUndefined();
    expect((await tracker.issuedDetail('pto')).files[0].rows[0]).toMatchObject({ inRaw: true, status: 'ok' });
    files.delete('permits|PTO/PTO 2026.xlsx');
  });

  it('tells the Developers of a warning, as a security notice that opens the Validation tab', () => {
    const notifier = nodeRequire('../services/notifier.js');
    const notice = vi.spyOn(notifier, 'notifyLater').mockImplementation(() => {});
    try {
      tracker.warnDevelopers([{ check: 'bulk', file: 'f', name: 'AURORA_RAW.xlsx', rows: 40, unchanged: 38, minutes: 3, modifiedBy: 'Planning Officer' }]);
      expect(notice).toHaveBeenCalledTimes(1);
      expect(notice.mock.calls[0][1]).toMatchObject({ kind: 'security', url: '/e-universe/admin/progress-tracker?tab=validation', title: 'Progress Tracker: rows highlighted in bulk' });
      expect(notice.mock.calls[0][1].body).toMatch(/40 rows of AURORA_RAW were highlighted in about 3 min; 38 of them had nothing on the row changed\. Last saved by Planning Officer\./);
    } finally {
      notice.mockRestore();
    }
  });

  it('lets the Developer name the colours on the newly issued lists the workshop does not use, not its own four', async () => {
    // Peach folds into orange; green is the workshop's.
    const names = await tracker.setMasterlistNames(String(season._id), { purple: '  For endorsement  ', peach: 'Pending verification', green: 'not allowed', gray: '' });
    expect(names).toEqual({ purple: 'For endorsement', orange: 'Pending verification' });
    expect((await tracker.overview(String(season._id))).masterlistNames).toEqual({ purple: 'For endorsement', orange: 'Pending verification' });
    await expect(tracker.setMasterlistNames(String(season._id), ['x'])).rejects.toMatchObject({ status: 400 });
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

  it('says which kinds of permit a RAW file is having written in, and only for the last minutes', () => {
    const now = Date.parse('2026-10-17T05:00:00Z');
    const raw = (activityMinutesAgo) => ({
      _id: 'r', name: 'r.xlsx', kind: 'raw', meta: { modifiedAt: new Date(now - 60000) }, current: { counts: { units: { Bulacan: {} } } },
      activity: { at: new Date(now - activityMinutesAgo * 60000), kinds: { pto: 3 } },
    });
    expect(tracker.editingNow([raw(1)], now)[0].encoded).toEqual({ pto: 3 });
    // Saved a minute ago, but its last permit written in ten minutes ago: open, not encoding.
    expect(tracker.editingNow([raw(10)], now)[0].encoded).toEqual({});
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
    unit('Tarlac', { rows: 3141, base: 2000, added: { erms: 1000, ecconline: 141, other: 0 }, coloredBase: 800, notModified: 1200, colours: [{ family: 'orange', rows: 40, shades: [] }], fills: [{ rgb: 'F6C6AD', family: 'orange', rows: 40, label: null }] }),
  ];
  const summary = { raw: { rows: 3873, base: 2551, additions: { erms: 1150, ecconline: 172, other: 0 } }, permits: { issued: 10, inRaw: 4 } };

  it('names the province furthest behind, what waits for review, and colours without a meaning', () => {
    const notes = notesFor({ matrix, summary, legend: {} }).map((x) => x.text).join('\n');
    expect(notes).toMatch(/2,551 baseline, 1,150 added from ERMS and 172 from ECC Online/);
    expect(notes).toMatch(/Aurora is furthest behind on highlighting: 5%/);
    expect(notes).toMatch(/5 firms are waiting on review sheets/);
    // A RAW colour without a name, by the fill the file uses.
    expect(notes).toMatch(/#F6C6AD on 40 rows in Tarlac/);
    // Named (its pencil on the Highlighting tab): no longer reported.
    const named = matrix.map((u) => (u.fills ? { ...u, fills: u.fills.map((f) => ({ ...f, label: 'PTO data' })) } : u));
    expect(notesFor({ matrix: named, summary, legend: {} }).map((x) => x.text).join('\n')).not.toMatch(/without a name/);
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
