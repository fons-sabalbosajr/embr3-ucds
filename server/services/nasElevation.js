const crypto = require('crypto');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const templates = require('./mailTemplates');

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
// Long enough to do a piece of work without re-verifying halfway through. It
// was 15 minutes, which meant an administrator configuring the share got sent
// back to the email step mid-task. A PIN makes re-elevating cheap, so this
// does not need to be generous to be usable.
const ELEVATION_TTL_MS = 60 * 60 * 1000;
const MAX_ATTEMPTS = 5;

// A PIN is a convenience over the emailed code, not a replacement for the
// account password: it re-opens a step-up the person has already proved by
// email, and grants exactly the same short elevation. So it is stored hashed,
// tried a limited number of times, and can only be set by someone who is
// already elevated.
const PIN_MIN_LENGTH = 6;
const PIN_MAX_LENGTH = 12;
const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCKOUT_MS = 15 * 60 * 1000;

// Kept out of the users collection deliberately. PUBLIC_USER_PROJECTION is an
// exclusion projection, so a field added to a user document is returned by
// GET /api/users to every authenticated caller unless someone remembers to
// exclude it. A separate collection cannot leak that way.
const PIN_COLLECTION = 'app-config';
const pinDocId = (userId) => `nas-pin:${userId}`;

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

/**
 * The address registered on the account, read from the database.
 *
 * Deliberately not taken from the session. buildSessionPayload() does not
 * carry `email` — the session holds identity and entitlement, not contact
 * details — so reading `user.email` here reported "this account has no email
 * address" for every account, including the developer, whose record has one.
 *
 * Looking it up is also the more correct behaviour for a one-time code: it
 * uses the address on the account *now*, so correcting a wrong address takes
 * effect immediately instead of after the user signs out and back in.
 */
