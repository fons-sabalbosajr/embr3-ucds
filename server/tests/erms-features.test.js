import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import XLSX from 'xlsx';

import db from '../config/db.js';
import exportService from '../modules/erms/services/exportService.js';
import tracking from '../modules/erms/services/trackingService.js';
import archive from '../modules/erms/services/archiveService.js';
import units from '../modules/erms/services/unitDocumentService.js';
import recordService from '../modules/erms/services/recordService.js';
import reportService from '../modules/erms/services/reportService.js';

const { connectToMongo, getDb } = db;

// ---------------------------------------------------------------------------
// The ERMS features added on 15 Oct 2026: the Excel export (every field),
// custody tracking and archive boxes for Legal Services and the Laboratory,
// the calibration due list, the reports list, and search over the text VERA
// read from a scan. Test serials (FSN-95…, FSN-TC9…), a test box, removed
// afterwards.
// ---------------------------------------------------------------------------

const REC = 'FSN-9500001';
const LAB = 'FSN-TC9500001';
const BOX = 'TEST-LAB-BOX-95';
const DEV = { username: 'test-dev', permission: 'developer', role: 'developer' };

const sheetRows = (buffer) => {
  const wb = XLSX.read(buffer);
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
};

beforeAll(async () => {
  await connectToMongo();
  await getDb().collection('erms-records').insertOne({
    serialNo: REC,
    proponentName: 'Export Test Corp',
    projectTitle: 'Export test project',
    permit: { type: 'ecc-original', label: 'ECC (Original)', number: 'ECC-OL-R03-1999-9501', dateApproved: new Date('1999-02-03'), refs: [{ number: 'ECC-OL-R03-2001-9502', dateApproved: new Date('2001-04-05'), label: 'Amendment' }] },
    project: { type: 'Poultry Industries', otherType: 'Layer farm' },
    location: { province: 'aurora', city: 'Baler', barangay: 'Sabang', street: 'Purok 1', lat: 15.7, long: 121.5 },
    document: { fileName: 'export-test.pdf', sharePath: 'secret/path/export-test.pdf', uploadedBy: 'tester', uploadedAt: new Date() },
    scanText: 'Environmental Compliance Certificate issued to Zyxwvut Layer Farm',
    createdAt: new Date(),
  });
  await getDb().collection('erms-documents').insertOne({
    unit: 'laboratory',
    serialNo: LAB,
    docType: 'calibration',
    title: 'Test balance',
    province: 'aurora',
    fields: { unitUnderTest: 'Analytical balance', dateDue: new Date(Date.now() - 86400000) },
    document: {},
    createdAt: new Date(),
  });
});

afterAll(async () => {
  await getDb().collection('erms-records').deleteMany({ serialNo: REC });
  await getDb().collection('erms-documents').deleteMany({ serialNo: LAB });
  await getDb().collection(tracking.TRACKING).deleteMany({ recordSerialNo: LAB });
  await getDb().collection(archive.BOXES).deleteMany({ code: BOX });
});

describe('the Excel export', () => {
  it('carries every field of a record, and the share path only for the Developer', async () => {
    const plain = sheetRows((await exportService.recordsWorkbook({ search: REC }, null, { developer: false })).buffer);
    const header = plain[0];
    const row = plain[1];
    const cell = (name) => row[header.indexOf(name)];
    expect(plain).toHaveLength(2);
    expect(cell('ECC / Permit Ref No')).toBe('ECC-OL-R03-1999-9501');
    expect(cell('Date approved')).toBe('1999-02-03');
    expect(cell('Other Ref Nos')).toContain('ECC-OL-R03-2001-9502');
    expect(cell('Specific project type')).toBe('Layer farm');
    expect(cell('Street')).toBe('Purok 1');
    expect(cell('Latitude')).toBe(15.7);
    expect(header).not.toContain('Location on the share');
    const dev = sheetRows((await exportService.recordsWorkbook({ search: REC }, null, { developer: true })).buffer);
    expect(dev[0]).toContain('Location on the share');
  });

  it("carries a unit document's own fields, labelled as the forms label them", async () => {
    const rows = sheetRows((await exportService.unitWorkbook(DEV, 'laboratory', { search: LAB })).buffer);
    expect(rows[0]).toContain('Unit under test');
    expect(rows[1][rows[0].indexOf('Unit under test')]).toBe('Analytical balance');
  });
});

describe('Legal and Laboratory: custody and boxes', () => {
  it("records a movement on a laboratory document's own trail", async () => {
    const entry = await tracking.addEntry(LAB, { action: 'received', toParty: 'Laboratory files' }, { username: 'test' }, { unit: 'laboratory' });
    expect(entry.unit).toBe('laboratory');
    expect((await tracking.listForUnitDocument(LAB))[0].recordSerialNo).toBe(LAB);
    expect((await tracking.currentCustody(LAB)).heldBy).toBe('Laboratory files');
  });

  it("files a laboratory document into the laboratory's own box, never a Records box", async () => {
    await archive.createBox({ code: BOX, province: 'aurora', unit: 'laboratory' }, { username: 'test' });
    const result = await archive.assignRecord(LAB, BOX, { username: 'test' }, { unit: 'laboratory' });
    expect(result.archive.boxCode).toBe(BOX);
    const boxes = await archive.listBoxes({ unit: 'laboratory' }, null);
    expect(boxes.find((b) => b.code === BOX).recordCount).toBe(1);
    expect((await archive.listBoxes({}, null)).some((b) => b.code === BOX)).toBe(false);
    await expect(archive.assignRecord(REC, BOX, { username: 'test' })).rejects.toThrow();
  });
});

describe('reminders, reports and search', () => {
  it('lists a calibration certificate past its due date', async () => {
    const dash = await units.dashboard(DEV, 'laboratory');
    expect(dash.calibrationDue.items.some((i) => i.serialNo === LAB && i.overdue)).toBe(true);
  });

  it('offers the four Records reports', () => {
    expect(Object.keys(reportService.REPORTS).length).toBeGreaterThanOrEqual(4);
  });

  it('finds a record by the text VERA read from its scan', async () => {
    const res = await recordService.listRecords({ search: 'Zyxwvut Layer' }, null);
    expect(res.items.some((r) => r.serialNo === REC)).toBe(true);
  });
});
