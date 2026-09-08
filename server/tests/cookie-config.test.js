import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// The session cookie has to follow the transport, not NODE_ENV.
//
// Deriving `secure` from NODE_ENV alone was wrong for anything but a
// TLS-terminated split-host deployment: over plain http the browser discards a
// Secure cookie, so sign-in appears to succeed and every request afterwards is
// unauthenticated. These lock the behaviour in for each deployment shape.
//
// config/cors.js reads the environment at module load, so each case is
// evaluated in a fresh module registry.
// ---------------------------------------------------------------------------

const ORIGINAL = { ...process.env };

async function cookieFor(env) {
  process.env = { ...ORIGINAL, ...env };
  // Drop any override the shape under test does not set.
  for (const k of ['SESSION_COOKIE_SECURE', 'SESSION_COOKIE_SAMESITE']) {
    if (!(k in env)) delete process.env[k];
  }
  // cors.js snapshots ALLOWED_ORIGINS at module load, so the registry has to be
  // cleared for each shape rather than re-importing the same instance.
  vi.resetModules();
  const { sessionCookieOptions } = await import('../config/security.js');
  return sessionCookieOptions();
}

beforeEach(() => {
  process.env = { ...ORIGINAL };
});

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe('session cookie flags', () => {
  it('is Lax and not Secure on a plain-http LAN deployment', async () => {
    const c = await cookieFor({
      NODE_ENV: 'production',
      ALLOWED_ORIGINS: 'http://10.14.77.107:5173',
    });
    // The case that locks everyone out if it gets this wrong.
    expect(c.secure).toBe(false);
    expect(c.sameSite).toBe('lax');
  });

  it('is None and Secure only when every origin is https', async () => {
    const c = await cookieFor({
      NODE_ENV: 'production',
      ALLOWED_ORIGINS: 'https://ucds.emb.gov.ph,https://api.emb.gov.ph',
    });
    expect(c.secure).toBe(true);
    expect(c.sameSite).toBe('none');
  });

  it('falls back to Lax when the origins are mixed', async () => {
    const c = await cookieFor({
      NODE_ENV: 'production',
      ALLOWED_ORIGINS: 'https://ucds.emb.gov.ph,http://10.14.77.107',
    });
    expect(c.secure).toBe(false);
    expect(c.sameSite).toBe('lax');
  });

  it('is Lax outside production regardless of scheme', async () => {
    const c = await cookieFor({
      NODE_ENV: 'development',
      ALLOWED_ORIGINS: 'https://ucds.emb.gov.ph',
    });
    expect(c.secure).toBe(false);
    expect(c.sameSite).toBe('lax');
  });

  it('lets an explicit override win over the derived value', async () => {
    const c = await cookieFor({
      NODE_ENV: 'production',
      ALLOWED_ORIGINS: 'https://ucds.emb.gov.ph',
      SESSION_COOKIE_SECURE: 'false',
      SESSION_COOKIE_SAMESITE: 'lax',
    });
    expect(c.secure).toBe(false);
    expect(c.sameSite).toBe('lax');
  });

  it('never emits SameSite=None without Secure, which browsers reject', async () => {
    for (const env of [
      { NODE_ENV: 'production', ALLOWED_ORIGINS: 'http://a.local' },
      { NODE_ENV: 'production', ALLOWED_ORIGINS: 'https://a.gov.ph' },
      { NODE_ENV: 'development', ALLOWED_ORIGINS: 'https://a.gov.ph' },
      { NODE_ENV: 'production', ALLOWED_ORIGINS: '' },
    ]) {
      const c = await cookieFor(env);
      if (c.sameSite === 'none') expect(c.secure).toBe(true);
    }
  });

  it('is always httpOnly', async () => {
    const c = await cookieFor({ NODE_ENV: 'production', ALLOWED_ORIGINS: 'https://a.gov.ph' });
    expect(c.httpOnly).toBe(true);
  });
});
