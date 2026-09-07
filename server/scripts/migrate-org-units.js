/**
 * Phase 4: promote the free-text `division` string on user documents into the
 * shared `org-units` collection.
 *
 * Dry run by default. Pass --apply to write.
 *
 *   node scripts/migrate-org-units.js
 *   node scripts/migrate-org-units.js --apply
 *
 * Variant spellings collapse onto one canonical code and are recorded as
 * aliases, so an existing user document keeps resolving without being rewritten.
 * The `division` field on users is deliberately left alone.
 */

require('dotenv').config();
const { connectToMongo, collections } = require('../config/db');
const orgUnits = require('../shared/services/orgUnits');

const APPLY = process.argv.includes('--apply');
const log = (...a) => console.log(...a);

/** Guess a unit type from the code shape, e.g. ORD-PEMU-BATAAN is a section. */
function inferType(code) {
  const depth = code.split('-').length;
  if (depth <= 1) return 'office';
  if (depth === 2) return 'division';
  return 'section';
}

function inferParent(code) {
  const parts = code.split('-');
  return parts.length > 1 ? parts.slice(0, -1).join('-') : null;
}

async function main() {
  await connectToMongo();
  await orgUnits.ensureIndexes();

  const divisions = (await collections.users.distinct('division')).filter(Boolean);

  // Group every spelling under its canonical code.
  const byCode = new Map();
  for (const raw of divisions) {
    const code = orgUnits.normalizeCode(raw);
    if (!code) continue;
    if (!byCode.has(code)) byCode.set(code, new Set());
    byCode.get(code).add(String(raw).trim());
  }

  // A parent implied by a child code (ORD-PEMU-BATAAN implies ORD-PEMU, ORD)
  // is created too, so the hierarchy has no gaps.
  const implied = new Set();
  for (const code of byCode.keys()) {
    const parts = code.split('-');
    for (let i = 1; i < parts.length; i++) implied.add(parts.slice(0, i).join('-'));
  }
  for (const code of implied) if (!byCode.has(code)) byCode.set(code, new Set());

  log(`\n${APPLY ? 'APPLYING' : 'DRY RUN'} — ${divisions.length} distinct division strings -> ${byCode.size} units\n`);

  const codes = [...byCode.keys()].sort();
  for (const code of codes) {
    const spellings = [...byCode.get(code)];
    const variants = spellings.filter((s) => s !== code);
    const existing = await orgUnits.getByCode(code);
    const type = inferType(code);
    const parent = inferParent(code);

    log(
      `  ${code.padEnd(22)}${type.padEnd(10)}parent=${String(parent || '-').padEnd(12)}` +
        `${existing ? 'exists' : 'create'}${spellings.length === 0 ? '  (implied parent)' : ''}`
    );
    if (variants.length) log(`${' '.repeat(4)}aliases: ${variants.map((v) => JSON.stringify(v)).join(', ')}`);

    if (!APPLY) continue;

    if (!existing) {
      await orgUnits.create({ code, name: code, type, parentCode: parent, createdBy: 'migration' });
    }
    for (const alias of spellings) await orgUnits.addAlias(code, alias);
  }

  log('');
  if (APPLY) {
    const all = await orgUnits.list({ includeInactive: true });
    log(`org-units now holds ${all.length} units.`);
  } else {
    log('Re-run with --apply to write.');
  }
  process.exit(0);
}

main().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
