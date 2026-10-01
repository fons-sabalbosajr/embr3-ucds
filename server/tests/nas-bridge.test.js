// This file tests the bridge check, so it opts in (see nasBridge.read).
process.env.NAS_BRIDGE_TEST = '1';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';

import app from '../app.js';
import activation from '../services/nasActivation.js';
import availability from '../services/nasAvailability.js';
import bridge from '../services/nasBridge.js';
import net from 'node:net';
import db from '../config/db.js';

const { connectToMongo, collections, getDb } = db;

// ---------------------------------------------------------------------------
// The NAS bridge monitor.
//
// When the office server the shares are reached through does not answer,
// the NAS is withdrawn with the configured sentence — before any share read
// is attempted — and comes back when it answers again. Probes here go to an
// address nothing listens on, so the test is the same at the office and at
// home. app-config is snapshotted by tests/setup.js and restored.
// ---------------------------------------------------------------------------

const PASSWORD = 'BridgeTestPw!x9';
const RECORDS = '__test_bridge_records';
const OFFLINE = 'The office server that connects to the NAS is off. Files are back on working days.';
// TEST-NET-1 (RFC 5737): never routed, so a probe fails fast and for certain.
const DEAD = '192.0.2.1';

async function signIn(username) {
  const agent = request.agent(app);
  const res = await agent.post('/login').send({ username, password: PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

beforeAll(async () => {
  await connectToMongo();
  await collections.users.deleteMany({ username: RECORDS });
  await collections.users.insertOne({
    username: RECORDS, name: RECORDS, email: `${RECORDS}@test.local`, division: 'TEST', status: 'offline',
    permission: 'records', assignedYears: [2025], nasContainers: ['records'], password: await bcrypt.hash(PASSWORD, 4),
  });
  await getDb().collection(activation.COLLECTION).updateOne(
    { _id: activation.DOC_ID },
    { $set: { enabled: true, startsAt: new Date(Date.now() - 60000), endsAt: new Date(Date.now() + 3600000) } },
    { upsert: true }
  );
  await availability.save({ master: true, schedule: { enabled: false } }, { username: 'test' });
}, 60000);

// The bridge config is put back by tests/setup.js from its snapshot; writing
// it here as well raced that restore and left the live check switched off.
afterAll(async () => {
  await collections.users.deleteMany({ username: RECORDS });
  await collections.loginStatus.deleteMany({ username: RECORDS });
});

describe('bridge monitor', () => {
  it('counts the NAS as reachable when it answers directly, even with the bridge silent', async () => {
    // A listener on the loopback stands in for the NAS on the office LAN.
    const server = net.createServer(() => {});
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const r = await bridge.save({ enabled: true, name: 'test-bridge', host: DEAD, nasHost: '127.0.0.1', nasPort: server.address().port, timeoutMs: 800 }, { username: 'test' });
      expect(r.ok).toBe(true);
      const state = await bridge.probe();
      expect(state.nas.up).toBe(true);
      expect(state.bridge.up).toBe(false);
      expect(state.up).toBe(true);
      expect(await bridge.blocking()).toBeNull();
    } finally {
      server.close();
    }
  }, 20000);

  it('refuses to be enabled without an address, and is not consulted while off', async () => {
    const bad = await bridge.save({ enabled: true, host: '' }, { username: 'test' });
    expect(bad.ok).toBe(false);
    expect(bad.status).toBe(400);
    await bridge.save({ enabled: false }, { username: 'test' });
    expect(await bridge.blocking()).toBeNull();
    expect((await availability.evaluate()).available).toBe(true);
  });

  it('withdraws the NAS with the configured sentence when the bridge does not answer, over HTTP too', async () => {
    const r = await bridge.save({ enabled: true, name: 'test-bridge', host: DEAD, nasHost: DEAD, timeoutMs: 800, offlineMessage: OFFLINE }, { username: 'test' });
    expect(r.ok).toBe(true);

    const first = await bridge.probe();
    expect(first.up).toBe(false);
    expect(first.bridge.up).toBe(false);
    expect(first.nas.up).toBe(false);

    const block = await bridge.blocking();
    expect(block).toMatchObject({ reason: 'bridge-offline', message: OFFLINE, bridgeName: 'test-bridge' });
    expect(await availability.evaluate()).toMatchObject({ available: false, reason: 'bridge-offline', message: OFFLINE });
    expect(await activation.evaluate()).toMatchObject({ active: false, reason: 'bridge-offline', message: OFFLINE });

    const agent = await signIn(RECORDS);
    const list = await agent.get('/api/storage/containers');
    expect(list.body).toMatchObject({ active: false, reason: 'bridge-offline', message: OFFLINE });
    const browse = await agent.get('/api/storage/browse?container=records&path=');
    expect(browse.status).toBe(503);
    expect(browse.body).toMatchObject({ code: 'NAS_INACTIVE', reason: 'bridge-offline', message: OFFLINE });
  }, 20000);

  it('records the transition in the audit trail without naming a host, and clears when disabled', async () => {
    // A second probe from "down" to "down" is silent; only a change is
    // announced. Counted through the in-process listener rather than the
    // log, because the live deployment's own monitor writes the same log.
    let announced = 0;
    const stop = bridge.onChange(() => { announced += 1; });
    await bridge.probe();
    stop();
    expect(announced).toBe(0);

    const entries = await getDb().collection('app-logs').find({ domain: 'nas', operation: { $in: ['nas-bridge-up', 'nas-bridge-down', 'nas-bridge-set'] } }).toArray();
    for (const e of entries) {
      expect(JSON.stringify(e)).not.toContain(DEAD);
    }

    await bridge.save({ enabled: false }, { username: 'test' });
    expect(await bridge.blocking()).toBeNull();
    expect((await availability.evaluate()).available).toBe(true);
  }, 20000);
});
