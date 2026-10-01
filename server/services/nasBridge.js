const net = require('net');
const { spawn } = require('child_process');
const { connectToMongo, getDb } = require('../config/db');

// ---------------------------------------------------------------------------
// The NAS bridge: the office Windows Server the application reaches the NAS
// through.
//
// The application no longer sits on the NAS's LAN. The Windows Server
// (emb3winsrvr2019, on the tailnet) advertises the NAS's address as a subnet
// route, so the application's SMB connection to 10.14.76.167 travels over the
// tailnet to that server and out onto the office LAN. When the server is
// shut down — it runs on working days — the route is gone and every share
// read would hang until it timed out.
//
// So the NAS is watched. Every `intervalSec` a probe opens a TCP connection
// to the NAS's SMB port — whenever a share is configured at all, bridge or
// no bridge, because a NAS that does not answer is a NAS that does not
// answer whichever road the application takes to it. When a bridge is set
// up the probe pings it as well, so the message can say which of the two
// is off. The last result is what the availability check consults: NAS down
// means "NAS files are not available right now", said at once and in words,
// before anything is tried. A change in state is pushed to every open screen
// over the socket, so the Storage page reacts in real time rather than on
// its next click.
//
// None of this touches the database. MongoDB is reached over the internet,
// not through the office; a NAS outage withdraws the files and nothing else.
//
// Nothing here holds a credential. The hosts named are the tailnet address
// of the bridge and the LAN address of the NAS, both already known to the
// Developer's screen; the audit trail records only up/down, never a host.
// ---------------------------------------------------------------------------

const COLLECTION = 'app-config';
const DOC_ID = 'nas-bridge';
// The last probe, persisted so a restart (or a second process) starts from
// the known state rather than from "never checked".
// Under vitest a separate document, so the suite neither reads the live
// monitor's probes nor overwrites them.
const STATE_ID = process.env.VITEST ? 'nas-bridge-state:test' : 'nas-bridge-state';

const DEFAULTS = {
  enabled: false,
  name: '',
  host: '', // tailnet address or MagicDNS name of the bridge
  nasHost: '10.14.76.167',
  nasPort: 445,
  intervalSec: 30,
  timeoutMs: 4000,
  offlineMessage:
    'The office server that connects this application to the NAS is switched off right now. NAS files are available on working days; please try again then.',
};

// Said when the NAS itself does not answer — with no bridge configured, or
// through a bridge that does. Reassures about the rest on purpose: people
// who see "NAS not connected" assume the whole system is down.
const NAS_OFFLINE_MESSAGE =
  'The NAS is not connected right now, so files stored on it cannot be opened. The database and everything else in the application keep working.';

/** The NAS host named by the records share (\\host\share), if any. */
function hostOfShare() {
  try {
    const root = require('./nasStorage').nasConfig()?.root || '';
    const m = /^\\\\([^\\]+)\\/.exec(root);
    return m ? cleanHost(m[1]) : '';
  } catch {
    return '';
  }
}

/**
 * What is watched under this configuration.
 *
 *   bridge  the office server, when the check is on and it has an address
 *   nas     the NAS itself: always when a share is configured and switched on
 *
 * Under vitest the NAS is watched only through an opted-in bridge test, so
 * the suite's document-access assertions do not depend on whether the real
 * NAS answers from wherever the tests happen to run.
 */
function watched(cfg) {
  const bridge = cfg.enabled && !!cfg.host;
  if (process.env.VITEST) return { bridge, nas: bridge };
  const nas = require('./nasStorage');
  return { bridge, nas: bridge || (nas.isConfigured() && nas.nasConfig().enabled === true) };
}

const collection = () => getDb().collection(COLLECTION);

let cache = { at: 0, value: null };
const CACHE_MS = process.env.VITEST ? 0 : 10 * 1000;

let state = { bridge: null, nas: null, checkedAt: null, up: null };
let timer = null;
let io = null;
let listeners = [];

const clampInt = (v, min, max, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), min), max) : fallback;
};
const cleanHost = (v) => String(v || '').trim().replace(/[^A-Za-z0-9.\-:]/g, '').slice(0, 120);

