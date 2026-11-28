// The lint gate for CI: fails only on the eslint errors that break a screen
// or a domain boundary. `npm run lint` reports about 2,400 problems, almost
// all react/prop-types (the app does not use PropTypes), so it cannot gate a
// deploy. The rules below are the ones the app check lists as "likely bugs"
// (SERIOUS in .claude/skills/app-check/scripts/check-all.js); keep the two lists
// the same.
//
//   node scripts/lint-likely-bugs.mjs        # from front-end/

import { ESLint } from 'eslint';
import path from 'node:path';

const SERIOUS = new Set(['no-undef', 'react-hooks/rules-of-hooks', 'no-restricted-imports', 'no-dupe-keys', 'no-unreachable', 'import/no-unresolved']);

const eslint = new ESLint({ extensions: ['.js', '.jsx'] });
const results = await eslint.lintFiles(['.']);

const found = [];
for (const file of results) {
  for (const m of file.messages) {
    if (m.severity === 2 && (m.fatal || SERIOUS.has(m.ruleId))) {
      found.push(`${path.relative(process.cwd(), file.filePath).replace(/\\/g, '/')}:${m.line} ${m.ruleId || 'parse-error'}: ${m.message}`);
    }
  }
}

if (found.length) {
  console.error(`${found.length} likely bug(s):\n${found.map((f) => `  ${f}`).join('\n')}`);
  process.exit(1);
}
console.log(`No likely bugs in ${results.length} files.`);
