import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';

import app from '../app.js';
import db from '../config/db.js';
import settings from '../services/ucdsSettings.js';

const { connectToMongo, collections, getDb } = db;

// ---------------------------------------------------------------------------
// Dataset columns and rows, and the per-year flags, over HTTP.
//
//   - a Developer can add a column to an imported sheet; it lands on every
//     existing row, and a duplicate or a dotted name is refused
//   - a row can be added afterwards and carries the new column
//   - editing switched off in Universe Central DB settings refuses both
//   - a locked year cannot be selected; a hidden year is offered to nobody
//
// The year container and the registry entry are synthetic: the folder scan
// is not involved, so this runs without any spreadsheet on disk.
// ---------------------------------------------------------------------------

const PASSWORD = 'DatasetTestPw!x9';
const DEVELOPER = '__test_ds_dev';
const YEAR = 2001;
const KEY = '__test-ds';
const SHEET = 'Sheet1';

async function signIn(username) {
  const agent = request.agent(app);
  const res = await agent.post('/login').send({ username, password: PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

let savedSettings;

beforeAll(async () => {
  await connectToMongo();
  const hash = await bcrypt.hash(PASSWORD, 4);
  await collections.users.deleteMany({ username: DEVELOPER });
  await collections.users.insertOne({
    username: DEVELOPER,
    name: DEVELOPER,
    email: `${DEVELOPER}@test.local`,
    division: 'TEST',
    status: 'offline',
    permission: 'developer',
    assignedYears: [YEAR],
    password: hash,
  });
  await collections.yearContainers.deleteOne({ year: YEAR });
  await collections.yearContainers.insertOne({
    year: YEAR,
    label: `${YEAR} Data (test)`,
    status: 'active',
    createdAt: new Date(),
  });
  await getDb().collection('ucds-dataset-registry').deleteMany({ year: YEAR, key: KEY });
  await getDb().collection('ucds-dataset-rows').deleteMany({ year: YEAR, dataset: KEY });
  await getDb().collection('ucds-dataset-registry').insertOne({
    year: YEAR,
    key: KEY,
    label: 'Test dataset',
    kind: 'table',
    rowCount: 1,
    importedAt: new Date(),
    sheets: [{ name: SHEET, rows: 1, columns: ['A', 'B'] }],
  });
  await getDb().collection('ucds-dataset-rows').insertOne({
    year: YEAR,
    dataset: KEY,
    sheet: SHEET,
    n: 1,
    data: { A: 'a1', B: 'b1' },
    _search: 'a1 b1',
  });
  savedSettings = await settings.read();
});

afterAll(async () => {
  await getDb().collection('ucds-dataset-registry').deleteMany({ year: YEAR, key: KEY });
  await getDb().collection('ucds-dataset-rows').deleteMany({ year: YEAR, dataset: KEY });
  await collections.yearContainers.deleteOne({ year: YEAR });
  await collections.users.deleteMany({ username: DEVELOPER });
  await collections.loginStatus.deleteMany({ username: DEVELOPER });
  await settings.save(savedSettings, { username: 'test' });
});

describe('dataset columns and rows', () => {
  it('adds a column to every row, refuses duplicates and dotted names, then accepts a row with it', async () => {
    const agent = await signIn(DEVELOPER);
    expect((await agent.post('/api/years/select').send({ year: YEAR })).status).toBe(200);

    const added = await agent.post(`/api/ucds/datasets/${KEY}/columns`).send({ sheet: SHEET, name: '  New  Column ' });
    expect(added.status).toBe(201);
    expect(added.body.column).toBe('New Column');

    const row = await getDb().collection('ucds-dataset-rows').findOne({ year: YEAR, dataset: KEY, n: 1 });
    expect(row.data).toHaveProperty('New Column', null);

    const reg = await getDb().collection('ucds-dataset-registry').findOne({ year: YEAR, key: KEY });
    expect(reg.sheets[0].columns).toEqual(['A', 'B', 'New Column']);

    expect((await agent.post(`/api/ucds/datasets/${KEY}/columns`).send({ sheet: SHEET, name: 'new column' })).status).toBe(409);
    expect((await agent.post(`/api/ucds/datasets/${KEY}/columns`).send({ sheet: SHEET, name: 'a.b' })).status).toBe(400);
    expect((await agent.post(`/api/ucds/datasets/${KEY}/columns`).send({ sheet: SHEET, name: '' })).status).toBe(400);

    const created = await agent.post(`/api/ucds/datasets/${KEY}/rows`).send({ sheet: SHEET, data: { A: 'a2', 'New Column': 'x' } });
    expect(created.status).toBe(201);
    const page = await agent.get(`/api/ucds/datasets/${KEY}/rows?sheet=${SHEET}&q=a2`);
    expect(page.status).toBe(200);
    expect(page.body.items.some((r) => r.data['New Column'] === 'x')).toBe(true);
  });

  it('refuses columns and rows while editing is switched off', async () => {
    const agent = await signIn(DEVELOPER);
    await agent.post('/api/years/select').send({ year: YEAR });
    const off = await agent.put('/api/ucds/settings').send({ ...savedSettings, datasets: { ...savedSettings.datasets, editing: false } });
    expect(off.status).toBe(200);
    expect(off.body.datasets.editing).toBe(false);

    const col = await agent.post(`/api/ucds/datasets/${KEY}/columns`).send({ sheet: SHEET, name: 'Blocked' });
    expect(col.status).toBe(403);
    expect(col.body.code).toBe('EDITING_OFF');
    expect((await agent.post(`/api/ucds/datasets/${KEY}/rows`).send({ sheet: SHEET, data: { A: 'no' } })).status).toBe(403);

    // Back on: the very next request sees it, no cache delay.
    expect((await agent.put('/api/ucds/settings').send(savedSettings)).status).toBe(200);
    expect((await agent.post(`/api/ucds/datasets/${KEY}/columns`).send({ sheet: SHEET, name: 'Allowed' })).status).toBe(201);
  });
});

describe('year flags', () => {
  it('a locked year cannot be selected, a hidden year is not offered, and both clear', async () => {
    const agent = await signIn(DEVELOPER);

    expect((await agent.patch(`/api/admin/years/${YEAR}`).send({ locked: true })).status).toBe(200);
    let years = await agent.get('/api/years');
    expect(years.body.years.find((y) => y.year === YEAR)).toMatchObject({ open: false, locked: true });
    const sel = await agent.post('/api/years/select').send({ year: YEAR });
    expect(sel.status).toBe(409);
    expect(sel.body.code).toBe('YEAR_LOCKED');

    expect((await agent.patch(`/api/admin/years/${YEAR}`).send({ locked: false, hidden: true })).status).toBe(200);
    years = await agent.get('/api/years');
    expect(years.body.years.some((y) => y.year === YEAR)).toBe(false);
    expect((await agent.post('/api/years/select').send({ year: YEAR })).status).not.toBe(200);
    const all = await agent.get('/api/admin/years');
    expect(all.body.years.find((y) => y.year === YEAR)).toMatchObject({ hidden: true, locked: false });

    expect((await agent.patch(`/api/admin/years/${YEAR}`).send({ hidden: false })).status).toBe(200);
    expect((await agent.post('/api/years/select').send({ year: YEAR })).status).toBe(200);
  });
});
