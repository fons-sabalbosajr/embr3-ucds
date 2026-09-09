const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Encryption at rest for configuration secrets.
//
// This exists so the NAS password can be rotated from Admin Settings instead
// of by editing .env and redeploying. Storing it in MongoDB in the clear would
// be worse than the environment variable it replaces — a database backup, an
// export, or anyone with a read connection would have it — so it is encrypted
// with a key that lives only in the environment.
//
// Be honest about what this buys: the key is still an environment variable, so
// this is not "no more secrets in .env". What changes is that the *rotating*
// secret moves out of .env, and the long-lived key stays. Someone who holds
// both the database and the environment can still read the password; someone
// who holds only the database cannot, which is the realistic threat for a
// backup or an exported dump.
//
// AES-256-GCM, so a tampered ciphertext fails to decrypt rather than
// decrypting to something else.
// ---------------------------------------------------------------------------

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_ENV = 'CONFIG_ENCRYPTION_KEY';

/**
 * The 32-byte key, derived from CONFIG_ENCRYPTION_KEY.
 *
 * scrypt rather than a raw hash so a short, human-chosen value is still
 * expensive to attack. The salt is fixed and public on purpose: this derives
 * one key from one configured value, it is not password storage.
 */
function key() {
  const raw = process.env[KEY_ENV];
  if (!raw || String(raw).trim().length < 16) return null;
  return crypto.scryptSync(String(raw).trim(), 'e-universe-config-v1', 32);
}

const isConfigured = () => key() !== null;

/** Encrypt a string. Returns null when no key is configured. */
function encrypt(plaintext) {
  const k = key();
  if (!k) return null;
  if (plaintext == null || plaintext === '') return null;

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, k, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  return {
    v: 1,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: enc.toString('base64'),
  };
}

/**
 * Decrypt what encrypt() produced, or null.
 *
 * Returns null rather than throwing on a bad key or tampered value, because
 * every caller treats "cannot read the secret" the same way as "no secret is
 * configured" — and a thrown error here would take down whatever was merely
 * checking whether one exists.
 */
function decrypt(payload) {
  const k = key();
  if (!k || !payload?.iv || !payload?.tag || !payload?.data) return null;
  try {
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      k,
      Buffer.from(payload.iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(payload.data, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}

/** Startup warning, in the same style as the cookie and NAS checks. */
function warnAboutSecretKey() {
  if (isConfigured()) return;
  console.warn(
    `\n[config] ${KEY_ENV} is not set (or is under 16 characters).\n` +
      '      Secrets managed through Admin Settings cannot be stored, so the\n' +
      '      NAS credentials fall back to the NAS_* environment variables and\n' +
      '      cannot be rotated from the application.\n' +
      '      Generate one with:  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"\n'
  );
}

module.exports = { encrypt, decrypt, isConfigured, warnAboutSecretKey, KEY_ENV };
