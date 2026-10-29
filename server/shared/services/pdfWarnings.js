// ---------------------------------------------------------------------------
// pdf-lib's warnings about damaged scans, gathered into one line.
//
// Opening a PDF with a damaged object, pdf-lib skips the object and goes on —
// the file still opens and its pages still read — but says so on console.warn,
// two lines an object:
//   Trying to parse invalid object: {"line":315109,"column":0,"offset":3334142})
//   Invalid object ref: 126 0 R
// Scans from old scanners carry dozens, and VERA's scan reading, the ERMS
// preview and the Document Portal's stamped copies all open scans, so the
// server's log filled with them and read like a failure. They are counted
// instead, and one line a minute says how many objects were skipped.
//
// Only these two messages, which no code but pdf-lib's parser writes; every
// other warning passes as before.
// ---------------------------------------------------------------------------

const PDF_LIB_RE = /^(Trying to parse invalid object:|Invalid object ref:)/;
const EVERY_MS = 60 * 1000;

let installed = false;
let skipped = 0;
let timer = null;

function install() {
  if (installed) return;
  installed = true;
  const warn = console.warn;
  console.warn = function quietPdfLib(first, ...rest) {
    if (typeof first === 'string' && PDF_LIB_RE.test(first)) {
      // Two lines an object: counted once.
      if (first.startsWith('Trying')) skipped += 1;
      if (!timer) {
        timer = setTimeout(() => {
          warn.call(console, `[pdf] ${skipped} damaged object(s) skipped while opening scans in the last minute — the scans were still read.`);
          skipped = 0;
          timer = null;
        }, EVERY_MS);
        timer.unref?.();
      }
      return undefined;
    }
    return warn.call(this, first, ...rest);
  };
}

module.exports = { install, PDF_LIB_RE };
