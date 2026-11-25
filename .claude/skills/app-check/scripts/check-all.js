#!/usr/bin/env node
// ---------------------------------------------------------------------------
// One pass over the whole of E-Universe: is this checkout in step with GitHub,
// is any secret in git, is the configuration safe, does the front-end lint and
// build inside its budget, are the routes guarded, do the tests pass, and do
// the dependencies carry known holes.
//
//   node .claude/skills/app-check/scripts/check-all.js            everything
//   node .claude/skills/app-check/scripts/check-all.js --quick    no build, no full suite, no npm audit
//   node .claude/skills/app-check/scripts/check-all.js --only=repo,secrets
//   node .claude/skills/app-check/scripts/check-all.js --offline  no git fetch, no npm audit
//
// Groups: repo, secrets, config, frontend, server, deps.
//
// What keeps it safe:
//   - nothing here writes to the production database. The full test suite
//     runs only when a test database answers, and tests/setup.js itself
//     refuses to run when TEST_MONGO_URI is the production cluster;
//   - secrets are never printed: a leak is reported as the .env key name and
//     the file it was found in, never the value;
//   - git is only read (fetch, status, rev-list). It never commits, pulls,
//     merges or pushes.
//
// Full output of every step goes to reports/app-check/<time>/, which git
// ignores. Exits 1 if any step FAILs, so it can gate a release.
// ---------------------------------------------------------------------------

const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../../../..');
const SERVER = path.join(ROOT, 'server');
const FRONT = path.join(ROOT, 'front-end');
const EXPECTED_REPO = 'fons-sabalbosajr/embr3-ucds';

const args = process.argv.slice(2);
const QUICK = args.includes('--quick');
const OFFLINE = args.includes('--offline');
const ONLY = (args.find((a) => a.startsWith('--only='))?.slice(7) || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const wants = (group) => !ONLY.length || ONLY.includes(group);

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const LOG_DIR = path.join(ROOT, 'reports', 'app-check', stamp);
fs.mkdirSync(LOG_DIR, { recursive: true });

const results = [];
const record = (group, name, status, detail, log) => {
  results.push({ group, name, status, detail });
  if (log) fs.writeFileSync(path.join(LOG_DIR, `${group}-${name.replace(/[^\w.-]+/g, '_')}.log`), log);
  const mark = { PASS: 'ok  ', WARN: 'warn', FAIL: 'FAIL', SKIP: 'skip' }[status];
  console.log(`  [${mark}] ${group} / ${name}${detail ? ` — ${detail}` : ''}`);
};

// npm and npx are .cmd files on Windows and need a shell; git and node do not,
// and must not get one: secret values from .env are passed to git grep, and a
// shell would split them on & or expand %VAR%. Only fixed arguments reach npm.
const run = (cmd, cmdArgs, cwd, timeoutMs = 10 * 60 * 1000) => {
  const t0 = Date.now();
  const viaShell = process.platform === 'win32' && /^(npm|npx)$/.test(cmd);
  const r = spawnSync(viaShell ? [cmd, ...cmdArgs].join(' ') : cmd, viaShell ? [] : cmdArgs, {
    cwd,
    encoding: 'utf8',
    shell: viaShell,
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
  });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  return { code: r.status, out, stdout: r.stdout || '', secs: ((Date.now() - t0) / 1000).toFixed(1), timedOut: r.error?.code === 'ETIMEDOUT' };
};
const git = (...a) => run('git', a, ROOT, 120000);
const tail = (text, n = 12) => text.trim().split(/\r?\n/).slice(-n).map((l) => `        ${l}`).join('\n');

// A step backed by an existing npm script: PASS on exit 0, FAIL otherwise.
const npmStep = (group, name, cwd, script, extra = []) => {
  const r = run('npm', ['run', script, '--silent', ...(extra.length ? ['--', ...extra] : [])], cwd);
  if (r.code === 0) return record(group, name, 'PASS', `${r.secs}s`, r.out);
  record(group, name, 'FAIL', r.timedOut ? `timed out after ${r.secs}s` : `exit ${r.code}, ${r.secs}s`, r.out);
  console.log(tail(r.out));
};

const parseEnv = (file) => {
  const map = new Map();
  if (!fs.existsSync(file)) return map;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    let v = line.slice(i + 1).trim();
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
    map.set(line.slice(0, i).trim(), v);
  }
  return map;
};
const serverEnv = parseEnv(path.join(SERVER, '.env'));

