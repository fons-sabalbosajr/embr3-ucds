import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { io as connect } from 'socket.io-client';
import { createRequire } from 'node:module';

import app from '../app.js';
import db from '../config/db.js';

const require = createRequire(import.meta.url);
const { setupSocket } = require('../socket.js');
const notifier = require('../services/notifier.js');
const { connectToMongo, collections, getDb } = db;

// ---------------------------------------------------------------------------
// Notices as they happen (services/notifier.js), over real sockets.
//
//   - a message reaches its recipient (Document Portal notices: portal.test.js)
//   - a socket is the account its tab's token names, not the cookie's
//   - the device endpoints need a session and refuse a malformed subscription
// No push is sent: none of these accounts has a device subscribed.
// ---------------------------------------------------------------------------

const PASSWORD = 'RealtimePw!x9';
const DEV = '__test_rt_dev';
const ADMIN = '__test_rt_admin';
const RECORDS = '__test_rt_records';
const LEGAL = '__test_rt_legal';
const ASKER = '__test_rt_planner';
const USERNAMES = [DEV, ADMIN, RECORDS, LEGAL, ASKER];
const SERIAL = '__TEST-RT-1';

const base = (username, extra) => ({
  username, name: username, email: `${username}@test.local`, division: 'TEST', status: 'offline', assignedYears: [2025],
  aurora: 'readWrite', bataan: 'readWrite', bulacan: 'readWrite', nuevaEcija: 'readWrite', pampanga: 'readWrite', tarlac: 'readWrite', zambales: 'readWrite',
  ...extra,
});

let server;
let url;
const sockets = {};
const inbox = {};
const agents = {};

async function signIn(username) {
  const agent = request.agent(app);
  const res = await agent.post('/login').send({ username, password: PASSWORD });
  expect(res.status).toBe(200);
  agents[username] = agent;
  return res.body.sessionToken;
}

async function open(username, token) {
  const socket = connect(url, { auth: { token }, transports: ['websocket'], forceNew: true });
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  // Wait until the server has placed the socket in its account's room.
  const ack = await new Promise((resolve) => socket.emit('notify:identify', { token }, resolve));
  expect(ack.ok).toBe(true);
  inbox[username] = [];
  socket.on('notify', (n) => inbox[username].push(n));
  sockets[username] = socket;
}

const settle = (ms = 600) => new Promise((r) => setTimeout(r, ms));
async function waitFor(check, ms = 4000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (check()) return true;
    await settle(50);
  }
  return check();
}

const cleanUp = async () => {
  await collections.users.deleteMany({ username: { $in: USERNAMES } });
  await collections.loginStatus.deleteMany({ username: { $in: USERNAMES } });
  await getDb().collection('erms-records').deleteMany({ serialNo: SERIAL });
  await getDb().collection('erms-messages').deleteMany({ 'from.username': { $in: USERNAMES } });
};

beforeAll(async () => {
  await connectToMongo();
  await cleanUp();
  const password = await bcrypt.hash(PASSWORD, 4);
  await collections.users.insertMany([
    base(DEV, { password, permission: 'developer', domains: ['ucds', 'erms', 'admin'] }),
    base(ADMIN, { password, permission: 'admin', domains: ['ucds', 'erms', 'admin'] }),
    base(RECORDS, { password, permission: 'records', ermsUnit: 'records', domains: ['erms'] }),
    base(LEGAL, { password, permission: 'records', ermsUnit: 'legal', domains: ['erms'] }),
    base(ASKER, { password, permission: 'planning', domains: ['ucds', 'erms'] }),
  ]);
  await getDb().collection('erms-records').insertOne({ serialNo: SERIAL, proponentName: 'Realtime Test Firm', projectTitle: 'Test', permit: { type: 'cnc' }, location: { province: 'bataan' }, document: { fileName: 'rt.pdf' } });

  server = http.createServer(app);
  const io = setupSocket(server, ['http://localhost']);
  notifier.attach(io, app.locals.sessionStore);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${server.address().port}`;

  for (const username of USERNAMES) await open(username, await signIn(username));
}, 90000);

afterAll(async () => {
  for (const s of Object.values(sockets)) s.close();
  await new Promise((resolve) => server?.close(resolve));
  await cleanUp();
}, 60000);

describe('notices as they happen', () => {
  it('tells the recipient of a message', async () => {
    inbox[RECORDS] = [];
    const sent = await agents[LEGAL].post('/api/erms/messages').send({ to: RECORDS, purpose: 'Request', subject: 'Copy of the NOV, please', details: 'For the hearing.' });
    expect(sent.status, JSON.stringify(sent.body)).toBeLessThan(300);
    expect(await waitFor(() => inbox[RECORDS].length > 0)).toBe(true);
    expect(inbox[RECORDS][0]).toMatchObject({ body: 'Copy of the NOV, please', url: '/e-universe/erms/messages' });
  });

  it('serves several accounts on one browser, each turning notices on and off for itself', async () => {
    const endpoint = 'https://push.invalid/__test-rt-shared-browser';
    const subscription = { endpoint, keys: { p256dh: 'BTestP256dhKey', auth: 'TestAuth' } };
    const status = async (u) => (await agents[u].get('/api/notifications/push').query({ endpoint })).body;
    try {
      for (const u of [DEV, RECORDS, ADMIN]) {
        expect((await agents[u].post('/api/notifications/push/subscribe').send({ subscription })).status).toBe(200);
      }
      expect(await status(DEV)).toMatchObject({ on: true, accounts: 3 });
      expect(await status(LEGAL)).toMatchObject({ on: false, accounts: 3 });

      // One turns off: the others keep theirs, and the browser keeps its subscription.
      const off = await agents[ADMIN].post('/api/notifications/push/unsubscribe').send({ endpoint });
      expect(off.body.remaining).toBe(2);
      expect(await status(DEV)).toMatchObject({ on: true, accounts: 2 });

      // Sign-out pauses, signing back in resumes; it never signs up an account that did not ask.
      await agents[RECORDS].post('/api/notifications/push/pause').send({ endpoint });
      expect(await status(RECORDS)).toMatchObject({ on: false, accounts: 1 });
      expect((await agents[RECORDS].post('/api/notifications/push/resume').send({ endpoint })).body.on).toBe(true);
      expect((await agents[LEGAL].post('/api/notifications/push/resume').send({ endpoint })).body.on).toBe(false);
      expect(await status(LEGAL)).toMatchObject({ on: false });
    } finally {
      await getDb().collection(notifier.SUBSCRIPTIONS).deleteMany({ endpoint });
    }
  });

  it('keeps the device endpoints to signed-in accounts and well-formed subscriptions', async () => {
    expect((await request(app).get('/api/notifications/push')).status).toBe(401);
    expect((await agents[DEV].get('/api/notifications/push')).status).toBe(200);
    const bad = await agents[DEV].post('/api/notifications/push/subscribe').send({ subscription: { endpoint: 'http://not-https.example/x', keys: {} } });
    expect(bad.status).toBe(400);
  });
});
