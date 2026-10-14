const nas = require('../../../services/nasStorage');

// ---------------------------------------------------------------------------
// Stream a share file inline, honouring range requests.
//
// Shared by the record and unit-document file routes. Always `inline`: there
// is no download in ERMS (see accessRequestService.js for the rule). The
// caller has already resolved and authorised the file; this only moves bytes.
// ---------------------------------------------------------------------------

function streamInline(req, res, file) {
  const safeName = file.fileName.replace(/["\\]/g, '_');
  res.setHeader('Content-Type', file.contentType);
  res.setHeader('Content-Disposition', `inline; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // The viewer reads a large PDF a piece at a time (range requests) instead
  // of downloading all of it first; across origins it can only do that when
  // it may see these.
  res.setHeader('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Range, Content-Length, X-Session-Token');

  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  let options;
  if (range && file.size > 0) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), file.size - 1) : file.size - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= file.size) {
      res.setHeader('Content-Range', `bytes */${file.size}`);
      return res.status(416).end();
    }
    options = { start, end };
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${file.size}`);
    res.setHeader('Content-Length', end - start + 1);
  } else {
    res.setHeader('Content-Length', file.size);
  }

  const stream = nas.openStream(file.resolved, options);
  stream.on('error', (err) => {
    console.error('NAS stream failed:', err.code || err.message);
    res.destroy(err);
  });
  return stream.pipe(res);
}

// ---------------------------------------------------------------------------
// A PDF cut to its first N pages, for a viewer with a page limit.
//
// Cutting means reading the whole scan from the share and rewriting it
// (pdf-lib), which took seconds for a large one — every time it was opened.
// The result is kept for a while, keyed by the file's path, size, date and
// the limit, so opening it again (or the next person opening it) is instant.
// Bounded by entries and bytes; the oldest go first.
// ---------------------------------------------------------------------------
const CUT_TTL = 15 * 60 * 1000;
const CUT_MAX_BYTES = 150 * 1024 * 1024;
const cuts = new Map(); // key -> { out, total, at }
let cutBytes = 0;

async function pageLimitedPdf(file, pageLimit) {
  const { PDFDocument } = require('pdf-lib');
  const key = [file.resolved, file.size, file.modifiedAt ? new Date(file.modifiedAt).getTime() : '', pageLimit].join('|');
  const hit = cuts.get(key);
  if (hit && Date.now() - hit.at < CUT_TTL) {
    cuts.delete(key);
    cuts.set(key, hit); // most recent last
    return hit;
  }
  const whole = await new Promise((resolve, reject) => {
    const chunks = [];
    nas.openStream(file.resolved).on('data', (c) => chunks.push(c)).on('end', () => resolve(Buffer.concat(chunks))).on('error', reject);
  });
  let out = whole;
  let total = null;
  try {
    const src = await PDFDocument.load(whole, { ignoreEncryption: true, updateMetadata: false });
    total = src.getPageCount();
    if (total > pageLimit) {
      const cut = await PDFDocument.create();
      const pages = await cut.copyPages(src, Array.from({ length: pageLimit }, (_, i) => i));
      for (const p of pages) cut.addPage(p);
      out = Buffer.from(await cut.save({ useObjectStreams: true }));
    }
  } catch (err) {
    // A PDF pdf-lib cannot read is served whole rather than not at all; the
    // viewer then knows no page count and applies no limit.
    console.warn('PDF page limit not applied:', err.message);
  }
  const entry = { out, total, at: Date.now() };
  if (out.length < CUT_MAX_BYTES / 4) {
    if (hit) cutBytes -= hit.out.length;
    cuts.set(key, entry);
    cutBytes += out.length;
    for (const [k, v] of cuts) {
      if (cutBytes <= CUT_MAX_BYTES && cuts.size <= 60) break;
      cuts.delete(k);
      cutBytes -= v.out.length;
    }
  }
  return entry;
}

module.exports = { streamInline, pageLimitedPdf };
