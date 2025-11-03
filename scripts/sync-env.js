// Sync public environment variables from server/.env into front-end/.env.local
// Copies only keys intended for the client (VITE_* and REACT_APP_*).

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
    // strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    // strip trailing semicolons
    value = value.replace(/;+$/, '');
    map.set(key, value);
  }
  return map;
}

(function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const serverEnvPath = path.join(repoRoot, 'server', '.env');
  const feEnvLocalPath = path.join(repoRoot, 'front-end', '.env.local');

  if (!fs.existsSync(serverEnvPath)) {
    console.error('server/.env not found; skipping sync.');
    process.exit(0);
  }

  const serverEnvContent = fs.readFileSync(serverEnvPath, 'utf8');
  const envMap = parseEnvFile(serverEnvContent);

  const allowedPrefixes = ['VITE_', 'REACT_APP_'];
  const lines = [
    '# Auto-generated from server/.env by scripts/sync-env.js',
    '# Do not commit secrets here; this file is gitignored.',
    '',
  ];

  let copied = 0;
  for (const [key, value] of envMap.entries()) {
    if (allowedPrefixes.some((p) => key.startsWith(p))) {
      lines.push(`${key}=${value}`);
      copied++;
    }
  }

  fs.writeFileSync(feEnvLocalPath, lines.join('\n'));
  console.log(`Synced ${copied} env keys to front-end/.env.local`);
})();
