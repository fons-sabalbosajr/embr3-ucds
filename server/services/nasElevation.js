const crypto = require('crypto');
const nodemailer = require('nodemailer');

// ---------------------------------------------------------------------------
// Step-up authentication for administrative NAS operations.
//
// Changing, testing, enabling, disabling or reading the share configuration
// asks for a one-time code by email on top of the normal session. Opening a
// document does not — a Records clerk files all day, and a code per PDF would
// only teach everyone to keep a code sitting in a sticky note.
//
// The elevation lives in the session on the server. Nothing about it is
// returned to the browser except "you are elevated until <time>", so there is
// no token for a page to keep, and signing out ends it because the session
// ends with it.
// ---------------------------------------------------------------------------

const CODE_TTL_MS = 10 * 60 * 1000; // to enter the code
const ELEVATION_TTL_MS = 15 * 60 * 1000; // to use it
const MAX_ATTEMPTS = 5;

const now = () => Date.now();
const generateCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

/** Compare in constant time so a wrong code cannot be found by timing it. */
function codesMatch(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

const hashCode = (code) => crypto.createHash('sha256').update(String(code)).digest('hex');

function transporter() {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    tls: { rejectUnauthorized: false },
  });
}

const mailConfigured = () => Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS);

/** Show enough of an address to recognise it, not enough to learn it. */
function maskEmail(email) {
  const [user, domain] = String(email || '').split('@');
  if (!user || !domain) return null;
  const head = user.slice(0, Math.min(2, user.length));
  return `${head}${'*'.repeat(Math.max(user.length - head.length, 1))}@${domain}`;
}

/**
 * Issue a code and email it.
 *
 * The address is always the one registered on the account — never one supplied
 * with the request, which would let a caller redirect their own step-up
 * challenge to an address they control.
 */
async function requestCode(req, user) {
  if (!user?.email) {
    return {
      ok: false,
      status: 409,
      code: 'NO_EMAIL_ON_ACCOUNT',
      message:
        'This account has no email address, so a verification code cannot be sent. ' +
        'Add one under Admin > User Accounts, then try again.',
    };
  }
  if (!mailConfigured()) {
    return {
      ok: false,
      status: 503,
      code: 'MAIL_NOT_CONFIGURED',
      message: 'Email is not configured on the server, so verification codes cannot be sent.',
    };
  }

  const code = generateCode();
  req.session.nasElevation = {
    codeHash: hashCode(code),
    expiresAt: now() + CODE_TTL_MS,
    attempts: 0,
    username: user.username,
    elevatedUntil: null,
  };

  try {
    await transporter().sendMail({
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: 'E-Universe — NAS configuration verification code',
      text:
        `Your verification code is ${code}\n\n` +
        `It expires in ${CODE_TTL_MS / 60000} minutes and can be used once.\n\n` +
        'This code authorises changes to the records share configuration. ' +
        'If you did not request it, tell the system administrator — someone ' +
        'signed in as you is trying to reach the NAS settings.',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px">
          <h2 style="margin:0 0 4px">E-Universe</h2>
          <p style="margin:0 0 20px;color:#666">Unified Information and Records Management System</p>
          <p>Your verification code for <strong>records share configuration</strong> is:</p>
          <p style="font-size:30px;letter-spacing:7px;font-weight:700;margin:20px 0">${code}</p>
          <p style="color:#666">Expires in ${CODE_TTL_MS / 60000} minutes. It can be used once.</p>
          <hr style="border:none;border-top:1px solid #eee;margin:22px 0">
          <p style="color:#a33">
            If you did not request this, tell the system administrator. Someone
            signed in as you is trying to reach the NAS settings.
          </p>
        </div>`,
    });
  } catch (err) {
    delete req.session.nasElevation;
    // The SMTP error text can carry the account and host; log it, do not return it.
    console.error('NAS elevation: could not send verification code:', err.message);
    return {
      ok: false,
      status: 502,
      code: 'MAIL_SEND_FAILED',
      message: 'Could not send the verification code. Check the mail settings and try again.',
    };
  }

  return {
    ok: true,
    sentTo: maskEmail(user.email),
    expiresInSeconds: Math.floor(CODE_TTL_MS / 1000),
  };
}

/** Exchange a code for a short-lived elevation on this session. */
function verifyCode(req, user, submitted) {
  const pending = req.session?.nasElevation;
  if (!pending?.codeHash) {
    return { ok: false, status: 400, code: 'NO_PENDING_CODE', message: 'Request a verification code first.' };
  }
  if (pending.username !== user?.username) {
    delete req.session.nasElevation;
    return { ok: false, status: 400, code: 'NO_PENDING_CODE', message: 'Request a verification code first.' };
  }
  if (now() > pending.expiresAt) {
    delete req.session.nasElevation;
    return { ok: false, status: 400, code: 'CODE_EXPIRED', message: 'That code has expired. Request another.' };
  }
  if (pending.attempts >= MAX_ATTEMPTS) {
    delete req.session.nasElevation;
    return {
      ok: false,
      status: 429,
      code: 'TOO_MANY_ATTEMPTS',
      message: 'Too many incorrect codes. Request another.',
    };
  }

  if (!codesMatch(hashCode(submitted), pending.codeHash)) {
    pending.attempts += 1;
    return {
      ok: false,
      status: 401,
      code: 'CODE_INCORRECT',
      message: 'That code is not correct.',
      attemptsLeft: Math.max(MAX_ATTEMPTS - pending.attempts, 0),
    };
  }

  // Single use: the code is consumed whether or not the elevation is used.
  req.session.nasElevation = {
    username: user.username,
    elevatedUntil: now() + ELEVATION_TTL_MS,
  };

  return { ok: true, elevatedUntil: req.session.nasElevation.elevatedUntil };
}

function elevationState(req, user) {
  const state = req.session?.nasElevation;
  if (!state?.elevatedUntil) return { elevated: false };
  if (state.username !== user?.username) return { elevated: false };
  if (now() > state.elevatedUntil) return { elevated: false, expired: true };
  return { elevated: true, elevatedUntil: state.elevatedUntil };
}

const clearElevation = (req) => {
  if (req.session) delete req.session.nasElevation;
};

/**
 * Gate for administrative NAS operations. 403 with a code the client can act
 * on — the NAS settings screen turns it into a "verify to continue" prompt
 * rather than a dead end.
 */
function requireElevation(req, res, next) {
  const user = req.session?.user || req.user;
  const state = elevationState(req, user);
  if (state.elevated) return next();

  return res.status(403).json({
    code: state.expired ? 'ELEVATION_EXPIRED' : 'ELEVATION_REQUIRED',
    message: state.expired
      ? 'Your verification has expired. Verify again to continue.'
      : 'This action needs email verification.',
  });
}

module.exports = {
  requestCode,
  verifyCode,
  elevationState,
  clearElevation,
  requireElevation,
  maskEmail,
  CODE_TTL_MS,
  ELEVATION_TTL_MS,
  MAX_ATTEMPTS,
};
