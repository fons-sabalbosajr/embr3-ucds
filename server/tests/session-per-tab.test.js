import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';

import app from '../app.js';
import db from '../config/db.js';

const { connectToMongo, collections } = db;

// ---------------------------------------------------------------------------
// One sign-in per tab (middleware/sessionToken.js).
//
// A supertest agent is one browser: it keeps the cookie jar. Each "tab" is a
// token the agent sends explicitly, the way sessionStorage does per tab.
//
//   - sign-in answers with a session token, and a second sign-in on the same
//     cookie jar opens a second session rather than replacing the first
//   - a request carrying a token is answered by that session, whatever the
//     cookie says; the header and the ?st= query form both work
//   - signing out by token ends only that session and leaves the cookie alone
//   - a token that does not verify is ignored
// ---------------------------------------------------------------------------

const PASSWORD = 'PerTabPw!x9';
const A = '__test_tab_a';
const B = '__test_tab_b';

beforeAll(async () => {
  await connectToMongo();
  const hash = await bcrypt.hash(PASSWORD, 4);
  await collections.users.deleteMany({ username: { $in: [A, B] } });
  await collections.users.insertMany([
    { username: A, name: A, email: `${A}@test.local`, division: 'TEST', status: 'offline', permission: 'developer', assignedYears: [], password: hash },
    { username: B, name: B, email: `${B}@test.local`, division: 'TEST', status: 'offline', permission: 'developer', assignedYears: [], password: hash },
  ]);
});

afterAll(async () => {
  await collections.users.deleteMany({ username: { $in: [A, B] } });
  await collections.loginStatus.deleteMany({ username: { $in: [A, B] } });
});

describe('one sign-in per tab', () => {
  it('keeps two sign-ins from one browser apart, and ends them one at a time', async () => {
    const browser = request.agent(app);

    const first = await browser.post('/login').send({ username: A, password: PASSWORD });
    expect(first.status).toBe(200);
    const tabA = first.body.sessionToken;
    expect(tabA).toMatch(/^s:/);

    // Tab 2 signs in on the same cookie jar.
    const second = await browser.post('/login').send({ username: B, password: PASSWORD });
    expect(second.status).toBe(200);
    const tabB = second.body.sessionToken;
    expect(tabB).toMatch(/^s:/);
    expect(tabB).not.toBe(tabA);

    // The cookie now says B; each tab still gets its own account.
    expect((await browser.get('/api/auth/me')).body.user.username).toBe(B);
    expect((await browser.get('/api/auth/me').set('X-Session-Token', tabA)).body.user.username).toBe(A);
    expect((await browser.get('/api/auth/me').set('X-Session-Token', tabB)).body.user.username).toBe(B);
    // The query form, for URLs the browser loads itself.
    expect((await browser.get('/api/auth/me').query({ st: tabA })).body.user.username).toBe(A);

    // A token that does not verify is ignored: the request is anonymous.
    const forged = `${tabA.slice(0, -4)}AAAA`;
    expect((await request(app).get('/api/auth/me').set('X-Session-Token', forged)).status).toBe(401);

    // Tab A signs out. Only its session ends; the cookie (B's) is untouched.
    const out = await browser.post('/logout').set('X-Session-Token', tabA);
    expect(out.status).toBe(200);
    expect(out.headers['set-cookie'] || []).toEqual([]);
    expect((await browser.get('/api/auth/me').set('X-Session-Token', tabA)).status).toBe(401);
    expect((await browser.get('/api/auth/me')).body.user.username).toBe(B);

    // Tab B signs out: its token is the cookie's session, so the cookie goes too.
    const outB = await browser.post('/logout').set('X-Session-Token', tabB);
    expect(outB.status).toBe(200);
    expect((outB.headers['set-cookie'] || []).join(';')).toMatch(/connect\.sid=;/);
    expect((await browser.get('/api/auth/me')).status).toBe(401);
  });

  it('treats a new tab as signed out, so a second account can sign in there without touching the first', async () => {
    const browser = request.agent(app);
    const first = await browser.post('/login').send({ username: A, password: PASSWORD });
    const tabA = first.body.sessionToken;

    // A new tab: no token of its own. The cookie is A's, but the tab is not A.
    const fresh = await browser.get('/api/auth/me').set('X-Session-Token', 'none');
    expect(fresh.status).toBe(401);
    expect(fresh.headers['x-session-token']).toBeUndefined();
    expect((await browser.get('/auth-check').set('X-Session-Token', 'none')).status).toBe(401);

    // It signs in as B: a session of its own; tab A is still A.
    const second = await browser.post('/login').set('X-Session-Token', 'none').send({ username: B, password: PASSWORD });
    expect(second.status).toBe(200);
    const tabB = second.body.sessionToken;
    expect(tabB).not.toBe(tabA);
    expect((await browser.get('/api/auth/me').set('X-Session-Token', tabA)).body.user.username).toBe(A);
    expect((await browser.get('/api/auth/me').set('X-Session-Token', tabB)).body.user.username).toBe(B);

    // Signing out a tab that never signed in ends nobody's session.
    expect((await browser.post('/logout').set('X-Session-Token', 'none')).status).toBeLessThan(500);
    expect((await browser.get('/api/auth/me').set('X-Session-Token', tabA)).body.user.username).toBe(A);
    // B signs out: A carries on.
    await browser.post('/logout').set('X-Session-Token', tabB);
    expect((await browser.get('/api/auth/me').set('X-Session-Token', tabB)).status).toBe(401);
    expect((await browser.get('/api/auth/me').set('X-Session-Token', tabA)).body.user.username).toBe(A);
  });

  it('gives a tab that arrived on the cookie alone a token to pin itself with', async () => {
    const browser = request.agent(app);
    const { body } = await browser.post('/login').send({ username: A, password: PASSWORD });
    const me = await browser.get('/api/auth/me');
    expect(me.body.sessionToken).toBe(body.sessionToken);
    // Offered on any signed-in, token-less response — so the first call from
    // a fresh tab pins it, whichever screen that call came from.
    expect(me.headers['x-session-token']).toBe(body.sessionToken);
    expect((await browser.get('/api/years')).headers['x-session-token']).toBe(body.sessionToken);
    // Not offered to a tab that already holds one, nor to an anonymous request.
    expect((await browser.get('/api/auth/me').set('X-Session-Token', body.sessionToken)).headers['x-session-token']).toBeUndefined();
    expect((await request(app).get('/api/auth/me')).headers['x-session-token']).toBeUndefined();
  });
});
