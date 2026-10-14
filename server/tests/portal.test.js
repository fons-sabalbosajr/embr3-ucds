import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import http from 'node:http';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { io as connect } from 'socket.io-client';
import { createRequire } from 'node:module';

import app from '../app.js';
import db from '../config/db.js';

const require = createRequire(import.meta.url);
const { ObjectId } = require('mongodb');
const { setupSocket } = require('../socket.js');
const notifier = require('../services/notifier.js');
const portal = require('../modules/portal/services/portalService.js');
const portalTerms = require('../modules/portal/services/portalTerms.js');
const portalSettings = require('../modules/portal/services/portalSettings.js');
const portalChat = require('../modules/portal/services/portalChat.js');
const { connectToMongo, collections, getDb } = db;

// ---------------------------------------------------------------------------
// The E-Universe Document Portal (modules/portal).
//
// The public page, without accounts:
//   - anyone may look at the room, search and ask — no session
//   - asking needs the portal's header; the browser is given an httpOnly
//     ticket, and only that browser reaches the request afterwards
//   - the room shows others a name, a designation and a clock — not the
//     document or the purpose
//   - one request per browser, a few per address; the 51st person waits in
//     line with an estimate and is seated when a seat frees
//   - the document is served to the approved browser alone, and stops at the
//     second the approval ends
// The Records Unit's desk, inside E-Universe:
//   - only the Records Unit decides; pages are checked as typed
//   - the Records Unit hears of a request at once, the requester's page hears
//     the decision, and every open room is told to look again
// ---------------------------------------------------------------------------

const PASSWORD = 'PortalTestPw!x9';
const RECORDS = '__test_portal_records';
const LEGAL = '__test_portal_legal';
const PLANNER = '__test_portal_planner';
const DEV = '__test_portal_dev';
const LAB = '__test_portal_lab';
const USERNAMES = [RECORDS, LEGAL, PLANNER, DEV, LAB];
const SERIAL_LEGAL = '__TEST-PORTAL-LEGAL';
const SERIAL_LAB = '__TEST-PORTAL-LAB';
const SERIAL = '__TEST-PORTAL-1';
const SERIAL_NO_SCAN = '__TEST-PORTAL-2';
const NAME = /^__Test Portal /;

const base = (username, extra) => ({
  username, name: `Name of ${username}`, email: `${username}@test.local`, division: 'TEST', status: 'offline', assignedYears: [2025],
  aurora: 'none', bataan: 'view', bulacan: 'none', nuevaEcija: 'none', pampanga: 'none', tarlac: 'none', zambales: 'none',
  ...extra,
});

let server;
let url;
const staff = {};
const staffInbox = {};
const sockets = [];

// A "browser": its own cookie jar, so its own ticket.
const browser = () => request.agent(app);
const browsers = { alice: browser(), bob: browser(), carol: browser() };

const ask = (agent, over = {}) =>
  agent
    .post('/api/portal/requests')
    .set('X-Portal-Request', '1')
    .send({
      serialNo: SERIAL,
      requesterName: '__Test Portal Alice',
      requesterType: 'emb-employee',
      designation: 'Environmental Impact Assessment Section',
      purpose: 'Checking the ECC conditions for an inspection.',
      desiredMinutes: 60,
      termsVersion: portalTerms.TERMS_VERSION,
      acceptPrivacy: true,
      ...over,
    });

const ticketCookie = (res) => (res.headers['set-cookie'] || []).find((c) => c.startsWith(`${portal.TICKET_COOKIE}=`));

async function signIn(username) {
  const agent = request.agent(app);
  const res = await agent.post('/login').send({ username, password: PASSWORD });
  expect(res.status).toBe(200);
  staff[username] = agent;
  return res.body.sessionToken;
}

async function socketFor({ token, cookie } = {}) {
  const socket = connect(url, { auth: token ? { token } : {}, extraHeaders: cookie ? { cookie } : {}, transports: ['websocket'], forceNew: true });
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  sockets.push(socket);
  return socket;
}

/** A portal page: watching the room, and — with its ticket — its own request. */
async function portalPage(cookie) {
  const socket = await socketFor({ cookie });
  const page = { pings: 0, mine: [] };
  socket.on('portal:room', () => {
    page.pings += 1;
  });
  socket.on('portal:mine', (n) => page.mine.push(n));
  page.chat = [];
  socket.on('portal:chat', (n) => page.chat.push(n));
  page.ack = await new Promise((resolve) => socket.emit('portal:watch', {}, resolve));
  return page;
}

const settle = (ms = 300) => new Promise((r) => setTimeout(r, ms));
async function waitFor(check, ms = 4000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (check()) return true;
    await settle(50);
  }
  return check();
}

const requests = () => getDb().collection(portal.COLLECTION);
const cookies = {};
let savedRoomSettings;

const cleanUp = async () => {
  await collections.users.deleteMany({ username: { $in: USERNAMES } });
  await collections.loginStatus.deleteMany({ username: { $in: USERNAMES } });
  await getDb().collection('erms-records').deleteMany({ serialNo: { $in: [SERIAL, SERIAL_NO_SCAN] } });
  await getDb().collection('erms-documents').deleteMany({ serialNo: { $in: [SERIAL_LEGAL, SERIAL_LAB] } });
  await getDb().collection(portalChat.COLLECTION).deleteMany({ requesterName: NAME });
  await requests().deleteMany({ requesterName: NAME });
  await getDb().collection('app-logs').deleteMany({ targetCollection: portal.COLLECTION, 'changes.requesterName': NAME });
};

