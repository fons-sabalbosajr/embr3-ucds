const dns = require('dns');
const net = require('net');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// DNS, made to work on the networks this server actually runs on.
//
// Node resolves DNS two different ways:
//   - dns.lookup()  -> the operating system resolver (used by HTTP, npm, etc.)
//   - dns.resolve*() -> Node's bundled c-ares resolver, which reads the adapter
//     list itself. This is what `mongodb+srv://` uses to look up SRV records.
//
// Two things go wrong with them in practice:
//
//   1. On Windows, virtual adapters (VirtualBox Host-Only, VPN tunnels, WSL)
//      often advertise the `fec0:0:0:ffff::1` IPv6 placeholders. c-ares can
//      fail to enumerate that list and silently falls back to its built-in
//      127.0.0.1 default, where nothing is listening:
//        Error: querySrv ECONNREFUSED _mongodb._tcp.<cluster>.mongodb.net
//      Setting DNS_SERVERS in .env pins the resolver c-ares uses.
//
//   2. Some networks (office Wi-Fi, hotspots, hotel/café portals) drop or
//      throttle UDP port 53 while TCP still passes. Both resolvers above use
//      UDP, so every lookup times out:
//        Error: querySrv ETIMEOUT _mongodb._tcp.<cluster>.mongodb.net
//      and the server cannot even start. DNS also runs over TCP (RFC 7766),
//      and that works on those networks. So this file carries a small
//      DNS-over-TCP client and uses it as the fallback: when the normal
//      SRV/TXT lookup fails, the records are fetched over TCP; and the Mongo
//      driver is given a `lookup` that resolves the shard hostnames the same
//      way. The driver still connects by hostname, so TLS certificate
//      verification is unchanged.
// ---------------------------------------------------------------------------

const PUBLIC_RESOLVERS = ['1.1.1.1', '8.8.8.8', '9.9.9.9'];
const TCP_TIMEOUT_MS = 5000;
// How long the normal (UDP) path gets before the TCP fallback starts. Short
// on purpose: a dead UDP resolver otherwise eats the driver's whole
// server-selection window one hostname at a time.
const UDP_TIMEOUT_MS = 2000;

function parseServers(raw) {
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function isUnusable(servers) {
  // c-ares' fallback when it cannot read any resolver from the OS.
  return servers.length === 0 || servers.every((s) => s === '127.0.0.1' || s === '::1');
}

/** Resolvers to try over TCP: the configured ones, then the public ones. */
function tcpResolvers() {
  const configured = process.env.DNS_SERVERS ? parseServers(process.env.DNS_SERVERS) : [];
  let system = [];
  try {
    system = dns.getServers().filter((s) => net.isIPv4(s) && s !== '127.0.0.1');
  } catch {
    system = [];
  }
  return [...new Set([...configured, ...system, ...PUBLIC_RESOLVERS])];
}

// --- a minimal DNS-over-TCP client -------------------------------------------------

const TYPES = { A: 1, TXT: 16, SRV: 33 };

function encodeName(name) {
  const parts = String(name).replace(/\.$/, '').split('.');
  const bufs = parts.map((p) => Buffer.concat([Buffer.from([p.length]), Buffer.from(p, 'ascii')]));
  return Buffer.concat([...bufs, Buffer.from([0])]);
}

function buildQuery(name, type) {
  const header = Buffer.alloc(12);
  header.writeUInt16BE(crypto.randomInt(0, 65536), 0);
  header.writeUInt16BE(0x0100, 2); // recursion desired
  header.writeUInt16BE(1, 4); // one question
  const question = Buffer.concat([encodeName(name), Buffer.from([0, type, 0, 1])]);
  return Buffer.concat([header, question]);
}

/** Read a (possibly compressed) name at `offset`; returns { name, next }. */
function readName(buf, offset) {
  const labels = [];
  let pos = offset;
  let next = null;
  let hops = 0;
  for (;;) {
    if (pos >= buf.length) throw new Error('DNS response truncated');
    const len = buf[pos];
    if (len === 0) {
      pos += 1;
      break;
    }
    if ((len & 0xc0) === 0xc0) {
      const pointer = ((len & 0x3f) << 8) | buf[pos + 1];
      if (next === null) next = pos + 2;
      pos = pointer;
      if (++hops > 64) throw new Error('DNS name compression loop');
      continue;
    }
    labels.push(buf.toString('ascii', pos + 1, pos + 1 + len));
    pos += 1 + len;
  }
  return { name: labels.join('.'), next: next === null ? pos : next };
}

function parseResponse(buf, wantedType) {
  if (buf.length < 12) throw new Error('DNS response too short');
  const rcode = buf[3] & 0x0f;
  if (rcode !== 0) {
    const err = new Error(rcode === 3 ? 'DNS name not found' : `DNS response code ${rcode}`);
    err.code = rcode === 3 ? 'ENOTFOUND' : 'ESERVFAIL';
    throw err;
  }
  const qd = buf.readUInt16BE(4);
  const an = buf.readUInt16BE(6);
  let pos = 12;
  for (let i = 0; i < qd; i += 1) {
    pos = readName(buf, pos).next + 4;
  }
  const answers = [];
  for (let i = 0; i < an; i += 1) {
    const { name, next } = readName(buf, pos);
    const type = buf.readUInt16BE(next);
    const rdlength = buf.readUInt16BE(next + 8);
    const rdata = next + 10;
    if (type === wantedType) {
      if (type === TYPES.A) {
        answers.push({ name, address: Array.from(buf.subarray(rdata, rdata + 4)).join('.') });
      } else if (type === TYPES.SRV) {
        answers.push({
          name: readName(buf, rdata + 6).name,
          priority: buf.readUInt16BE(rdata),
          weight: buf.readUInt16BE(rdata + 2),
          port: buf.readUInt16BE(rdata + 4),
        });
      } else if (type === TYPES.TXT) {
        const strings = [];
        let p = rdata;
        while (p < rdata + rdlength) {
          const len = buf[p];
          strings.push(buf.toString('utf8', p + 1, p + 1 + len));
          p += 1 + len;
        }
        answers.push(strings);
      }
    }
    pos = rdata + rdlength;
  }
  return answers;
}

function queryTcpOnce(server, name, type) {
  return new Promise((resolve, reject) => {
    const query = buildQuery(name, type);
    const socket = net.connect({ host: server, port: 53 });
    let buffer = Buffer.alloc(0);
    let done = false;
    const finish = (err, value) => {
      if (done) return;
      done = true;
      socket.destroy();
      if (err) reject(err);
      else resolve(value);
    };
    socket.setTimeout(TCP_TIMEOUT_MS, () => finish(Object.assign(new Error(`DNS over TCP to ${server} timed out`), { code: 'ETIMEOUT' })));
    socket.once('error', (err) => finish(err));
    socket.once('connect', () => {
      const len = Buffer.alloc(2);
      len.writeUInt16BE(query.length, 0);
      socket.write(Buffer.concat([len, query]));
    });
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length < 2) return;
      const expected = buffer.readUInt16BE(0);
      if (buffer.length >= 2 + expected) {
        try {
          finish(null, parseResponse(buffer.subarray(2, 2 + expected), type));
        } catch (err) {
          finish(err);
        }
      }
    });
    socket.once('close', () => finish(Object.assign(new Error('DNS over TCP: connection closed'), { code: 'ECONNRESET' })));
  });
}

