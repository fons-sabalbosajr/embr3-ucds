import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'node:module';

// The guard of the Developer's "view as" (services/viewAs.js): what a session
// viewing as an officer may and may not send. No database: the audit writer
// is replaced before the service loads.
const require = createRequire(import.meta.url);
const audited = [];
beforeAll(() => {
  require.cache[require.resolve('../services/activityStore')] = {
    id: 'activityStore', loaded: true, exports: { record: async (e) => { audited.push(e); } },
  };
});
const load = () => require('../services/viewAs');

const dev = { userId: 'd1', username: 'dev', name: 'The Developer', permission: 'developer' };
const officer = { userId: 'p1', username: 'planner', name: 'A Planner', permission: 'planning' };

function viewingSession({ expiresIn = 60000 } = {}) {
  return {
    user: { ...officer },
    activeYear: 2027,
    viewAs: {
      by: { userId: dev.userId, username: dev.username, name: dev.name },
      target: { userId: officer.userId, username: officer.username, name: officer.name, roleLabel: 'Planning Officer' },
      devSession: { ...dev },
      devActiveYear: 2026,
      startedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + expiresIn).toISOString(),
    },
  };
}

function run(method, path, session) {
  return new Promise((resolve) => {
    const res = {
      code: 200,
      status(c) { this.code = c; return this; },
      json(body) { resolve({ passed: false, code: this.code, body }); },
    };
    load().guard({ method, path, session }, res, (err) => resolve({ passed: !err, err }));
  });
}

describe('view as: guard', () => {
  it('lets everything through when nobody is viewing', async () => {
    expect((await run('POST', '/api/ucds/update-data', { user: dev })).passed).toBe(true);
  });

  it('lets reads through while viewing', async () => {
    expect((await run('GET', '/api/ucds/count', viewingSession())).passed).toBe(true);
  });

  it('refuses a change while viewing', async () => {
    for (const [m, p] of [['POST', '/api/ucds/update-data'], ['PUT', '/api/users/p1'], ['PATCH', '/api/erms/records/1'], ['DELETE', '/api/postings/1'], ['POST', '/api/vera/chat']]) {
      const r = await run(m, p, viewingSession());
      expect(r.passed, `${m} ${p}`).toBe(false);
      expect(r.code).toBe(403);
      expect(r.body.code).toBe('VIEW_ONLY');
    }
  });

  it('allows the requests that only read', async () => {
    for (const p of ['/api/years/select', '/api/check-data', '/check-data', '/api/ucds/spreadsheet/export.xlsx', '/api/ucds/custom-tables/abc/export.xlsx']) {
      expect((await run('POST', p, viewingSession())).passed, p).toBe(true);
    }
  });

  it('allows ending the view', async () => {
    expect((await run('POST', '/api/developer/view-as/stop', viewingSession())).passed).toBe(true);
  });

  it('turns a sign-out into the Developer signing out', async () => {
    const session = viewingSession();
    const r = await run('POST', '/logout', session);
    expect(r.passed).toBe(true);
    expect(session.user.username).toBe('dev');
    expect(session.viewAs).toBeUndefined();
    expect(session.activeYear).toBe(2026);
  });

  it('ends a view that has run its time, and refuses a change sent after it', async () => {
    const session = viewingSession({ expiresIn: -1000 });
    const r = await run('POST', '/api/ucds/update-data', session);
    expect(r.code).toBe(409);
    expect(r.body.code).toBe('VIEW_AS_ENDED');
    expect(session.user.username).toBe('dev');
    expect(session.viewAs).toBeUndefined();
    expect(audited.some((e) => e.username === 'dev' && /Stopped viewing as A Planner \(time ran out\)/.test(e.actionLabel))).toBe(true);
  });
});

describe('view as: who the logs name', () => {
  it('names the Developer while viewing, with the account viewed', () => {
    expect(load().actorOf({ session: viewingSession() })).toEqual({ userId: 'd1', username: 'dev', viewingAs: 'planner' });
  });

  it('names the signed-in user otherwise', () => {
    expect(load().actorOf({ session: { user: officer } })).toEqual({ userId: 'p1', username: 'planner' });
  });

  it('tells the shell nothing when not viewing', () => {
    expect(load().describe({ session: { user: dev } })).toBeNull();
  });
});
