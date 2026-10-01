#!/usr/bin/env node
/* eslint-disable no-console */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '..', '.env') });
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { connectToMongo, getDb } = require('../../../config/db');
const { cleanProjectType } = require('../lib/source');

// ---------------------------------------------------------------------------
// Load the legacy ERMS databases into MongoDB.
//
// Input: the JSON-lines export written by export.ps1 (one file per table,
// under data/erms_sql/export/<unit>/). Two things come out:
//
//   1. Staging — every table, every row, as it was, in collections named
//      legacy-erms-<unit>-<table>. Nothing is interpreted; this is the
//      desktop system's data kept whole and queryable, so a question about
//      "what did ERMS say about X" can be answered without SQL Server.
//
//   2. Lookups — the desktop system's configuration menus, cleaned into one
//      collection, erms-lookups, one document per list: project types,
//      document statuses, the Legal Unit's case statuses, officers and
//      handlers, the Laboratory's parameter groups, and the province → city
//      → barangay address tables. These are what the application's screens
//      offer in dropdowns; they used to live in the desktop system's
//      Settings.
//
// Re-runnable: staging collections are replaced, lookups upserted. Passwords
// and photos were never exported (see export.ps1).
// ---------------------------------------------------------------------------

const EXPORT_DIR = path.resolve(__dirname, '../../../../data/erms_sql/export');
const STAGING_PREFIX = 'legacy-erms';
const LOOKUPS = 'erms-lookups';

const UNITS = ['records', 'legal', 'laboratory'];

// The desktop system numbered provinces 1–7; the application keys them.
const PROVINCE_KEY_BY_ID = { 1: 'aurora', 2: 'bataan', 3: 'bulacan', 4: 'nuevaEcija', 5: 'pampanga', 6: 'tarlac', 7: 'zambales' };

const collectionName = (unit, table) => `${STAGING_PREFIX}-${unit}-${table.replace(/^tb_/i, '').toLowerCase().replace(/_/g, '-')}`;

async function* readJsonl(file) {
  const rl = readline.createInterface({ input: fs.createReadStream(file, 'utf8'), crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.trim()) yield JSON.parse(line);
  }
}

async function readAll(unit, table) {
  const file = path.join(EXPORT_DIR, unit, `${table}.jsonl`);
  if (!fs.existsSync(file)) return [];
  const rows = [];
  for await (const row of readJsonl(file)) rows.push(row);
  return rows;
}

const clean = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s && !/^(n\/a|null|none|-)$/i.test(s) ? s : null;
};
const num = (v) => {
  const n = Number(clean(v));
  return Number.isFinite(n) ? n : null;
};

// --- staging -----------------------------------------------------------------

async function loadStaging() {
  const db = getDb();
  const importedAt = new Date();
  const loaded = [];
  for (const unit of UNITS) {
    const dir = path.join(EXPORT_DIR, unit);
    if (!fs.existsSync(dir)) {
      console.warn(`no export for ${unit} at ${dir}`);
      continue;
    }
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort()) {
      const table = file.replace(/\.jsonl$/, '');
      const name = collectionName(unit, table);
      const col = db.collection(name);
      await col.drop().catch(() => {});
      let batch = [];
      let count = 0;
      for await (const row of readJsonl(path.join(dir, file))) {
        batch.push({ ...row, _legacy: { unit, table, importedAt } });
        if (batch.length === 1000) {
          await col.insertMany(batch, { ordered: false });
          count += batch.length;
          batch = [];
        }
      }
      if (batch.length) {
        await col.insertMany(batch, { ordered: false });
        count += batch.length;
      }
      if (count && 'Serial_No' in (await col.findOne({})) ) await col.createIndex({ Serial_No: 1 });
      loaded.push({ unit, table, collection: name, rows: count });
      console.log(`  ${unit.padEnd(11)} ${table.padEnd(32)} ${String(count).padStart(6)} → ${name}`);
    }
  }
  return loaded;
}

// --- lookups -----------------------------------------------------------------

