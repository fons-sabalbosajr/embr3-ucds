// Validate required public client environment variables exist before dev/build
// Source of truth: server/.env (synced to front-end/.env.local)

const fs = require('fs');
const path = require('path');

function parseEnvFile(content) {
  const map = new Map();
  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    value = value.replace(/;+$/, '');
    map.set(key, value);
  }
  return map;
}

(function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const serverEnvPath = path.join(repoRoot, 'server', '.env');

  // Required keys for client build
  const REQUIRED_KEYS = [
    'VITE_API_BASE_URL',
    'VITE_CRYPTOJS_ENCRYPTION_KEY',
  ];

  // On CI/hosting (Render, Actions) there is no server/.env; the keys are
  // injected as real environment variables instead. Accept either source.
  const envMap = fs.existsSync(serverEnvPath)
    ? parseEnvFile(fs.readFileSync(serverEnvPath, 'utf8'))
    : new Map();

  const lookup = (key) => envMap.get(key) || process.env[key];

  const missing = REQUIRED_KEYS.filter(k => !lookup(k));
  if (missing.length) {
    console.error('\u274c Missing required client env keys:');
    for (const k of missing) console.error('  - ' + k);
    console.error('Set them in server/.env for local development, or as environment variables in CI.');
    process.exit(1);
  }

  // Optional key: VITE_SOCKET_URL; if missing we will default to VITE_API_BASE_URL at runtime.
  if (!lookup('VITE_SOCKET_URL')) {
    console.warn('\u26A0\uFE0F  VITE_SOCKET_URL not set; front-end will default to VITE_API_BASE_URL.');
  }

  // Feature keys. The build still succeeds without them, but the feature that
  // reads each one will fail at runtime, so surface it here instead.
  // Email is sent by the server (EMAIL_USER / EMAIL_PASS in server/.env), so
  // the client needs no mail keys at all.
  const FEATURE_KEYS = {
    VITE_GOOGLE_MAPS_API_KEY: 'map rendering and address lookup',
  };

  for (const [key, feature] of Object.entries(FEATURE_KEYS)) {
    if (!lookup(key)) {
      console.warn(`\u26A0\uFE0F  ${key} not set; ${feature} will not work.`);
    }
  }

  console.log('\u2705 Required client env keys present.');
})();
