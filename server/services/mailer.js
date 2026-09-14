const nodemailer = require('nodemailer');
const { allowedOrigins } = require('../config/cors');
const { PRODUCT } = require('./mailTemplates');

// ---------------------------------------------------------------------------
// One way out for every email the server sends.
//
// The password-reset controller and the NAS step-up each built their own
// transport from the same two environment variables. Sign-up notifications and
// new-account credentials went a third way: EmailJS, called from the browser
// with a public key in the bundle — and never configured, so a registrant saw
// a "Configuration Error" dialog and an approved user was told credentials
// had been sent when nothing was. Everything now goes through here, from the
// same address, with the same sender name.
//
// SMTP errors carry the account and host in their text. They are logged and
// never returned to a client.
// ---------------------------------------------------------------------------

const isConfigured = () => Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS);

let cached = null;
function transporter() {
  if (!cached) {
    cached = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
      tls: { rejectUnauthorized: false },
    });
  }
  return cached;
}

/**
 * The public origin the application is served from, for links in email.
 * Falls back to the first allowed CORS origin so a link is never hardcoded
 * to localhost on a deployment that forgot to set CLIENT_URL.
 */
function publicOrigin() {
  const origin =
    process.env.CLIENT_URL || process.env.SERVER_URL || allowedOrigins[0] || 'http://localhost:5173';
  return String(origin).replace(/\/+$/, '');
}

/** Where sign-up requests are announced. Defaults to the sending mailbox. */
const adminAddress = () => process.env.ADMIN_NOTIFY_EMAIL || process.env.EMAIL_USER;

/**
 * Send a rendered template. Returns true on success and false when mail is not
 * configured or the send fails — callers that must not fail the request on a
 * mail problem (a sign-up that is already recorded) read the boolean; callers
 * for which the email *is* the outcome (a password reset) pass `throwOnError`.
 */
async function send({ to, subject, text, html, throwOnError = false }) {
  if (!isConfigured()) {
    if (throwOnError) {
      const err = new Error('Email is not configured on the server.');
      err.code = 'MAIL_NOT_CONFIGURED';
      throw err;
    }
    console.warn(`Mail not configured; skipped "${subject}" to ${to}`);
    return false;
  }
  try {
    await transporter().sendMail({
      from: { name: PRODUCT, address: process.env.EMAIL_USER },
      to,
      subject,
      text,
      html,
    });
    return true;
  } catch (err) {
    console.error(`Could not send "${subject}" to ${to}:`, err.message);
    if (throwOnError) {
      const wrapped = new Error('The email could not be sent.');
      wrapped.code = 'MAIL_SEND_FAILED';
      throw wrapped;
    }
    return false;
  }
}

module.exports = { send, isConfigured, publicOrigin, adminAddress };
