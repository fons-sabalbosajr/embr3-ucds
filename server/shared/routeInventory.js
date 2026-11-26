// ---------------------------------------------------------------------------
// Walk the Express router stack and describe every route the app actually
// serves, together with the middleware guarding it.
//
// Reading route files by hand misses things: a router mounted twice, a route
// added by a module behind a flag, or a handler whose guard was dropped in a
// refactor. Asking the app what it registered cannot drift from reality.
//
// Used by scripts/audit-routes.js and by tests/route-protection.test.js.
// ---------------------------------------------------------------------------

/** Middleware whose presence tells us what a route requires. */
const GUARD_NAMES = new Set([
  'authenticateSession',
  'requireDomain',
  'requireDeveloper',
  'requireYearManager',
  'requireRole',
  'requireErmsWrite',
  'requireNasConfig',
  'requireElevation',
  'requireNasActive',
  'requireContainerAccess',
  'resolveYearContext',
  'rejectYearOverride',
  'logActivity',
  'validate',
]);

function guardsOf(layerStack) {
  return layerStack
    .map((l) => l.name)
    .filter((n) => n && n !== '<anonymous>' && n !== 'bound dispatch');
}

/**
 * @param {import('express').Express} app
 * @returns {Array<{method, path, guards: string[], handler: string}>}
 */
function inventory(app) {
  const routes = [];
  const router = app._router || app.router;
  if (!router) return routes;

  const visit = (stack, prefix = '') => {
    for (const layer of stack) {
      if (layer.route) {
        const names = guardsOf(layer.route.stack);
        for (const method of Object.keys(layer.route.methods)) {
          routes.push({
            method: method.toUpperCase(),
            path: prefix + layer.route.path,
            guards: names.filter((n) => GUARD_NAMES.has(n)),
            // The last entry in the stack is the handler itself.
            handler: names[names.length - 1] || 'anonymous',
            all: names,
          });
        }
      } else if (layer.handle && layer.handle.stack) {
        visit(layer.handle.stack, prefix);
      }
    }
  };

  visit(router.stack);
  return routes;
}

/** Deduplicate by method+path, keeping the first registration, which wins. */
function uniqueRoutes(app) {
  const seen = new Set();
  return inventory(app).filter((r) => {
    const key = `${r.method} ${r.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Routes that are public on purpose. Everything else must require a session.
//
// This list is deliberately explicit: a new public route has to be added here
// consciously, and the test fails until it is.
// ---------------------------------------------------------------------------
const PUBLIC_ROUTES = new Set([
  // Sign-in and account recovery must be reachable without a session.
  'POST /login',
  'POST /register',
  'POST /request-password-reset',
  'POST /reset-password',
  // Answers whether a session exists; returns nothing about the user.
  'GET /auth-check',
  'POST /logout',
  // Uptime probes. Liveness returns a constant; readiness pings the database
  // and returns only ok/down, never a connection string or an error detail
  // that names a host.
  'GET /healthz',
  'GET /readyz',
  // VERA on the sign-in page. Off unless an administrator enables it (Admin
  // Settings › VERA Assistant › Public pages); its own narrow knowledge base,
  // every account or record lookup refused before a model is reached, and
  // rate limited by address (controllers/veraController.js).
  'GET /api/vera/public-status',
  'POST /api/vera/public-chat',
  // The E-Universe Document Portal's public page (/e-universe/document-portal):
  // people without an account ask for a scanned document and read it once
  // the unit that keeps it approves. Rate limited by address; a browser
  // reaches its own request only with the httpOnly ticket it was given;
  // changes need the X-Portal-Request header; search returns no file
  // locations; the document is the approved pages only (modules/portal).
  'GET /api/portal/room',
  'GET /api/portal/terms',
  'GET /api/portal/search',
  'POST /api/portal/requests',
  'POST /api/portal/leave',
  'GET /api/portal/document',
  // The temporary conversation about this browser's own request (ticket-scoped, rate limited).
  'GET /api/portal/chat',
  'POST /api/portal/chat',
  // The Progress Tracker's public link (/e-universe/progress/:token): the
  // season's figures only — no files, links, names or activity — for a token
  // the Developer turned on, until its end date; rate limited by address
  // (routes/progressTrackerRoutes.js).
  'GET /api/public/progress/:token',
  // Its map: each firm's dot (a place and a province), and one firm's card —
  // project, industry, municipality, province, the kinds of permit held;
  // never the proponent, the street address or a permit number.
  'GET /api/public/progress/:token/points',
  'GET /api/public/progress/:token/firms/:serial',
  // CORS preflight, answered by the cors middleware before any route runs.
  'OPTIONS *',
]);

/** Domain a path belongs to, by prefix. */
function domainOf(path) {
  if (path.startsWith('/api/erms/')) return 'erms';
  if (
    path.startsWith('/api/org-units') ||
    path.startsWith('/api/admin/') ||
    path.startsWith('/api/audit/') ||
    path.startsWith('/api/legacy-sql/') ||
    path.startsWith('/api/eu-sql/') ||
    path.startsWith('/api/users')
  ) {
    return 'admin';
  }
  if (path.startsWith('/api/nas/')) return 'shared';
  // The Document Portal's public page; its desk is under /api/erms/.
  if (path.startsWith('/api/portal/')) return 'shared';
  if (path.startsWith('/api/auth') || path.startsWith('/api/years')) return 'shared';
  return 'ucds';
}

module.exports = { inventory, uniqueRoutes, PUBLIC_ROUTES, domainOf, GUARD_NAMES };
