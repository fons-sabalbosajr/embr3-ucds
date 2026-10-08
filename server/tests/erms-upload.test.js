import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

import app from '../app.js';
import activation from '../services/nasActivation.js';
import db from '../config/db.js';

// The instance app.js holds. An `import` here would load a second copy of
// nasStorage, and refreshing that copy's container cache changes nothing the
// routes see — the uploads would still go to the real NAS.
const nas = createRequire(import.meta.url)('../services/nasStorage.js');

const { connectToMongo, collections, getDb } = db;

// ---------------------------------------------------------------------------
// Uploading: a scan goes from the browser onto the share, and back out.
//
// Everything else in the suite stops short of the share — the filing tests
// check the form and refuse before a byte is written. This one writes. The
// share is a temporary folder on this machine, reached the way the NAS is
// reached: as a UNC path (\\localhost\C$\…), through the same writeFile(),
// path containment and activation gate as production. What it cannot prove
// is that the real NAS answers — that is the bridge's job, and the
// availability check's (nas-availability.test.js).
//
// Skipped where the machine's admin share is not reachable (not Windows, or
// not an administrator).
// ---------------------------------------------------------------------------

const PASSWORD = 'UploadTestPw!x9';
const RECORDS = '__test_upload_records';
const LEGAL = '__test_upload_legal';
const PLANNING = '__test_upload_planning';
const USERNAMES = [RECORDS, LEGAL, PLANNING];

const localDir = path.join(os.tmpdir(), `erms-upload-${process.pid}-${Date.now()}`);
const drive = /^([A-Za-z]):\\/.exec(localDir)?.[1];
const shareRoot = drive ? `\\\\localhost\\${drive.toUpperCase()}$` : null;
const baseDir = drive ? localDir.slice(3) : null;
const shareReachable = !!shareRoot && process.platform === 'win32' && fs.existsSync(`${shareRoot}\\`);

// A file the share and the browser can both recognise as a PDF.
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');

const base = (username, extra) => ({
  username, name: username, email: `${username}@test.local`, division: 'TEST', status: 'offline',
  assignedYears: [], aurora: 'none', bataan: 'none', bulacan: 'none', nuevaEcija: 'none', pampanga: 'none', tarlac: 'none', zambales: 'none',
  ...extra,
});

