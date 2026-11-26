import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

// services/auditLog.js: which tab an entry belongs to, and what a screen is
// allowed to see of it. Pure functions only; no database.
const require = createRequire(import.meta.url);
const { CATEGORIES, CATEGORY_KEYS, buildFilter, redact, present, unitOf } = require('../services/auditLog');

// A tiny evaluator for the operators the category filters use, so the tests
// check where real-looking entries land without a MongoDB.
function matches(doc, f) {
  return Object.entries(f).every(([k, cond]) => {
    if (k === '$and') return cond.every((c) => matches(doc, c));
    if (k === '$or') return cond.some((c) => matches(doc, c));
    if (k === '$nor') return !cond.some((c) => matches(doc, c));
    const v = doc[k];
    if (cond instanceof RegExp) return typeof v === 'string' && cond.test(v);
    if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
      if ('$ne' in cond) return v !== cond.$ne;
      if ('$not' in cond) return !(typeof v === 'string' && cond.$not.test(v));
      if ('$gte' in cond || '$lte' in cond) return true;
    }
    if (cond === null) return v == null;
    return v === cond;
  });
}
const tabsOf = (doc) => CATEGORY_KEYS.filter((k) => matches(doc, CATEGORIES[k].filter));

describe('Audit log tabs', () => {
  const cases = [
    [{ domain: 'nas', actionType: 'NAS', path: '/api/erms/portal/x/file' }, 'nas'],
    [{ domain: 'erms', actionType: 'portal-request', path: '/api/erms/portal/requests' }, 'portal'],
    [{ domain: 'erms', actionType: 'portal-settings' }, 'portal'],
    [{ domain: 'erms', actionType: 'Update Record', path: '/api/erms/legal/records/1' }, 'erms'],
    [{ domain: 'ucds', actionType: 'Generic Action', path: '/api/ucds-data' }, 'ucds'],
    [{ domain: 'vera', actionType: 'vera:chat' }, 'vera'],
    [{ domain: 'admin', actionType: 'Update Data', path: '/api/users/5' }, 'admin'],
    // From before the domain field existed.
    [{ actionType: 'Update Data', path: '/api/update-data/abc' }, 'ucds'],
    [{ actionType: 'Update Data', path: '/api/users/abc' }, 'admin'],
    [{ actionType: 'Generic Action', path: '/api/profile/theme' }, 'admin'],
    [{ actionType: 'Generic Action' }, 'ucds'],
  ];

  it.each(cases)('%j lands on exactly one tab: %s', (doc, expected) => {
    expect(tabsOf(doc)).toEqual([expected]);
  });

  it('refuses an unknown tab', () => {
    expect(buildFilter('nope')).toBeNull();
  });

  it('treats a search term as literal text, never as a pattern', () => {
    const f = buildFilter('ucds', { q: '(.*)+[' });
    const re = f.$and[1].$or[0].actionLabel;
    expect(re.test('(.*)+[')).toBe(true);
    expect(re.test('anything else')).toBe(false);
  });
});

describe('What a screen may see', () => {
  it('hides secrets at any depth and keeps the rest', () => {
    const out = redact({ username: 'ana', password: 'p', profile: { newPassword: 'x', apiKey: 'k', name: 'Ana' }, code: '123456', pin: '0000' });
    expect(out).toEqual({ username: 'ana', password: '[hidden]', profile: { newPassword: '[hidden]', apiKey: '[hidden]', name: 'Ana' }, code: '[hidden]', pin: '[hidden]' });
  });

  it('bounds long strings and long arrays', () => {
    expect(redact('x'.repeat(600))).toHaveLength(501);
    const arr = redact({ list: Array.from({ length: 60 }, (_, i) => i) }).list;
    expect(arr).toHaveLength(51);
    expect(arr[50]).toBe('… 10 more');
  });

  it('names the ERMS unit from the path', () => {
    expect(unitOf('/api/erms/legal/records')).toBe('legal');
    expect(unitOf('/api/erms/laboratory/x')).toBe('laboratory');
    expect(unitOf('/api/erms/records/1')).toBe('records');
    expect(unitOf('/api/ucds-data')).toBeNull();
  });

  it('returns a fixed shape with the request body redacted', () => {
    const out = present({ _id: 'a1', timestamp: new Date(0), username: 'ana', actionType: 'Update Data', path: '/api/users/1', requestData: { password: 'p', role: 'x' }, secretField: 'never' });
    expect(out.requestData).toEqual({ password: '[hidden]', role: 'x' });
    expect(out).not.toHaveProperty('secretField');
  });
});
