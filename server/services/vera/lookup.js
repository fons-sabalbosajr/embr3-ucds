// ---------------------------------------------------------------------------
// VERA's lookups: "find the file of ABC Corp", "do we have ECC-R3-2301-0012?",
// "where is AU-00012?" — the documents and establishments matching what was
// asked, with how many there are, for the person asking.
//
// What each person gets is what their own screens already show them, under
// the same rules as services/vera/figures:
//
//   ERMS Records      the Document Library, scoped to the person's provinces
//                     (all of them for the Developer)
//   Legal, Laboratory the unit's documents, for the units on the account
//   Central DB        the establishments of the person's active year's
//                     register, scoped as the register screen is
//
// The public Document Portal gets exactly what its own search box returns —
// the documents with a scan, by serial, reference number, proponent or title,
// never a file name or a location (portalService.search) — and the totals of
// what can be requested there.
//
// Found rows are handed to VERA as plain lines; she lists them, she does not
// read the documents.
// ---------------------------------------------------------------------------

const { connectToMongo, getDb, collections } = require('../../config/db');
const { canAccessAllYears, ermsUnitsOf, authorizedProvinces, domainsOf } = require('../authorization');
const { userProvinceKeys, provinceFilter, PROVINCES } = require('../provinces');

const LOOKUP_RE =
  /\b(find|finding|search|searching|look(?:ing)?\s*(?:for|up)|lookup|locate|where\s+(?:is|are|can|do)|hanap\w*|pakihanap\w*|do\s+(?:we|you|i)\s+have|is\s+there|are\s+there|show\s+me|list\s+(?:the|all)|meron\s+ba|may\s+\w+\s+ba|available|on\s+file|exist|exists)\b/i;
// Serials and reference numbers: AU-00012, HC-BU-0012, ECC-R3-2301-0012, R3-2026-031735.
const CODE_RE = /\b([A-Z]{1,8}(?:-[A-Z0-9]{1,8})*-\d{2,8}(?:-\d{1,8})*)\b/i;
const QUOTED_RE = /["“”‘’']([^"“”‘’']{2,80})["“”‘’']/;

// Words that ask, not what is asked for.
const STOP = new Set(
  (
    'find finding search searching look looking up lookup locate where is are was were the a an file files document documents doc docs ' +
    'record records scan scans scanned copy copies permit permits of named called titled with about establishment establishments firm firms ' +
    'company companies proponent proponents project projects ecc cnc pto wwdp please pls can could would will you me my i we us our have has had do does ' +
    'did there any in on at from to show give list all portal library database register registry system this that these those which what ' +
    'how many much total totals count counts number numbers hanap hanapin pakihanap po ng sa ang mga yung si ni kay para meron ba may want ' +
    'need see open get available exist exists for it its their them they be been being by as so if or and no not one some'
  ).split(/\s+/)
);

const escapeRx = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const fmt = (n) => new Intl.NumberFormat('en-PH').format(n ?? 0);
const provinceName = (key) => PROVINCES.find((p) => [p.key, p.value, p.label].some((n) => String(n).toLowerCase() === String(key || '').toLowerCase()))?.label || key || '—';

/**
 * What the message asks to find: { code } for a serial or reference number,
 * { words } for a name or title — or null when it asks for nothing to be found.
 */
function searchTermsOf(message) {
  // "VERA, find…" addresses her; "De Vera" later in the message is a name.
  const text = String(message || '').replace(/^\s*(?:(?:hi|hello|hey|good\s+\w+)\s*,?\s*)?vera\b\s*[,:!-]?\s*/i, '');
  const quoted = QUOTED_RE.exec(text)?.[1]?.trim();
  const code = CODE_RE.exec(text)?.[1];
  if (!quoted && !code && !LOOKUP_RE.test(text)) return null;
  if (code && !quoted) return { code: code.toUpperCase(), label: code.toUpperCase() };
  const phrase = quoted || text;
  const words = phrase
    .toLowerCase()
    .replace(/[^\p{L}\p{N}&.\-\s]/gu, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^[.\-]+|[.\-]+$/g, ''))
    .filter((w) => w.length >= 2 && (quoted || !STOP.has(w)))
    .slice(0, 6);
  if (!words.length || words.join(' ').length < 3) return null;
  return { words, label: words.join(' ') };
}

/** Whether the message asks VERA to find something. */
const wantsLookup = (message) => Boolean(searchTermsOf(message));

/** A filter matching the terms on the given fields: the code on any, or every word on some field. */
function matchOn(terms, fields) {
  if (terms.code) {
    const rx = new RegExp(escapeRx(terms.code), 'i');
    return { $or: fields.map((f) => ({ [f]: rx })) };
  }
  return { $and: terms.words.map((w) => ({ $or: fields.map((f) => ({ [f]: new RegExp(escapeRx(w), 'i') })) })) };
}