const portOpen = (host, port) =>
  new Promise((resolve) => {
    const s = net.connect({ host, port, timeout: 2000 });
    s.on('connect', () => (s.end(), resolve(true)));
    s.on('timeout', () => (s.destroy(), resolve(false)));
    s.on('error', () => resolve(false));
  });

// ---------------------------------------------------------------------------
async function repo() {
  console.log('\nrepo — this checkout against GitHub');
  const origin = git('remote', 'get-url', 'origin');
  if (origin.code !== 0) {
    record('repo', 'origin', 'FAIL', `no "origin" remote; run: git remote add origin https://github.com/${EXPECTED_REPO}.git`);
    return;
  }
  const url = origin.out.trim();
  record('repo', 'origin', url.includes(EXPECTED_REPO) ? 'PASS' : 'WARN', url);

  if (!OFFLINE) {
    const f = git('fetch', 'origin', '--prune');
    record('repo', 'fetch', f.code === 0 ? 'PASS' : 'WARN', f.code === 0 ? 'up to date with GitHub' : 'could not reach GitHub; ahead/behind below may be stale', f.out);
  }

  const branch = git('rev-parse', '--abbrev-ref', 'HEAD').out.trim();
  const upstream = git('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}');
  if (upstream.code !== 0) {
    record('repo', `branch ${branch}`, 'WARN', 'no upstream on GitHub; push with: git push -u origin ' + branch);
  } else {
    const [ahead, behind] = git('rev-list', '--left-right', '--count', `HEAD...${upstream.out.trim()}`).out.trim().split(/\s+/).map(Number);
    const status = behind ? 'WARN' : ahead ? 'WARN' : 'PASS';
    const detail = !ahead && !behind
      ? `in sync with ${upstream.out.trim()}`
      : `${ahead} to push, ${behind} to pull${ahead && behind ? ' (diverged: pull --rebase or merge first)' : ''}`;
    record('repo', `branch ${branch}`, status, detail);
  }

  const dirty = git('status', '--porcelain').out.trim().split(/\r?\n/).filter(Boolean);
  record('repo', 'working tree', dirty.length ? 'WARN' : 'PASS', dirty.length ? `${dirty.length} uncommitted change(s)` : 'clean', dirty.join('\n'));

  // Local branches whose work exists only on this machine.
  const refs = git('for-each-ref', '--format=%(refname:short)|%(upstream:short)|%(upstream:track)', 'refs/heads').out.trim().split(/\r?\n/).filter(Boolean);
  const unpushed = [];
  for (const line of refs) {
    const [name, up, track] = line.split('|');
    if (!up) {
      const only = git('rev-list', '--count', name, '--not', '--remotes=origin').out.trim();
      if (Number(only) > 0) unpushed.push(`${name}: ${only} commit(s) not on GitHub (no upstream)`);
    } else if (/ahead/.test(track)) {
      unpushed.push(`${name}: ${track}`);
    } else if (track === '[gone]') {
      unpushed.push(`${name}: its GitHub branch was deleted`);
    }
  }
  record('repo', 'local branches', unpushed.length ? 'WARN' : 'PASS', unpushed.length ? unpushed.join('; ') : 'nothing exists only locally');
}

