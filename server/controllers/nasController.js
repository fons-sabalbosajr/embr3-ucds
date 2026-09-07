const SMB2 = require('smb2');

// ---------------------------------------------------------------------------
// NAS (SMB) storage access.
//
// This is shared infrastructure, not a business domain. It reaches the records
// share where scanned documents live; the ERMS domain module consumes it.
//
// Credentials are a server-side service account read from the environment.
// They used to be collected from a login form and written to req.session,
// which connect-mongo then persisted to universe-db.sessions in cleartext for
// up to 14 days. Access to the share is now governed by the application's own
// authentication instead: a user who may reach these routes may read the
// share, and no SMB password ever leaves the server.
//
// Formerly served under /api/erms/* — renamed so the ERMS records module can
// own that namespace. See docs/UNIFICATION-PLAN.md, Phases 1 and 2.
// ---------------------------------------------------------------------------

/** Normalise a UNC share path to a leading double backslash. */
const normalizeShare = (share) => String(share).trim().replace(/^\\{1,2}/, '\\\\');

/**
 * The service account, or null when the deployment has not configured one.
 * NAS_* is canonical; ERMS_NAS_* is accepted for continuity with the names
 * the previous env-status check already used.
 */
function nasCredentials() {
  const share = process.env.NAS_SHARE || process.env.ERMS_NAS_SHARE;
  const username = process.env.NAS_USERNAME || process.env.ERMS_NAS_USERNAME;
  const password = process.env.NAS_PASSWORD || process.env.ERMS_NAS_PASSWORD;
  const domain = process.env.NAS_DOMAIN || process.env.ERMS_NAS_DOMAIN || '';

  if (!share || !username || !password) return null;
  return { share: normalizeShare(share), username, password, domain };
}

function requireNasConfig(req, res, next) {
  const credentials = nasCredentials();
  if (!credentials) {
    return res.status(503).json({
      message:
        'NAS storage is not configured on the server. Set NAS_SHARE, ' +
        'NAS_USERNAME and NAS_PASSWORD in the server environment.',
      required: ['NAS_SHARE', 'NAS_USERNAME', 'NAS_PASSWORD'],
    });
  }
  req.nasCredentials = credentials;
  next();
}

const clientFor = ({ share, username, password, domain }) =>
  new SMB2({ share, username, password, domain, autoCloseTimeout: 0 });

/**
 * Reduce caller-supplied input to a path that cannot escape the share root.
 *
 * Returns null for anything absolute, UNC, drive-qualified, or containing a
 * traversal segment. Previously the raw query string went straight to
 * smb2.readFile(), so "../../" walked out of the share.
 */
function safeSharePath(input) {
  const raw = String(input || '');
  if (!raw || raw.includes('\0')) return null;
  if (/^[a-zA-Z]:/.test(raw)) return null; // drive-qualified
  if (/^[\\/]/.test(raw)) return null; // absolute or UNC

  const segments = raw.split(/[\\/]+/).filter(Boolean);
  if (!segments.length) return null;
  if (segments.some((s) => s === '.' || s === '..')) return null;

  return segments.join('\\');
}

function listFiles(req, res) {
  clientFor(req.nasCredentials).readdir('', (err, files) => {
    if (err) {
      return res.status(502).json({ error: 'Drive access failed', message: err.message });
    }
    return res.json({ files });
  });
}

function viewPdf(req, res) {
  const filePath = safeSharePath(req.query.file);
  if (!filePath) {
    return res.status(400).json({ error: 'Invalid or missing file name.' });
  }

  clientFor(req.nasCredentials).readFile(filePath, (err, data) => {
    if (err) {
      return res.status(502).json({ error: 'File read failed', message: err.message });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    return res.send(data);
  });
}

function detectOtpFromError(err) {
  const msg = String((err && (err.message || err.code)) || '').toLowerCase();
  return (
    msg.includes('otp') ||
    msg.includes('two-factor') ||
    msg.includes('2fa') ||
    msg.includes('verification code')
  );
}

/** Connectivity check for Developer Settings. Never returns the password. */
function envStatus(req, res) {
  const credentials = nasCredentials();
  if (!credentials) {
    return res.status(400).json({
      message: 'Missing NAS credentials in environment.',
      required: ['NAS_SHARE', 'NAS_USERNAME', 'NAS_PASSWORD'],
    });
  }

  clientFor(credentials).readdir('', (err, files) => {
    if (err) {
      return res.status(502).json({
        message: err.message || 'SMB access failed',
        code: err.code,
        otpLikely: detectOtpFromError(err),
      });
    }
    return res.json({
      ok: true,
      share: credentials.share,
      domain: credentials.domain,
      files: Array.isArray(files) ? files.slice(0, 10) : [],
    });
  });
}

module.exports = {
  listFiles,
  viewPdf,
  envStatus,
  requireNasConfig,
  nasCredentials,
  safeSharePath,
};
