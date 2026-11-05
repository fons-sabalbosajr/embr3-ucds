// ---------------------------------------------------------------------------
// How long each route takes, measured in the running server.
//
// Without it, slowness was only ever known by someone complaining or by a
// one-off measurement. Each finished request is counted against its route; one
// over SLOW_REQUEST_MS (default 3 s) is also written to the log. The longest
// the event loop was held up is kept too: on one Node thread, that is how long
// everyone else was kept waiting.
//
// The route's pattern only, never the URL: a query string or a serial can name
// a person or a firm, and nothing about a request's content is kept. In memory,
// so a restart starts afresh and nothing is written to the shared cluster.
//   GET /api/health/performance   (Developer) the slowest routes
// ---------------------------------------------------------------------------

const { monitorEventLoopDelay } = require('perf_hooks');

const SLOW_MS = () => Number(process.env.SLOW_REQUEST_MS) || 3000;

const routes = new Map(); // 'GET /api/x/:id' -> { count, totalMs, maxMs, slow, errors }
const since = new Date();
const stalls = monitorEventLoopDelay({ resolution: 20 });
stalls.enable();

function requestTiming(req, res, next) {
  const started = Date.now();
  res.on('finish', () => {
    // Unmatched paths have no pattern, and are not worth a row each.
    if (!req.route) return;
    const pattern = String(req.route.path);
    const key = `${req.method} ${req.baseUrl || ''}${pattern}`;
    const ms = Date.now() - started;
    const row = routes.get(key) || { count: 0, totalMs: 0, maxMs: 0, slow: 0, errors: 0 };
    row.count += 1;
    row.totalMs += ms;
    row.maxMs = Math.max(row.maxMs, ms);
    if (res.statusCode >= 500) row.errors += 1;
    if (ms >= SLOW_MS()) {
      row.slow += 1;
      console.warn(`[slow request] ${key} ${ms} ms, status ${res.statusCode}`);
    }
    routes.set(key, row);
  });
  next();
}

/** The routes that took longest at their worst, and the longest hold on the event loop. */
function summary(limit = 50) {
  return {
    since,
    slowRequestMs: SLOW_MS(),
    longestStallMs: Math.round(stalls.max / 1e6),
    routes: [...routes]
      .map(([route, r]) => ({ route, count: r.count, avgMs: Math.round(r.totalMs / r.count), maxMs: r.maxMs, slow: r.slow, errors: r.errors }))
      .sort((a, b) => b.maxMs - a.maxMs)
      .slice(0, limit),
  };
}

module.exports = { requestTiming, summary };
