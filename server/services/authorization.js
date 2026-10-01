const yearService = require('./yearService');
const { PROVINCE_KEYS, normalizeKeys, userProvinceKeys } = require('./provinces');

// ---------------------------------------------------------------------------
// One authorization model, four facets:
//
//   role          what kind of user this is        user.permission
//   domains       which business domains they      user.domains
//                 may enter
//   capabilities  what they may do inside one      user.capabilities
//   scope         which slice of data they see     user.assignedYears + provinces
//
// Before this, the same three questions were answered three different ways: a
// role string checked here, a set of named booleans on the user document that
// nothing enforced, and a positional boolean array the sidebar indexed by hand
// (permissions[2] meant "admin"). Only the first was ever enforced server-side.
// ---------------------------------------------------------------------------

const ROLES = {
  DEVELOPER: 'developer',
  ADMIN: 'admin',
  RECORDS: 'records',
  PLANNING: 'planning',
  VIEWER: 'viewer',
};

const ROLE_VALUES = new Set(Object.values(ROLES));

/**
 * How each role is named on screen, and what it is for. The stored values
 * above are unchanged — accounts keep working — only the words are new:
 * "viewer" was never a good name for the people who do the encoding.
 *
 * `admin` is kept for the accounts that already hold it; new accounts get
 * one of the other four.
 */
const ROLE_LABELS = {
  [ROLES.DEVELOPER]: 'Developer',
  [ROLES.ADMIN]: 'Administrator',
  [ROLES.PLANNING]: 'Planning Admin',
  [ROLES.RECORDS]: 'ERMS User',
  [ROLES.VIEWER]: 'Encoder',
};

const ROLE_DESCRIPTIONS = {
  [ROLES.DEVELOPER]: 'Everything: UCDS, ERMS, administration, the NAS and every storage container.',
  [ROLES.ADMIN]: 'Legacy: UCDS, ERMS and administration. Reassign to one of the other types.',
  [ROLES.PLANNING]: 'UCDS, and the storage containers the Developer designates.',
  [ROLES.RECORDS]: 'ERMS for one unit — Records, Legal Services or Laboratory — set as the System on the account, with that unit\'s storage container. No year container to choose.',
  [ROLES.VIEWER]: 'UCDS only, within the year containers assigned. No storage access.',
};

// --- ERMS units ---------------------------------------------------------------
//
// The desktop ERMS was three subsystems, one per unit, each with its own
// database and its own NAS share. An ERMS User belongs to exactly one of
// them — the "System" on the account — and sees that unit's documents and
// nothing of the other two. The Developer (and the legacy Administrator)
// sees all three. The unit's key is also its storage container's key.

const ERMS_UNITS = {
  RECORDS: 'records',
  LEGAL: 'legal',
  LABORATORY: 'laboratory',
};
const ERMS_UNIT_VALUES = Object.values(ERMS_UNITS);
const ERMS_UNIT_LABELS = {
  [ERMS_UNITS.RECORDS]: 'Records Unit',
  [ERMS_UNITS.LEGAL]: 'Legal Services Unit',
  [ERMS_UNITS.LABORATORY]: 'Laboratory Unit',
};

/**
 * The one unit this account works in, or null for an account that sees all
 * of them (Developer, legacy Administrator) or none (an Encoder).
 *
 * An ERMS User from before the field existed is a Records Unit user: that is
 * what the role always was.
 */
function ermsUnitOf(user) {
  const raw = String(user?.ermsUnit || '').trim().toLowerCase();
  if (ERMS_UNIT_VALUES.includes(raw)) return raw;
  return roleOf(user) === ROLES.RECORDS ? ERMS_UNITS.RECORDS : null;
}

/** The units this account may see: one for an ERMS User, all for a Developer/Administrator. */
function ermsUnitsOf(user) {
  if (canAccessAllYears(user)) return [...ERMS_UNIT_VALUES];
  const one = ermsUnitOf(user);
  return one ? [one] : [];
}

