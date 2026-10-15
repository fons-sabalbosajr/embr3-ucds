import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';

import app from '../app.js';
import activation from '../services/nasActivation.js';
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
// A Planning Admin who does hold the ERMS domain: may read the record, may
// not open its document without the Records Unit's approval.
const PLANNING_ERMS = '__test_nas_planning_erms';
const DEVELOPER = '__test_nas_dev';
const USERNAMES = [RECORDS, PLANNING, PLANNING_ERMS, DEVELOPER];

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
let planningErms;
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
    base(PLANNING_ERMS, { password, permission: 'planning', domains: ['ucds', 'erms'], nasContainers: ['records'], bataan: 'readWrite' }),
    base(DEVELOPER, { password, permission: 'developer' }),
  ]);
  await getDb().collection('erms-access-requests').deleteMany({ serialNo: { $in: [SERIAL_IN_SCOPE, SERIAL_NO_DOC] } });

  const col = getDb().collection('erms-records');
  await col.deleteMany({ serialNo: { $in: [SERIAL_IN_SCOPE, SERIAL_OUT_OF_SCOPE, SERIAL_NO_DOC] } });
  await col.insertMany([
    // Points at a path that will not exist on the share. The endpoint's job is
    // to authorise and resolve; whether the scan is filed is a data question.
    recordDoc(SERIAL_IN_SCOPE, 'bataan', 'RECORDS\\__test\\nothing-here.pdf'),
    recordDoc(SERIAL_OUT_OF_SCOPE, 'aurora', 'RECORDS\\__test\\nothing-here.pdf'),
    recordDoc(SERIAL_NO_DOC, 'bataan', null),
  ]);

  // These assert authorization and record scoping, so document access has to
  // be switched on: otherwise every one of them returns 503 NAS_INACTIVE and
  // proves nothing about who may read what.
  //
  // tests/setup.js snapshots app-config for the whole run and restores it
  // afterwards, so this no longer overwrites the deployment's real activation
  // window. It used to, which reset a 30-day setting to one hour on every run.
  await getDb()
    .collection(activation.COLLECTION)
    .updateOne(
      { _id: activation.DOC_ID },
      { $set: { enabled: true, startsAt: new Date(Date.now() - 60000), endsAt: new Date(Date.now() + 3600000) } },
      { upsert: true }
    );

  [records, planning, planningErms, developer] = await Promise.all([
    signIn(RECORDS),
    signIn(PLANNING),
    signIn(PLANNING_ERMS),
    signIn(DEVELOPER),
  ]);
}, 90000);

