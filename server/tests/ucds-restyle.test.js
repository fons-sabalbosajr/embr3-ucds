import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import db from '../config/db.js';
import yearService from '../services/yearService.js';
import datasetService from '../services/datasetService.js';
import pm from '../modules/ucds/services/permitMatch.js';
import reports from '../modules/ucds/services/ucdsReports.js';
import shortCache from '../shared/services/shortCache.js';
import yearScope from '../services/yearScope.js';
import importer from '../scripts/migrate-ucds/import-year-register.js';
import registerCheck from '../modules/ucds/services/registerCheck.js';

const { connectToMongo, getDb } = db;

// ---------------------------------------------------------------------------
// The Universe Central DB changes of 15 Oct 2026: a single future year opened
// early (2027), the menus cut to the Monitoring Plan and the Survey, and the
// Monitoring Plan's permits anchored to the ERMS Document Library.
// ---------------------------------------------------------------------------

const YEAR = 2098;

describe('a future year opened early', () => {
  beforeAll(async () => {
    await connectToMongo();
    await getDb().collection('year-containers').insertMany([
      { year: YEAR, label: `${YEAR} Data`, status: 'active', provinces: [], openEarly: true },
      { year: YEAR + 1, label: `${YEAR + 1} Data`, status: 'active', provinces: [] },
    ]);
    shortCache.invalidate('years:');
  });
  afterAll(async () => {
    await getDb().collection('year-containers').deleteMany({ year: { $in: [YEAR, YEAR + 1] } });
  });
  it('opens when it is marked openEarly, and the year after it stays locked', async () => {
    expect(await yearService.isOpenYearNow(YEAR)).toBe(true);
    expect(await yearService.isOpenYearNow(YEAR + 1)).toBe(false);
  });
});

describe('a year with its own register (2027 onward)', () => {
  const { registerOf } = yearScope;
  it('reads the container\'s own register, and the shared one otherwise', () => {
    expect(registerOf({ yearContainer: { register: 'ucds-data-2027' } }).collectionName).toBe('ucds-data-2027');
    expect(registerOf({ yearContainer: { year: 2026 } }).collectionName).toBe('ucds-data');
    expect(registerOf({}).collectionName).toBe('ucds-data');
    // Only a register name, never any collection a container document names.
    expect(registerOf({ yearContainer: { register: 'users' } }).collectionName).toBe('ucds-data');
  });
  it('loads the RAW workbook\'s serials and headers into register fields', () => {
    expect(importer.serial('AU-2')).toEqual({ sort_key: 'AU-00002', helper_column: 'AU', helper_count: 2 });
    expect(importer.serial('HCCP-NE-1').sort_key).toBe('HCCP-NE-00001');
    expect(importer.serial('n/a')).toBeNull();
    const fields = importer.fieldsOf(['Serial_No', 'Proponent_Name', 'Date_Monitored\r\n(mm/dd/yy)', 'Date_Routed_to_IIS', 'Date_Report_Signed', 'TOTAL_NUMBER_OF_DAYS\r\n(DM)', 'TOTAL_NUMBER_OF_DAYS\r\n(DR)', 'ECC/CNC\r\nPermit_Reference_No.', 'HAZWASTE_ID', 'HAZWASTE_ID_DATE_ISSUED']);
    expect(fields).toEqual(['sort_key', 'name', 'date_monitored', 'date_routed', 'date_signed', 'days_dmds', 'days_drds', 'ecc_cnc', 'haz_id', 'haz_issued']);
    expect(importer.provinceOf('PAMPANGA')).toBe('Pampanga');
    expect(importer.provinceOf('Nueva Ecija')).toBe('Nueva_Ecija');
    expect(importer.cell(new Date('2016-08-22T16:00:00.000Z'))).toBe('8/23/2016');
  });
});

