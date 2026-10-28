const { roleOf, ROLES, isDeveloper, hasDomain, DOMAINS, ermsUnitOf, ERMS_UNITS } = require('../../../services/authorization');

// ---------------------------------------------------------------------------
// Who may open a Records scan inside E-Universe.
//
// The rule, set by the office:
//
//   * Nobody downloads. Documents are viewed in the browser and never handed
//     over as a file — there is no download endpoint, and the viewer is told
//     to hide its save button. Every view is in the audit trail.
//   * The Records Unit views. A Records Admin, an Administrator with ERMS, or
//     the Developer opens any document whose record they can read.
//   * The Planning Unit and the PEMUs view an establishment's documents from
//     its record in the Universe Central DB (the Documents tab, through the
//     UCDS routes only) — they plan and monitor those establishments. In their
//     provinces only, view-only, under the same page limit and audit trail.
//   * Everyone else asks in the E-Universe Document Portal (modules/portal),
//     where the unit that keeps the document decides. The in-app request,
//     approval and "full access" inbox that used to live here is gone.
// ---------------------------------------------------------------------------

const PORTAL_URL = '/e-universe/document-portal';

/**
 * The Records Unit: the people who view without asking.
 *
 * The Records Unit's own staff, not every ERMS User: Legal Services and
 * Laboratory staff hold the same role for their own units. An ERMS User from
 * before units existed is a Records Unit user (authorization.ermsUnitOf).
 */
const isRecordsUnit = (user) =>
  isDeveloper(user) ||
  (roleOf(user) === ROLES.RECORDS && ermsUnitOf(user) === ERMS_UNITS.RECORDS) ||
  (roleOf(user) === ROLES.ADMIN && hasDomain(user, DOMAINS.ERMS));

// A PEMU office: "ORD-PEMU-BATAAN", "PEMU Tarlac".
const PEMU_RE = /\bPEMU\b/i;

/**
 * The Planning Unit and the PEMUs: they open an establishment's documents
 * from its register record. On the Universe Central DB only.
 */
const isEstablishmentViewer = (user) =>
  hasDomain(user, DOMAINS.UCDS) && (roleOf(user) === ROLES.PLANNING || PEMU_RE.test(`${user?.office || ''} ${user?.division || ''}`));

/**
 * Whether `user` may open a Records document here: { allowed, reason }.
 * `establishment`: asked from an establishment's record (the UCDS routes).
 */
async function viewPermission(user, _serialNo, { establishment = false } = {}) {
  if (isRecordsUnit(user)) return { allowed: true, reason: 'records-unit' };
  if (establishment && isEstablishmentViewer(user)) return { allowed: true, reason: 'establishment' };
  return { allowed: false, reason: 'portal' };
}

module.exports = { PORTAL_URL, isRecordsUnit, isEstablishmentViewer, viewPermission };
