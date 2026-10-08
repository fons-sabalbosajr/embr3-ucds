import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

// The instances the app holds (an `import` would load second copies).
const require = createRequire(import.meta.url);
const presence = require('../services/presence.js');
const shortCache = require('../shared/services/shortCache.js');

// ---------------------------------------------------------------------------
// Sign-ins reach open screens as they happen, and a morning's burst of them
// reaches each screen as one notice, not one per person.
// ---------------------------------------------------------------------------

describe('presence', () => {
  let emitted;
  beforeEach(() => {
    vi.useFakeTimers();
    emitted = [];
    presence.attach({ emit: (event, payload) => emitted.push({ event, payload }) });
  });
  afterEach(() => vi.useRealTimers());

  it('coalesces a burst of sign-ins into one notice', () => {
    for (let i = 0; i < 30; i += 1) presence.changed({ username: `u${i}`, name: `User ${i}`, online: true });
    expect(emitted).toHaveLength(0);
    vi.advanceTimersByTime(2000);
    expect(emitted).toHaveLength(1);
    expect(emitted[0].event).toBe('presence:changed');
    expect(emitted[0].payload.changes).toHaveLength(30);
  });

  it('reports a sign-out as offline', () => {
    presence.changed({ username: 'u1', name: 'User 1', online: false });
    vi.advanceTimersByTime(2000);
    expect(emitted[0].payload.changes[0]).toEqual({ username: 'u1', name: 'User 1', online: false });
  });

  it('drops the cached online list so the next fetch is current', async () => {
    let computed = 0;
    await shortCache.cached('users:online', 60000, async () => (computed += 1));
    presence.changed({ username: 'u2', name: 'User 2', online: true });
    await shortCache.cached('users:online', 60000, async () => (computed += 1));
    expect(computed).toBe(2);
  });
});
