const {
  ROLES,
  roleOf,
  isDeveloper,
  canAccessYear,
  canManageYears,
  authorizedProvinces,
  hasDomain,
  domainsOf,
} = require('../services/authorization');
const { provinceFilter } = require('../services/provinces');
const yearService = require('../services/yearService');

// BYPASS_AUTH is honoured outside production only. Even if the startup guard
// below were somehow skipped, a production process still enforces every check.
const bypassEnabled = () =>
  process.env.BYPASS_AUTH === 'true' && process.env.NODE_ENV !== 'production';

// BYPASS_AUTH is a local development escape hatch. It already grants access to
// every authenticated route, so it also stands in as a Developer principal for
// role/year checks — otherwise year-aware routes would fail with no session.
const BYPASS_PRINCIPAL = { username: '__bypass__', permission: ROLES.DEVELOPER };

/** The acting user, or null. Never trusts anything outside the session. */
function principalOf(req) {
  if (req.session && req.session.user) return req.session.user;
  if (bypassEnabled()) return BYPASS_PRINCIPAL;
  return null;
}

function authenticateSession(req, res, next) {
  if (bypassEnabled()) return next();
  if (req.session && req.session.user) return next();
  res.status(401).json({ message: 'User not authenticated' });
}

/** Developer-only routes: Main Settings, year management, system configuration. */
function requireDeveloper(req, res, next) {
  const user = principalOf(req);
  if (!user) return res.status(401).json({ message: 'User not authenticated' });
  if (!isDeveloper(user)) {
    return res.status(403).json({ message: 'Developer access required' });
  }
  next();
}

/** Year-container management: Developers and Admins, never Guests. */
function requireYearManager(req, res, next) {
  const user = principalOf(req);
  if (!user) return res.status(401).json({ message: 'User not authenticated' });
  if (!canManageYears(user)) {
    return res.status(403).json({ message: 'Administrator access required' });
  }
  next();
}

/**
 * Gate a route on a business domain.
 *
 * This is the boundary between UCDS and ERMS, and it is enforced here rather
 * than by which menu items the client renders. A Planning user who types an
 * ERMS URL, or calls the endpoint directly, gets 403 whether or not the link
 * was ever shown to them.
 */
function requireDomain(domain) {
  return (req, res, next) => {
    const user = principalOf(req);
    if (!user) return res.status(401).json({ message: 'User not authenticated' });
    if (!hasDomain(user, domain)) {
      return res.status(403).json({
        code: 'DOMAIN_FORBIDDEN',
        message: `You do not have access to the ${domain.toUpperCase()} module.`,
      });
    }
    next();
  };
}

function requireRole(...allowed) {
  const permitted = allowed.map((r) => String(r).toLowerCase());
  return (req, res, next) => {
    const user = principalOf(req);
    if (!user) return res.status(401).json({ message: 'User not authenticated' });
    if (!permitted.includes(roleOf(user))) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    next();
  };
}

/**
 * Establish req.activeYear for year-aware routes.
 *
 * The year comes from the session — set by POST /api/years/select after an
 * authorization check — never from the URL, query string or body. A client
 * that rewrites a request to another year therefore changes nothing.
 */
async function resolveYearContext(req, res, next) {
  try {
    const user = principalOf(req);
    if (!user) return res.status(401).json({ message: 'User not authenticated' });

    const year = req.session ? req.session.activeYear : null;
    if (!year) {
      return res.status(409).json({
        code: 'NO_ACTIVE_YEAR',
        message: 'No year container selected.',
      });
    }

    // Re-validate on every request: a container may have been archived, or the
    // user's assignment revoked, since the year was selected.
    if (!(await canAccessYear(user, year))) {
      if (req.session) delete req.session.activeYear;
      return res.status(403).json({
        code: 'YEAR_FORBIDDEN',
        message: `You are not authorized to access the ${year} data container.`,
      });
    }

    req.activeYear = Number(year);

    // Province scope for this user in this container: the container's declared
    // provinces intersected with the account's own province permissions.
    // Handlers must apply req.provinceFilter to register reads/writes.
    const container = await yearService.getYear(req.activeYear);
    req.yearContainer = container;
    req.provinceKeys = authorizedProvinces(user, container);
    req.provinceFilter = provinceFilter(req.provinceKeys);

    res.set('X-UCDS-Active-Year', String(req.activeYear));
    next();
  } catch (error) {
    console.error('Error resolving year context:', error);
    res.status(500).json({ message: 'Failed to resolve year context' });
  }
}

/**
 * Reject any request that names a year other than the session's active year.
 * Defence in depth for handlers that still read a year from their input.
 */
function rejectYearOverride(req, res, next) {
  const claimed = req.params?.year ?? req.query?.year ?? req.body?.year;
  if (claimed === undefined || claimed === null || claimed === '') return next();
  if (Number(claimed) !== Number(req.activeYear)) {
    return res.status(403).json({
      code: 'YEAR_MISMATCH',
      message: 'Requested year does not match the active year container.',
    });
  }
  next();
}

/**
 * Refuse to start a production process that has the bypass switch set.
 *
 * Previously this only logged a warning, which meant a stray BYPASS_AUTH in a
 * deployment's environment would serve every route unauthenticated and the
 * only trace would be one line in the startup log.
 */
function assertAuthNotBypassed() {
  if (process.env.BYPASS_AUTH !== 'true') return;

  if (process.env.NODE_ENV === 'production') {
    console.error(
      'FATAL: BYPASS_AUTH=true with NODE_ENV=production.\n' +
        '       This would disable authentication, role and year checks for every\n' +
        '       request. Refusing to start. Remove BYPASS_AUTH from the environment.'
    );
    process.exit(1);
  }

  console.warn(
    'WARNING: BYPASS_AUTH=true — authentication, role and year checks are disabled.\n' +
      '         This must never be set in a deployed environment.'
  );
}

module.exports = {
  authenticateSession,
  requireDeveloper,
  requireYearManager,
  requireDomain,
  requireRole,
  resolveYearContext,
  rejectYearOverride,
  principalOf,
  assertAuthNotBypassed,
  yearService,
};