async function registeredEmailFor(user) {
  if (!user?.userId) return null;
  try {
    const { connectToMongo, collections, ObjectId } = require('../config/db');
    await connectToMongo();
    const record = await collections.users.findOne(
      { _id: new ObjectId(String(user.userId)) },
      { projection: { email: 1 } }
    );
    const email = String(record?.email || '').trim();
    return email || null;
  } catch (err) {
    console.error('NAS elevation: could not read the account email:', err.message);
    return null;
  }
}

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
  const email = await registeredEmailFor(user);
  if (!email) {
    return {
      ok: false,
      status: 409,
      code: 'NO_EMAIL_ON_ACCOUNT',
      message:
        'This account has no email address on record, so a verification code ' +
        'cannot be sent. Add one under Admin > User Accounts, then try again.',
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
    const mail = templates.nasVerificationCode({ code, minutes: CODE_TTL_MS / 60000 });
    await transporter().sendMail({
      from: { name: templates.PRODUCT, address: process.env.EMAIL_USER },
      to: email,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
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
    sentTo: maskEmail(email),
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

// --- PIN -------------------------------------------------------------------

async function pinCollection() {
  const { connectToMongo, getDb } = require('../config/db');
  await connectToMongo();
  return getDb().collection(PIN_COLLECTION);
}

/** Whether this account has a PIN set, and whether it is locked out. */
async function pinState(user) {
  if (!user?.userId) return { set: false };
  const col = await pinCollection();
  const doc = await col.findOne({ _id: pinDocId(user.userId) });
  if (!doc?.hash) return { set: false };

  const lockedUntil = doc.lockedUntil ? new Date(doc.lockedUntil) : null;
  return {
    set: true,
    setAt: doc.setAt || null,
    locked: Boolean(lockedUntil && lockedUntil > new Date()),
    lockedUntil: lockedUntil && lockedUntil > new Date() ? lockedUntil : null,
    attempts: doc.attempts || 0,
  };
}

/**
 * Set or replace the PIN.
 *
 * Requires the caller to be elevated already, which means they have proved the
 * email challenge in this session. Without that a stolen session could set a
 * PIN and turn a temporary hold on the account into a durable one.
 */
async function setPin(req, user, pin) {
  const state = elevationState(req, user);
  if (!state.elevated) {
    return {
      ok: false,
      status: 403,
      code: 'ELEVATION_REQUIRED',
      message: 'Verify by email before setting a PIN.',
    };
  }

  const value = String(pin ?? '').trim();
  if (!/^\d+$/.test(value) || value.length < PIN_MIN_LENGTH || value.length > PIN_MAX_LENGTH) {
    return {
      ok: false,
      status: 400,
      code: 'BAD_PIN',
      message: `The PIN must be ${PIN_MIN_LENGTH} to ${PIN_MAX_LENGTH} digits.`,
    };
  }
  // Rejects 000000, 123456, 111111 and the like — a PIN that re-opens the
  // share configuration should not be one an attacker tries first.
  if (/^(\d)\1*$/.test(value) || isSequential(value)) {
    return {
      ok: false,
      status: 400,
      code: 'WEAK_PIN',
      message: 'That PIN is too easy to guess. Avoid repeated or sequential digits.',
    };
  }

  const col = await pinCollection();
  await col.updateOne(
    { _id: pinDocId(user.userId) },
    {
      $set: {
        hash: await bcrypt.hash(value, 10),
        username: user.username,
        setAt: new Date(),
        attempts: 0,
        lockedUntil: null,
      },
    },
    { upsert: true }
  );
  return { ok: true };
}

const isSequential = (v) => {
  const up = [...v].every((d, i, a) => i === 0 || Number(d) === Number(a[i - 1]) + 1);
  const down = [...v].every((d, i, a) => i === 0 || Number(d) === Number(a[i - 1]) - 1);
  return up || down;
};

/** Exchange a PIN for the same short elevation an emailed code grants. */
async function verifyPin(req, user, pin) {
  if (!user?.userId) {
    return { ok: false, status: 401, code: 'NOT_AUTHENTICATED', message: 'Not signed in.' };
  }

  const col = await pinCollection();
  const doc = await col.findOne({ _id: pinDocId(user.userId) });
  if (!doc?.hash) {
    return { ok: false, status: 409, code: 'NO_PIN_SET', message: 'No PIN is set for this account.' };
  }

  if (doc.lockedUntil && new Date(doc.lockedUntil) > new Date()) {
    return {
      ok: false,
      status: 429,
      code: 'PIN_LOCKED',
      message: 'Too many incorrect PINs. Verify by email instead.',
      lockedUntil: doc.lockedUntil,
    };
  }

  const matches = await bcrypt.compare(String(pin ?? ''), doc.hash);
  if (!matches) {
    const attempts = (doc.attempts || 0) + 1;
    const lock = attempts >= PIN_MAX_ATTEMPTS;
    await col.updateOne(
      { _id: pinDocId(user.userId) },
      { $set: { attempts: lock ? 0 : attempts, lockedUntil: lock ? new Date(Date.now() + PIN_LOCKOUT_MS) : null } }
    );
    return {
      ok: false,
      status: 401,
      code: lock ? 'PIN_LOCKED' : 'PIN_INCORRECT',
      message: lock
        ? 'Too many incorrect PINs. Verify by email instead.'
        : 'That PIN is not correct.',
      attemptsLeft: lock ? 0 : Math.max(PIN_MAX_ATTEMPTS - attempts, 0),
    };
  }

  await col.updateOne({ _id: pinDocId(user.userId) }, { $set: { attempts: 0, lockedUntil: null } });
  req.session.nasElevation = {
    username: user.username,
    elevatedUntil: now() + ELEVATION_TTL_MS,
    via: 'pin',
  };
  return { ok: true, elevatedUntil: req.session.nasElevation.elevatedUntil };
}

/** Remove the PIN. Elevated only, same as setting it. */
async function clearPin(req, user) {
  const state = elevationState(req, user);
  if (!state.elevated) {
    return { ok: false, status: 403, code: 'ELEVATION_REQUIRED', message: 'Verify before removing the PIN.' };
  }
  const col = await pinCollection();
  await col.deleteOne({ _id: pinDocId(user.userId) });
  return { ok: true };
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
  pinState,
  setPin,
  verifyPin,
  clearPin,
  CODE_TTL_MS,
  ELEVATION_TTL_MS,
  MAX_ATTEMPTS,
  PIN_MIN_LENGTH,
  PIN_MAX_LENGTH,
  PIN_MAX_ATTEMPTS,
};
