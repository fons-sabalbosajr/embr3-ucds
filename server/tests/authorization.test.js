import { describe, it, expect } from 'vitest';
import {
  ROLES,
  DOMAINS,
  roleOf,
  isDeveloper,
  canAccessAllYears,
  domainsOf,
  hasDomain,
  capabilitiesOf,
  authorizedProvinces,
} from '../services/authorization.js';

describe('roleOf', () => {
  it('recognises every declared role', () => {
    for (const role of Object.values(ROLES)) {
      expect(roleOf({ permission: role })).toBe(role);
    }
  });

  it('is case- and whitespace-insensitive', () => {
    expect(roleOf({ permission: '  Developer ' })).toBe(ROLES.DEVELOPER);
    expect(roleOf({ permission: 'ADMIN' })).toBe(ROLES.ADMIN);
  });

  it('fails closed to the least-privileged role', () => {
    for (const input of [undefined, null, {}, { permission: '' }, { permission: 'guest' }, { permission: 'wizard' }]) {
      expect(roleOf(input)).toBe(ROLES.VIEWER);
    }
  });

  it('only developer and admin reach every year', () => {
    expect(canAccessAllYears({ permission: 'developer' })).toBe(true);
    expect(canAccessAllYears({ permission: 'admin' })).toBe(true);
    expect(canAccessAllYears({ permission: 'planning' })).toBe(false);
    expect(canAccessAllYears({ permission: 'records' })).toBe(false);
    expect(canAccessAllYears({ permission: 'viewer' })).toBe(false);
    expect(isDeveloper({ permission: 'admin' })).toBe(false);
  });
});

describe('domainsOf', () => {
  it('defaults by role', () => {
    expect(domainsOf({ permission: 'developer' })).toEqual(['ucds', 'erms', 'admin']);
    expect(domainsOf({ permission: 'admin' })).toEqual(['ucds', 'erms', 'admin']);
    // An ERMS User holds ERMS only: the Universe Central DB is the Planning
    // Unit's, and each ERMS unit has its own screens. The register lookup on
    // the record form reads UCDS through the ERMS module's own route.
    expect(domainsOf({ permission: 'records' })).toEqual(['erms']);
    expect(domainsOf({ permission: 'planning' })).toEqual(['ucds']);
  });

  it('defaults an unrecognised account to UCDS only, matching the existing population', () => {
    expect(domainsOf({ permission: 'viewer' })).toEqual(['ucds']);
    expect(domainsOf({})).toEqual(['ucds']);
  });

  it('lets an explicit array narrow a user below their role default', () => {
    expect(domainsOf({ permission: 'admin', domains: ['ucds'] })).toEqual(['ucds']);
  });

  it('ignores unknown domain names rather than trusting them', () => {
    expect(domainsOf({ permission: 'viewer', domains: ['erms', 'nonsense'] })).toEqual(['erms']);
    // An array of only junk is empty, so the role default applies.
    expect(domainsOf({ permission: 'records', domains: ['nonsense'] })).toEqual(['erms']);
  });

  it('normalises case and removes duplicates', () => {
    expect(domainsOf({ permission: 'viewer', domains: ['ERMS', 'erms', ' Ucds '] })).toEqual(['erms', 'ucds']);
  });

  it('gates the domain boundary', () => {
    const records = { permission: 'records' };
    expect(hasDomain(records, DOMAINS.ERMS)).toBe(true);
    expect(hasDomain(records, DOMAINS.UCDS)).toBe(false);
    expect(hasDomain(records, DOMAINS.ADMIN)).toBe(false);
    // Widened explicitly by an administrator when a specific account needs it.
    expect(hasDomain({ permission: 'records', domains: ['erms', 'ucds'] }, DOMAINS.UCDS)).toBe(true);
  });
});

describe('capabilitiesOf', () => {
  it('always returns a complete object', () => {
    const caps = capabilitiesOf({ permission: 'viewer' });
    expect(Object.keys(caps).sort()).toEqual(
      ['canAccessRangePicker', 'canGenerateData', 'canManageData', 'canViewAdminPanel', 'canViewDataHistory'].sort()
    );
    expect(Object.values(caps).every((v) => v === false)).toBe(true);
  });

  it('reads the legacy top-level booleans', () => {
    expect(capabilitiesOf({ permission: 'viewer', canManageData: true }).canManageData).toBe(true);
  });

  it('prefers the nested object over the legacy field', () => {
    const user = { permission: 'viewer', canManageData: true, capabilities: { canManageData: false } };
    expect(capabilitiesOf(user).canManageData).toBe(false);
  });

  it('treats any non-true value as false', () => {
    const user = { permission: 'viewer', canManageData: 'yes', canGenerateData: 1 };
    expect(capabilitiesOf(user).canManageData).toBe(false);
    expect(capabilitiesOf(user).canGenerateData).toBe(false);
  });

  it('grants a developer everything regardless of what is stored', () => {
    const caps = capabilitiesOf({ permission: 'developer', canViewAdminPanel: false });
    expect(Object.values(caps).every((v) => v === true)).toBe(true);
  });
});

describe('authorizedProvinces', () => {
  const container = { provinces: ['bulacan', 'tarlac'] };

  it('gives developers and admins the container scope', () => {
    expect(authorizedProvinces({ permission: 'admin' }, container)).toEqual(['bulacan', 'tarlac']);
  });

  it('treats a container with no province list as all provinces', () => {
    expect(authorizedProvinces({ permission: 'developer' }, {})).toHaveLength(7);
  });

  it('intersects the container scope with the account grant', () => {
    const user = { permission: 'viewer', bulacan: 'readWrite', aurora: 'readWrite' };
    expect(authorizedProvinces(user, container)).toEqual(['bulacan']);
  });

  it('returns nothing when the account has no province inside the container', () => {
    const user = { permission: 'viewer', aurora: 'readWrite' };
    expect(authorizedProvinces(user, container)).toEqual([]);
  });
});