function projectTypes(recordsConfig, legalNature, maindata) {
  const seen = new Map();
  const add = (item) => {
    const key = item.label.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!key || seen.has(key)) return;
    seen.set(key, item);
  };
  for (const r of recordsConfig) {
    const label = clean(r.Project_Type);
    if (label) add({ code: `RPT-${r.No}`, category: clean(r.Category), label, source: 'records-settings' });
  }
  for (const r of legalNature) {
    const label = clean(r.Project_Type_Name);
    if (label) add({ code: clean(r.ID_No), category: clean(r.Category_Group), label, description: clean(r.Description), source: 'legal-settings' });
  }
  // Values typed into records that were never in the settings list: kept so
  // an existing record's type is still offered, but marked as data-only.
  // The desktop application's textbox text is unwrapped first (see
  // cleanProjectType), and a value it cut short is matched back to the
  // settings entry it starts like rather than listed as its own stub.
  const counts = new Map();
  const known = [...seen.values()].map((it) => it.label);
  for (const r of maindata) {
    let label = cleanProjectType(String(r.Project_Type || '').replace(/^"+|"+$/g, ''));
    if (!label || /^--\s*select/i.test(label)) continue;
    if (label.endsWith('…')) {
      const stem = label.slice(0, -1).toLowerCase();
      const full = known.find((k) => k.toLowerCase().startsWith(stem));
      if (full) label = full;
    }
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  for (const [label, n] of [...counts].sort((a, b) => b[1] - a[1])) {
    add({ code: null, category: null, label, source: 'records-data', usedBy: n });
  }
  return [...seen.values()];
}

function documentTypes() {
  // The desktop system's upload counters name each unit's document kinds
  // as columns; they are the tabs and the "type" menu of each subsystem.
  return [
    { unit: 'records', code: 'ECC_Original', label: 'ECC (Original)' },
    { unit: 'records', code: 'ECC_Amended', label: 'ECC (Amended)' },
    { unit: 'records', code: 'CNC', label: 'Certificate of Non-Coverage' },
    { unit: 'records', code: 'DP', label: 'Discharge Permit' },
    { unit: 'records', code: 'PTO', label: 'Permit to Operate' },
    { unit: 'records', code: 'HWGRC', label: 'Hazardous Waste Generator Registration Certificate' },
    { unit: 'records', code: 'LUC', label: 'LUC', note: 'legacy abbreviation, not expanded in the source' },
    { unit: 'records', code: 'COA', label: 'COA', note: 'legacy abbreviation, not expanded in the source' },
    { unit: 'legal', code: 'NOV', label: 'Notice of Violation' },
    { unit: 'legal', code: 'TC', label: 'Technical Conference' },
    { unit: 'legal', code: 'ORD_RES', label: 'Order / Resolution' },
    { unit: 'legal', code: 'PAYMENT', label: 'Payment' },
    { unit: 'legal', code: 'ATTACHMENTS', label: 'Attachments' },
    { unit: 'laboratory', code: 'Lab_Test_Results', label: 'Laboratory Test Result' },
    { unit: 'laboratory', code: 'COC', label: 'Chain of Custody Form (COC)' },
    { unit: 'laboratory', code: 'Draft_Results_of_Analysis', label: 'Draft Results of Analysis' },
    { unit: 'laboratory', code: 'Memo', label: 'Laboratory Memo' },
    { unit: 'laboratory', code: 'PR_Receipts', label: 'PR / Receipts' },
    { unit: 'laboratory', code: 'Calibration_Certificates', label: 'Calibration Certificate' },
  ];
}

