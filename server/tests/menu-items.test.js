import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';

import app from '../app.js';
import db from '../config/db.js';

const { connectToMongo, collections, getDb } = db;

// ---------------------------------------------------------------------------
// User-added items in the Universe Central DB menu: folders and tables under
// a year, or under the Monitoring Plan folder. Scoped to the active year;
// writing needs canManageData.
// ---------------------------------------------------------------------------

const PASSWORD = 'MenuTestPw!x9';
const PLANNER = '__test_menu_planner';
const ENCODER = '__test_menu_encoder';
// An Encoder who may change data, but not remove the Planning Unit's tables.
const EDITOR = '__test_menu_editor';
const USERNAMES = [PLANNER, ENCODER, EDITOR];

const base = (username, extra) => ({
  username, name: username, email: `${username}@test.local`, division: 'TEST', status: 'offline',
  assignedYears: [2025], aurora: 'none', bataan: 'readWrite', bulacan: 'none', nuevaEcija: 'none', pampanga: 'none', tarlac: 'none', zambales: 'none',
  ...extra,
});

async function signIn(username) {
  const agent = request.agent(app);
  const res = await agent.post('/login').send({ username, password: PASSWORD });
  expect(res.status).toBe(200);
  const sel = await agent.post('/api/years/select').send({ year: 2025 });
  expect(sel.status).toBe(200);
  return agent;
}

let planner;
let encoder;
let editor;

beforeAll(async () => {
  await connectToMongo();
  const password = await bcrypt.hash(PASSWORD, 10);
  await collections.users.deleteMany({ username: { $in: USERNAMES } });
  await collections.users.insertMany([
    base(PLANNER, { password, permission: 'planning', capabilities: { canManageData: true } }),
    base(ENCODER, { password, permission: 'viewer', capabilities: { canManageData: false } }),
    base(EDITOR, { password, permission: 'viewer', capabilities: { canManageData: true } }),
  ]);
  await getDb().collection('ucds-menu-items').deleteMany({ createdBy: { $in: USERNAMES } });
  [planner, encoder, editor] = await Promise.all([signIn(PLANNER), signIn(ENCODER), signIn(EDITOR)]);
}, 90000);

afterAll(async () => {
  await getDb().collection('ucds-menu-items').deleteMany({ createdBy: { $in: USERNAMES } });
  await collections.users.deleteMany({ username: { $in: USERNAMES } });
  await collections.loginStatus.deleteMany({ username: { $in: USERNAMES } });
}, 60000);

describe('items people add to the year’s menu', () => {
  let folderId;
  let tableId;

  it('needs the Manage Data capability to add', async () => {
    const res = await encoder.post('/api/ucds/menu-items').send({ label: 'Nope', kind: 'folder', parent: 'root' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CAPABILITY_REQUIRED');
    const list = await encoder.get('/api/ucds/menu-items');
    expect(list.status).toBe(200);
    expect(list.body.canManage).toBe(false);
  });

  it('adds a folder under Monitoring Plan and a table inside it', async () => {
    const folder = await planner.post('/api/ucds/menu-items').send({ label: '  Air quality  stations ', kind: 'folder', parent: 'monitoring' });
    expect(folder.status).toBe(201);
    expect(folder.body.item).toMatchObject({ year: 2025, parent: 'monitoring', kind: 'folder', label: 'Air quality stations', createdBy: PLANNER });
    folderId = folder.body.item.id;

    const table = await planner.post('/api/ucds/menu-items').send({ label: 'Stations 2025', kind: 'table', parent: folderId });
    expect(table.status).toBe(201);
    expect(table.body.item.parent).toBe(folderId);
    expect(table.body.item.table).toEqual({ columns: [], rowCount: 0 });
    tableId = table.body.item.id;

    const inTable = await planner.post('/api/ucds/menu-items').send({ label: 'x', kind: 'folder', parent: tableId });
    expect(inTable.status).toBe(400);
    expect(inTable.body.code).toBe('PARENT_NOT_FOLDER');
  });

  it('lists them per year for the sidebar, and one with its contents', async () => {
    const list = await planner.get('/api/ucds/menu-items');
    const y = list.body.years.find((x) => x.year === 2025);
    expect(y.items.map((i) => i.id)).toEqual(expect.arrayContaining([folderId, tableId]));
    expect(list.body.canManage).toBe(true);

    const one = await planner.get(`/api/ucds/menu-items/${folderId}`);
    expect(one.status).toBe(200);
    expect(one.body.children.map((c) => c.id)).toEqual([tableId]);
  });

  it('renames and moves, refusing a folder into itself', async () => {
    const renamed = await planner.patch(`/api/ucds/menu-items/${tableId}`).send({ label: 'Stations (all)' });
    expect(renamed.body.item.label).toBe('Stations (all)');
    const self = await planner.patch(`/api/ucds/menu-items/${folderId}`).send({ parent: folderId });
    expect(self.status).toBe(400);
    const moved = await planner.patch(`/api/ucds/menu-items/${tableId}`).send({ parent: 'root' });
    expect(moved.body.item.parent).toBe('root');
    await planner.patch(`/api/ucds/menu-items/${tableId}`).send({ parent: folderId });
  });

  it('keeps the Planning Unit’s items from an Encoder, who removes only their own', async () => {
    const list = await editor.get('/api/ucds/menu-items');
    expect(list.body.canManage).toBe(true);
    expect(list.body.canRemoveAny).toBe(false);
    const theirs = await editor.delete(`/api/ucds/menu-items/${tableId}`);
    expect(theirs.status).toBe(403);
    expect(theirs.body.code).toBe('REMOVE_NOT_ALLOWED');
    const own = await editor.post('/api/ucds/menu-items').send({ label: 'Scratch', kind: 'table', parent: 'root' });
    expect(own.status).toBe(201);
    const removed = await editor.delete(`/api/ucds/menu-items/${own.body.item.id}`);
    expect(removed.status).toBe(200);
  });

  it('removes a folder with everything inside it', async () => {
    const res = await planner.delete(`/api/ucds/menu-items/${folderId}`);
    expect(res.status).toBe(200);
    expect(res.body.removed).toBe(2);
    const gone = await planner.get(`/api/ucds/menu-items/${tableId}`);
    expect(gone.status).toBe(404);
  });
});
