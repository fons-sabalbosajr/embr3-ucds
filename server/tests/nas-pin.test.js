import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest';

import db from '../config/db.js';
import elevation from '../services/nasElevation.js';

const { connectToMongo, getDb } = db;

// ---------------------------------------------------------------------------
// The PIN that replaces re-emailing a code.
//
// It is a convenience over the email challenge, not a second password: it
// re-opens a step-up the person already proved by email, grants exactly the
// same short elevation, and can only be set by someone already elevated.
// ---------------------------------------------------------------------------

const USER = { username: '__pin_dev', userId: '5f000000000000000000beef' };
const DOC_ID = `nas-pin:${USER.userId}`;

const elevatedReq = () => ({
  session: { nasElevation: { username: USER.username, elevatedUntil: Date.now() + 600000 } },
});
const plainReq = () => ({ session: {} });

beforeAll(async () => {
  await connectToMongo();
}, 60000);

beforeEach(async () => {
  await getDb().collection('app-config').deleteOne({ _id: DOC_ID });
});

afterAll(async () => {
  await getDb().collection('app-config').deleteOne({ _id: DOC_ID });
});

describe('setting a PIN', () => {
  it('refuses when the session is not already elevated', async () => {
    // The bootstrap has to be the email challenge. Without this a stolen
    // session could set a PIN and make a temporary hold permanent.
    const res = await elevation.setPin(plainReq(), USER, '835211');
    expect(res.ok).toBe(false);
    expect(res.code).toBe('ELEVATION_REQUIRED');
  });

  it('accepts a reasonable PIN from an elevated session', async () => {
    const res = await elevation.setPin(elevatedReq(), USER, '835211');
    expect(res.ok).toBe(true);
  });

  it.each(['12345', '1234567890123', 'abcdef', '12 34 56', ''])(
    'rejects %s as malformed',
    async (pin) => {
      const res = await elevation.setPin(elevatedReq(), USER, pin);
      expect(res.ok).toBe(false);
      expect(res.code).toBe('BAD_PIN');
    }
  );

  it.each(['000000', '111111', '123456', '654321'])('rejects %s as guessable', async (pin) => {
    const res = await elevation.setPin(elevatedReq(), USER, pin);
    expect(res.ok).toBe(false);
    expect(res.code).toBe('WEAK_PIN');
  });

  it('never stores the PIN in readable form', async () => {
    await elevation.setPin(elevatedReq(), USER, '835211');
    const doc = await getDb().collection('app-config').findOne({ _id: DOC_ID });
    expect(doc.hash).toBeTruthy();
    expect(JSON.stringify(doc)).not.toContain('835211');
    expect(doc.pin).toBeUndefined();
  });

  it('is stored outside the users collection', async () => {
    // PUBLIC_USER_PROJECTION excludes named fields, so anything added to a user
    // document is returned by GET /api/users to every authenticated caller.
    await elevation.setPin(elevatedReq(), USER, '835211');
    const users = await getDb()
      .collection('users')
      .countDocuments({ nasPin: { $exists: true } });
    expect(users).toBe(0);
  });
});

describe('using a PIN', () => {
  it('elevates on the right PIN, without an email', async () => {
    await elevation.setPin(elevatedReq(), USER, '835211');
    const req = plainReq();
    const res = await elevation.verifyPin(req, USER, '835211');
    expect(res.ok).toBe(true);
    expect(elevation.elevationState(req, USER).elevated).toBe(true);
  });

  it('does not elevate on a wrong PIN', async () => {
    await elevation.setPin(elevatedReq(), USER, '835211');
    const req = plainReq();
    const res = await elevation.verifyPin(req, USER, '835212');
    expect(res.ok).toBe(false);
    expect(res.code).toBe('PIN_INCORRECT');
    expect(elevation.elevationState(req, USER).elevated).toBe(false);
  });

  it('locks out after repeated wrong PINs', async () => {
    await elevation.setPin(elevatedReq(), USER, '835211');
    let last;
    for (let i = 0; i < elevation.PIN_MAX_ATTEMPTS; i++) {
      last = await elevation.verifyPin(plainReq(), USER, '000001');
    }
    expect(last.code).toBe('PIN_LOCKED');

    // And the correct PIN is refused while locked, so the lockout is real
    // rather than only a message.
    const after = await elevation.verifyPin(plainReq(), USER, '835211');
    expect(after.ok).toBe(false);
    expect(after.code).toBe('PIN_LOCKED');
  });

  it('says plainly when no PIN is set', async () => {
    const res = await elevation.verifyPin(plainReq(), USER, '835211');
    expect(res.ok).toBe(false);
    expect(res.code).toBe('NO_PIN_SET');
  });
});

describe('removing a PIN', () => {
  it('needs an elevated session', async () => {
    await elevation.setPin(elevatedReq(), USER, '835211');
    const res = await elevation.clearPin(plainReq(), USER);
    expect(res.ok).toBe(false);
    expect(res.code).toBe('ELEVATION_REQUIRED');
  });

  it('removes it when elevated', async () => {
    await elevation.setPin(elevatedReq(), USER, '835211');
    expect((await elevation.clearPin(elevatedReq(), USER)).ok).toBe(true);
    expect((await elevation.pinState(USER)).set).toBe(false);
  });
});

describe('pinState', () => {
  it('reports whether a PIN exists without revealing it', async () => {
    expect((await elevation.pinState(USER)).set).toBe(false);
    await elevation.setPin(elevatedReq(), USER, '835211');
    const state = await elevation.pinState(USER);
    expect(state.set).toBe(true);
    expect(JSON.stringify(state)).not.toContain('835211');
    expect(state.hash).toBeUndefined();
  });
});

describe('the elevation still expires', () => {
  it('a PIN grants the same bounded window, not a permanent one', () => {
    const req = {
      session: {
        nasElevation: { username: USER.username, elevatedUntil: Date.now() - 1000, via: 'pin' },
      },
    };
    const state = elevation.elevationState(req, USER);
    expect(state.elevated).toBe(false);
    expect(state.expired).toBe(true);
  });

  it('uses a window long enough to finish a task in', () => {
    expect(elevation.ELEVATION_TTL_MS).toBeGreaterThanOrEqual(30 * 60 * 1000);
  });
});

