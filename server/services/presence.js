const shortCache = require('../shared/services/shortCache');

// ---------------------------------------------------------------------------
// Who is signed in, pushed as it changes.
//
// The "online" list on every Planning screen used to learn about a sign-in
// at its next poll — up to a minute later. Now a sign-in or sign-out tells
// every open screen at once over Socket.IO, and the screens fetch the list
// again (GET /api/online_users).
//
// Bursts are coalesced: when thirty people sign in within the same second at
// the start of the day, open screens get one notice for the lot, not thirty
// — otherwise every screen would refetch thirty times and the burst of
// sign-ins would turn into a burst of everything else.
// ---------------------------------------------------------------------------

const EVENT = 'presence:changed';
const COALESCE_MS = 1500;

let io = null;
let pending = [];
let timer = null;

/** Called once by server.js with the Socket.IO server. */
function attach(socketServer) {
  io = socketServer;
}

function flush() {
  timer = null;
  const changes = pending;
  pending = [];
  if (io && changes.length) io.emit(EVENT, { changes, at: new Date().toISOString() });
}

/** Someone signed in or out. */
function changed({ username, name, online }) {
  // The cached online list (usersController.getOnlineUsers) is now wrong.
  shortCache.invalidate('users:online');
  pending.push({ username, name, online: Boolean(online) });
  if (!timer) {
    timer = setTimeout(flush, COALESCE_MS);
    timer.unref?.();
  }
}

module.exports = { attach, changed, EVENT };
