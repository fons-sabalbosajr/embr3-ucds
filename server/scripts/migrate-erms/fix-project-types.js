#!/usr/bin/env node
/* eslint-disable no-console */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { connectToMongo, getDb } = require('../../config/db');
const { cleanProjectType } = require('./lib/source');

// ---------------------------------------------------------------------------
// Repair project types that hold the desktop application's textbox text
// ("Guna.UI2.WinForms.Internal.PlaceholderTextBox, Text: …") instead of the
// value typed into it. The original is kept as project.typeRaw. A value the
// desktop application cut short ("…") is completed from the settings list
// when exactly one entry starts like it. Re-runnable; `--dry` only reports.
// ---------------------------------------------------------------------------

(async () => {
  const dry = process.argv.includes('--dry');
  const { client } = await connectToMongo();
  const records = getDb().collection('erms-records');
  const lookups = getDb().collection('erms-lookups');

  const list = await lookups.findOne({ _id: 'project-types' });
  const known = (list?.items || []).map((i) => i.label).filter((l) => !/PlaceholderTextBox/i.test(l));

  const pattern = /PlaceholderTextBox/i;
  const cursor = records.find({ $or: [{ 'project.type': pattern }, { 'project.otherType': pattern }] }, { projection: { serialNo: 1, project: 1 } });
  let fixed = 0;
  let completed = 0;
  let emptied = 0;
  const unresolved = new Map();
  for await (const r of cursor) {
    const set = {};
    for (const field of ['type', 'otherType']) {
      const raw = r.project?.[field];
      if (!raw || !pattern.test(raw)) continue;
      let value = cleanProjectType(raw);
      if (value && value.endsWith('…')) {
        const stem = value.slice(0, -1).toLowerCase();
        const matches = known.filter((k) => k.toLowerCase().startsWith(stem));
        if (matches.length === 1) {
          value = matches[0];
          completed += 1;
        } else {
          unresolved.set(value, (unresolved.get(value) || 0) + 1);
        }
      }
      set[`project.${field}`] = value;
      set[`project.${field}Raw`] = raw;
      if (!value) emptied += 1;
    }
    if (!Object.keys(set).length) continue;
    fixed += 1;
    if (!dry) await records.updateOne({ _id: r._id }, { $set: set });
  }
  console.log(`${dry ? '[dry run] ' : ''}${fixed} records repaired (${completed} truncated values completed from the settings list, ${emptied} left empty).`);
  if (unresolved.size) {
    console.log('Truncated values that match no single settings entry (kept with an ellipsis):');
    for (const [v, n] of unresolved) console.log(`  ${n}× ${v}`);
  }
  await client.close();
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