async function buildLookups() {
  const [projCfg, docStatus, provinces, cities, brgys, maindata] = await Promise.all([
    readAll('records', 'tb_config_projtype'),
    readAll('records', 'tb_config_docstatus'),
    readAll('records', 'tb_addprovince'),
    readAll('records', 'tb_addcity'),
    readAll('records', 'tb_addbrgy'),
    readAll('records', 'tb_maindata'),
  ]);
  const [legalStatus, officers, handlers, nature] = await Promise.all([
    readAll('legal', 'tb_input_status'),
    readAll('legal', 'tb_input_legalofficer'),
    readAll('legal', 'tb_input_casehandler'),
    readAll('legal', 'tb_input_natureofbusiness'),
  ]);
  const dockets = [];
  for (const [suffix, key] of [['AU', 'aurora'], ['BA', 'bataan'], ['BU', 'bulacan'], ['NE', 'nuevaEcija'], ['PA', 'pampanga'], ['TA', 'tarlac'], ['ZA', 'zambales']]) {
    for (const r of await readAll('legal', `tb_docketno_${suffix}`)) {
      const docketNo = clean(r[`Docket_No_${suffix}`]);
      if (docketNo) dockets.push({ province: key, docketNo, id: num(r.ID_No) });
    }
  }
  const labParams = await readAll('laboratory', 'tb_input_parameters');

  const simple = (rows, code, label, extra = () => ({})) =>
    rows
      .map((r) => ({ code: clean(r[code]), label: clean(r[label]), ...extra(r) }))
      .filter((x) => x.label)
      .sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')));

  const provinceItems = provinces
    .map((r) => ({ id: num(r.Province_ID), key: PROVINCE_KEY_BY_ID[num(r.Province_ID)] || null, label: clean(r.Province), lat: num(r.Latitude), long: num(r.Longitude) }))
    .filter((p) => p.label);
  const cityItems = cities
    .map((r) => ({ provinceId: num(r.Prov_ID), province: PROVINCE_KEY_BY_ID[num(r.Prov_ID)] || null, cityId: num(r.City_ID), label: clean(r.City), lat: num(r.Latitude), long: num(r.Longitude) }))
    .filter((c) => c.label)
    .sort((a, b) => a.provinceId - b.provinceId || a.label.localeCompare(b.label));
  const brgyItems = brgys
    .map((r) => ({ provinceId: num(r.Prov_ID), province: PROVINCE_KEY_BY_ID[num(r.Prov_ID)] || null, cityId: num(r.City_ID), brgyId: num(r.Brgy_ID), label: clean(r.Barangay), lat: num(r.Latitude), long: num(r.Longitude) }))
    .filter((b) => b.label)
    .sort((a, b) => a.provinceId - b.provinceId || a.cityId - b.cityId || a.label.localeCompare(b.label));

  const now = new Date();
  const doc = (kind, description, items, unit) => ({ _id: kind, kind, unit, description, items, count: items.length, source: 'desktop ERMS settings', importedAt: now });

  return [
    doc('project-types', 'Project type menu: the Records settings list, the Legal Unit\'s nature-of-business list, and values found in records.', projectTypes(projCfg, nature, maindata), 'records'),
    doc('document-statuses', 'Document status menu (Records settings).', simple(docStatus, 'No', 'Document_StatusConfig'), 'records'),
    doc('document-types', 'The document kinds each unit files, from the upload counters.', documentTypes(), null),
    doc('legal-statuses', 'Case status menu (Legal settings).', simple(legalStatus, 'ID_No', 'Status'), 'legal'),
    doc('legal-officers', 'Legal officers (Legal settings).', simple(officers, 'ID_No', 'Legal_Officer'), 'legal'),
    doc('case-handlers', 'Case handlers (Legal settings).', simple(handlers, 'ID_No', 'Case_Handler'), 'legal'),
    doc('nature-of-business', 'Nature of business, grouped (Legal settings).', simple(nature, 'ID_No', 'Project_Type_Name', (r) => ({ category: clean(r.Category_Group), description: clean(r.Description) })), 'legal'),
    doc('legal-dockets', 'Docket number registers per province (Legal).', dockets, 'legal'),
    doc('lab-parameters', 'Parameter groups (Laboratory settings).', simple(labParams, 'ID_No', 'Parameter_Name'), 'laboratory'),
    doc('provinces', 'Provinces with the desktop system\'s ids and coordinates.', provinceItems, 'records'),
    doc('cities', 'Cities and municipalities per province.', cityItems, 'records'),
    doc('barangays', 'Barangays per city.', brgyItems, 'records'),
  ];
}

async function loadLookups() {
  const docs = await buildLookups();
  const col = getDb().collection(LOOKUPS);
  for (const d of docs) {
    await col.replaceOne({ _id: d._id }, d, { upsert: true });
    console.log(`  ${d.kind.padEnd(20)} ${String(d.count).padStart(5)} items`);
  }
  return docs;
}

// --- main --------------------------------------------------------------------

(async () => {
  if (!fs.existsSync(EXPORT_DIR)) {
    console.error(`No export at ${EXPORT_DIR}. Run scripts/migrate-erms/legacy-sql/export.ps1 first.`);
    process.exit(1);
  }
  const { client } = await connectToMongo();
  const only = process.argv.includes('--lookups-only');

  let staged = [];
  if (!only) {
    console.log('Staging (every legacy table):');
    staged = await loadStaging();
  }
  console.log('Lookups (the desktop system\'s menus):');
  const lookups = await loadLookups();

  await getDb().collection('app-config').updateOne(
    { _id: 'erms-legacy-import' },
    { $set: { importedAt: new Date(), tables: staged, lookups: lookups.map((l) => ({ kind: l.kind, count: l.count })) } },
    { upsert: true }
  );
  console.log(`\nDone: ${staged.length} tables staged, ${lookups.length} lookup lists.`);
  await client.close();
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