const LIMIT = 8;

async function recordsLines(terms, user) {
  const scope = canAccessAllYears(user) ? null : userProvinceKeys(user);
  const filter = {
    ...(scope ? { 'location.province': { $in: scope } } : {}),
    ...matchOn(terms, ['serialNo', 'permit.number', 'proponentName', 'projectTitle']),
  };
  const col = getDb().collection('erms-records');
  const [total, rows] = await Promise.all([
    col.countDocuments(filter),
    col
      .find(filter, { projection: { serialNo: 1, proponentName: 1, projectTitle: 1, 'permit.number': 1, 'permit.label': 1, 'permit.type': 1, 'location.province': 1, 'document.fileName': 1 } })
      .sort({ 'document.uploadedAt': -1 })
      .limit(LIMIT)
      .toArray(),
  ]);
  const withScan = total ? await col.countDocuments({ ...filter, 'document.fileName': { $nin: [null, ''] } }) : 0;
  return [
    `ERMS Records — Document Library${scope ? ' (your provinces)' : ''}: ${fmt(total)} found${total ? `, ${fmt(withScan)} with the scan on file` : ''}`,
    ...rows.map(
      (r) =>
        `- ${r.serialNo || '—'} · ${r.proponentName || '—'} · ${r.projectTitle || '—'}${r.permit?.number ? ` · ${r.permit.label || r.permit.type || 'permit'} ${r.permit.number}` : ''} · ${provinceName(r.location?.province)} · ${r.document?.fileName ? 'scan on file' : 'no scan yet'}`
    ),
    total > rows.length ? `- …and ${fmt(total - rows.length)} more: search the Document Library for the full list.` : '',
  ];
}

async function unitLines(terms, user, unit) {
  const scope = canAccessAllYears(user) ? null : userProvinceKeys(user);
  const filter = {
    unit,
    ...(scope ? { province: { $in: scope } } : {}),
    ...matchOn(terms, ['serialNo', 'title', 'fields.docketNo', 'fields.referenceNo', 'fields.companyName', 'fields.firmName', 'fields.subject']),
  };
  const col = getDb().collection('erms-documents');
  const [total, rows] = await Promise.all([
    col.countDocuments(filter),
    col.find(filter, { projection: { serialNo: 1, title: 1, docTypeLabel: 1, docType: 1, fields: 1, province: 1, 'document.fileName': 1 } }).sort({ createdAt: -1 }).limit(LIMIT).toArray(),
  ]);
  const name = unit === 'legal' ? 'ERMS Legal Services' : 'ERMS Laboratory';
  return [
    `${name}: ${fmt(total)} found`,
    ...rows.map((d) => {
      const f = d.fields || {};
      const ref = f.docketNo || f.referenceNo || '';
      return `- ${d.serialNo || '—'} · ${d.docTypeLabel || d.docType || 'document'} · ${d.title || f.companyName || f.firmName || f.subject || '—'}${ref ? ` · ${ref}` : ''} · ${provinceName(d.province)} · ${d.document?.fileName ? 'scan on file' : 'no scan yet'}`;
    }),
    total > rows.length ? `- …and ${fmt(total - rows.length)} more in the unit's document list.` : '',
  ];
}

async function registerLines(terms, user, activeYear) {
  const yearService = require('../yearService');
  const year = Number(activeYear) || new Date().getFullYear();
  const container = await yearService.getYear(year).catch(() => null);
  const keys = container ? authorizedProvinces(user, container) : userProvinceKeys(user);
  const scope = provinceFilter(keys);
  // A year loaded from its own RAW universe keeps its own register (services/yearScope.js registerOf).
  const col = container?.register && /^ucds-data-\d{4}$/.test(container.register) ? getDb().collection(container.register) : collections.ucds;
  const filter = { ...(scope || {}), ...matchOn(terms, ['sort_key', 'name', 'title', 'ecc_cnc', 'pto_code', 'wwdp_code', 'haz_id']) };
  const [total, rows] = await Promise.all([
    col.countDocuments(filter),
    col.find(filter, { projection: { sort_key: 1, name: 1, title: 1, ecc_cnc: 1, city: 1, province: 1, section_incharged: 1 } }).sort({ sort_key: 1 }).limit(LIMIT).toArray(),
  ]);
  return [
    `Universe Central DB register (${year}${keys?.length && keys.length < 7 ? ', your provinces' : ''}): ${fmt(total)} establishment(s) found`,
    ...rows.map(
      (r) => `- ${r.sort_key || '—'} · ${r.name || '—'} · ${r.title || '—'}${r.ecc_cnc ? ` · ECC/CNC ${r.ecc_cnc}` : ''} · ${[r.city, provinceName(r.province)].filter(Boolean).join(', ')}${r.section_incharged ? ` · ${r.section_incharged}` : ''}`
    ),
    total > rows.length ? `- …and ${fmt(total - rows.length)} more: search the province's Monitoring Plan for the full list.` : '',
  ];
}