async function signIn(username) {
  const agent = request.agent(app);
  const res = await agent.post('/login').send({ username, password: PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

const onDisk = (sharePath) => path.join(localDir, ...String(sharePath).split('\\'));

// Each upload its own permit number: a repeated one is refused when the unit
// blocks duplicate permits (Settings › ERMS), which is not what these test.
let permitSeq = 0;
const recordPayload = (over = {}) => ({
  proponentName: '__Test Upload Proponent',
  projectTitle: '__Test Upload Project',
  permit: { type: 'ecc-original', number: `__TEST-UPLOAD-${process.pid}-${(permitSeq += 1)}` },
  location: { province: 'bataan' },
  ...over,
});

let records;
let legal;
let planning;
let savedContainers = [];
const createdRecords = [];
const createdUnitDocs = [];

describe.skipIf(!shareReachable)('uploading a scan to the share', () => {
  beforeAll(async () => {
    await connectToMongo();
    fs.mkdirSync(localDir, { recursive: true });

    // Every container files into the temporary folder for this file's run.
    const containers = getDb().collection('nas-containers');
    savedContainers = await containers.find({}).toArray();
    for (const key of ['records', 'legal', 'laboratory']) {
      await containers.updateOne(
        { _id: key },
        { $set: { label: key, root: shareRoot, baseDir, enabled: true, incoming: false }, $unset: { password: '', username: '' } },
        { upsert: true }
      );
    }
    await nas.refreshConfig();

    // Open: no bridge to wait for, no schedule, an activation window now.
    // (app-config is restored after the file by tests/setup.js.)
    const config = getDb().collection('app-config');
    await config.updateOne({ _id: 'nas-bridge' }, { $set: { enabled: false } }, { upsert: true });
    await config.updateOne({ _id: 'nas-availability' }, { $set: { master: true, 'schedule.enabled': false } }, { upsert: true });
    await config.updateOne(
      { _id: activation.DOC_ID },
      { $set: { enabled: true, startsAt: new Date(Date.now() - 60000), endsAt: new Date(Date.now() + 3600000) } },
      { upsert: true }
    );

    const password = await bcrypt.hash(PASSWORD, 10);
    await collections.users.deleteMany({ username: { $in: USERNAMES } });
    await collections.users.insertMany([
      base(RECORDS, { password, permission: 'records', bataan: 'readWrite' }),
      base(LEGAL, { password, permission: 'records', ermsUnit: 'legal', bataan: 'readWrite' }),
      base(PLANNING, { password, permission: 'planning', bataan: 'readWrite' }),
    ]);
    [records, legal, planning] = await Promise.all([signIn(RECORDS), signIn(LEGAL), signIn(PLANNING)]);

    // app.js also starts a refreshConfig() of its own when it loads, which
    // can finish after the one above and put the real NAS back. Refresh once
    // more now that it has settled, and make sure of it: an upload sent to
    // the real NAS hangs on an unreachable share rather than failing cleanly.
    await nas.refreshConfig();
    expect(nas.describeConfig('records').host).toBe('localhost');
  }, 120000);

  afterAll(async () => {
    if (createdRecords.length) await collections.ermsRecords.deleteMany({ serialNo: { $in: createdRecords } });
    if (createdUnitDocs.length) await getDb().collection('erms-documents').deleteMany({ serialNo: { $in: createdUnitDocs } });
    await collections.users.deleteMany({ username: { $in: USERNAMES } });
    await collections.loginStatus.deleteMany({ username: { $in: USERNAMES } });

    const containers = getDb().collection('nas-containers');
    await containers.deleteMany({});
    if (savedContainers.length) await containers.insertMany(savedContainers);
    await nas.refreshConfig();

    fs.rmSync(localDir, { recursive: true, force: true });
  }, 60000);

  it('files a Records scan under province, year range, year and project, and creates the record', async () => {
    const res = await records
      .post('/api/erms/records/upload')
      .field('payload', JSON.stringify(recordPayload()))
      .attach('file', PDF, { filename: 'ECC scan.pdf', contentType: 'application/pdf' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);

    const serialNo = res.body.record.serialNo;
    createdRecords.push(serialNo);

    // No container on a Records record: Records is the one every reader
    // falls back to (nasStorage's RECORDS_KEY).
    const stored = await collections.ermsRecords.findOne({ serialNo });
    const year = new Date().getFullYear();
    expect(stored.document.sharePath).toMatch(new RegExp(`\\\\Bataan\\\\\\d{4}-\\d{4}\\\\${year}\\\\__Test Upload Project\\\\`));
    expect(stored.document.fileName).toMatch(/ECC scan\.pdf$/);

    // The bytes on the share are the bytes that were sent.
    expect(fs.readFileSync(onDisk(stored.document.sharePath)).equals(PDF)).toBe(true);
  });

  it('keeps both scans when the same name is filed twice', async () => {
    const send = () =>
      records
        .post('/api/erms/records/upload')
        .field('payload', JSON.stringify(recordPayload({ projectTitle: '__Test Upload Twice' })))
        .attach('file', PDF, { filename: 'same name.pdf', contentType: 'application/pdf' });
    const first = await send();
    const second = await send();
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    createdRecords.push(first.body.record.serialNo, second.body.record.serialNo);

    const [a, b] = await Promise.all(
      [first, second].map((r) => collections.ermsRecords.findOne({ serialNo: r.body.record.serialNo }))
    );
    expect(a.document.sharePath).not.toBe(b.document.sharePath);
    expect(b.document.fileName).toMatch(/\(2\)\.pdf$/);
    expect(fs.existsSync(onDisk(a.document.sharePath))).toBe(true);
    expect(fs.existsSync(onDisk(b.document.sharePath))).toBe(true);
  });

  it('opens the uploaded scan from the record for the Records Unit', async () => {
    const serialNo = createdRecords[0];
    const info = await records.get(`/api/erms/records/${encodeURIComponent(serialNo)}/file`);
    expect(info.status, JSON.stringify(info.body)).toBe(200);

    const preview = await records
      .get(`/api/erms/records/${encodeURIComponent(serialNo)}/file/preview`)
      .buffer(true)
      .parse((res, done) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      });
    expect(preview.status).toBe(200);
    expect(Buffer.compare(preview.body, PDF)).toBe(0);
  });

  it('refuses a file type the configuration does not accept, before writing anything', async () => {
    const before = fs.readdirSync(localDir, { recursive: true }).length;
    const res = await records
      .post('/api/erms/records/upload')
      .field('payload', JSON.stringify(recordPayload({ projectTitle: '__Test Upload Refused' })))
      .attach('file', Buffer.from('MZ not a scan'), { filename: 'setup.exe' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('FILE_TYPE');
    expect(fs.readdirSync(localDir, { recursive: true }).length).toBe(before);
  });

  it('files a Legal Services document into the Legal container', async () => {
    const res = await legal
      .post('/api/erms/units/legal/documents')
      .field('docType', 'nov')
      .field('province', 'bataan')
      .field('fields', JSON.stringify({
        docketNo: 'EMBR3-TEST-UPLOAD-001',
        companyName: '__Test Upload Company',
        novDateIssued: '2026-09-01',
        status: 'FOR TECHNICAL CONFERENCE',
      }))
      .attach('file', PDF, { filename: 'NOV.pdf', contentType: 'application/pdf' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    createdUnitDocs.push(res.body.document.serialNo);

    const stored = await getDb().collection('erms-documents').findOne({ serialNo: res.body.document.serialNo });
    expect(stored.document.container).toBe('legal');
    expect(stored.document.sharePath).toMatch(/\\Bataan\\.*__Test Upload Company/);
    expect(fs.readFileSync(onDisk(stored.document.sharePath)).equals(PDF)).toBe(true);
  });

  it('replaces a Legal document’s scan only when told what becomes of the old one', async () => {
    const legalSerial = createdUnitDocs[0];
    const before = await getDb().collection('erms-documents').findOne({ serialNo: legalSerial });
    const send = (replace) => {
      const req = legal.post(`/api/erms/units/legal/documents/${encodeURIComponent(legalSerial)}/upload`);
      if (replace) req.field('replace', replace);
      return req.attach('file', Buffer.concat([PDF, Buffer.from(`% ${replace}\n`)]), { filename: 'NOV corrected.pdf', contentType: 'application/pdf' });
    };

    const refused = await send(null);
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('HAS_DOCUMENT');

    const kept = await send('keep');
    expect(kept.status, JSON.stringify(kept.body)).toBe(200);
    expect(kept.body.previous).toMatchObject({ fileName: before.document.fileName, deleted: false, reason: 'kept' });
    const afterKeep = await getDb().collection('erms-documents').findOne({ serialNo: legalSerial });
    expect(fs.existsSync(onDisk(before.document.sharePath))).toBe(true);
    expect(fs.existsSync(onDisk(afterKeep.document.sharePath))).toBe(true);
    expect(afterKeep.document.sharePath).not.toBe(before.document.sharePath);

    const deleted = await send('delete');
    expect(deleted.status, JSON.stringify(deleted.body)).toBe(200);
    expect(deleted.body.previous.deleted).toBe(true);
    expect(fs.existsSync(onDisk(afterKeep.document.sharePath))).toBe(false);
    const afterDelete = await getDb().collection('erms-documents').findOne({ serialNo: legalSerial });
    expect(fs.readFileSync(onDisk(afterDelete.document.sharePath)).toString()).toMatch(/% delete/);
  });

  it('files a scan against a Legal document the desktop system kept without one', async () => {
    const serialNo = `__TEST-UPLOAD-NOFILE-${process.pid}`;
    createdUnitDocs.push(serialNo);
    await getDb().collection('erms-documents').insertOne({
      unit: 'legal', docType: 'payment', docTypeLabel: 'Payment', serialNo, province: 'bataan', provinceLabel: 'Bataan',
      title: '__Test Unfiled Payment',
      fields: { docketNo: 'EMBR3-TEST-UPLOAD-002', companyName: '__Test Unfiled Payment' },
      document: { fileName: null, sharePath: null, filePath: null },
      legacy: { table: 'tb_records_PAYMENT' }, createdAt: new Date(),
    });
    const res = await legal
      .post(`/api/erms/units/legal/documents/${encodeURIComponent(serialNo)}/upload`)
      .attach('file', PDF, { filename: 'OR.pdf', contentType: 'application/pdf' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.previous).toBeNull();
    const stored = await getDb().collection('erms-documents').findOne({ serialNo });
    expect(stored.document.container).toBe('legal');
    expect(stored.document.sharePath).toMatch(/\\Bataan\\.*__Test Unfiled Payment\\Payment\\OR\.pdf$/);
    expect(fs.readFileSync(onDisk(stored.document.sharePath)).equals(PDF)).toBe(true);
  });

  it('is filed only by the document’s own unit', async () => {
    const res = await records
      .post(`/api/erms/units/legal/documents/${encodeURIComponent(createdUnitDocs[0])}/upload`)
      .field('replace', 'keep')
      .attach('file', PDF, { filename: 'x.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(403);
  });

  it('files an attachment beside the record’s own scan, as the desktop system did', async () => {
    const parentSerial = createdRecords[0];
    const parent = await collections.ermsRecords.findOne({ serialNo: parentSerial });
    const res = await records
      .post('/api/erms/records/upload')
      .field('payload', JSON.stringify({
        parentSerialNo: parentSerial,
        proponentName: parent.proponentName,
        projectTitle: 'A different title, which must not make a new folder',
        permit: { type: 'ecc-amended', number: parent.permit.number },
        location: { province: 'bataan' },
      }))
      .attach('file', PDF, { filename: 'Amendment.pdf', contentType: 'application/pdf' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    createdRecords.push(res.body.record.serialNo);
    expect(res.body.record.serialNo).toMatch(new RegExp(`^${parentSerial} Att-\\d{5}$`));

    const stored = await collections.ermsRecords.findOne({ serialNo: res.body.record.serialNo });
    const dir = (p) => p.split('\\').slice(0, -1).join('\\');
    expect(dir(stored.document.sharePath)).toBe(dir(parent.document.sharePath));
    expect(stored.document.fileName).toBe('ECC_Amended Amendment.pdf');
    expect(fs.readFileSync(onDisk(stored.document.sharePath)).equals(PDF)).toBe(true);
  });

  it('is refused to anyone who may not file records', async () => {
    const res = await planning
      .post('/api/erms/records/upload')
      .field('payload', JSON.stringify(recordPayload()))
      .attach('file', PDF, { filename: 'x.pdf', contentType: 'application/pdf' });
    expect([401, 403]).toContain(res.status);
  });

  it('says the NAS is unavailable, rather than failing, when document access is closed', async () => {
    const config = getDb().collection('app-config');
    await config.updateOne({ _id: activation.DOC_ID }, { $set: { enabled: false } });
    try {
      const res = await records
        .post('/api/erms/records/upload')
        .field('payload', JSON.stringify(recordPayload()))
        .attach('file', PDF, { filename: 'closed.pdf', contentType: 'application/pdf' });
      expect(res.status).toBe(503);
      expect(res.body.code).toBe('NAS_INACTIVE');
    } finally {
      await config.updateOne({ _id: activation.DOC_ID }, { $set: { enabled: true } });
    }
  });
});
