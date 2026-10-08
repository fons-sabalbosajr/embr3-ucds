// ---------------------------------------------------------------------------
// A few seconds of memory for expensive reads that many people ask for.
//
// A dashboard is half a dozen aggregations over the whole register, and it
// refreshes itself every minute for everyone looking at it. Run per viewer,
// a hundred viewers is a hundred times the same work on a database that has
// an operations-per-second limit. Kept for `ttlMs`, it is done once and
// handed to everyone who asks in that window.
//
// Identical requests that arrive while the first is still running share it
// rather than starting their own. A write that changes the answer calls
// invalidate() with the key's prefix, so a clerk who has just filed sees the
// new count at once rather than after the window.
//
// One process, in memory: the application runs as a single Node process. A
// second process would keep its own copy, which is still correct (each is at
// most `ttlMs` stale), only less effective.
// ---------------------------------------------------------------------------

const entries = new Map(); // key -> { expires, value?, pending? }

async function cached(key, ttlMs, compute) {
  const now = Date.now();
  const hit = entries.get(key);
  if (hit) {
    if (hit.pending) return hit.pending;
    if (hit.expires > now) return hit.value;
  }
  const pending = Promise.resolve()
    .then(compute)
    .then(
      (value) => {
        entries.set(key, { expires: Date.now() + ttlMs, value });
        return value;
      },
      (err) => {
        // A failure is not remembered: the next caller tries again.
        entries.delete(key);
        throw err;
      }
    );
  entries.set(key, { expires: 0, pending });
  return pending;
}

/** Forget every entry whose key starts with `prefix`. */
function invalidate(prefix) {
  for (const key of entries.keys()) if (key.startsWith(prefix)) entries.delete(key);
}

module.exports = { cached, invalidate };
