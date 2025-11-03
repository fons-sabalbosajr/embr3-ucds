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

  if (!fs.existsSync(serverEnvPath)) {
    console.error('\u274c Missing server/.env. Please create it and include required public keys:');
    console.error(REQUIRED_KEYS.map(k => `  - ${k}`).join('\n'));
    process.exit(1);
  }

  const envContent = fs.readFileSync(serverEnvPath, 'utf8');
  const envMap = parseEnvFile(envContent);

  const missing = REQUIRED_KEYS.filter(k => !envMap.get(k));
  if (missing.length) {
    console.error('\u274c Missing required client env keys in server/.env:');
    for (const k of missing) console.error('  - ' + k);
    console.error('These are needed for the front-end build.');
    process.exit(1);
  }

  // Optional key: VITE_SOCKET_URL; if missing we will default to VITE_API_BASE_URL at runtime.
  if (!envMap.get('VITE_SOCKET_URL')) {
    console.warn('\u26A0\uFE0F  VITE_SOCKET_URL not set; front-end will default to VITE_API_BASE_URL.');
  }

  console.log('\u2705 Required client env keys present.');
})();
