// A worker thread of analyzePool.js: reads one workbook at a time (analyze.js).
const { parentPort } = require('worker_threads');
const { analyze } = require('./analyze');

parentPort.on('message', ({ id, buffer, kind, opts }) => {
  try {
    parentPort.postMessage({ id, result: analyze(Buffer.from(buffer), kind, opts) });
  } catch (err) {
    parentPort.postMessage({ id, error: err?.message || String(err) });
  }
});