// ---------------------------------------------------------------------------
async function secrets() {
  console.log('\nsecrets — nothing private in git');
  const tracked = git('ls-files').out.split(/\r?\n/);
  const bad = tracked.filter((f) =>
    /(^|\/)\.env(\.local|\.bak.*|\..*\.bak)?$/.test(f) ||
    /(^|\/)settings\.local\.json$/.test(f) ||
    /^(data|backups|reports|docs)\//.test(f) ||
    /\.(pem|key|pfx|p12)$/i.test(f));
  record('secrets', 'tracked files', bad.length ? 'FAIL' : 'PASS', bad.length ? `should not be in git: ${bad.join(', ')}` : '.env, data/, backups/ and local settings are untracked');

  // Every secret-looking value in server/.env, searched for literally in the
  // tracked files. Reported by key name only.
  const leaks = [];
  for (const [key, value] of serverEnv) {
    if (!/KEY|SECRET|PASS|TOKEN|URI|CREDENTIAL/i.test(key) || value.length < 10) continue;
    if (/^(true|false|mongodb:\/\/127\.0\.0\.1.*|mongodb:\/\/localhost.*)$/i.test(value)) continue;
    // .gitignore naming a credentials file (GOOGLE_APPLICATION_CREDENTIALS) is the fix, not a leak.
    const hit = git('grep', '-l', '-F', '-e', value, '--', '.', ':!**/.gitignore', ':!.gitignore');
    if (hit.code === 0) leaks.push(`${key} in ${hit.out.trim().split(/\r?\n/).join(', ')}`);
  }
  record('secrets', 'server/.env values', leaks.length ? 'FAIL' : 'PASS', leaks.length ? `committed: ${leaks.join('; ')}. Rotate these keys` : `${serverEnv.size ? 'none' : 'no server/.env to compare'} found in tracked files`);

  // Known key shapes, whatever .env says today (an old key may still be live).
  const shapes = [
    ['Anthropic key', 'sk-ant-[A-Za-z0-9_-]{20,}'],
    ['Google API key', 'AIza[0-9A-Za-z_-]{35}'],
    ['Groq key', 'gsk_[A-Za-z0-9]{20,}'],
    ['private key', '-----BEGIN [A-Z ]*PRIVATE KEY-----'],
    ['Mongo URI with password', 'mongodb(\\+srv)?://[^:/@ "\'<>$]+:[^@ "\'<>$]{6,}@[a-z0-9.-]*mongodb\\.net'],
  ];
  const found = [];
  for (const [label, re] of shapes) {
    const hit = git('grep', '-n', '-I', '-E', '-e', re, '--', '.', ':!**/package-lock.json');
    // Tests set deliberate stand-ins such as 'AIzaFAKE…' and 'gsk_FAKE…'.
    const lines = hit.code === 0 ? hit.out.trim().split(/\r?\n/).filter((l) => !/FAKE|EXAMPLE|PLACEHOLDER|x{10,}/i.test(l)) : [];
    if (lines.length) {
      const where = lines.map((l) => l.split(':').slice(0, 2).join(':'));
      found.push(`${label} at ${where.slice(0, 5).join(', ')}${where.length > 5 ? ` (+${where.length - 5})` : ''}`);
    }
  }
  record('secrets', 'key patterns', found.length ? 'FAIL' : 'PASS', found.length ? found.join('; ') : 'no API keys, private keys or Atlas passwords in tracked files');
}

// ---------------------------------------------------------------------------
async function config() {
  console.log('\nconfig — environment and safety switches');
  const [major] = process.versions.node.split('.').map(Number);
  record('config', 'node', major >= 20 ? 'PASS' : 'FAIL', `v${process.versions.node} (engines: >=20)`);

  if (!serverEnv.size) {
    record('config', 'server/.env', 'FAIL', 'missing; the server cannot start');
    return;
  }
  const required = ['MONGO_URI', 'SESSION_SECRET', 'PORT'];
  const missing = required.filter((k) => !serverEnv.get(k));
  record('config', 'server/.env', missing.length ? 'FAIL' : 'PASS', missing.length ? `missing ${missing.join(', ')}` : `${serverEnv.size} keys`);

  const bypass = serverEnv.get('BYPASS_AUTH') === 'true';
  const prod = serverEnv.get('NODE_ENV') === 'production';
  record('config', 'BYPASS_AUTH', bypass ? (prod ? 'FAIL' : 'WARN') : 'PASS', bypass ? 'true: sign-in, role and year checks are off' : 'off');

  const secret = serverEnv.get('SESSION_SECRET') || '';
  record('config', 'SESSION_SECRET', secret.length >= 32 ? 'PASS' : 'WARN', `${secret.length} characters${secret.length < 32 ? '; use at least 32 random characters' : ''}`);

  const r = run('node', ['scripts/check-client-env.js'], ROOT, 60000);
  record('config', 'client env', r.code === 0 ? 'PASS' : 'FAIL', r.code === 0 ? 'front-end variables present' : 'see log', r.out);
  if (r.code !== 0) console.log(tail(r.out));
}

