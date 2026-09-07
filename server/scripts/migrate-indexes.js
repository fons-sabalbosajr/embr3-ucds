/**
 * Phase 5: create the indexes the application's own queries imply.
 *
 * Dry run by default. Pass --apply to create.
 *
 *   node scripts/migrate-indexes.js
 *   node scripts/migrate-indexes.js --apply
 *
 * Before this, universe-db had exactly one index beyond the automatic _id: a
 * text index on ucds-data.description, created lazily by a controller. Every
 * other query — including the province filter applied to all 17,751 register
 * documents on every scoped read, and the username lookup on every login — was
 * a collection scan.
 *
 * Every key below is taken from a filter or sort that appears in the code, not
 * from guesswork. Unique indexes are checked for existing duplicates first and
 * skipped with a report rather than failing halfway.
 */

require('dotenv').config();
const { connectToMongo, getDb } = require('../config/db');

const APPLY = process.argv.includes('--apply');
const log = (...a) => console.log(...a);

// [collection, keys, options, why]
const INDEXES = [
  // --- Identity: every login and password reset goes through these ---------
  ['users', { username: 1 }, { unique: true }, 'login lookup; must also be unique'],
  ['users', { email: 1 }, { unique: true }, 'password reset and account creation'],
  ['users', { resetToken: 1 }, { sparse: true }, 'password-reset token lookup'],
  ['login-status', { userId: 1 }, {}, 'session bookkeeping on login/logout'],

  // --- The register: 17,751 documents, scanned on every scoped read --------
  ['ucds-data', { sort_key: 1 }, {}, 'primary business key; also the default sort'],
  ['ucds-data', { id_no: 1 }, {}, 'record lookup'],
  ['ucds-data', { province: 1 }, {}, 'province scope filter, applied to every scoped read'],
  ['ucds-data', { ecc_cnc: 1 }, {}, 'permit lookup; also the ERMS join key'],
  ['ucds-data', { industry_class: 1 }, {}, 'industry search and breakdowns'],
  ['ucds-data', { pto_code: 1 }, { sparse: true }, 'permit search'],
  ['ucds-data', { wwdp_code: 1 }, { sparse: true }, 'permit search'],
  ['ucds-data', { haz_id: 1 }, { sparse: true }, 'permit search'],
  ['ucds-data', { pco_no: 1 }, { sparse: true }, 'PCO search'],
  ['ucds-data', { province: 1, sort_key: 1 }, {}, 'scoped list: filter then sort'],

  // --- Sector datasets -----------------------------------------------------
  ['ucds-data-healthcare', { id_no: 1 }, {}, 'record lookup'],
  ['ucds-data-chemicals', { id_no: 1 }, {}, 'record lookup'],
  ['ucds-data-tsd', { id_no: 1 }, {}, 'record lookup'],
  ['ucds-data-trc', { id_no: 1 }, {}, 'record lookup'],

  // --- eSWM ----------------------------------------------------------------
  ['ucds-eswm-ten_swm_plan', { id_no: 1 }, {}, 'record lookup'],
  ['ucds-eswm-mrf', { id_no: 1 }, {}, 'record lookup'],
  ['ucds-eswm-slf', { id_no: 1 }, {}, 'record lookup'],
  ['ucds-eswm-equipment', { id_no: 1 }, {}, 'record lookup'],
  ['ucds-eswm-ods', { id_no: 1 }, {}, 'record lookup'],

  // --- Year-scoped activity ------------------------------------------------
  ['survey-data-2024', { id_no: 1 }, {}, 'record lookup'],
  ['survey-data-2025', { id_no: 1 }, {}, 'record lookup'],
  ['ucds-log', { year: 1, transactionID: -1 }, {}, 'year-scoped log, newest first'],
  ['survey-log', { year: 1, transactionID: -1 }, {}, 'year-scoped log, newest first'],
  ['postings', { year: 1, createdDate: -1 }, {}, 'year-scoped bulletin, newest first'],
  ['draft-reports', { year: 1, date: -1 }, {}, 'year-scoped drafts, newest first'],

  // --- Shared platform -----------------------------------------------------
  ['app-logs', { timestamp: -1 }, {}, 'audit trail, newest first'],
  ['app-logs', { username: 1, timestamp: -1 }, {}, 'per-user audit trail'],
  ['app-logs', { domain: 1, timestamp: -1 }, {}, 'per-domain audit trail'],
  ['year-containers', { year: 1 }, { unique: true }, 'container registry; one document per year'],
  ['developer-field-configs', { module: 1, order: 1, fieldKey: 1 }, {}, 'field config listing order'],
];

const keyName = (keys) =>
  Object.entries(keys)
    .map(([k, v]) => `${k}:${v}`)
    .join(', ');

async function duplicatesFor(collection, keys) {
  const fields = Object.keys(keys);
  const id = fields.reduce((acc, f) => ({ ...acc, [f]: `$${f}` }), {});
  const rows = await collection
    .aggregate([
      { $match: fields.reduce((acc, f) => ({ ...acc, [f]: { $ne: null } }), {}) },
      { $group: { _id: id, n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
      { $limit: 5 },
    ])
    .toArray();
  return rows;
}

async function main() {
  await connectToMongo();
  const db = getDb();

  const existingNames = new Set();
  const present = (await db.listCollections().toArray()).map((c) => c.name);
  for (const name of present) {
    for (const idx of await db.collection(name).indexes()) {
      existingNames.add(`${name}::${idx.name}`);
    }
  }

  log(`\n${APPLY ? 'APPLYING' : 'DRY RUN'}\n`);
  log(`${'collection'.padEnd(26)}${'keys'.padEnd(34)}${'status'.padEnd(12)}why`);
  log('-'.repeat(120));

  let created = 0;
  let skipped = 0;
  const blocked = [];

  for (const [name, keys, options, why] of INDEXES) {
    if (!present.includes(name)) {
      log(`${name.padEnd(26)}${keyName(keys).padEnd(34)}${'no coll'.padEnd(12)}${why}`);
      skipped++;
      continue;
    }

    const collection = db.collection(name);

    // A unique index fails the whole command if duplicates exist. Check first
    // and report the offending values instead.
    if (options.unique) {
      const dupes = await duplicatesFor(collection, keys);
      if (dupes.length) {
        blocked.push({ name, keys: keyName(keys), dupes });
        log(`${name.padEnd(26)}${keyName(keys).padEnd(34)}${'BLOCKED'.padEnd(12)}duplicates exist`);
        continue;
      }
    }

    if (!APPLY) {
      log(`${name.padEnd(26)}${keyName(keys).padEnd(34)}${'would add'.padEnd(12)}${why}`);
      created++;
      continue;
    }

    const idxName = await collection.createIndex(keys, { ...options, background: true });
    const already = existingNames.has(`${name}::${idxName}`);
    log(`${name.padEnd(26)}${keyName(keys).padEnd(34)}${(already ? 'exists' : 'created').padEnd(12)}${why}`);
    if (!already) created++;
    else skipped++;
  }

  log('-'.repeat(120));
  log(`${created} ${APPLY ? 'created' : 'would be created'}, ${skipped} already present or not applicable.`);

  if (blocked.length) {
    log('\nBLOCKED — a unique index cannot be created while duplicates exist:');
    for (const b of blocked) {
      log(`  ${b.name} (${b.keys})`);
      for (const d of b.dupes) log(`    ${JSON.stringify(d._id)} x${d.n}`);
    }
    log('\n  Resolve these by hand, then re-run. Nothing else was affected.');
  }

  process.exit(0);
}

main().catch((e) => {
  console.error('Index migration failed:', e);
  process.exit(1);
});
