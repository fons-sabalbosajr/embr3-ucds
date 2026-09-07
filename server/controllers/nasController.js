const SMB2 = require('smb2');

// ---------------------------------------------------------------------------
// NAS (SMB) storage access.
//
// This is shared infrastructure, not a business domain. It browses the records
// share where scanned documents live; the ERMS domain module consumes it.
//
// Formerly served under /api/erms/* — renamed so the ERMS records module can
// own that namespace. See docs/UNIFICATION-PLAN.md, Phase 1.
// ---------------------------------------------------------------------------

const DEFAULT_DOMAIN = 'EMBR3SYNOLOG';

/** Normalise a UNC share path to a leading double backslash. */
const normalizeShare = (share) => String(share).trim().replace(/^\\{1,2}/, '\\\\');

function requireNasAuth(req, res, next) {
  if (req.session && req.session.nas_credentials) return next();
  return res
    .status(401)
    .json({ message: 'Not authenticated for NAS storage. Please log in.' });
}

/** Build an SMB client from a stored credential set. */
const clientFor = ({ share, username, password, domain }) =>
  new SMB2({ share, username, password, domain, autoCloseTimeout: 0 });

async function nasLogin(req, res) {
  const { share, username: rawUsername, password, domain: rawDomain } = req.body;
  if (!share || !rawUsername || !password) {
    return res
      .status(400)
      .json({ success: false, message: 'Share path, username, and password required.' });
  }

  let username = String(rawUsername).trim();
  let domain = rawDomain ? String(rawDomain).trim() : undefined;
  if (username.includes('\\')) [domain, username] = username.split('\\');

  const credentials = {
    share: normalizeShare(share),
    username,
    password,
    domain: domain || DEFAULT_DOMAIN,
  };

  clientFor(credentials).readdir('', (err) => {
    if (err) {
      return res
        .status(401)
        .json({ success: false, message: err.message || 'SMB login failed', code: err.code });
    }
    req.session.nas_credentials = credentials;
    return res.json({ success: true });
  });
}

function listFiles(req, res) {
  clientFor(req.session.nas_credentials).readdir('', (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Drive access failed', message: err.message });
    }
    return res.json({ files });
  });
}

function viewPdf(req, res) {
  const { file: fileName } = req.query;
  if (!fileName) return res.status(400).json({ error: 'File name is required.' });

  clientFor(req.session.nas_credentials).readFile(fileName, (err, data) => {
    if (err) {
      return res.status(500).json({ error: 'File read failed', message: err.message });
    }
    res.setHeader('Content-Type', 'application/pdf');
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

/** Connectivity check using server-side credentials, for Developer Settings. */
function envStatus(req, res) {
  const share = process.env.NAS_SHARE || process.env.ERMS_NAS_SHARE;
  const username = process.env.NAS_USERNAME || process.env.ERMS_NAS_USERNAME;
  const password = process.env.NAS_PASSWORD || process.env.ERMS_NAS_PASSWORD;
  const domain = process.env.NAS_DOMAIN || process.env.ERMS_NAS_DOMAIN || '';

  if (!share || !username || !password) {
    return res.status(400).json({
      message: 'Missing NAS credentials in environment.',
      required: ['NAS_SHARE', 'NAS_USERNAME', 'NAS_PASSWORD'],
    });
  }

  clientFor({ share: normalizeShare(share), username, password, domain }).readdir(
    '',
    (err, files) => {
      if (err) {
        return res.status(502).json({
          message: err.message || 'SMB access failed',
          code: err.code,
          otpLikely: detectOtpFromError(err),
        });
      }
      return res.json({
        ok: true,
        share,
        domain,
        files: Array.isArray(files) ? files.slice(0, 10) : [],
      });
    }
  );
}

module.exports = { nasLogin, listFiles, viewPdf, requireNasAuth, envStatus };