// The same eslint run as `npm run lint`, read as JSON so a failure says which
// rules failed. Most of the count is react/prop-types (the app does not use
// PropTypes); the rules in SERIOUS are the ones that crash a screen or break
// a boundary, and they are listed by file and line.
const SERIOUS = new Set(['no-undef', 'react-hooks/rules-of-hooks', 'no-restricted-imports', 'no-dupe-keys', 'no-unreachable', 'import/no-unresolved']);
function lint() {
  const r = run('npx', ['eslint', '.', '--ext', 'js,jsx', '--report-unused-disable-directives', '-f', 'json'], FRONT);
  let report;
  try {
    report = JSON.parse(r.stdout.slice(r.stdout.indexOf('[')));
  } catch {
    record('frontend', 'lint', 'FAIL', `eslint gave no report (exit ${r.code})`, r.out);
    return console.log(tail(r.out));
  }
  const byRule = {};
  const serious = [];
  for (const f of report) {
    for (const m of f.messages) {
      // No ruleId means a parse error (fatal) or an unused eslint-disable comment.
      const rule = m.ruleId || (m.fatal ? 'parse-error' : 'unused-disable-directive');
      const key = `${m.severity === 2 ? 'error' : 'warn'} ${rule}`;
      byRule[key] = (byRule[key] || 0) + 1;
      if (m.severity === 2 && (m.fatal || (m.ruleId && SERIOUS.has(m.ruleId)))) {
        serious.push(`${path.relative(ROOT, f.filePath).replace(/\\/g, '/')}:${m.line} ${rule}: ${m.message.split(/\.\s/)[0]}`);
      }
    }
  }
  const ranked = Object.entries(byRule).sort((a, b) => b[1] - a[1]);
  const total = ranked.reduce((n, [, c]) => n + c, 0);
  const log = ranked.map(([k, c]) => `${String(c).padStart(5)}  ${k}`).join('\n') + '\n\n' + serious.join('\n');
  if (!total) return record('frontend', 'lint', 'PASS', `${r.secs}s`, log);
  const top = ranked.slice(0, 3).map(([k, c]) => `${c} ${k.split(' ')[1]}`).join(', ');
  record('frontend', 'lint', 'FAIL', `${total} problems (${top}${ranked.length > 3 ? ', …' : ''})`, log);
  if (serious.length) console.log(`        likely bugs:\n${serious.map((s) => `          ${s}`).join('\n')}`);
}

// ---------------------------------------------------------------------------
async function frontend() {
  console.log('\nfrontend — lint, fetch credentials, build, bundle budget');
  if (!fs.existsSync(path.join(FRONT, 'node_modules'))) {
    record('frontend', 'install', 'FAIL', 'front-end/node_modules missing; run: cd front-end && npm ci');
    return;
  }
  lint();
  npmStep('frontend', 'fetch credentials', FRONT, 'check:fetch');
  if (QUICK) {
    record('frontend', 'build + size', 'SKIP', '--quick');
    return;
  }
  const before = results.length;
  npmStep('frontend', 'build', FRONT, 'build');
  if (results[before]?.status === 'PASS') npmStep('frontend', 'bundle size', FRONT, 'size');
  else record('frontend', 'bundle size', 'SKIP', 'build failed');
}