function normalize(doc) {
  return {
    enabled: doc?.enabled === true,
    name: String(doc?.name || '').trim().slice(0, 80),
    host: cleanHost(doc?.host),
    // Unset means "the host the records share names", so the check needs
    // no setting at all to watch the NAS the application actually reads.
    nasHost: cleanHost(doc?.nasHost) || hostOfShare() || DEFAULTS.nasHost,
    nasPort: clampInt(doc?.nasPort, 1, 65535, DEFAULTS.nasPort),
    intervalSec: clampInt(doc?.intervalSec, 10, 600, DEFAULTS.intervalSec),
    timeoutMs: clampInt(doc?.timeoutMs, 500, 20000, DEFAULTS.timeoutMs),
    offlineMessage: String(doc?.offlineMessage || '').trim().slice(0, 400) || DEFAULTS.offlineMessage,
    updatedAt: doc?.updatedAt || null,
    updatedBy: doc?.updatedBy || null,
  };
}

async function read() {
  if (cache.value && Date.now() - cache.at < CACHE_MS) return cache.value;
  await connectToMongo();
  const value = normalize(await collection().findOne({ _id: DOC_ID }));
  // The live deployment may be watching a real bridge that is, right now,
  // off — a weekend, the tailnet down. That must not turn every document-
  // access assertion in the test suite into "bridge-offline", so under
  // vitest the check is off unless the file testing it opts in.
  if (process.env.VITEST && !process.env.NAS_BRIDGE_TEST) value.enabled = false;
  cache = { at: Date.now(), value };
  return value;
}

async function save(input, actor) {
  const current = await read();
  const next = normalize({ ...current, ...(input || {}) });
  if (next.enabled && !next.host) {
    return { ok: false, status: 400, message: 'Enter the bridge address (its Tailscale IP or name) before enabling the check.' };
  }
  const doc = { ...next, updatedAt: new Date(), updatedBy: actor?.username || 'unknown' };
  await connectToMongo();
  await collection().updateOne({ _id: DOC_ID }, { $set: doc }, { upsert: true });
  cache = { at: 0, value: null };
  const changed = [];
  if (current.enabled !== next.enabled) changed.push(next.enabled ? 'bridge check on' : 'bridge check off');
  if (current.host !== next.host || current.name !== next.name) changed.push('bridge address changed');
  if (current.nasHost !== next.nasHost || current.nasPort !== next.nasPort) changed.push('NAS target changed');
  if (current.intervalSec !== next.intervalSec || current.timeoutMs !== next.timeoutMs) changed.push('probe timing changed');
  if (current.offlineMessage !== next.offlineMessage) changed.push('offline message changed');
  await restart();
  return { ok: true, config: await read(), changed };
}

// --- probes ------------------------------------------------------------------

