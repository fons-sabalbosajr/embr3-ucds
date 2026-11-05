#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Fail when the front-end's main chunks grow past their budget, compressed.
//
// A library imported in the wrong place is invisible in the code and costs
// every person on every first visit: on 4 Nov 2026 one chain of ordinary imports
// had the sign-in page downloading the whole application, 1.28 MB compressed.
// Run after a build. A chunk over budget usually wants a lazy() or an import()
// where it is used; raise a budget only when the size is truly needed.
//
//   npm run build && npm run size
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const assets = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', process.argv[2] || 'dist', 'assets');

// Compressed kilobytes, about 15% over what each measured on 4 Nov 2026.
const BUDGETS = [
  { chunk: 'index', kb: 450, why: 'every page, sign-in included' },
  { chunk: 'Universe', kb: 140, why: 'every signed-in screen' },
  { chunk: 'Province', kb: 40, why: 'the Monitoring Plan' },
];

if (!fs.existsSync(assets)) {
  console.error(`No build at ${assets}. Run npm run build first.`);
  process.exit(2);
}

const files = fs.readdirSync(assets).filter((f) => f.endsWith('.js'));
const sizeOf = (f) => zlib.gzipSync(fs.readFileSync(path.join(assets, f))).length / 1024;

let over = 0;
for (const { chunk, kb, why } of BUDGETS) {
  // A name can be shared ("index" and "index.es"): the largest of that exact name.
  const matches = files.filter((f) => new RegExp(`^${chunk}-[^.]+\\.js$`).test(f));
  if (!matches.length) {
    console.log(`  ?     ${chunk}: no such chunk; update the budgets if it was renamed`);
    continue;
  }
  const size = Math.max(...matches.map(sizeOf));
  const ok = size <= kb;
  if (!ok) over += 1;
  console.log(`  ${ok ? 'ok   ' : 'OVER '} ${chunk.padEnd(10)} ${size.toFixed(0).padStart(5)} KB of ${kb} KB  (${why})`);
}

const largest = files.map((f) => [f, sizeOf(f)]).sort((a, b) => b[1] - a[1]).slice(0, 5);
console.log('\nLargest chunks, loaded only where they are used:');
for (const [f, size] of largest) console.log(`  ${size.toFixed(0).padStart(5)} KB  ${f}`);

if (over) console.error(`\n${over} chunk(s) over budget.`);
process.exit(over ? 1 : 0);
