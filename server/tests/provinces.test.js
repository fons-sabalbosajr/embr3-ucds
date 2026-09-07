import { describe, it, expect } from 'vitest';
import {
  PROVINCE_KEYS,
  accessLevel,
  userProvinceKeys,
  userWritableProvinceKeys,
  userProvinceAccess,
  provinceFilter,
  provinceScoped,
  DENY_ALL,
} from '../services/provinces.js';

// These cover the escalation found in Phase 3: per-province grants are stored
// as booleans on some accounts and as strings on others. The old code tested
// `=== true`, so string accounts resolved to no keys — and an empty key list
// produced a null filter, which callers read as "unrestricted".

describe('accessLevel', () => {
  it('understands the boolean representation', () => {
    expect(accessLevel(true)).toBe('readWrite');
    expect(accessLevel(false)).toBe('none');
  });

  it('understands the string representation', () => {
    expect(accessLevel('readWrite')).toBe('readWrite');
    expect(accessLevel('view')).toBe('view');
    expect(accessLevel('none')).toBe('none');
  });

  it('is case-insensitive and trims', () => {
    expect(accessLevel(' ReadWrite ')).toBe('readWrite');
    expect(accessLevel('VIEW')).toBe('view');
  });

  it('fails closed on absent or unrecognised values', () => {
    for (const v of [undefined, null, '', 'maybe', 0, {}]) {
      expect(accessLevel(v)).toBe('none');
    }
  });
});

describe('userProvinceKeys', () => {
  it('resolves a string-valued account (the escalation case)', () => {
    const user = {
      aurora: 'view', bataan: 'none', bulacan: 'none', nuevaEcija: 'none',
      pampanga: 'view', tarlac: 'readWrite', zambales: 'none',
    };
    expect(userProvinceKeys(user)).toEqual(['aurora', 'pampanga', 'tarlac']);
  });

  it('still resolves a boolean-valued account', () => {
    expect(userProvinceKeys({ bataan: true, aurora: false })).toEqual(['bataan']);
  });

  it('separates read access from write access', () => {
    const user = { aurora: 'view', tarlac: 'readWrite' };
    expect(userProvinceKeys(user)).toEqual(['aurora', 'tarlac']);
    expect(userWritableProvinceKeys(user)).toEqual(['tarlac']);
  });

  it('reports every province, granted or not', () => {
    const access = userProvinceAccess({ bataan: true });
    expect(Object.keys(access)).toEqual(PROVINCE_KEYS);
    expect(access.bataan).toBe('readWrite');
    expect(access.aurora).toBe('none');
  });
});

describe('provinceFilter', () => {
  it('denies when no province is granted', () => {
    // Previously returned null, which provinceScoped reads as unrestricted.
    expect(provinceFilter([])).toEqual(DENY_ALL);
    expect(provinceFilter(undefined)).toEqual(DENY_ALL);
    expect(provinceFilter(['not-a-province'])).toEqual(DENY_ALL);
  });

  it('does not restrict when all seven are granted', () => {
    expect(provinceFilter(PROVINCE_KEYS)).toBeNull();
  });

  it('restricts to a subset', () => {
    const filter = provinceFilter(['bataan']);
    expect(filter).not.toBeNull();
    expect(filter.province.$in).toHaveLength(1);
    expect(filter.province.$in[0].test('Bataan')).toBe(true);
    expect(filter.province.$in[0].test('Tarlac')).toBe(false);
  });

  it('tolerates the casing and spacing variants present in the register', () => {
    const [pattern] = provinceFilter(['nuevaEcija']).province.$in;
    for (const variant of ['Nueva_Ecija', 'Nueva Ecija', ' nueva_ecija ', 'NUEVA ECIJA']) {
      expect(pattern.test(variant)).toBe(true);
    }
  });
});

describe('provinceScoped', () => {
  const fakeCollection = () => {
    const seen = [];
    return {
      seen,
      find: (f) => { seen.push(f); return { toArray: async () => [] }; },
      countDocuments: (f) => { seen.push(f); return 0; },
      findOne: (f) => { seen.push(f); return null; },
      aggregate: (p) => { seen.push(p); return { toArray: async () => [] }; },
      updateOne: (f) => { seen.push(f); return {}; },
      updateMany: (f) => { seen.push(f); return {}; },
      deleteOne: (f) => { seen.push(f); return {}; },
      deleteMany: (f) => { seen.push(f); return {}; },
      bulkWrite: (o) => { seen.push(o); return {}; },
      distinct: (field, f) => { seen.push(f); return []; },
      insertOne: () => ({}),
      insertMany: () => ({}),
      createIndex: () => ({}),
      estimatedDocumentCount: () => 0,
    };
  };

  it('applies a deny-all filter to reads when the user has no province', () => {
    const c = fakeCollection();
    const scoped = provinceScoped(c, { provinceFilter: DENY_ALL });
    scoped.find({});
    expect(c.seen[0]).toEqual(DENY_ALL);
  });

  it('returns the collection untouched when the request is unrestricted', () => {
    const c = fakeCollection();
    expect(provinceScoped(c, { provinceFilter: null })).toBe(c);
  });

  it('merges the scope into a caller filter without widening it', () => {
    const c = fakeCollection();
    const scope = provinceFilter(['bataan']);
    provinceScoped(c, { provinceFilter: scope }).find({ province: 'Tarlac' });
    // The caller's own province constraint is kept alongside the scope, so
    // neither can widen the other.
    expect(c.seen[0].$and).toHaveLength(2);
  });

  it('constrains an aggregation before any other stage runs', () => {
    const c = fakeCollection();
    const scope = provinceFilter(['bataan']);
    provinceScoped(c, { provinceFilter: scope }).aggregate([{ $group: { _id: null } }]);
    expect(c.seen[0][0]).toEqual({ $match: scope });
  });
});
