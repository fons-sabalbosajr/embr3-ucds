const yearService = require('./yearService');
const { PROVINCE_KEYS, normalizeKeys, userProvinceKeys } = require('./provinces');

// ---------------------------------------------------------------------------
// Roles map onto the `permission` values already stored on user documents:
//
//   developer -> Developer   unrestricted; system configuration + Main Settings
//   admin     -> Admin       all years, all normal menus, no developer functions
//   <other>   -> Guest       only the years listed in user.assignedYears
//
// This deliberately reuses the existing field rather than introducing a second
// permission system.
// ---------------------------------------------------------------------------

const ROLES = { DEVELOPER: 'developer', ADMIN: 'admin', GUEST: 'guest' };

function roleOf(user) {
  const raw = String(user?.permission || '').trim().toLowerCase();
  if (raw === ROLES.DEVELOPER) return ROLES.DEVELOPER;
  if (raw === ROLES.ADMIN) return ROLES.ADMIN;
  return ROLES.GUEST; // 'viewer' and anything unrecognised
}

const isDeveloper = (user) => roleOf(user) === ROLES.DEVELOPER;
const canAccessAllYears = (user) => [ROLES.DEVELOPER, ROLES.ADMIN].includes(roleOf(user));

/**
 * Years this user may enter. Developers and Admins get every active container;
 * Guests get the intersection of their assignment and the active containers.
 *
 * A Guest with no `assignedYears` gets nothing. The migration grants existing
 * accounts the baseline year explicitly, so absence means "never configured"
 * and must fail closed.
 */
async function authorizedYears(user) {
  const active = await yearService.listYearNumbers();
  if (canAccessAllYears(user)) return active;

  const assigned = Array.isArray(user?.assignedYears)
    ? user.assignedYears.map(Number).filter(Number.isInteger)
    : [];
  return active.filter((y) => assigned.includes(y));
}

async function canAccessYear(user, year) {
  const n = Number(year);
  if (!Number.isInteger(n)) return false;
  return (await authorizedYears(user)).includes(n);
}

/** Developers and Admins manage year containers; Guests never do. */
const canManageYears = (user) => canAccessAllYears(user);

/**
 * Province keys a user may work on inside a given container.
 *
 * A container declares which provinces are in scope for that year. A Guest's
 * effective scope is the intersection of that list with the per-province
 * permissions already on their account — so neither grant alone widens access.
 * Developers and Admins see the container's full scope.
 *
 * A container with no province list means "all provinces", which keeps
 * pre-existing containers behaving exactly as before.
 */
function authorizedProvinces(user, container) {
  const containerScope =
    Array.isArray(container?.provinces) && container.provinces.length
      ? normalizeKeys(container.provinces)
      : PROVINCE_KEYS;

  if (canAccessAllYears(user)) return containerScope;

  const userScope = userProvinceKeys(user);
  return containerScope.filter((k) => userScope.includes(k));
}

module.exports = {
  canManageYears,
  authorizedProvinces,
  ROLES,
  roleOf,
  isDeveloper,
  canAccessAllYears,
  authorizedYears,
  canAccessYear,
};
