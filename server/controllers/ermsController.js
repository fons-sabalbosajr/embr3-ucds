const SMB2 = require('smb2');

function requireErmsAuth(req, res, next) {
  if (req.session && req.session.erms_credentials) return next();
  return res.status(401).json({ message: 'Not authenticated for ERMS. Please log in.' });
}

async function ermsLogin(req, res) {
  const { share, username: rawUsername, password, domain: rawDomain } = req.body;
  if (!share || !rawUsername || !password) {
    return res.status(400).json({ success: false, message: 'Share path, username, and password required.' });
  }
  let username = rawUsername.trim();
  let domain = rawDomain?.trim();
  if (username.includes('\\')) [domain, username] = username.split('\\');
  const smbConfig = { share: share.trim().replace(/^\\{1,2}/, '\\\\'), username, password, domain: domain || 'EMBR3SYNOLOG', autoCloseTimeout: 0 };
  const smb2Client = new SMB2(smbConfig);
  smb2Client.readdir('', (err) => {
    if (err) return res.status(401).json({ success: false, message: err.message || 'SMB login failed', code: err.code });
    req.session.erms_credentials = { share: smbConfig.share, username, password, domain: smbConfig.domain };
    return res.json({ success: true });
  });
}

function listFiles(req, res) {
  const { share, username, password, domain } = req.session.erms_credentials;
  const smb2Client = new SMB2({ share, username, password, domain, autoCloseTimeout: 0 });
  smb2Client.readdir('', (err, files) => {
    if (err) return res.status(500).json({ error: 'Drive access failed', message: err.message });
    return res.json({ files });
  });
}

function viewPdf(req, res) {
  const { file: fileName } = req.query;
  if (!fileName) return res.status(400).json({ error: 'File name is required.' });
  const { share, username, password, domain } = req.session.erms_credentials;
  const smb2Client = new SMB2({ share, username, password, domain, autoCloseTimeout: 0 });
  smb2Client.readFile(fileName, (err, data) => {
    if (err) return res.status(500).json({ error: 'File read failed', message: err.message });
    res.setHeader('Content-Type', 'application/pdf');
    return res.send(data);
  });
}

module.exports = { ermsLogin, listFiles, viewPdf, requireErmsAuth };
// New: env-based status check

function detectOtpFromError(err) {
  const msg = (err && (err.message || err.code || String(err))) || "";
  const m = msg.toLowerCase();
  return (
    m.includes("otp") ||
    m.includes("two-factor") ||
    m.includes("2fa") ||
    m.includes("verification code")
  );
}

function envStatus(req, res) {
  const share = process.env.ERMS_NAS_SHARE || process.env.NAS_SHARE;
  const username = process.env.ERMS_NAS_USERNAME || process.env.NAS_USERNAME;
  const password = process.env.ERMS_NAS_PASSWORD || process.env.NAS_PASSWORD;
  const domain = process.env.ERMS_NAS_DOMAIN || process.env.NAS_DOMAIN || "";

  if (!share || !username || !password) {
    return res.status(400).json({
      message: "Missing ERMS NAS credentials in environment.",
      required: ["ERMS_NAS_SHARE", "ERMS_NAS_USERNAME", "ERMS_NAS_PASSWORD"],
    });
  }

  const smb2Client = new SMB2({
    share: String(share).trim().replace(/^\\{1,2}/, "\\\\"),
    username,
    password,
    domain,
    autoCloseTimeout: 0,
  });

  smb2Client.readdir("", (err, files) => {
    if (err) {
      return res.status(502).json({
        message: err.message || "SMB access failed",
        code: err.code,
        otpLikely: detectOtpFromError(err),
      });
    }
    return res.json({ ok: true, share, domain, files: Array.isArray(files) ? files.slice(0, 10) : [] });
  });
}

module.exports.envStatus = envStatus;