// ---------------------------------------------------------------------------
async function server() {
  console.log('\nserver — route guards and tests');
  if (!fs.existsSync(path.join(SERVER, 'node_modules'))) {
    record('server', 'install', 'FAIL', 'server/node_modules missing; run: cd server && npm ci');
    return;
  }
  // Reads the live router; exits non-zero when a non-public route has no session check.
  const audit = run('node', ['scripts/audit-routes.js', '--unprotected'], SERVER, 180000);
  record('server', 'route guards', audit.code === 0 ? 'PASS' : 'FAIL', audit.code === 0 ? 'every non-public route checks the session' : 'unprotected routes, see log', audit.out);
  if (audit.code !== 0) console.log(tail(audit.out));

  npmStep('server', 'unit tests', SERVER, 'test:unit');

  if (QUICK) {
    record('server', 'full test suite', 'SKIP', '--quick');
    return;
  }
  const uri = process.env.TEST_MONGO_URI || serverEnv.get('TEST_MONGO_URI') || 'mongodb://127.0.0.1:27017';
  let reachable = true;
  const m = /^mongodb:\/\/(?:[^@/]*@)?([^:/,]+)(?::(\d+))?/.exec(uri);
  if (m) reachable = await portOpen(m[1], Number(m[2] || 27017));
  if (!reachable) {
    record('server', 'full test suite', 'SKIP', `no test database at ${m[1]}:${m[2] || 27017}; start a local mongod, then npm run test:db:refresh`);
    return;
  }
  const r = run('npx', ['vitest', 'run', '--reporter=dot'], SERVER, 30 * 60 * 1000);
  const summary = (r.out.match(/Tests?\s+.*\d+.*(passed|failed).*/g) || []).pop() || '';
  record('server', 'full test suite', r.code === 0 ? 'PASS' : 'FAIL', `${summary.trim() || `exit ${r.code}`}, ${r.secs}s`, r.out);
  if (r.code !== 0) console.log(tail(r.out, 25));
}

// ---------------------------------------------------------------------------
async function deps() {
  console.log('\ndeps — known vulnerabilities in what ships (npm audit --omit=dev)');
  if (QUICK || OFFLINE) {
    record('deps', 'npm audit', 'SKIP', QUICK ? '--quick' : '--offline');
    return;
  }
  for (const [name, dir] of [['server', SERVER], ['front-end', FRONT]]) {
    const r = run('npm', ['audit', '--omit=dev', '--json'], dir, 180000);
    let v;
    try {
      v = JSON.parse(r.stdout.slice(r.stdout.indexOf('{'))).metadata.vulnerabilities;
    } catch {
      record('deps', name, 'WARN', 'npm audit gave no report (offline?)', r.out);
      continue;
    }
    const detail = `critical ${v.critical}, high ${v.high}, moderate ${v.moderate}, low ${v.low}`;
    record('deps', name, v.critical ? 'FAIL' : v.high ? 'WARN' : 'PASS', detail, r.out);
  }
}

// ---------------------------------------------------------------------------
(async () => {
  console.log(`E-Universe app check — ${new Date().toLocaleString()}${QUICK ? ' (quick)' : ''}${OFFLINE ? ' (offline)' : ''}`);
  for (const [group, fn] of Object.entries({ repo, secrets, config, frontend, server, deps })) {
    if (!wants(group)) continue;
    try {
      await fn();
    } catch (err) {
      record(group, 'crashed', 'FAIL', err.message);
    }
  }
  const count = (s) => results.filter((r) => r.status === s).length;
  console.log(`\n${count('PASS')} pass, ${count('WARN')} warn, ${count('FAIL')} fail, ${count('SKIP')} skipped`);
  console.log(`Logs: ${path.relative(ROOT, LOG_DIR)}`);
  fs.writeFileSync(path.join(LOG_DIR, 'summary.json'), JSON.stringify(results, null, 2));
  process.exit(count('FAIL') ? 1 : 0);
})();
