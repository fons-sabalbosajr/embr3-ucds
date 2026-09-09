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
  // CORS preflight, answered by the cors middleware before any route runs.
  'OPTIONS *',
]);

/** Domain a path belongs to, by prefix. */
function domainOf(path) {
  if (path.startsWith('/api/erms/')) return 'erms';
  if (
    path.startsWith('/api/org-units') ||
    path.startsWith('/api/admin/') ||
    path.startsWith('/api/users')
  ) {
    return 'admin';
  }
  if (path.startsWith('/api/nas/')) return 'shared';
  if (path.startsWith('/api/auth') || path.startsWith('/api/years')) return 'shared';
  return 'ucds';
}

module.exports = { inventory, uniqueRoutes, PUBLIC_ROUTES, domainOf, GUARD_NAMES };
