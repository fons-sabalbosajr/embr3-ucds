import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest';

import db from '../config/db.js';
import credentials from '../services/nasCredentials.js';

const { connectToMongo, getDb } = db;

// ---------------------------------------------------------------------------
// The credential rotation log.
//
// It answers, months later: when was the share password last changed, by whom,
// and did the connection work afterwards. So it has to record enough to be
// useful and nothing that would be unsafe on a screen.
// ---------------------------------------------------------------------------

const SHARE = '\\\\10.0.0.1\\SHARE';
const FIRST = 'FirstRotation123!';
const SECOND = 'SecondRotation456!';

let saved;

beforeAll(async () => {
  await connectToMongo();
  saved = await getDb().collection(credentials.COLLECTION).findOne({ _id: credentials.DOC_ID });
}, 60000);

afterAll(async () => {
  const col = getDb().collection(credentials.COLLECTION);
  if (saved) await col.replaceOne({ _id: credentials.DOC_ID }, saved, { upsert: true });
  else await col.deleteOne({ _id: credentials.DOC_ID });
}, 60000);

beforeEach(async () => {
  await getDb().collection(credentials.COLLECTION).deleteOne({ _id: credentials.DOC_ID });
});

describe('credential history', () => {
  it('records the first save', async () => {
    const res = await credentials.save(
      { root: SHARE, username: 'svc', password: FIRST },
      { username: 'alice' }
    );
    expect(res.ok).toBe(true);

    const log = await credentials.history();
    expect(log).toHaveLength(1);
    expect(log[0].by).toBe('alice');
    expect(log[0].changed).toContain('password');
    expect(log[0].changed).toContain('share path');
  });

  it('names only the fields that actually changed', async () => {
    await credentials.save({ root: SHARE, username: 'svc', password: FIRST }, { username: 'alice' });
    await credentials.save({ root: SHARE, username: 'svc2' }, { username: 'bob' });

    const log = await credentials.history();
    expect(log[0].by).toBe('bob');
    expect(log[0].changed).toEqual(['username']);
    // A save that omits the password must not claim the password changed.
    expect(log[0].changed).not.toContain('password');
  });

  it('is newest first', async () => {
    await credentials.save({ root: SHARE, password: FIRST }, { username: 'alice' });
    await credentials.save({ root: SHARE, password: SECOND }, { username: 'carol' });

    const log = await credentials.history();
    expect(log[0].by).toBe('carol');
    expect(log[1].by).toBe('alice');
  });

  it('attaches the connection outcome to the change it followed', async () => {
    await credentials.save({ root: SHARE, password: FIRST }, { username: 'alice' });
    await credentials.recordTest({ ok: true, detail: '2 entries at the root' });

    const log = await credentials.history();
    expect(log[0].testOk).toBe(true);
    expect(log[0].testDetail).toBe('2 entries at the root');
  });

  it('never records any part of a password', async () => {
    await credentials.save({ root: SHARE, password: FIRST }, { username: 'alice' });
    await credentials.save({ root: SHARE, password: SECOND }, { username: 'bob' });

    const blob = JSON.stringify(await credentials.history());
    expect(blob).not.toContain(FIRST);
    expect(blob).not.toContain(SECOND);
  });

  it('does not grow without bound', async () => {
    for (let i = 0; i < 55; i++) {
      await credentials.save({ root: SHARE, username: `svc${i}` }, { username: 'loop' });
    }
    const log = await credentials.history();
    expect(log.length).toBeLessThanOrEqual(50);
  }, 120000);

  it('is empty when the configuration comes from the environment', async () => {
    expect(await credentials.history()).toEqual([]);
  });
});
