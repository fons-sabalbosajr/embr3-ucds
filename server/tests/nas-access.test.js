import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';

import app from '../app.js';
import db from '../config/db.js';

const { connectToMongo, collections, getDb } = db;

// ---------------------------------------------------------------------------
// Document access and the NAS administrative surface, over HTTP.
//
// The two things this has to prove:
//
//   1. A Records clerk can read the document filed against a record they are
//      entitled to, and cannot name a path.
//   2. Everyone else — including an authenticated Planning user, which is what
//      the old routes let through — is refused.
//
// Before Phase 7 the NAS routes required only authenticateSession, so any
// signed-in account could read any file on the share by supplying a path.
// ---------------------------------------------------------------------------

const PASSWORD = 'Phase7TestPw!x9';
const RECORDS = '__test_nas_records';
const PLANNING = '__test_nas_planning';
const DEVELOPER = '__test_nas_dev';
const USERNAMES = [RECORDS, PLANNING, DEVELOPER];

const SERIAL_IN_SCOPE = '__TEST-NAS-1';
const SERIAL_OUT_OF_SCOPE = '__TEST-NAS-2';
const SERIAL_NO_DOC = '__TEST-NAS-3';

const base = (username, extra) => ({
  username,
  name: username,
  email: `${username}@test.local`,
  division: 'TEST',
  status: 'offline',
  assignedYears: [2025],
  aurora: 'none', bataan: 'none', bulacan: 'none', nuevaEcija: 'none',
  pampanga: 'none', tarlac: 'none', zambales: 'none',
  ...extra,
});

