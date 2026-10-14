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

/** Whether `user` may open a Records document here: { allowed, reason }. */
async function viewPermission(user) {
  return isRecordsUnit(user) ? { allowed: true, reason: 'records-unit' } : { allowed: false, reason: 'portal' };
}

module.exports = { PORTAL_URL, isRecordsUnit, viewPermission };
