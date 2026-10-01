import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';

import app from '../app.js';
import activation from '../services/nasActivation.js';
import availability from '../services/nasAvailability.js';
import db from '../config/db.js';

const { connectToMongo, collections, getDb } = db;

// ---------------------------------------------------------------------------
// The master switch and the weekday schedule.
//
// Whatever the activation window says, the NAS is not offered when the master
// is off or the schedule says not now — and the person is told in the
// Developer's own sentence, so a weekend request reads "available on
// weekdays", not "unreachable".
//
// app-config is snapshotted by tests/setup.js and restored after the run.
// ---------------------------------------------------------------------------

const PASSWORD = 'AvailTestPw!x9';
const RECORDS = '__test_avail_records';
const MESSAGE = 'NAS files are available on weekdays only. Try again on Monday.';

const localDay = () =>
  ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
    new Intl.DateTimeFormat('en-US', { timeZone: availability.TIME_ZONE, weekday: 'short' }).format(new Date())
  );

// Through the service, so its cache is reset the way a real save resets it.
async function setAvailability(doc) {
  const r = await availability.save(doc, { username: 'test' });
  expect(r.ok).toBe(true);
}

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
    username: RECORDS,
    name: RECORDS,
    email: `${RECORDS}@test.local`,
    division: 'TEST',
    status: 'offline',
    permission: 'records',
    assignedYears: [2025],
    nasContainers: ['records'],
    password: await bcrypt.hash(PASSWORD, 4),
  });
  await getDb()
    .collection(activation.COLLECTION)
    .updateOne(
      { _id: activation.DOC_ID },
      { $set: { enabled: true, startsAt: new Date(Date.now() - 60000), endsAt: new Date(Date.now() + 3600000) } },
      { upsert: true }
    );
}, 60000);

afterAll(async () => {
  await collections.users.deleteMany({ username: RECORDS });
  await collections.loginStatus.deleteMany({ username: RECORDS });
});

describe('availability evaluation', () => {
  it('is offered by default, refused by the master switch, and refused outside the schedule with the configured sentence', async () => {
    await setAvailability({ master: true, schedule: { enabled: false, days: [1, 2, 3, 4, 5], from: '07:00', to: '19:00' }, message: MESSAGE });
    expect((await availability.evaluate()).available).toBe(true);

    await setAvailability({ master: false });
    expect(await availability.evaluate()).toMatchObject({ available: false, reason: 'master-off' });

    // A schedule that excludes today, whatever today is.
    const today = localDay();
    const otherDays = [0, 1, 2, 3, 4, 5, 6].filter((d) => d !== today);
    await setAvailability({ master: true, schedule: { enabled: true, days: otherDays, from: '00:00', to: '23:59' }, message: MESSAGE });
    const closed = await availability.evaluate();
    expect(closed).toMatchObject({ available: false, reason: 'outside-schedule', message: MESSAGE });
    expect(closed.nextOpensAt).toBeTruthy();
    expect(new Date(closed.nextOpensAt).getTime()).toBeGreaterThan(Date.now());

    // A schedule that is exactly today, all hours.
    await setAvailability({ master: true, schedule: { enabled: true, days: [today], from: '00:00', to: '23:59' }, message: MESSAGE });
    expect((await availability.evaluate()).available).toBe(true);
  });

  it('save() validates and describes the schedule', async () => {
    const bad = await availability.save({ schedule: { enabled: true, days: [] } }, { username: 'test' });
    expect(bad.ok).toBe(false);
    expect(bad.status).toBe(400);

    const ok = await availability.save({ schedule: { enabled: true, days: [5, 1, 2, 3, 4], from: '07:00', to: '19:00' } }, { username: 'test' });
    expect(ok.ok).toBe(true);
    expect(ok.config.schedule.days).toEqual([1, 2, 3, 4, 5]);
    expect(availability.describeSchedule(ok.config.schedule)).toContain('weekdays, 07:00–19:00');
  });
});

describe('over HTTP, as staff', () => {
  it('reports the reason and message on /api/storage/containers and refuses browsing with them', async () => {
    const today = localDay();
    const otherDays = [0, 1, 2, 3, 4, 5, 6].filter((d) => d !== today);
    await setAvailability({ master: true, schedule: { enabled: true, days: otherDays, from: '00:00', to: '23:59' }, message: MESSAGE });

    const agent = await signIn(RECORDS);
    const list = await agent.get('/api/storage/containers');
    expect(list.status).toBe(200);
    expect(list.body).toMatchObject({ active: false, reason: 'outside-schedule', message: MESSAGE });

    const browse = await agent.get('/api/storage/browse?container=records&path=');
    expect(browse.status).toBe(503);
    expect(browse.body).toMatchObject({ code: 'NAS_INACTIVE', reason: 'outside-schedule', message: MESSAGE });

    await setAvailability({ master: false, schedule: { enabled: false, days: [1, 2, 3, 4, 5], from: '07:00', to: '19:00' }, message: MESSAGE });
    const off = await agent.get('/api/storage/browse?container=records&path=');
    expect(off.status).toBe(503);
    expect(off.body.reason).toBe('master-off');

    // Back to offered: the gate no longer refuses for availability reasons.
    await setAvailability({ master: true, schedule: { enabled: false, days: [1, 2, 3, 4, 5], from: '07:00', to: '19:00' }, message: MESSAGE });
    const again = await agent.get('/api/storage/containers');
    expect(again.body.reason === 'outside-schedule' || again.body.reason === 'master-off').toBe(false);
  });
});