async function signIn(username) {
  const agent = request.agent(app);
  const res = await agent.post('/login').send({ username, password: PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

const recordDoc = (serialNo, province, sharePath) => ({
  serialNo,
  attachmentNo: null,
  isAttachment: false,
  parentSerialNo: null,
  legacySource: '__test',
  projectTitle: 'Test project',
  proponentName: 'Test proponent',
  location: { province, provinceLabel: province },
  permit: { type: 'ecc-original', label: 'ECC (Original)', number: 'TEST-1' },
  document: sharePath
    ? { fileName: 'sample.pdf', filePath: `Z:\\${sharePath}`, sharePath, fileClass: 'Public' }
    : { fileName: null, filePath: null, sharePath: null, fileClass: null },
  dataQuality: { clean: true, issues: [] },
});

let records;
let planning;
let developer;

beforeAll(async () => {
  await connectToMongo();
  const password = await bcrypt.hash(PASSWORD, 10);
  await collections.users.deleteMany({ username: { $in: USERNAMES } });
  await collections.users.insertMany([
    base(RECORDS, {
      password,
      permission: 'records',
      domains: ['erms'],
      bataan: 'readWrite',
    }),
    base(PLANNING, { password, permission: 'planning', domains: ['ucds'], bataan: 'readWrite' }),
    base(DEVELOPER, { password, permission: 'developer' }),
  ]);

  const col = getDb().collection('erms-records');
  await col.deleteMany({ serialNo: { $in: [SERIAL_IN_SCOPE, SERIAL_OUT_OF_SCOPE, SERIAL_NO_DOC] } });
  await col.insertMany([
    // Points at a path that will not exist on the share. The endpoint's job is
    // to authorise and resolve; whether the scan is filed is a data question.
    recordDoc(SERIAL_IN_SCOPE, 'bataan', 'RECORDS\\__test\\nothing-here.pdf'),
    recordDoc(SERIAL_OUT_OF_SCOPE, 'aurora', 'RECORDS\\__test\\nothing-here.pdf'),
    recordDoc(SERIAL_NO_DOC, 'bataan', null),
  ]);

  [records, planning, developer] = await Promise.all([
    signIn(RECORDS),
    signIn(PLANNING),
    signIn(DEVELOPER),
  ]);
}, 90000);

afterAll(async () => {
  await collections.users.deleteMany({ username: { $in: USERNAMES } });
  await collections['loginStatus'].deleteMany({ username: { $in: USERNAMES } });
  await getDb()
    .collection('erms-records')
    .deleteMany({ serialNo: { $in: [SERIAL_IN_SCOPE, SERIAL_OUT_OF_SCOPE, SERIAL_NO_DOC] } });
}, 60000);

describe('document access is addressed by record, never by path', () => {
  it('has no endpoint that accepts a caller-supplied path', async () => {
    // The route that did this is gone rather than guarded, so there is nothing
    // left to get the guard wrong on.
    const res = await developer.get('/api/nas/view-pdf?file=../../secret.pdf');
    expect(res.status).toBe(404);
  });

  it('refuses an unauthenticated caller', async () => {
    for (const path of [
      `/api/erms/records/${SERIAL_IN_SCOPE}/file`,
      `/api/erms/records/${SERIAL_IN_SCOPE}/file/preview`,
      `/api/erms/records/${SERIAL_IN_SCOPE}/file/download`,
    ]) {
      const res = await request(app).get(path);
      expect(res.status).toBe(401);
    }
  });

  it('refuses a signed-in user outside the ERMS domain', async () => {
    const res = await planning.get(`/api/erms/records/${SERIAL_IN_SCOPE}/file`);
    expect(res.status).toBe(403);
  });

  it('refuses a record outside the clerk\u2019s province scope', async () => {
    const res = await records.get(`/api/erms/records/${SERIAL_OUT_OF_SCOPE}/file`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('RECORD_NOT_FOUND');
  });

  it('says plainly when a record has no document filed', async () => {
    const res = await records.get(`/api/erms/records/${SERIAL_NO_DOC}/file`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NO_DOCUMENT');
  });

  it('distinguishes a missing scan from a refusal', async () => {
    // The clerk is entitled to this record; the file is simply not there.
    // Reporting that as 403 would send someone hunting for a permission bug.
    const res = await records.get(`/api/erms/records/${SERIAL_IN_SCOPE}/file`);
    expect([404, 503]).toContain(res.status);
    expect(['FILE_MISSING', 'NAS_NOT_CONFIGURED', 'NAS_DISABLED']).toContain(res.body.code);
  });
});

describe('the stored share path', () => {
  it('is withheld from a Records clerk', async () => {
    const res = await records.get(`/api/erms/records/${SERIAL_IN_SCOPE}`);
    expect(res.status).toBe(200);
    expect(res.body.record.document.fileName).toBe('sample.pdf');
    // The path describes the internal layout of the share and is not needed to
    // open a document, which is addressed by serial.
    expect(res.body.record.document.sharePath).toBeUndefined();
    expect(res.body.record.document.filePath).toBeUndefined();
  });

  it('is shown to a developer, who may have to diagnose it', async () => {
    const res = await developer.get(`/api/erms/records/${SERIAL_IN_SCOPE}`);
    expect(res.status).toBe(200);
    expect(res.body.record.document.sharePath).toBe('RECORDS\\__test\\nothing-here.pdf');
  });

  it('survives an edit that does not mention it', async () => {
    // The update path merges over the stored document, so a client that never
    // received the path cannot write it back as null.
    const before = await getDb().collection('erms-records').findOne({ serialNo: SERIAL_IN_SCOPE });
    const res = await developer
      .patch(`/api/erms/records/${SERIAL_IN_SCOPE}`)
      .send({ document: { fileName: 'renamed.pdf' } });
    expect(res.status).toBe(200);

    const after = await getDb().collection('erms-records').findOne({ serialNo: SERIAL_IN_SCOPE });
    expect(after.document.fileName).toBe('renamed.pdf');
    expect(after.document.sharePath).toBe(before.document.sharePath);
  });
});

describe('the NAS administrative surface', () => {
  it('tells any signed-in user only whether a share is configured', async () => {
    const res = await records.get('/api/nas/status');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['configured', 'enabled']);
  });

  it('refuses non-developers outright', async () => {
    for (const agent of [records, planning]) {
      expect((await agent.get('/api/nas/config')).status).toBe(403);
      expect((await agent.post('/api/nas/test-connection')).status).toBe(403);
      expect((await agent.get('/api/nas/files')).status).toBe(403);
    }
  });

  it('refuses a developer who has not verified by email', async () => {
    for (const res of [
      await developer.get('/api/nas/config'),
      await developer.post('/api/nas/test-connection'),
      await developer.get('/api/nas/files'),
    ]) {
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ELEVATION_REQUIRED');
    }
  });

  it('will not verify a code that was never issued', async () => {
    const res = await developer.post('/api/nas/elevation/verify').send({ code: '000000' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NO_PENDING_CODE');
  });

  it('reports the developer as unelevated', async () => {
    const res = await developer.get('/api/nas/elevation');
    expect(res.status).toBe(200);
    expect(res.body.elevated).toBe(false);
  });
});