/** Whether `user` may see `unit`'s documents at all. */
const canSeeErmsUnit = (user, unit) => ermsUnitsOf(user).includes(String(unit || '').toLowerCase());

/**
 * An ERMS end user: someone whose work is a unit's documents, not the
 * register. They are spared the year container picker — nothing they do is
 * year-scoped — and land in their unit directly.
 */
const isErmsEndUser = (user) => roleOf(user) === ROLES.RECORDS;

/** The types offered when creating or reassigning an account. */
const ASSIGNABLE_ROLES = [ROLES.DEVELOPER, ROLES.PLANNING, ROLES.RECORDS, ROLES.VIEWER];

const DOMAINS = {
  UCDS: 'ucds',
  ERMS: 'erms',
  ADMIN: 'admin',
};

const DOMAIN_VALUES = new Set(Object.values(DOMAINS));

/**
 * Domains a role may enter when the user document does not say otherwise.
 *
 * `viewer` maps to UCDS because that is what every pre-existing account is:
 * the backfill therefore changes nobody's access.
 */
const DEFAULT_DOMAINS = {
  [ROLES.DEVELOPER]: [DOMAINS.UCDS, DOMAINS.ERMS, DOMAINS.ADMIN],
  [ROLES.ADMIN]: [DOMAINS.UCDS, DOMAINS.ERMS, DOMAINS.ADMIN],
  // ERMS Users hold ERMS only. The Universe Central DB is the Planning
  // Unit's; an ERMS User has their unit's own screens (dashboard, register
  // or documents, upload). The register lookup on the record form reads
  // UCDS through the ERMS module's own route, so no UCDS entitlement is
  // needed for it. An administrator can still widen a specific account by
  // setting `domains` on it.
  [ROLES.RECORDS]: [DOMAINS.ERMS],
  [ROLES.PLANNING]: [DOMAINS.UCDS],
  [ROLES.VIEWER]: [DOMAINS.UCDS],
};

/** The named capabilities. Previously indexed positionally by the sidebar. */
const CAPABILITY_KEYS = [
  'canGenerateData',
  'canManageData',
  'canViewAdminPanel',
  'canViewDataHistory',
  'canAccessRangePicker',
];

function roleOf(user) {
  const raw = String(user?.permission || '').trim().toLowerCase();
  if (ROLE_VALUES.has(raw)) return raw;
  // 'guest' and anything unrecognised fall to the least-privileged role.
  return ROLES.VIEWER;
}

const isDeveloper = (user) => roleOf(user) === ROLES.DEVELOPER;
const canAccessAllYears = (user) => [ROLES.DEVELOPER, ROLES.ADMIN].includes(roleOf(user));

// --- Domains ---------------------------------------------------------------

function normalizeDomains(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((v) => String(v).trim().toLowerCase()))].filter((v) =>
    DOMAIN_VALUES.has(v)
  );
}

/**
 * Domains this user may enter.
 *
 * An explicit `domains` array on the account wins. Absent or empty, the role's
 * default applies — so an account that predates this field keeps working, and
 * an administrator can still narrow a specific user by setting the array.
 */
function domainsOf(user) {
  const explicit = normalizeDomains(user?.domains);
  if (explicit.length) return explicit;
  return DEFAULT_DOMAINS[roleOf(user)] || [DOMAINS.UCDS];
}

const hasDomain = (user, domain) => domainsOf(user).includes(String(domain).toLowerCase());

// --- Capabilities ----------------------------------------------------------

/**
 * Named capability flags, always a complete object.
 *
 * Reads the nested `capabilities` object first and falls back to the legacy
 * top-level booleans, so the two can coexist while accounts are migrated.
 * Developers hold every capability by definition — the role already implies
 * unrestricted access, and a stored `false` would only be misleading.
 */