/** Ask each resolver in turn over TCP; the first answer wins. */
async function queryTcp(name, type) {
  let lastError = null;
  for (const server of tcpResolvers()) {
    try {
      return await queryTcpOnce(server, name, type);
    } catch (err) {
      lastError = err;
      if (err.code === 'ENOTFOUND') throw err; // a definite answer, not a dead resolver
    }
  }
  throw lastError || Object.assign(new Error('No DNS resolver reachable over TCP'), { code: 'ETIMEOUT' });
}

// --- the fallbacks ------------------------------------------------------------------------

const withTimeout = (promise, ms, label) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Object.assign(new Error(`${label} timed out`), { code: 'ETIMEOUT' })), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });

const RETRYABLE = new Set(['ETIMEOUT', 'ECONNREFUSED', 'EAI_AGAIN', 'ESERVFAIL', 'EREFUSED', 'ECANCELLED']);

// After a UDP lookup fails, later lookups go straight to TCP for a short
// while rather than each waiting out UDP_TIMEOUT_MS again. Once the backoff
// expires UDP is tried again and an answer clears it, so one slow reply (a
// cold resolver cache, a busy hotspot) does not route the whole process
// over TCP for good.
const UDP_BACKOFF_MS = 60_000;
let udpDownUntil = 0;
let warnedTcp = false;

const udpIsDown = () => udpDownUntil > Date.now();
const noteUdpOk = () => { udpDownUntil = 0; };

// The TCP fallback is routine on some networks and needs no action, so it is
// only announced when DNS_DEBUG is set; otherwise the terminal stays clean.
const dnsDebug = () => /^(1|true|yes)$/i.test(String(process.env.DNS_DEBUG || ''));

function noteTcpFallback(label, code) {
  udpDownUntil = Date.now() + UDP_BACKOFF_MS;
  if (warnedTcp || !dnsDebug()) return;
  warnedTcp = true;
  console.warn(
    `[DNS] ${label} got no UDP answer within ${UDP_TIMEOUT_MS / 1000}s (${code}); resolved over TCP instead.\n` +
      '      This is handled automatically. Connections still go to the hostnames, so TLS verification is unchanged.'
  );
}

