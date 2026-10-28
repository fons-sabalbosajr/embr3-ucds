import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { viewPermission, isEstablishmentViewer } = require('../modules/erms/services/accessRequestService.js');

// ---------------------------------------------------------------------------
// The Planning Unit and the PEMUs open an establishment's documents from its
// register record (28 Oct 2026) — from there only; on the ERMS routes the
// Records Unit's rule stands. No database.
// ---------------------------------------------------------------------------

describe("an establishment's documents", () => {
  const planning = { permission: 'planning', office: 'ORD-PISMU' };
  const pemu = { permission: 'viewer', office: 'ORD-PEMU-BATAAN', domains: ['ucds'] };

  it('are opened by the Planning Unit and the PEMUs, from the establishment', async () => {
    expect(isEstablishmentViewer(planning)).toBe(true);
    expect(isEstablishmentViewer(pemu)).toBe(true);
    expect(await viewPermission(planning, 'R-1', { establishment: true })).toEqual({ allowed: true, reason: 'establishment' });
    expect(await viewPermission(pemu, 'R-1', { establishment: true })).toEqual({ allowed: true, reason: 'establishment' });
  });

  it('not on the ERMS routes, and not by anyone else', async () => {
    expect(await viewPermission(planning, 'R-1')).toEqual({ allowed: false, reason: 'portal' });
    expect(await viewPermission({ permission: 'records', ermsUnit: 'legal' }, 'R-1', { establishment: true })).toEqual({ allowed: false, reason: 'portal' });
    expect(isEstablishmentViewer({ permission: 'viewer', office: 'ORD-LEGAL' })).toBe(false);
    // A PEMU account without the Universe Central DB has no establishment to open it from.
    expect(isEstablishmentViewer({ permission: 'records', office: 'ORD-PEMU-TARLAC', domains: ['erms'] })).toBe(false);
  });
});