function capabilitiesOf(user) {
  const developer = isDeveloper(user);
  const nested = user && typeof user.capabilities === 'object' ? user.capabilities : null;

  return CAPABILITY_KEYS.reduce((acc, key) => {
    if (developer) {
      acc[key] = true;
    } else if (nested && key in nested) {
      acc[key] = nested[key] === true;
    } else {
      acc[key] = user?.[key] === true;
    }
    return acc;
  }, {});
}

const hasCapability = (user, key) => capabilitiesOf(user)[key] === true;

// --- Years -----------------------------------------------------------------

/**
 * Years this user may enter. Developers and Admins get every active container;
 * everyone else gets the intersection of their assignment and the active
 * containers.
 *
 * An account with no `assignedYears` gets nothing. The migration grants
 * existing accounts the baseline year explicitly, so absence means "never
 * configured" and must fail closed.
 */
async function authorizedYears(user) {
  // Hidden containers are offered to nobody; Year Configuration lists them
  // through the admin route instead.
  const active = (await yearService.listYears()).filter((y) => y.hidden !== true).map((y) => y.year);
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

/** Developers and Admins manage year containers; nobody else does. */
const canManageYears = (user) => canAccessAllYears(user);

// --- Provinces -------------------------------------------------------------

/**
 * Province keys a user may work on inside a given container.
 *
 * A container declares which provinces are in scope for that year. A restricted
 * user's effective scope is the intersection of that list with the per-province
 * permissions on their account — so neither grant alone widens access.
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

// --- Storage containers ------------------------------------------------------

/**
 * Storage containers this user may open, given every container that exists.
 *
 * The Developer opens all of them. Everyone else opens exactly what the
 * Developer designated on their account (`nasContainers`), which is the whole
 * point: staff never hold a share credential, and the NAS is shared to them
 * inside the application, container by container.
 *
 * An account with no `nasContainers` at all predates the field. A Records
 * Admin from before then keeps the records container — that is what their
 * role always opened — and everyone else gets nothing, so absence fails
 * closed rather than open.
 */
function nasContainersOf(user, allKeys = []) {
  const keys = Array.isArray(allKeys) ? allKeys.map(String) : [];
  if (isDeveloper(user)) return keys;
  // Encoders work in UCDS only; the NAS is not part of that job, whatever a
  // stale designation on the account says.
  if (roleOf(user) === ROLES.VIEWER) return [];

  if (Array.isArray(user?.nasContainers) && user.nasContainers.length) {
    const wanted = new Set(user.nasContainers.map((k) => String(k).trim().toLowerCase()));
    // An ERMS User always holds their own unit's container as well: the
    // unit's documents live there, and a designation cannot take that away.
    const own = ermsUnitOf(user);
    if (own && roleOf(user) === ROLES.RECORDS) wanted.add(own);
    return keys.filter((k) => wanted.has(k));
  }
  if (roleOf(user) === ROLES.RECORDS) {
    const own = ermsUnitOf(user);
    return keys.filter((k) => k === own);
  }
  return [];
}

const canOpenContainer = (user, key, allKeys) =>
  nasContainersOf(user, allKeys).includes(String(key || '').toLowerCase());

module.exports = {
  ROLES,
  ROLE_LABELS,
  ROLE_DESCRIPTIONS,
  ASSIGNABLE_ROLES,
  DOMAINS,
  ERMS_UNITS,
  ERMS_UNIT_VALUES,
  ERMS_UNIT_LABELS,
  ermsUnitOf,
  ermsUnitsOf,
  canSeeErmsUnit,
  isErmsEndUser,
  nasContainersOf,
  canOpenContainer,
  CAPABILITY_KEYS,
  DEFAULT_DOMAINS,
  roleOf,
  isDeveloper,
  canAccessAllYears,
  normalizeDomains,
  domainsOf,
  hasDomain,
  capabilitiesOf,
  hasCapability,
  authorizedYears,
  canAccessYear,
  canManageYears,
  authorizedProvinces,
};