/** The normal (UDP) lookup, or an immediate ETIMEOUT while UDP is backed off. */
function udpAttempt(label, run) {
  if (udpIsDown()) {
    return Promise.reject(Object.assign(new Error(`${label}: UDP DNS backed off`), { code: 'ETIMEOUT' }));
  }
  return withTimeout(run(), UDP_TIMEOUT_MS, label).then((v) => { noteUdpOk(); return v; });
}

/**
 * Wrap dns.promises.resolveSrv / resolveTxt: the normal lookup first, and when
 * it times out or is refused, the same records over TCP. This is what the
 * Mongo driver calls for a mongodb+srv:// URI.
 */
function patchResolvers() {
  const original = { resolveSrv: dns.promises.resolveSrv.bind(dns.promises), resolveTxt: dns.promises.resolveTxt.bind(dns.promises) };
  dns.promises.resolveSrv = async (name) => {
    try {
      return await udpAttempt(`querySrv ${name}`, () => original.resolveSrv(name));
    } catch (err) {
      if (!RETRYABLE.has(err.code)) throw err;
      noteTcpFallback(`querySrv ${name}`, err.code);
      return queryTcp(name, TYPES.SRV);
    }
  };
  dns.promises.resolveTxt = async (name) => {
    try {
      return await udpAttempt(`queryTxt ${name}`, () => original.resolveTxt(name));
    } catch (err) {
      // A cluster with no TXT record answers "no data" either way.
      if (err.code === 'ENODATA') return [];
      if (!RETRYABLE.has(err.code)) throw err;
      noteTcpFallback(`queryTxt ${name}`, err.code);
      try {
        return await queryTcp(name, TYPES.TXT);
      } catch (tcpErr) {
        if (tcpErr.code === 'ENOTFOUND') return [];
        throw tcpErr;
      }
    }
  };
}

const lookupCache = new Map(); // hostname -> { address, until }

/**
 * A dns.lookup-compatible function for the driver's sockets: the operating
 * system resolver first, TCP DNS when that fails. Addresses found over TCP
 * are cached for a few minutes so a reconnect does not repeat the round trip.
 */
function resilientLookup(hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  const opts = typeof options === 'number' ? { family: options } : options || {};
  const cached = lookupCache.get(hostname);
  if (cached && cached.until > Date.now()) {
    return process.nextTick(() => (opts.all ? callback(null, [{ address: cached.address, family: 4 }]) : callback(null, cached.address, 4)));
  }
  // While UDP is backed off this rejects at once, so the OS resolver does not
  // wait out its own timeouts again for every hostname.
  return udpAttempt(`lookup ${hostname}`, () => dns.promises.lookup(hostname, opts)).then(
    (result) => (opts.all ? callback(null, result) : callback(null, result.address, result.family)),
    (err) => {
    if (!RETRYABLE.has(err.code) && err.code !== 'ENOTFOUND') return callback(err);
    noteTcpFallback(`lookup ${hostname}`, err.code);
    return queryTcp(hostname, TYPES.A).then(
      (answers) => {
        if (!answers.length) return callback(Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), { code: 'ENOTFOUND', hostname }));
        lookupCache.set(hostname, { address: answers[0].address, until: Date.now() + 5 * 60 * 1000 });
        if (opts.all) return callback(null, answers.map((a) => ({ address: a.address, family: 4 })));
        return callback(null, answers[0].address, 4);
      },
      (tcpErr) => callback(Object.assign(tcpErr, { hostname }))
    );
    }
  );
}

let configuredOnce = false;

function configureDns() {
  // Called from app.js and from config/db.js, so scripts and tests that load
  // the database module directly get the same resolution; once is enough.
  if (configuredOnce) return;
  configuredOnce = true;
  const configured = process.env.DNS_SERVERS ? parseServers(process.env.DNS_SERVERS) : null;

  if (configured && configured.length) {
    try {
      dns.setServers(configured);
      dns.promises.setServers(configured);
    } catch (error) {
      console.error(`Invalid DNS_SERVERS value "${process.env.DNS_SERVERS}": ${error.message}`);
      console.error('Falling back to the system resolver.');
    }
  } else if (isUnusable(dns.getServers())) {
    // c-ares could not read the OS resolvers (on Windows, an adapter that
    // lists the fec0:: site-local placeholders first is enough) and fell back
    // to 127.0.0.1, where nothing answers: every SRV/TXT lookup then waited
    // out the UDP timeout before the TCP fallback. Use the public resolvers
    // directly instead. DNS_SERVERS in .env still takes precedence.
    try {
      dns.setServers(PUBLIC_RESOLVERS);
      dns.promises.setServers(PUBLIC_RESOLVERS);
      if (dnsDebug()) console.log(`[DNS] No system resolver readable; using ${PUBLIC_RESOLVERS.join(', ')} (set DNS_SERVERS in .env to choose).`);
    } catch (error) {
      console.warn(`[DNS] No usable system resolver and the public ones could not be set (${error.message}); lookups fall back to TCP.`);
    }
  }

  patchResolvers();
}

module.exports = { configureDns, resilientLookup, queryTcp, TYPES };
