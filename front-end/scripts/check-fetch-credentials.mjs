#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Every fetch() to the API must send the session cookie.
//
// fetch defaults to credentials: "same-origin", and the SPA and API are on
// different origins, so a bare fetch to the API silently drops the cookie and
// the request comes back 401 for a user who is signed in perfectly well.
//
// This has now caused the same bug four times — the avatar in the header, the
// user list, /api/user/details, and the profile photo upload — each found by a
// person noticing a console error rather than by anything checking. So it is
// checked.
//
//   npm run check:fetch
//
// axios is fine: axios.defaults.withCredentials is set once in App.jsx.
// ---------------------------------------------------------------------------

const ROOT = path.resolve(process.argv[2] || 'src');
const offenders = [];

/** Find the matching ")" for the "(" at `open`, ignoring strings. */
function callEnd(text, open) {
  let depth = 0;
  let quote = null;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function scan(file) {
  const text = fs.readFileSync(file, 'utf8');
  const re = /\bfetch\s*\(/g;
  let m;
  while ((m = re.exec(text))) {
    const open = m.index + m[0].length - 1;
    const end = callEnd(text, open);
    if (end === -1) continue;
    const call = text.slice(open, end + 1);

    // Only calls that target the API matter; a fetch of a local asset does not
    // need the cookie.
    const targetsApi = /API_BASE|API_URL|API_BASE_URL|\/api\//.test(call);
    if (!targetsApi) continue;
    if (/credentials\s*:/.test(call)) continue;

    const line = text.slice(0, m.index).split('\n').length;
    offenders.push(`${path.relative(process.cwd(), file)}:${line}`);
  }
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      walk(full);
    } else if (/\.(js|jsx)$/.test(entry.name)) {
      scan(full);
    }
  }
}

walk(ROOT);

if (offenders.length) {
  console.error(`\n${offenders.length} fetch() call(s) to the API without credentials: "include":\n`);
  offenders.forEach((o) => console.error('  ' + o));
  console.error(
    '\nThe SPA and API are different origins, so these send no session cookie\n' +
      'and answer 401 for a signed-in user. Add { credentials: "include" }.\n'
  );
  process.exit(1);
}

console.log('All fetch() calls to the API send credentials.');
