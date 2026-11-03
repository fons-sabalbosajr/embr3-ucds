import { describe, it, expect, afterEach, vi } from 'vitest';

import modelUsage from '../services/vera/modelUsage.js';

// ---------------------------------------------------------------------------
// A model's allowance on the Models tab and in the chat's model picker. The
// provider's report ("0 left, resets in 2h") is a snapshot from VERA's last
// call; it used to stand as it was until the next call — "0% left · resets
// 2h" for days on a model nobody had used since. It now refills at the time
// the provider named, call or no call.
// ---------------------------------------------------------------------------

const MODEL = '__test/allowance-model';
const of = (r) => r.models.find((m) => m.model === MODEL).available.requests;

describe("a model's reported allowance", () => {
  afterEach(() => vi.useRealTimers());

  it('counts down from the time it was reported, and is whole again after the reset', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-29T05:00:00Z'));
    modelUsage.limits('groq', MODEL, { requestsPerDay: 1000, requestsLeft: 0, requestsReset: '2h3m4.5s' });
    const route = [{ provider: 'groq', model: MODEL }];

    vi.setSystemTime(new Date('2026-10-29T06:00:00Z'));
    const soon = of(await modelUsage.report({ route, keys: { groq: true }, days: 1 }));
    expect(soon).toMatchObject({ left: 0, of: 1000, resetIn: '1h 3m' });
    expect(new Date(soon.resetAt).toISOString()).toBe('2026-10-29T07:03:04.500Z');

    // Days later, never called again: whole.
    vi.setSystemTime(new Date('2026-11-03T05:00:00Z'));
    expect(of(await modelUsage.report({ route, keys: { groq: true }, days: 1 }))).toMatchObject({ left: 1000, of: 1000, pct: 100, resetIn: null });
  });

  it('reads the times providers write', () => {
    expect(modelUsage.durationMs('2h3m4.5s')).toBe(7384500);
    expect(modelUsage.durationMs('59.56s')).toBe(59560);
    expect(modelUsage.durationMs('7m')).toBe(420000);
  });
});