/**
 * The search results for a staff member's question, as plain lines VERA may
 * quote — or null when the question asks for nothing to be found.
 */
async function lookupFor(message, user, { activeYear } = {}) {
  const terms = searchTermsOf(message);
  if (!user || !terms) return null;
  await connectToMongo();
  const domains = domainsOf(user);
  const units = ermsUnitsOf(user);
  const jobs = [];
  if (domains.includes('erms') && (units.includes('records') || !units.length)) jobs.push(recordsLines(terms, user));
  if (units.includes('legal')) jobs.push(unitLines(terms, user, 'legal'));
  if (units.includes('laboratory')) jobs.push(unitLines(terms, user, 'laboratory'));
  if (domains.includes('ucds')) jobs.push(registerLines(terms, user, activeYear));
  if (!jobs.length) return null;
  const blocks = (await Promise.allSettled(jobs)).filter((r) => r.status === 'fulfilled').map((r) => r.value.filter(Boolean).join('\n'));
  if (!blocks.length) return null;
  return { text: `Searched for "${terms.label}":\n\n${blocks.join('\n\n')}`, terms };
}

/**
 * The public Document Portal: what its search box finds, and the totals of
 * what can be requested there. Nothing a visitor could not see by searching.
 */
async function portalLookupFor(message) {
  const portal = require('../../modules/portal/services/portalService');
  const terms = searchTermsOf(message);
  const asksCount = /\b(how\s+many|number\s+of|no\.?\s+of|totals?|count|counts|ilan|ilang|bilang|kabuuan)\b/i.test(String(message || ''));
  if (!terms && !asksCount) return null;
  await connectToMongo();
  const lines = [];
  // The totals: documents with a scan that can be asked for here, per unit.
  const withScan = { 'document.fileName': { $nin: [null, ''] } };
  const [records, legal, laboratory, establishments] = await Promise.all([
    getDb().collection('erms-records').countDocuments(withScan),
    getDb().collection('erms-documents').countDocuments({ unit: 'legal', ...withScan }),
    getDb().collection('erms-documents').countDocuments({ unit: 'laboratory', ...withScan }),
    getDb().collection('erms-records').distinct('proponentName', withScan).then((v) => v.filter(Boolean).length),
  ]);
  lines.push(
    'Documents that can be requested in the Document Portal (with a scan on file):',
    `- Records Unit (permits and clearances): ${fmt(records)}`,
    `- Legal Services: ${fmt(legal)}`,
    `- Laboratory: ${fmt(laboratory)}`,
    `- In all: ${fmt(records + legal + laboratory)}; firms/proponents with a permit on file: ${fmt(establishments)}`
  );
  if (terms) {
    const q = terms.code || terms.words.join(' ');
    let found = await portal.search(q, { limit: 40 });
    // Several words: the portal's search matches the phrase; fall back to the longest word, then keep the rows that hold every word.
    if (!found.length && terms.words?.length > 1) {
      const longest = [...terms.words].sort((a, b) => b.length - a.length)[0];
      found = (await portal.search(longest, { limit: 40 })).filter((d) =>
        terms.words.every((w) => [d.serialNo, d.proponentName, d.projectTitle, d.permit?.number].some((v) => String(v || '').toLowerCase().includes(w)))
      );
    }
    const UNIT = { records: 'Records', legal: 'Legal Services', laboratory: 'Laboratory' };
    lines.push(
      '',
      `Search for "${terms.label}": ${fmt(found.length)}${found.length >= 40 ? '+' : ''} document(s) found`,
      ...found
        .slice(0, LIMIT)
        .map((d) => `- ${d.serialNo || '—'} · ${UNIT[d.source] || d.source} · ${d.proponentName || '—'} · ${d.projectTitle || '—'}${d.permit?.number ? ` · ${d.permit.label || 'ref.'} ${d.permit.number}` : ''}${d.province ? ` · ${d.province}` : ''}`),
      found.length > LIMIT ? `- …and more: type the name in the portal's search box to see them all, then choose one to request it.` : ''
    );
  }
  return { text: lines.filter((l) => l !== null).join('\n'), terms };
}

module.exports = { wantsLookup, searchTermsOf, lookupFor, portalLookupFor };