afterAll(async () => {
  await collections.users.deleteMany({ username: { $in: USERNAMES } });
  await collections['loginStatus'].deleteMany({ username: { $in: USERNAMES } });
  await getDb().collection('erms-access-requests').deleteMany({ serialNo: { $in: [SERIAL_IN_SCOPE, SERIAL_NO_DOC] } });
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
    ]) {
      const res = await request(app).get(path);
      expect(res.status).toBe(401);
    }
  });

  it('has no download: documents are viewed, never handed over as files', async () => {
    const res = await records.get(`/api/erms/records/${SERIAL_IN_SCOPE}/file/download`);
    expect(res.status).toBe(404);
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

describe('who may open a document', () => {
  const file = `/api/erms/records/${SERIAL_IN_SCOPE}/file`;

  it('refuses a Planning Admin and points them to the Document Portal', async () => {
    const res = await planningErms.get(file);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('APPROVAL_REQUIRED');
    expect(res.body.reason).toBe('portal');
    expect(res.body.portalUrl).toBe('/e-universe/document-portal');
  });

  it('lets the Records Unit past the gate', async () => {
    // Past the gate the answer is whatever the share says about the file
    // (here: not filed), never APPROVAL_REQUIRED.
    const open = await records.get(file);
    expect(open.body.code).not.toBe('APPROVAL_REQUIRED');
  });

  it('no longer has an in-app request inbox — asking is done in the portal', async () => {
    expect((await planningErms.post(`/api/erms/records/${SERIAL_IN_SCOPE}/access-request`).send({})).status).toBe(404);
    expect((await records.get('/api/erms/access-requests')).status).toBe(404);
    expect((await records.patch(`/api/erms/access-requests/${'0'.repeat(24)}`).send({ decision: 'approved' })).status).toBe(404);
    expect((await records.post(`/api/erms/access-requests/${'0'.repeat(24)}/revoke`).send({})).status).toBe(404);
    expect((await records.post(`/api/erms/records/${SERIAL_IN_SCOPE}/full-access-request`).send({})).status).toBe(404);
  });
});

describe('a Planning Admin without ERMS, from the planning screens', () => {
  // The establishment panel on a UCDS screen reaches the same document and
  // the same rule through the UCDS-domain routes; the ERMS routes still
  // refuse an account that holds only UCDS.
  const file = `/api/ucds/records/${SERIAL_IN_SCOPE}/file`;

  it('is pointed to the Document Portal, and has no request route here either', async () => {
    expect((await planning.get(`/api/erms/records/${SERIAL_IN_SCOPE}/file`)).status).toBe(403);

    const before = await planning.get(file);
    expect(before.status).toBe(403);
    expect(before.body.code).toBe('APPROVAL_REQUIRED');
    expect(before.body.reason).toBe('portal');

    expect((await planning.post(`/api/ucds/records/${SERIAL_IN_SCOPE}/access-request`).send({})).status).toBe(404);
    expect((await planning.get('/api/ucds/access-requests')).status).toBe(404);
  });
});

describe('sharing is gone — requests go through the Document Portal', () => {
  it('no longer offers the Records Unit a way to push a document to a person', async () => {
    expect((await records.get(`/api/erms/share/people?q=${PLANNING}`)).status).toBe(404);
    expect((await records.post(`/api/erms/records/${SERIAL_NO_DOC}/share`).send({ userId: '0'.repeat(24) })).status).toBe(404);
  });
});

describe('a record’s tracking reads the desktop system’s log', () => {
  it('lists the custody trail and, for a migrated record, the legacy events', async () => {
    const res = await records.get(`/api/erms/records/${SERIAL_IN_SCOPE}/tracking`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.tracking)).toBe(true);
    // The test record has no legacy log; a migrated one does when the
    // legacy tables were loaded. Either way the shape is one timeline.
    for (const t of res.body.tracking) expect(['custody', 'legacy', 'activity', 'portal']).toContain(t.source);
  });
});

describe('the folder picker', () => {
  it('lists, makes and removes folders only for the unit’s own staff', async () => {
    // A UCDS-only account holds no ERMS domain at all.
    expect((await planning.get('/api/erms/units/records/folders?province=bataan')).status).toBe(403);
    // A Planning Admin with ERMS reads the register but does not file into it.
    const notStaff = await planningErms.get('/api/erms/units/records/folders?province=bataan');
    expect(notStaff.status).toBe(403);
    expect(notStaff.body.code).toBe('UNIT_WRITE_FORBIDDEN');
    // The Records Unit may: the answer is the share's (unreachable here) or a listing.
    const staff = await records.get('/api/erms/units/records/folders?province=bataan&date=2024-03-01&hint=Test%20project');
    expect([200, 502, 503]).toContain(staff.status);
    if (staff.status === 200) {
      expect(staff.body.applicable).toBe(true);
      expect(staff.body.parent).toMatch(/Bataan\\2021-2025\\2024$/);
      expect(staff.body.suggested).toBe('Test project');
      expect(Array.isArray(staff.body.folders)).toBe(true);
    }
    expect((await records.post('/api/erms/units/records/folders').send({ province: 'bataan', name: '' })).status).toBe(400);
  });
});

describe('the desktop system’s menus', () => {
  it('serves the lookups to ERMS users, with the address lists per province', async () => {
    const res = await records.get('/api/erms/lookups?province=bataan');
    expect(res.status).toBe(200);
    for (const key of ['projectTypes', 'documentStatuses', 'legalStatuses', 'cities', 'barangays']) {
      expect(Array.isArray(res.body[key])).toBe(true);
    }
    // Loaded by scripts/migrate-erms/legacy-sql/load.js; when it has run, the
    // lists are the desktop system's and scoped to the province asked for.
    if (res.body.cities.length) {
      expect(res.body.cities.every((c) => c.province === 'bataan')).toBe(true);
      expect(res.body.barangays.every((b) => b.province === 'bataan')).toBe(true);
    }
    const refused = await planning.get('/api/erms/lookups');
    expect(refused.status).toBe(403);
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
      expect((await agent.get('/api/nas/browse')).status).toBe(403);
    }
  });

  it('refuses a developer who has not verified by email', async () => {
    for (const res of [
      await developer.get('/api/nas/config'),
      await developer.post('/api/nas/test-connection'),
      await developer.get('/api/nas/browse'),
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