/** ICMP echo via the OS ping, which needs no raw socket. */
function ping(host, timeoutMs) {
  return new Promise((resolve) => {
    const started = Date.now();
    const args = process.platform === 'win32' ? ['-n', '1', '-w', String(timeoutMs), host] : ['-c', '1', '-W', String(Math.ceil(timeoutMs / 1000)), host];
    let done = false;
    const finish = (up) => {
      if (done) return;
      done = true;
      resolve({ up, ms: Date.now() - started });
    };
    try {
      const p = spawn('ping', args, { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
      let out = '';
      p.stdout.on('data', (d) => { out += d; });
      p.on('error', () => finish(false));
      p.on('close', (code) => {
        // Windows ping exits 0 on "Destination host unreachable" too; the
        // reply line is the real answer.
        finish(code === 0 && /TTL=|ttl=/.test(out));
      });
      setTimeout(() => { try { p.kill(); } catch { /* already gone */ } finish(false); }, timeoutMs + 1500);
    } catch {
      finish(false);
    }
  });
}

/** A TCP connect to host:port — the only thing the share actually needs. */
function tcp(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = new net.Socket();
    let done = false;
    const finish = (up) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve({ up, ms: Date.now() - started });
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

/** One round: the NAS, and the bridge over the tailnet when there is one. */
async function probe() {
  const cfg = await read();
  const w = watched(cfg);
  if (!w.nas) {
    state = { bridge: null, nas: null, checkedAt: new Date(), up: null, enabled: false };
    await persist();
    return state;
  }
  // What matters is whether the NAS answers — by whichever road. At the
  // office the application sits on the same LAN and needs no bridge at all;
  // from anywhere else the SMB connection rides the bridge's route. The
  // bridge is pinged as well so that when the NAS does not answer the
  // message can say which of the two is off.
  const [nas, bridge] = await Promise.all([
    tcp(cfg.nasHost, cfg.nasPort, cfg.timeoutMs),
    w.bridge ? ping(cfg.host, cfg.timeoutMs) : Promise.resolve(null),
  ]);
  const previous = (await status()).up;
  state = { bridge, nas, checkedAt: new Date(), up: nas.up, enabled: true };
  await persist();
  if (previous !== null && previous !== undefined && previous !== state.up) await announce();
  return state;
}

async function persist() {
  try {
    await connectToMongo();
    await collection().updateOne({ _id: STATE_ID }, { $set: { ...state } }, { upsert: true });
  } catch (err) {
    console.warn('[NAS bridge] could not persist the probe:', err.message);
  }
}

/**
 * The last probe, without running one. Memory first; the stored copy when
 * this process has not probed yet (or, under vitest, always — the test and
 * the app hold separate copies of this module).
 */
async function status() {
  if (state.up !== null && !process.env.VITEST) return state;
  try {
    await connectToMongo();
    const doc = await collection().findOne({ _id: STATE_ID });
    if (doc) {
      const { _id, ...rest } = doc;
      return rest;
    }
  } catch { /* fall through to memory */ }
  return state;
}

/** Whether the NAS (or the bridge to it) is currently down, for the availability check. */
async function blocking() {
  const cfg = await read();
  if (!watched(cfg).nas) return null;
  const last = await status();
  // Before the first probe has run, give the benefit of the doubt for one
  // round rather than refuse every request at boot.
  if (last.up === null || last.up === undefined) return null;
  if (last.up) return null;
  // The bridge is the culprit only when it was probed and did not answer;
  // with no bridge, or a bridge that answers, it is the NAS itself.
  const bridgeDown = last.bridge ? !last.bridge.up : false;
  return {
    reason: bridgeDown ? 'bridge-offline' : 'nas-offline',
    message: bridgeDown ? cfg.offlineMessage : NAS_OFFLINE_MESSAGE,
    bridgeName: cfg.name || cfg.host || null,
    checkedAt: last.checkedAt,
  };
}

// --- change notifications -------------------------------------------------------

/** Record the transition and tell every open screen. Never a host in the log. */
async function announce() {
  const nowUp = state.up;
  try {
    await connectToMongo();
    await getDb().collection('app-logs').insertOne({
      userId: null,
      username: 'system',
      domain: 'nas',
      actionType: 'NAS',
      actionLabel: nowUp ? 'nas-bridge-up' : 'nas-bridge-down',
      operation: nowUp ? 'nas-bridge-up' : 'nas-bridge-down',
      success: nowUp,
      detail: nowUp
        ? `The NAS answers again (${state.nas.ms} ms${state.bridge ? `; bridge ${state.bridge.up ? `${state.bridge.ms} ms` : 'no answer'}` : ''}).`
        : !state.bridge
          ? 'The NAS stopped answering.'
          : state.bridge.up
            ? 'The bridge answers but the NAS does not through it.'
            : 'The NAS stopped answering and the bridge server is not reachable.',
      timestamp: new Date(),
    });
  } catch (err) {
    console.warn('[NAS bridge] could not record the state change:', err.message);
  }
  broadcast();
}

/** Push the current availability to sockets and in-process listeners. */
async function broadcast() {
  let payload;
  try {
    payload = await require('./nasActivation').evaluate();
  } catch {
    payload = { active: false, reason: 'bridge-offline' };
  }
  if (io) io.emit('nas:availability', payload);
  for (const fn of listeners) {
    try { fn(payload); } catch { /* listener's problem */ }
  }
}

const onChange = (fn) => {
  listeners.push(fn);
  return () => { listeners = listeners.filter((f) => f !== fn); };
};

// --- lifecycle -----------------------------------------------------------------

async function restart() {
  if (timer) clearInterval(timer);
  timer = null;
  const cfg = await read();
  if (!watched(cfg).nas) {
    const wasUp = state.up;
    state = { bridge: null, nas: null, checkedAt: new Date(), up: null, enabled: false };
    await persist();
    if (wasUp === false) broadcast();
    return;
  }
  // Tests drive probe() by hand; no timer, no boot probe.
  if (process.env.VITEST) return;
  await probe().catch(() => {});
  timer = setInterval(() => probe().catch(() => {}), cfg.intervalSec * 1000);
  if (timer.unref) timer.unref();
}

/** Called once from server.js after the socket server exists. */
async function start(socketServer) {
  io = socketServer || null;
  await restart();
}

module.exports = { read, save, probe, status, blocking, start, restart, broadcast, onChange, watched, DEFAULTS, NAS_OFFLINE_MESSAGE, COLLECTION, DOC_ID };
