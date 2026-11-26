#!/usr/bin/env node
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// ---------------------------------------------------------------------------
// The daily check for the parallel period.
//
// Runs the divergence comparison and keeps a dated copy of the output. The
// dated copy is the point: the value of a 2-4 week parallel run is being able
// to say afterwards "the two systems agreed every day", and a check that
// overwrites its own report cannot support that claim. If drift appears in
// week three, these files say which day it started.
//
//   npm run daily-check                       uses data/tb_maindata_erms.csv
//   npm run daily-check -- --csv=<export>     a fresh desktop export
//
// Exits with the divergence script's own status, so a scheduled task fails
// loudly on drift.
// ---------------------------------------------------------------------------

// divergence.js reads its export from --file=; this script has always been
// given --csv=, which divergence.js ignored, so a fresh export passed here was
// silently replaced by the default file. --csv= is now translated.
// --source=sql reads the legacy SQL Server live instead of any file.
const args = process.argv.slice(2).map((a) => (a.startsWith('--csv=') ? `--file=${a.slice('--csv='.length)}` : a));
const fromSql = args.includes('--source=sql');
const hasFile = args.some((a) => a.startsWith('--file='));
const csvArg = fromSql || hasFile ? [] : [`--file=${path.resolve(__dirname, '../../data/tb_maindata_erms.csv')}`];

const reportsDir = path.resolve(__dirname, '../../reports');
fs.mkdirSync(reportsDir, { recursive: true });

const stamp = new Date().toISOString().slice(0, 10);
const outFile = path.join(reportsDir, `divergence-${stamp}.txt`);

const run = spawnSync(
  process.execPath,
  [path.join(__dirname, 'migrate-erms/divergence.js'), ...csvArg, ...args],
  { encoding: 'utf8' }
);

const output = `${run.stdout || ''}${run.stderr || ''}`;
process.stdout.write(output);

const header =
  `E-Universe divergence check\n` +
  `run at   : ${new Date().toISOString()}\n` +
  `exit code: ${run.status}\n` +
  `${'='.repeat(78)}\n`;

// Appended, not overwritten, so a second run on the same day does not erase
// the first — two runs in a day usually means the first one found something.
fs.appendFileSync(outFile, header + output + '\n', 'utf8');

console.log(`\nkept: reports/divergence-${stamp}.txt`);

if (run.status !== 0) {
  console.log('\nDrift found. Someone has to decide which side is right before it compounds.');
}

process.exit(run.status ?? 1);
