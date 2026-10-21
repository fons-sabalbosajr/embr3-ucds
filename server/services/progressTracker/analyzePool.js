// ---------------------------------------------------------------------------
// Reading the workbooks off the main thread. Parsing a RAW workbook takes a
// few seconds of CPU (a large province's: 3 s); done on the server's own
// thread it held every request and socket of the whole server for that
// long, on each save the tracker read. Here a small pool of worker threads
// reads them (analyze.js, unchanged), several at once, while the server goes
// on answering.
//
// Without worker threads (a test run, or one failing to start) the workbook
// is read in this thread, as before.
// ---------------------------------------------------------------------------

const os = require('os');
const path = require('path');
const { Worker } = require('worker_threads');
const { analyze } = require('./analyze');

// Two threads, one per spare core at most: the server keeps a core of its own.
// Memory, not cores, is the limit — a thread reading a large RAW workbook
// holds a few hundred megabytes — so a host with room to spare can read more
// at once with PROGRESS_READERS (1–6).
const WANTED = Number(process.env.PROGRESS_READERS) || 2;
const SIZE = Math.max(1, Math.min(6, WANTED, (os.cpus()?.length || 2) - 1));
const SCRIPT = path.join(__dirname, 'analyzeWorker.js');

const idle = [];
const all = new Set();
const queue = [];
const pending = new Map(); // job id -> { resolve, reject }
let nextId = 1;
let broken = process.env.NODE_ENV === 'test';

function spawn() {
  const w = new Worker(SCRIPT);
  w.unref();
  w.job = null;
  w.on('message', ({ id, result, error }) => {
    const p = pending.get(id);
    pending.delete(id);
    w.job = null;
    if (p) (error ? p.reject(Object.assign(new Error(error), { status: 500 })) : p.resolve(result));
    idle.push(w);
    drain();
  });
  // A thread that dies takes its job with it; the next job starts a new one.
  w.on('error', (err) => {
    if (w.job && pending.has(w.job)) {
      pending.get(w.job).reject(err);
      pending.delete(w.job);
    }
  });
  w.on('exit', () => {
    all.delete(w);
    const i = idle.indexOf(w);
    if (i >= 0) idle.splice(i, 1);
    drain();
  });
  all.add(w);
  return w;
}

function drain() {
  while (queue.length) {
    let w = idle.pop();
    if (!w && all.size < SIZE) {
      try {
        w = spawn();
      } catch (err) {
        console.warn('[progress tracker] worker threads unavailable, reading in the main thread:', err.message);
        broken = true;
        while (queue.length) {
          const job = queue.shift();
          const p = pending.get(job.id);
          pending.delete(job.id);
          try {
            p.resolve(analyze(Buffer.from(job.buffer), job.kind, job.opts));
          } catch (e) {
            p.reject(e);
          }
        }
        return;
      }
    }
    if (!w) return;
    const job = queue.shift();
    w.job = job.id;
    // The bytes are handed over, not copied.
    w.postMessage(job, [job.buffer]);
  }
}

/** A workbook's bytes read as the tracked kind (analyze.js analyze), in a worker thread. */
function analyzeOff(buffer, kind, opts = {}) {
  if (broken) return Promise.resolve().then(() => analyze(buffer, kind, opts));
  // Its own ArrayBuffer, to hand to the thread.
  const own = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    queue.push({ id, buffer: own, kind, opts });
    drain();
  });
}

/** Run `fn` over `items`, at most `limit` at a time; results in the items' order. */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const run = async () => {
    while (i < items.length) {
      const at = i++;
      out[at] = await fn(items[at], at);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return out;
}

module.exports = { analyzeOff, mapLimit, POOL_SIZE: SIZE };