beforeAll(async () => {
  await connectToMongo();
  await cleanUp();
  await portal.ensureIndexes();
  await portalChat.ensureIndexes();
  // The room is open whatever day the tests run; the weekend rule is tested on its own.
  savedRoomSettings = await getDb().collection('app-config').findOne({ _id: 'portal-settings' });
  await getDb().collection('app-config').updateOne({ _id: 'portal-settings' }, { $set: { closedOnWeekends: false, watermark: false } }, { upsert: true });
  portalSettings.forget();
  const password = await bcrypt.hash(PASSWORD, 4);
  await collections.users.insertMany([
    base(RECORDS, { password, permission: 'records', ermsUnit: 'records', domains: ['erms'] }),
    base(LEGAL, { password, permission: 'records', ermsUnit: 'legal', domains: ['erms'] }),
    base(PLANNER, { password, permission: 'planning', domains: ['ucds'] }),
    base(DEV, { password, permission: 'developer', domains: ['ucds', 'erms', 'admin'] }),
    base(LAB, { password, permission: 'records', ermsUnit: 'laboratory', domains: ['erms'] }),
  ]);
  await getDb().collection('erms-records').insertMany([
    { serialNo: SERIAL, proponentName: 'Portal Test Firm', projectTitle: 'Portal Test Project', permit: { type: 'ecc-original', number: '__PORTAL-ECC-1' }, location: { province: 'bataan' }, document: { fileName: 'secret-scan-name.pdf', sharePath: 'PORTAL\\secret-scan-name.pdf' } },
    { serialNo: SERIAL_NO_SCAN, proponentName: 'Portal Test Firm', projectTitle: 'No scan', permit: { type: 'cnc' }, location: { province: 'bataan' }, document: {} },
  ]);
  await getDb().collection('erms-documents').insertMany([
    { unit: 'legal', serialNo: SERIAL_LEGAL, docType: 'nov', title: 'Portal Legal Case', fields: { docketNo: '__LEGAL-DKT-1' }, province: 'bataan', document: { fileName: 'legal-scan.pdf', sharePath: 'LEGAL\\legal-scan.pdf' }, createdAt: new Date() },
    { unit: 'laboratory', serialNo: SERIAL_LAB, docType: 'ltr', title: 'Portal Lab Report', fields: { referenceNo: '__LAB-REF-1' }, province: 'bataan', document: { fileName: 'lab-scan.pdf', sharePath: 'LAB\\lab-scan.pdf' }, createdAt: new Date() },
  ]);

  server = http.createServer(app);
  const io = setupSocket(server, ['http://localhost']);
  notifier.attach(io, app.locals.sessionStore);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${server.address().port}`;

  for (const username of USERNAMES) {
    const token = await signIn(username);
    const socket = await socketFor({ token });
    staffInbox[username] = [];
    socket.on('notify', (n) => staffInbox[username].push(n));
    // Wait until the server has placed the socket in its account's room.
    const ack = await new Promise((resolve) => socket.emit('notify:identify', { token }, resolve));
    expect(ack.ok).toBe(true);
  }
}, 90000);

afterAll(async () => {
  for (const s of sockets) s.close();
  await new Promise((resolve) => server?.close(resolve));
  await cleanUp();
  const config = getDb().collection('app-config');
  if (savedRoomSettings) await config.replaceOne({ _id: 'portal-settings' }, savedRoomSettings);
  else await config.deleteOne({ _id: 'portal-settings' });
  portalSettings.forget();
}, 60000);

describe('the public page', () => {
  it('needs no sign-in to look at the room or search', async () => {
    // The terms the page shows: who may ask, FOI and Data Privacy.
    const termsRes = await request(app).get('/api/portal/terms');
    expect(termsRes.status).toBe(200);
    expect(termsRes.body.version).toBe(portalTerms.TERMS_VERSION);
    expect(termsRes.body.requesterTypes.map((t) => t.value)).toEqual(['emb-employee', 'government', 'student', 'citizen']);
    expect(termsRes.body.foi.title).toMatch(/Executive Order No\. 2/);
    expect(termsRes.body.privacy.title).toMatch(/Republic Act No\. 10173/);

    const room = await request(app).get('/api/portal/room');
    expect(room.status).toBe(200);
    expect(room.body).toMatchObject({ capacity: portal.CAPACITY, mine: null });
    // Suggestions for the Designation box: HRPMS's units, or the built-in few without it.
    expect(room.body.designations.map((d) => d.abbreviation)).toEqual(expect.arrayContaining(['PISMU', 'AMTSS', 'EIA']));

    const res = await request(app).get('/api/portal/search').query({ q: 'Portal Test Firm' });
    expect(res.status).toBe(200);
    const serials = res.body.results.map((r) => r.serialNo);
    expect(serials).toContain(SERIAL);
    expect(serials).not.toContain(SERIAL_NO_SCAN);
    expect(JSON.stringify(res.body)).not.toContain('secret-scan-name');
  });

  it('takes a request only from the portal page, and checks the form', async () => {
    const noHeader = await browsers.alice.post('/api/portal/requests').send({ serialNo: SERIAL, requesterName: 'X Y', designation: 'EIA', purpose: 'Something.', desiredMinutes: 60 });
    expect(noHeader.status).toBe(403);
    expect(noHeader.body.code).toBe('PORTAL_HEADER_REQUIRED');
    expect((await ask(browsers.alice, { designation: 'X' })).status).toBe(400);
    expect((await ask(browsers.alice, { requesterType: 'alien' })).status).toBe(400);
    // Everyone accepts the Data Privacy terms, in the version the page showed.
    expect((await ask(browsers.alice, { acceptPrivacy: false })).body.code).toBe('TERMS_NOT_ACCEPTED');
    expect((await ask(browsers.alice, { termsVersion: '1999-01-01' })).body.code).toBe('TERMS_CHANGED');
    // A member of the public asks under FOI: contact details, a valid ID, and the FOI terms too.
    const citizen = { requesterType: 'citizen', designation: 'Resident of Bataan' };
    expect((await ask(browsers.alice, { ...citizen, contact: 'nope' })).body.code).toBe('CONTACT_REQUIRED');
    expect((await ask(browsers.alice, { ...citizen, contact: '09171234567', idType: 'Library card' })).body.code).toBe('ID_TYPE_REQUIRED');
    expect((await ask(browsers.alice, { ...citizen, contact: '09171234567', idType: 'Passport' })).body.code).toBe('TERMS_NOT_ACCEPTED');
    expect((await ask(browsers.alice, { desiredMinutes: 7 })).status).toBe(400);
    expect((await ask(browsers.alice, { purpose: '' })).status).toBe(400);
    expect((await ask(browsers.alice, { serialNo: SERIAL_NO_SCAN })).body.code).toBe('NO_DOCUMENT');
  });

  it('seats the person, hands the browser an httpOnly ticket, and tells the Records Unit and every open room', async () => {
    const watcher = await portalPage();
    expect(watcher.ack.ok).toBe(true);

    const res = await ask(browsers.alice);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.request.status).toBe('pending');
    expect(res.body.position).toBeNull();
    const cookie = ticketCookie(res);
    expect(cookie).toMatch(/HttpOnly/i);
    cookies.alice = cookie.split(';')[0];
    // The ticket itself is never stored, only its hash.
    const stored = await requests().findOne({ _id: new ObjectId(res.body.request.id) });
    expect(stored.ticketHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(cookies.alice.split('=')[1]);

    expect(await waitFor(() => staffInbox[RECORDS].some((n) => n.kind === 'portal-request'))).toBe(true);
    const notice = staffInbox[RECORDS].find((n) => n.kind === 'portal-request');
    expect(notice).toMatchObject({ url: '/universe/erms/portal-requests' });
    // The document is named by its ECC reference number and project title.
    expect(notice.body).toContain('__PORTAL-ECC-1 — Portal Test Project');
    expect(res.body.request.permitNumber).toBe('__PORTAL-ECC-1');
    expect(await waitFor(() => watcher.pings > 0)).toBe(true);
    await settle();
    expect(staffInbox[PLANNER].some((n) => n.kind === 'portal-request')).toBe(false);
  });

  it('holds one request per browser', async () => {
    const again = await ask(browsers.alice);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('ALREADY_IN_ROOM');
  });

  it('hides people from each other — only ERMS staff and the Developer see who is who', async () => {
    // Another visitor: unnamed seats and clocks; no name, designation, document or purpose.
    const theirs = await browsers.bob.get('/api/portal/room');
    expect(theirs.body.named).toBe(false);
    expect(theirs.body.seats.every((s) => s.name === null && s.designation === null)).toBe(true);
    const text = JSON.stringify(theirs.body);
    expect(text).not.toContain('__Test Portal Alice');
    expect(JSON.stringify(theirs.body.seats)).not.toContain('Environmental Impact Assessment Section');
    expect(text).not.toContain(SERIAL);
    expect(text).not.toContain('inspection');
    expect(theirs.body.mine).toBeNull();

    // A signed-in ERMS user sees the names; a Planning account without ERMS does not.
    const staffView = await staff[RECORDS].get('/api/portal/room');
    expect(staffView.body.named).toBe(true);
    expect(staffView.body.seats.find((s) => s.name === '__Test Portal Alice')).toMatchObject({ designation: 'Environmental Impact Assessment Section', status: 'pending', mine: false });
    expect((await staff[PLANNER].get('/api/portal/room')).body.seats.some((s) => s.name)).toBe(false);

    // The requester sees their own seat, named.
    const mine = await browsers.alice.get('/api/portal/room');
    expect(mine.body.mine).toMatchObject({ serialNo: SERIAL, status: 'pending' });
    expect(mine.body.seats.find((s) => s.name === '__Test Portal Alice').mine).toBe(true);
    // Not the file's name on the share, not the network details.
    expect(JSON.stringify(mine.body.mine)).not.toContain('secret-scan-name');
    expect(mine.body.mine.client).toBeUndefined();
  });

  it('serves no document before approval, and none to a browser without the ticket', async () => {
    const before = await browsers.alice.get('/api/portal/document');
    expect(before.status).toBe(403);
    expect(before.body.code).toBe('NOT_APPROVED');
    expect((await browsers.bob.get('/api/portal/document')).body.code).toBe('NO_REQUEST');
    // A made-up ticket is no ticket.
    const forged = await request(app).get('/api/portal/document').set('Cookie', `${portal.TICKET_COOKIE}=${'A'.repeat(43)}`);
    expect(forged.body.code).toBe('NO_REQUEST');
  });

  it('limits how many requests one computer holds at once', async () => {
    // Bob is a private citizen: he asks under FOI, accepting both sets of terms.
    const bob = await ask(browsers.bob, {
      requesterName: '__Test Portal Bob',
      requesterType: 'citizen',
      designation: 'Resident of Balanga, Bataan',
      contact: 'bob@example.com',
      idType: 'Passport',
      acceptFoi: true,
    });
    expect(bob.status, JSON.stringify(bob.body)).toBe(201);
    // Even to ERMS staff, the room says what kind of requester he is, not where he lives.
    const seen = (await staff[RECORDS].get('/api/portal/room')).body.seats.find((s) => s.name === '__Test Portal Bob');
    expect(seen.designation).toBe('Private citizen');
    expect(JSON.stringify(seen)).not.toContain('Balanga');
    // A custom duration is accepted; more than 30 days is not.
    expect(bob.body.request.desiredMinutes).toBe(60);
    expect((await ask(browser(), { requesterName: '__Test Portal Eve', desiredMinutes: 31 * 24 * 60 })).status).toBe(400);
    expect((await ask(browsers.carol, { requesterName: '__Test Portal Carol' })).status).toBe(201);
    const fourth = await ask(browser(), { requesterName: '__Test Portal Dave' });
    expect(fourth.status).toBe(429);
    expect(fourth.body.code).toBe('TOO_MANY_FROM_ADDRESS');
    // Carol leaves; the seat and the address's allowance free up.
    expect((await browsers.carol.post('/api/portal/leave').set('X-Portal-Request', '1')).status).toBe(200);
    expect((await browsers.carol.post('/api/portal/leave').set('X-Portal-Request', '1')).status).toBe(404);
  });
});

describe('VERA on the portal', () => {
  it('is there without sign-in, introduces herself, and stays on the portal’s subject', async () => {
    const status = await request(app).get('/api/vera/public-status').query({ page: 'document-portal' });
    expect(status.status).toBe(200);
    expect(status.body).toMatchObject({ available: true, introduce: true });
    expect(status.body.welcomeMessage).toMatch(/Document Portal/);
    // Her introduction (the first paragraph) is short, and about every office document — not one unit's.
    const intro = status.body.welcomeMessage.split('\n\n')[0];
    expect(intro.length).toBeLessThan(200);
    expect(intro).toMatch(/EMB Region III document/);
    expect(intro).not.toMatch(/Records Unit|ECC/);
    expect(status.body.starters).toContain('How do I request a document?');

    const ask = (message) => request(app).post('/api/vera/public-chat').send({ message, page: 'document-portal' });
    // Portal questions are answered — finding any kind of office document by its number or title.
    expect((await ask('How do I request a document?')).body.answer).toMatch(/reference or docket number/);
    expect((await ask('Can I download or print the document?')).body.answer).toMatch(/view only/i);
    // She sees no request, document or person.
    expect((await ask('Is my request for ECC-OL-R03-2020-0001 approved?')).body.answer).toMatch(/can't look up/i);
    expect((await ask('What is the admin password?')).body.source).toBe('guard');
  });

  it('gives a public visitor no counts — only the office website — and staff the exact figures', async () => {
    const ask = (message, page = 'document-portal') => request(app).post('/api/vera/public-chat').send({ message, page });
    for (const q of ['How many documents are in the portal?', 'What is the total number of ECC permits?', 'Ilan ang requests ngayon?']) {
      const res = await ask(q);
      expect(res.body.source, q).toBe('guard');
      expect(res.body.answer).toMatch(/https:\/\/r3\.emb\.gov\.ph/);
      expect(res.body.answer).not.toMatch(/\d+\s+(documents?|requests?|permits?)/i);
    }
    // Not every "how much" is a count.
    expect((await ask('How much does it cost?')).body.source).not.toBe('guard');

    // A signed-in member of the unit gets the exact numbers for its own requests.
    const pending = await requests().countDocuments({ status: 'pending', $or: [{ source: 'records' }, { source: { $exists: false } }] });
    const res = await staff[RECORDS].post('/api/vera/chat').send({ message: 'How many portal requests are awaiting a decision?', page: 'portal-desk' });
    expect(res.status).toBe(200);
    if (res.body.source !== 'model') expect(res.body.answer).toContain(`Awaiting a decision: ${pending}`);
  });
});

describe('the Records Unit desk', () => {
  let aliceId;

  it('is the Records Unit’s, inside E-Universe', async () => {
    expect((await request(app).get('/api/erms/portal/desk')).status).toBe(401);
    expect((await staff[PLANNER].get('/api/erms/portal/desk')).status).toBe(403);
    // Legal Services decides its own documents' requests — and sees none of the Records Unit's.
    const legal = await staff[LEGAL].get('/api/erms/portal/desk');
    expect(legal.status).toBe(200);
    expect(legal.body.sources).toEqual(['legal']);
    expect(legal.body.pending.some((r) => r.serialNo === SERIAL)).toBe(false);
    const desk = await staff[RECORDS].get('/api/erms/portal/desk');
    expect(desk.status).toBe(200);
    const alice = desk.body.pending.find((r) => r.requesterName === '__Test Portal Alice');
    expect(alice).toMatchObject({ serialNo: SERIAL, purpose: 'Checking the ECC conditions for an inspection.', fileName: 'secret-scan-name.pdf' });
    expect(alice.client.ip).toBeTruthy();
    expect(alice.ticketHash).toBeUndefined();
    // An employee accepted the Data Privacy terms only, and gave no contact or ID.
    expect(alice.consents).toMatchObject({ version: portalTerms.TERMS_VERSION, privacy: true });
    expect(alice.consents.foi).toBeUndefined();
    expect(alice.contact).toBeNull();
    // A citizen's FOI details are the Records Unit's to see.
    const bobRow = desk.body.pending.find((r) => r.requesterName === '__Test Portal Bob');
    expect(bobRow).toMatchObject({ requesterType: 'citizen', designation: 'Resident of Balanga, Bataan', contact: 'bob@example.com', idType: 'Passport', consents: { foi: true, privacy: true } });
    aliceId = alice.id;
    // The day's figures, for the ERMS dashboard.
    expect(desk.body.today.requested).toBeGreaterThanOrEqual(1);
    expect(desk.body.capacity).toBe(portal.CAPACITY);
  });

  it('checks the pages as typed, approves, and tells the requester’s page at once', async () => {
    const page = await portalPage(cookies.alice);
    expect(page.ack.mine).toBe(true);

    const badPages = await staff[RECORDS].patch(`/api/erms/portal/requests/${aliceId}`).send({ decision: 'approved', minutes: 60, allPages: false, pages: 'all of them' });
    expect(badPages.status).toBe(400);
    expect((await staff[RECORDS].patch(`/api/erms/portal/requests/${aliceId}`).send({ decision: 'approved', minutes: 5 })).status).toBe(400);
    expect((await staff[LEGAL].patch(`/api/erms/portal/requests/${aliceId}`).send({ decision: 'approved', minutes: 60 })).status).toBe(404);

    const ok = await staff[RECORDS].patch(`/api/erms/portal/requests/${aliceId}`).send({ decision: 'approved', minutes: 4320, allPages: false, pages: '3, 1-2, 9' });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.request).toMatchObject({ status: 'approved', grantedMinutes: 4320, pages: { all: false, list: [1, 2, 3, 9], spec: '1-3, 9' } });
    expect(new Date(ok.body.request.expiresAt) - Date.now()).toBeGreaterThan(71 * 3600000);
    expect(await waitFor(() => page.mine.some((n) => n.status === 'approved'))).toBe(true);

    // Decided once.
    expect((await staff[RECORDS].patch(`/api/erms/portal/requests/${aliceId}`).send({ decision: 'declined' })).status).toBe(409);
  });

  it('ends access 24 hours after the document is first opened', async () => {
    const page = await portalPage(cookies.alice);
    const before = await requests().findOne({ _id: new ObjectId(aliceId) });
    expect(before.firstViewedAt ?? null).toBeNull();
    // Approved for three days; opened now.
    const ends = await portal.recordView(aliceId);
    expect(ends.getTime() - Date.now()).toBeLessThanOrEqual(24 * 3600000 + 1000);
    expect(ends.getTime() - Date.now()).toBeGreaterThan(23 * 3600000);
    const after = await requests().findOne({ _id: new ObjectId(aliceId) });
    expect(after.firstViewedAt).toBeTruthy();
    expect(after.views).toBe(1);
    // The requester's page is told at once.
    expect(await waitFor(() => page.mine.some((n) => /24 hours/.test(n.title || '')))).toBe(true);
    // A later opening counts, and changes nothing else.
    await portal.recordView(aliceId);
    const again = await requests().findOne({ _id: new ObjectId(aliceId) });
    expect(again.views).toBe(2);
    expect(again.expiresAt.getTime()).toBe(after.expiresAt.getTime());
    expect(again.firstViewedAt.getTime()).toBe(after.firstViewedAt.getTime());
    // Her page sees when it was first opened.
    expect((await browsers.alice.get('/api/portal/room')).body.mine.firstViewedAt).toBeTruthy();
  });

  it('lets only the Developer change an approved seat — time, pages, download — and keeps each change', async () => {
    // No download unless the Developer allows it for this seat; there is no switch for everyone.
    const refused = await browsers.alice.get('/api/portal/document').query({ download: '1' });
    expect([403, 503]).toContain(refused.status);
    if (refused.status === 403) expect(refused.body.code).toBe('DOWNLOAD_NOT_ALLOWED');
    expect((await staff[DEV].put('/api/erms/portal/settings').send({ allowDownload: true })).body.allowDownload).toBeUndefined();
    expect((await browsers.alice.get('/api/portal/room')).body.viewer).toBeUndefined();

    // The Records Unit cannot; the Developer can.
    expect((await staff[DEV].get('/api/erms/portal/desk')).body.canAdjustAccess).toBe(true);
    expect((await staff[RECORDS].get('/api/erms/portal/desk')).body.canAdjustAccess).toBe(false);
    const refusedToRecords = await staff[RECORDS].patch(`/api/erms/portal/requests/${aliceId}/access`).send({ downloadAllowed: true });
    expect(refusedToRecords.status).toBe(403);
    expect(refusedToRecords.body.code).toBe('DEVELOPER_ONLY');
    expect((await staff[DEV].patch(`/api/erms/portal/requests/${aliceId}/access`).send({})).body.code).toBe('NOTHING_TO_CHANGE');

    const page = await portalPage(cookies.alice);
    const changed = await staff[DEV]
      .patch(`/api/erms/portal/requests/${aliceId}/access`)
      .send({ minutes: 120, allPages: false, pages: '1-2', downloadAllowed: true, note: 'Needs the file for the hearing.' });
    expect(changed.status, JSON.stringify(changed.body)).toBe(200);
    expect(changed.body.request).toMatchObject({ downloadAllowed: true, pages: { all: false, spec: '1-2' } });
    expect(new Date(changed.body.request.expiresAt) - Date.now()).toBeGreaterThan(119 * 60000);
    const adjustment = changed.body.request.adjustments.at(-1);
    expect(adjustment).toMatchObject({ by: { username: DEV }, changes: { timeLeft: '2 hours', pages: '1-2', download: 'allowed' }, note: 'Needs the file for the hearing.' });
    expect(await waitFor(() => page.mine.some((n) => n.title === 'Your access was updated'))).toBe(true);
    expect((await browsers.alice.get('/api/portal/room')).body.mine.downloadAllowed).toBe(true);
    // Past the download check: what comes back is whatever the share says.
    const taken = await browsers.alice.get('/api/portal/document').query({ download: '1' });
    expect(taken.body?.code).not.toBe('DOWNLOAD_NOT_ALLOWED');
    // Only an approved seat: Bob is still waiting for a decision.
    const bobRow = (await staff[DEV].get('/api/erms/portal/desk')).body.pending.find((r) => r.requesterName === '__Test Portal Bob');
    expect((await staff[DEV].patch(`/api/erms/portal/requests/${bobRow.id}/access`).send({ downloadAllowed: true })).body.code).toBe('NOT_APPROVED');
  });

  it('filters the desk', async () => {
    const desk = (query) => staff[RECORDS].get('/api/erms/portal/desk').query(query);
    const names = (body) => [...body.pending, ...body.approved, ...body.waiting, ...body.history].map((r) => r.requesterName);
    expect(names((await desk({ q: 'Portal Bob' })).body)).toEqual(expect.arrayContaining(['__Test Portal Bob']));
    expect(names((await desk({ q: 'Portal Bob' })).body)).not.toContain('__Test Portal Alice');
    expect(names((await desk({ requesterType: 'citizen' })).body).every((n) => n !== '__Test Portal Alice')).toBe(true);
    expect(names((await desk({ q: '__PORTAL-ECC-1' })).body).length).toBeGreaterThan(0);
    expect(names((await desk({ q: '__PORTAL-ECC-1', permitTypes: 'cnc' })).body)).toHaveLength(0);
    expect(names((await desk({ q: '__PORTAL-ECC-1', permitTypes: 'ecc-original' })).body).length).toBeGreaterThan(0);
    expect(names((await desk({ q: 'Portal', from: '2999-01-01' })).body)).toHaveLength(0);
    // The history narrowed to one outcome.
    const left = (await desk({ outcome: 'left' })).body;
    expect(left.history.every((r) => r.status === 'left')).toBe(true);
    expect(left.history.some((r) => r.requesterName === '__Test Portal Carol')).toBe(true);
  });

  it('opens the document for the approved browser alone, then not at all once the time is up', async () => {
    // Past the approval check: what comes back is whatever the share says.
    const opened = await browsers.alice.get('/api/portal/document');
    expect(['NOT_APPROVED', 'EXPIRED', 'NO_REQUEST']).not.toContain(opened.body?.code);
    expect((await browsers.bob.get('/api/portal/document')).body.code).toBe('NOT_APPROVED');

    await requests().updateOne({ _id: new ObjectId(aliceId) }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const late = await browsers.alice.get('/api/portal/document');
    expect(late.status).toBe(403);
    expect(late.body.code).toBe('EXPIRED');

    const page = await portalPage(cookies.alice);
    await portal.sweep();
    const room = await browsers.bob.get('/api/portal/room');
    expect(room.body.seats.some((s) => s.name === '__Test Portal Alice')).toBe(false);
    expect(await waitFor(() => page.mine.some((n) => n.status === 'expired'))).toBe(true);
    // Her browser is told how it ended, and may ask again.
    expect((await browsers.alice.get('/api/portal/room')).body.last).toMatchObject({ status: 'expired' });
    expect((await ask(browsers.alice)).status).toBe(201);
  });

  it('lets the Records Unit end someone’s access early', async () => {
    const bob = (await staff[RECORDS].get('/api/erms/portal/desk')).body.pending.find((r) => r.requesterName === '__Test Portal Bob');
    const ended = await staff[RECORDS].post(`/api/erms/portal/requests/${bob.id}/revoke`).send({ note: 'Not needed.' });
    expect(ended.status).toBe(200);
    expect(ended.body.request.status).toBe('revoked');
    expect((await browsers.bob.get('/api/portal/room')).body.mine).toBeNull();
  });

  it('keeps every ending in the history — how, by whom, and in the audit trail', async () => {
    const { history } = (await staff[RECORDS].get('/api/erms/portal/desk').query({ q: '__Test Portal' })).body;
    // Withdrawn by the Records Unit, with the note.
    const bob = history.find((r) => r.requesterName === '__Test Portal Bob' && r.status === 'revoked');
    expect(bob.ended).toMatchObject({ how: portal.END.revoked, by: { username: RECORDS }, note: 'Not needed.' });
    expect(bob.endedAt).toBeTruthy();
    // Ran out on its own, after the first opening.
    const alice = history.find((r) => r.id === aliceId);
    expect(alice.status).toBe('expired');
    expect(alice.ended).toMatchObject({ how: portal.END.timeUpAfterView, by: { name: 'E-Universe (automatic)' } });
    expect(alice.views).toBeGreaterThan(0);
    // Left by the requester.
    const carol = history.find((r) => r.requesterName === '__Test Portal Carol');
    expect(carol.ended).toMatchObject({ how: portal.END.left, by: { name: '__Test Portal Carol' } });
    // The ending nobody pressed a button for is in the audit trail too.
    const logged = await getDb().collection('app-logs').findOne({ actionType: 'portal-ended', documentId: aliceId });
    expect(logged).toMatchObject({ domain: 'erms', changes: { status: 'expired', how: portal.END.timeUpAfterView } });
  });
});

describe('a full room', () => {
  it('holds 50 names; the next waits in line with an estimate and is seated when a seat frees', async () => {
    const seated = await requests().countDocuments({ status: { $in: ['pending', 'approved'] } });
    const now = Date.now();
    const fillers = Array.from({ length: Math.max(0, portal.CAPACITY - seated) }, (_, i) => ({
      source: 'records', serialNo: SERIAL, requesterName: `__Test Portal Filler ${i}`, designation: 'PISMU', purpose: 'Filling the room.', desiredMinutes: 60,
      ticketHash: `filler-${i}`, client: { ip: null },
      status: 'approved', active: true, createdAt: new Date(now - 1000), enteredAt: new Date(now - 1000 + i),
      // The first to leave, in about five minutes.
      expiresAt: new Date(now + (i === 0 ? 5 : 60 + i) * 60000), pendingUntil: null,
    }));
    if (fillers.length) await requests().insertMany(fillers);

    const waiting = await ask(browsers.bob, { requesterName: '__Test Portal Bob' });
    expect(waiting.status, JSON.stringify(waiting.body)).toBe(201);
    expect(waiting.body.request.status).toBe('waiting');
    expect(waiting.body.position).toBe(1);
    const page = await portalPage(ticketCookie(waiting).split(';')[0]);

    const room = (await browsers.bob.get('/api/portal/room')).body;
    expect(room.full).toBe(true);
    expect(room.seats).toHaveLength(portal.CAPACITY);
    expect(room.waiting[0]).toMatchObject({ position: 1, mine: true });
    expect(room.nextSeatAt).toBeTruthy();
    expect(new Date(room.waiting[0].etaAt).getTime()).toBeLessThanOrEqual(now + 6 * 60000);

    // The first filler's time runs out: the line moves into the room.
    await requests().updateOne({ requesterName: '__Test Portal Filler 0' }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    await portal.sweep();
    const after = (await browsers.bob.get('/api/portal/room')).body;
    expect(after.mine.status).toBe('pending');
    expect(after.waiting).toHaveLength(0);
    expect(await waitFor(() => page.mine.some((n) => n.status === 'pending'))).toBe(true);
  });

  it('is tracked in the Records Unit’s log history, and no other unit’s', async () => {
    const recordsLog = await staff[RECORDS].get('/api/erms/units/records/activity').query({ q: 'Document Portal', limit: 200 });
    expect(recordsLog.status).toBe(200);
    const asked = recordsLog.body.events.find((e) => e.action === 'portal-request');
    expect(asked).toBeTruthy();
    // A public requester has no account: the log names them as they did.
    expect(asked.who).toMatch(/\(Document Portal\)$/);
    expect(asked.serialNo).toBe(SERIAL);
    expect(recordsLog.body.events.some((e) => e.action === 'portal-decision' && e.who === RECORDS)).toBe(true);

    const legalLog = await staff[LEGAL].get('/api/erms/units/legal/activity').query({ limit: 500 });
    expect(legalLog.status).toBe(200);
    expect(legalLog.body.events.some((e) => String(e.action || '').startsWith('portal-'))).toBe(false);
  });

  it('keeps the old Share route gone', async () => {
    expect((await staff[RECORDS].post(`/api/erms/records/${SERIAL}/share`).send({ userId: '0'.repeat(24) })).status).toBe(404);
  });
});

// Everyone the earlier tests seated leaves, so the room and this computer's
// allowance are free for what follows.
const emptyTheRoom = () => requests().updateMany({ requesterName: NAME, active: true }, { $set: { active: false, status: 'left', endedAt: new Date() } });

describe('the room settings', () => {
  it('are the Developer’s to change, and audited', async () => {
    const seen = await staff[RECORDS].get('/api/erms/portal/settings');
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({ closedOnWeekends: false, watermark: false });
    const refused = await staff[RECORDS].put('/api/erms/portal/settings').send({ watermark: true });
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe('DEVELOPER_ONLY');
    expect((await staff[PLANNER].put('/api/erms/portal/settings').send({ watermark: true })).status).toBe(403);

    const saved = await staff[DEV].put('/api/erms/portal/settings').send({ watermark: true });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ watermark: true, closedOnWeekends: false, updatedBy: DEV });
    // Only the Developer's desk carries them.
    expect((await staff[DEV].get('/api/erms/portal/desk')).body.settings).toMatchObject({ watermark: true });
    expect((await staff[RECORDS].get('/api/erms/portal/desk')).body.settings).toBeNull();
    const logged = await getDb().collection('app-logs').findOne({ actionType: 'portal-settings' }, { sort: { _id: -1 } });
    expect(logged?.changes).toMatchObject({ watermark: true });

    expect((await staff[DEV].put('/api/erms/portal/settings').send({ watermark: false })).body.watermark).toBe(false);
  });
});

describe('weekends', () => {
  // Saturday 17 October 2026, noon in Manila; Friday 16 October, 6 PM.
  const saturdayNoon = new Date('2026-10-17T04:00:00Z');
  const fridayEvening = new Date('2026-10-16T10:00:00Z');

  it('are Saturday and Sunday in Philippine time, and the room opens again on Monday', () => {
    expect(portalSettings.isWeekend(saturdayNoon)).toBe(true);
    expect(portalSettings.isWeekend(fridayEvening)).toBe(false);
    // Friday 11 PM UTC is already Saturday 7 AM in Manila.
    expect(portalSettings.isWeekend(new Date('2026-10-16T23:00:00Z'))).toBe(true);
    expect(portalSettings.nextOpening(saturdayNoon).toISOString()).toBe('2026-10-18T16:00:00.000Z');
    // A day to decide, asked on Friday evening: Monday evening, not Saturday.
    expect(portalSettings.addOpenTime(fridayEvening, 24 * 3600000, true).toISOString()).toBe('2026-10-19T10:00:00.000Z');
    expect(portalSettings.addOpenTime(fridayEvening, 24 * 3600000, false).toISOString()).toBe('2026-10-17T10:00:00.000Z');
  });

  it('close the room when the setting is on: no new request, no document opened', async () => {
    await getDb().collection('app-config').updateOne({ _id: 'portal-settings' }, { $set: { closedOnWeekends: true } });
    portalSettings.forget();
    expect(await portalSettings.roomState(saturdayNoon)).toMatchObject({ open: false, reason: 'weekend' });
    expect((await portalSettings.roomState(fridayEvening)).open).toBe(true);

    // The rest runs as if it were Saturday.
    const spy = vi.spyOn(portalSettings, 'roomState').mockResolvedValue({ open: false, opensAt: portalSettings.nextOpening(saturdayNoon), reason: 'weekend' });
    try {
      await emptyTheRoom();
      const room = await browser().get('/api/portal/room');
      expect(room.body.roomState).toMatchObject({ open: false, reason: 'weekend' });
      const refused = await ask(browser(), { requesterName: '__Test Portal Weekend' });
      expect(refused.status).toBe(423);
      expect(refused.body.code).toBe('ROOM_CLOSED');
      expect(refused.body.message).toMatch(/Monday/);
    } finally {
      spy.mockRestore();
      await getDb().collection('app-config').updateOne({ _id: 'portal-settings' }, { $set: { closedOnWeekends: false } });
      portalSettings.forget();
    }
  });
});

describe('the conversation about a request', () => {
  const frank = browser();
  let frankId;
  let frankCookie;

  it('is the requester’s and the deciding unit’s, and nobody else’s', async () => {
    await emptyTheRoom();
    const asked = await ask(frank, { requesterName: '__Test Portal Frank' });
    expect(asked.status, JSON.stringify(asked.body)).toBe(201);
    frankId = asked.body.request.id;
    frankCookie = ticketCookie(asked).split(';')[0];

    // Without a request there is no conversation.
    expect((await browser().get('/api/portal/chat')).body.code).toBe('NO_REQUEST');
    expect((await frank.post('/api/portal/chat').send({ text: 'Hello?' })).body.code).toBe('PORTAL_HEADER_REQUIRED');
    expect((await frank.post('/api/portal/chat').set('X-Portal-Request', '1').send({ text: '   ' })).status).toBe(400);

    staffInbox[RECORDS] = [];
    const sent = await frank.post('/api/portal/chat').set('X-Portal-Request', '1').send({ text: 'Is page 4 the site plan?' });
    expect(sent.status, JSON.stringify(sent.body)).toBe(201);
    expect(sent.body.messages).toHaveLength(1);
    expect(await waitFor(() => staffInbox[RECORDS].some((n) => n.kind === 'portal-chat'))).toBe(true);

    // The Records Unit sees it waiting; Legal Services does not, and cannot open it.
    const summary = (await staff[RECORDS].get('/api/erms/portal/chats')).body.chats.find((c) => c.requestId === frankId);
    expect(summary).toMatchObject({ unread: 1, messages: 1 });
    expect((await staff[LEGAL].get('/api/erms/portal/chats')).body.chats.some((c) => c.requestId === frankId)).toBe(false);
    expect((await staff[LEGAL].get(`/api/erms/portal/requests/${frankId}/chat`)).status).toBe(404);
    expect((await staff[PLANNER].get('/api/erms/portal/chats')).status).toBe(403);
  });

  it('reaches the requester’s page at once, with an unread count until read', async () => {
    const thread = await staff[RECORDS].get(`/api/erms/portal/requests/${frankId}/chat`);
    expect(thread.status).toBe(200);
    expect(thread.body.messages[0]).toMatchObject({ from: 'requester', text: 'Is page 4 the site plan?' });
    expect((await staff[RECORDS].get('/api/erms/portal/chats')).body.chats.find((c) => c.requestId === frankId).unread).toBe(0);

    const page = await portalPage(frankCookie);
    const reply = await staff[RECORDS].post(`/api/erms/portal/requests/${frankId}/chat`).send({ text: 'Yes — pages 4 to 6.' });
    expect(reply.status).toBe(201);
    expect(await waitFor(() => page.chat.length > 0)).toBe(true);
    // Another visitor's page hears nothing of it.
    expect(page.chat[0].body).toContain('pages 4 to 6');

    expect((await frank.get('/api/portal/room')).body.chatUnread).toBe(1);
    const mine = await frank.get('/api/portal/chat');
    expect(mine.body.messages.map((m) => m.from)).toEqual(['requester', 'staff']);
    expect(mine.body.unread).toBe(0);
    expect(new Date(mine.body.expiresAt) - Date.now()).toBeGreaterThan(11.9 * 3600000);
    expect((await frank.get('/api/portal/room')).body.chatUnread).toBe(0);
    // The audit trail says a message was sent, not what it said.
    const logged = await getDb().collection('app-logs').findOne({ actionType: 'portal-chat', documentId: frankId });
    expect(JSON.stringify(logged?.changes || {})).not.toContain('pages 4 to 6');
  });

  it('is deleted after 12 idle hours', async () => {
    const indexes = await getDb().collection(portalChat.COLLECTION).indexes();
    expect(indexes.find((i) => i.name === 'idle_12h')).toMatchObject({ expireAfterSeconds: 12 * 3600 });
    // Until MongoDB's monitor removes it, an idle conversation is already gone from every read.
    await getDb().collection(portalChat.COLLECTION).updateOne({ requestId: new ObjectId(frankId) }, { $set: { lastActivityAt: new Date(Date.now() - 13 * 3600000) } });
    expect((await frank.get('/api/portal/chat')).body.messages).toHaveLength(0);
    expect((await staff[RECORDS].get('/api/erms/portal/chats')).body.chats.some((c) => c.requestId === frankId)).toBe(false);
    // Writing again starts a new one.
    const fresh = await frank.post('/api/portal/chat').set('X-Portal-Request', '1').send({ text: 'Thank you.' });
    expect(fresh.body.messages).toHaveLength(1);
  });
});

describe('Legal Services and Laboratory documents', () => {
  it('are found, colour-coded by unit, and asked for like any other', async () => {
    await emptyTheRoom();
    const found = await request(app).get('/api/portal/search').query({ q: '__LEGAL-DKT-1' });
    const legal = found.body.results.find((r) => r.serialNo === SERIAL_LEGAL);
    expect(legal).toMatchObject({ source: 'legal', projectTitle: 'Portal Legal Case', permit: { type: 'legal:nov', number: '__LEGAL-DKT-1' } });
    expect(JSON.stringify(found.body)).not.toContain('legal-scan.pdf');
    const lab = (await request(app).get('/api/portal/search').query({ q: 'Portal Lab Report' })).body.results.find((r) => r.serialNo === SERIAL_LAB);
    expect(lab).toMatchObject({ source: 'laboratory', permit: { type: 'laboratory:ltr', number: '__LAB-REF-1' } });

    staffInbox[LEGAL] = [];
    staffInbox[RECORDS] = [];
    const asked = await ask(browser(), { requesterName: '__Test Portal Grace', source: 'legal', serialNo: SERIAL_LEGAL });
    expect(asked.status, JSON.stringify(asked.body)).toBe(201);
    expect(asked.body.request).toMatchObject({ source: 'legal', permitNumber: '__LEGAL-DKT-1', projectTitle: 'Portal Legal Case' });
    // Legal Services hears of it; the Records Unit does not.
    expect(await waitFor(() => staffInbox[LEGAL].some((n) => n.kind === 'portal-request'))).toBe(true);
    await settle();
    expect(staffInbox[RECORDS].some((n) => n.kind === 'portal-request' && n.body.includes('__LEGAL-DKT-1'))).toBe(false);
    // A serial that is not that unit's is not found.
    expect((await ask(browser(), { requesterName: '__Test Portal Heidi', source: 'laboratory', serialNo: SERIAL_LEGAL })).body.code).toBe('RECORD_NOT_FOUND');
  });

  it('are decided by their own unit only', async () => {
    const legalDesk = (await staff[LEGAL].get('/api/erms/portal/desk')).body;
    const grace = legalDesk.pending.find((r) => r.requesterName === '__Test Portal Grace');
    expect(grace).toMatchObject({ source: 'legal', serialNo: SERIAL_LEGAL });
    // Not on the Records Unit's or the Laboratory's desk.
    expect((await staff[RECORDS].get('/api/erms/portal/desk')).body.pending.some((r) => r.id === grace.id)).toBe(false);
    expect((await staff[LAB].get('/api/erms/portal/desk')).body.pending.some((r) => r.id === grace.id)).toBe(false);
    expect((await staff[RECORDS].patch(`/api/erms/portal/requests/${grace.id}`).send({ decision: 'approved', minutes: 60 })).status).toBe(404);
    expect((await staff[LAB].patch(`/api/erms/portal/requests/${grace.id}`).send({ decision: 'approved', minutes: 60 })).status).toBe(404);
    // The Developer sees every unit's, and can narrow the desk to one unit.
    const ids = (body) => body.pending.map((r) => r.id);
    expect(ids((await staff[DEV].get('/api/erms/portal/desk')).body)).toContain(grace.id);
    expect(ids((await staff[DEV].get('/api/erms/portal/desk').query({ source: 'legal' })).body)).toContain(grace.id);
    expect(ids((await staff[DEV].get('/api/erms/portal/desk').query({ source: 'records' })).body)).not.toContain(grace.id);
    // "Other" kinds are the Records library's, never a Legal or Laboratory document.
    expect(ids((await staff[DEV].get('/api/erms/portal/desk').query({ permitTypes: 'other' })).body)).not.toContain(grace.id);

    const ok = await staff[LEGAL].patch(`/api/erms/portal/requests/${grace.id}`).send({ decision: 'approved', minutes: 60 });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.request.status).toBe('approved');
  });
});