describe("VERA's check of the register", () => {
  const NAME = 'ucds-data-2097';
  let col;
  beforeAll(async () => {
    await connectToMongo();
    col = getDb().collection(NAME);
    await col.deleteMany({});
    await getDb().collection(registerCheck.COLLECTION).deleteMany({ register: NAME });
    await col.insertMany([
      { sort_key: 'PA-00001', title: 'Alpha Mill', province: 'PAMPANGA', city: 'San Fernando', ecc_cnc: 'ECC-OL-R03-2017-0370', lat: 15.03, long: 120.69 },
      { sort_key: 'PA-00002', title: 'Beta Mill', province: 'Pampanga', city: 'San  fernando', ecc_cnc: 'ECC OL R3 2017 370', lat: 120.7, long: 15.04 },
      { sort_key: 'PA-00003', title: 'Gamma Farm', province: 'Pampanga', city: 'San Fernando', pto_code: 'PTO-1', pto_expiration: '1/5/2020' },
      // Two real barangays a letter apart, one written without its accent, and a placeholder.
      { sort_key: 'PA-00004', title: 'Delta', province: 'Pampanga', city: 'San Fernando', brgy: 'Santa Rosa', ecc_cnc: 'ECC-1' },
      { sort_key: 'PA-00005', title: 'Epsilon', province: 'Pampanga', city: 'San Fernando', brgy: 'Santa Rita', ecc_cnc: 'ECC-2' },
      { sort_key: 'PA-00006', title: 'Zeta', province: 'Pampanga', city: 'San Fernando', brgy: 'Santo Niño', ecc_cnc: 'ECC-3' },
      { sort_key: 'PA-00007', title: 'Eta', province: 'Pampanga', city: 'San Fernando', brgy: 'Santo Nino', ecc_cnc: 'ECC-4' },
      { sort_key: 'PA-00008', title: 'Theta', province: 'Pampanga', city: 'San Fernando', brgy: 'No Barangay', ecc_cnc: 'ECC-5' },
      { sort_key: 'PA-00009', title: 'Iota', province: 'Pampanga', city: 'San Fernando', brgy: '--no barangay--', ecc_cnc: 'ECC-6' },
    ]);
  });
  afterAll(async () => {
    await col.drop().catch(() => {});
    await getDb().collection(registerCheck.COLLECTION).deleteMany({ register: NAME });
  });
  it('finds what to fix and what to review, fixes what it is sure of, and undoes on request', async () => {
    const run = await registerCheck.scan({ col, register: NAME, cfg: {}, by: 'test' });
    const fix = (field) => run.proposals.find((p) => p.field === field);
    expect(fix('province')).toMatchObject({ from: 'PAMPANGA', to: 'Pampanga', confidence: 'certain' });
    expect(fix('city')).toMatchObject({ from: 'San  fernando', to: 'San Fernando' });
    expect(fix('coordinates').count).toBe(1);
    // Places a letter apart are two places; only the missing accent is proposed.
    const brgy = run.proposals.filter((p) => p.field === 'brgy');
    expect(brgy).toEqual([expect.objectContaining({ from: 'Santo Nino', to: 'Santo Niño' })]);
    const review = Object.fromEntries(run.review.map((r) => [r.key, r.count]));
    expect(review['duplicate-permits']).toBe(1);
    expect(review.missing).toBe(1);
    expect(review.expired).toBe(1);

    const done = await registerCheck.autoFix({ col, register: NAME, cfg: {}, by: 'test', user: { username: 'test' } });
    expect(done.ok).toBe(true);
    expect(await col.countDocuments({ province: 'PAMPANGA' })).toBe(0);
    expect((await col.findOne({ sort_key: 'PA-00007' })).brgy).toBe('Santo Niño');
    expect((await col.findOne({ sort_key: 'PA-00005' })).brgy).toBe('Santa Rita');
    expect(await col.findOne({ sort_key: 'PA-00002' })).toMatchObject({ lat: 15.04, long: 120.7, city: 'San Fernando' });

    const { current } = await registerCheck.latest(NAME);
    const province = current.proposals.find((p) => p.field === 'province');
    await registerCheck.undo({ col, register: NAME, runId: current.id, id: province.id, user: { username: 'test' } });
    expect((await col.findOne({ sort_key: 'PA-00001' })).province).toBe('PAMPANGA');
  });
});

describe('VERA and the underscored place names', () => {
  const NAME = 'ucds-data-2096';
  let col;
  beforeAll(async () => {
    await connectToMongo();
    col = getDb().collection(NAME);
    await col.deleteMany({});
    await col.insertMany([
      { sort_key: 'TA-00001', city: 'Tarlac_City' },
      { sort_key: 'TA-00002', city: 'Tarlac_City' },
      { sort_key: 'TA-00003', city: 'TARLAC CITY' },
    ]);
  });
  afterAll(async () => {
    await col.drop().catch(() => {});
    await getDb().collection(registerCheck.COLLECTION).deleteMany({ register: NAME });
  });
  it('leaves the underscores to a person, and either order of applying ends consistent', async () => {
    const run = await registerCheck.scan({ col, register: NAME, cfg: {}, by: 'test' });
    const city = run.proposals.filter((p) => p.field === 'city');
    expect(city).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: 'TARLAC CITY', to: 'Tarlac_City', confidence: 'certain' }),
        expect.objectContaining({ from: 'Tarlac_City', to: 'Tarlac City', confidence: 'review' }),
      ])
    );
    // The review first, on its own: everything ends spaced, and the other fix is settled.
    const review = city.find((p) => p.confidence === 'review');
    await registerCheck.apply({ col, register: NAME, runId: String(run._id), ids: [review.id], user: { username: 'test' } });
    await registerCheck.apply({ col, register: NAME, runId: String(run._id), ids: 'all', user: { username: 'test' } });
    expect(await col.distinct('city')).toEqual(['Tarlac City']);
  });
});

describe('the year menus', () => {
  it('hold only the Monitoring Plan and the Survey', async () => {
    const scan = await datasetService.scanFolders();
    for (const { datasets } of Object.values(scan)) {
      for (const d of datasets) expect(d.kind === 'monitoring-plan' || /survey/i.test(d.label)).toBe(true);
    }
  });
});

describe('the Monitoring Plan anchored to ERMS', () => {
  const index = pm.buildIndex([
    { sort_key: 'FSN-0000001', ecc_cnc: 'ECC-OL-R03-2017-0370', permit: { label: 'ECC (Original)' } },
    { sort_key: 'FSN-0000002', ecc_cnc: 'CNC-OL-R03-2019-10-01090', permit: { label: 'CNC' } },
  ]);
  it('finds a permit written differently, and says which FSN', () => {
    expect(reports.anchorOne(index, 'ECC OL R3 2017 370')).toMatchObject({ status: 'found', serials: ['FSN-0000001'], label: 'ECC (Original)' });
  });
  it('says when the Records Unit has no record of it, and ignores a blank or "N/A"', () => {
    expect(reports.anchorOne(index, 'ECC-OL-R03-2011-9999').status).toBe('missing');
    expect(reports.anchorOne(index, 'N/A').status).toBe('none');
    expect(reports.anchorOne(index, '').status).toBe('none');
  });
});
