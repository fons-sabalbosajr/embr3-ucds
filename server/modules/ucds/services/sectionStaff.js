const { connectToMongo, getDb, client } = require('../../../config/db');
const { cached } = require('../../../shared/services/shortCache');
const { namesAgree } = require('../../../services/vera/registerLinks');

// ---------------------------------------------------------------------------
// Who works under each "Section in charge", for the record window's
// Inspector / handler box: choose CPD_EIAS and the box offers the people of
// the Environmental Impact Assessment Section, not the whole office.
//
// Two sources, per section code (as the register writes it, PEMU-Bataan and
// PEMU_Bataan alike):
//   handlers  the names the register itself records under that section, the
//             most used first — the spelling the register already has;
//   staff     the section's people in HRPMS (employees.sectionOrUnit), as
//             "First M. Surname", less any the register already has. HRPMS
//             does not split the PEMUs by province, so a PEMU's staff are
//             all the PEMUs'; its handlers are the province's own.
//
// Names only — no position, number or contact leaves HRPMS — and for staff
// signed in to the Central DB. Kept an hour.
// ---------------------------------------------------------------------------

const TTL_MS = 60 * 60 * 1000;
const HRPMS_DB = () => String(process.env.HRPMS_DB_NAME || 'db-hrpms').trim();

// The section codes of the register and HRPMS's names for them.
const HR_SECTIONS = {
  CPD_EIAS: ['Environmental Impact Assessment Section'],
  CPD_AWPS: ['Air and Water Permitting Section'],
  CPD_CHWPS: ['Chemical and Hazardous Waste Permitting Section'],
  TCHWMS: ['Chemicals and Hazardous Waste Monitoring Section'],
  WAQMS: ['Water and Air Quality Monitoring Section'],
  // The section's earlier name; its people are WAQMS's now.
  AWECMES: ['Air, Water and ECC Compliance Monitoring and Enforcement Section', 'Water and Air Quality Monitoring Section'],
  MBU: ['Manila Bay Unit'],
  PEMU: ['Provincial Environmental Management Unit'],
};

/** "PEMU-Nueva_Ecija", "pemu nueva ecija" → "PEMU_NUEVA_ECIJA". */
const codeOf = (s) => String(s || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
const hrSectionsOf = (code) => HR_SECTIONS[code.startsWith('PEMU_') ? 'PEMU' : code] || [];

const tidy = (s) => String(s || '').replace(/\s+/g, ' ').trim();
/** A person's name, not a stray month, date or number typed in the column. */
const looksLikeName = (s) => /^[A-Za-zÑñ.,' -]{5,80}$/.test(s) && s.split(' ').filter((w) => /[A-Za-z]{2,}/.test(w)).length >= 2;

/** "Surname, First M. Jr." (or "Surname, First Jr. M.") → "First M. Surname Jr." */
function displayName(hrName) {
  const s = tidy(hrName);
  const comma = s.indexOf(',');
  if (comma < 0) return s;
  const surname = s.slice(0, comma).trim();
  const words = s.slice(comma + 1).trim().split(' ');
  const isSuffix = (w) => /^(Jr\.?|Sr\.?|II|III|IV)$/i.test(w);
  return [...words.filter((w) => !isSuffix(w)), surname, ...words.filter(isSuffix)].filter(Boolean).join(' ');
}

/** One spelling per person, the most used first. */
function distinctNames(counts) {
  const kept = [];
  for (const [name] of [...counts].sort((a, b) => b[1] - a[1])) {
    if (!kept.some((k) => namesAgree(k, name))) kept.push(name);
  }
  return kept;
}

async function handlersByCode() {
  const db = getDb();
  const registers = (await db.listCollections({ name: /^ucds-data(-\d{4})?$/ }, { nameOnly: true }).toArray()).map((c) => c.name);
  const byCode = new Map();
  for (const reg of registers) {
    const rows = await db
      .collection(reg)
      .aggregate([{ $match: { section_incharged: { $type: 'string', $ne: '' }, handler: { $type: 'string', $ne: '' } } }, { $group: { _id: { s: '$section_incharged', h: '$handler' }, n: { $sum: 1 } } }])
      .toArray();
    for (const r of rows) {
      const name = tidy(r._id.h);
      if (!looksLikeName(name)) continue;
      const code = codeOf(r._id.s);
      if (!byCode.has(code)) byCode.set(code, new Map());
      const counts = byCode.get(code);
      counts.set(name, (counts.get(name) || 0) + r.n);
    }
  }
  return byCode;
}

async function staffBySection() {
  try {
    const rows = await client
      .db(HRPMS_DB())
      .collection('employees')
      .find({ sectionOrUnit: { $in: [...new Set(Object.values(HR_SECTIONS).flat())] } }, { projection: { _id: 0, name: 1, sectionOrUnit: 1 } })
      .toArray();
    const by = new Map();
    for (const r of rows) {
      const name = displayName(r.name);
      if (!looksLikeName(name)) continue;
      if (!by.has(r.sectionOrUnit)) by.set(r.sectionOrUnit, new Set());
      by.get(r.sectionOrUnit).add(name);
    }
    return by;
  } catch (err) {
    console.error('Section staff: HRPMS could not be read:', err.message);
    return new Map();
  }
}

/** { [code]: { handlers: [...], staff: [...] } } for every section code known to the register or HRPMS. */
function directory() {
  return cached('ucds:section-staff', TTL_MS, async () => {
    await connectToMongo();
    const [handlers, staff] = await Promise.all([handlersByCode(), staffBySection()]);
    const codes = new Set([...handlers.keys(), ...Object.keys(HR_SECTIONS).filter((c) => c !== 'PEMU')]);
    const out = {};
    for (const code of codes) {
      const known = distinctNames(handlers.get(code) || new Map());
      const people = [...new Set(hrSectionsOf(code).flatMap((s) => [...(staff.get(s) || [])]))]
        .filter((n) => !known.some((k) => namesAgree(k, n)))
        .sort((a, b) => a.localeCompare(b));
      if (known.length || people.length) out[code] = { handlers: known, staff: people };
    }
    return out;
  });
}

module.exports = { directory, codeOf, displayName, looksLikeName };
