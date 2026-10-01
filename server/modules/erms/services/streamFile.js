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

module.exports = { streamInline };
