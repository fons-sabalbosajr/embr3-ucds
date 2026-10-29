// ---------------------------------------------------------------------------
// VERA'S UPLOAD GUIDE — suggestions while a Records clerk files or edits a
// record (ERMS › Upload record, Edit).
//
// Two kinds of help, both offered, never applied by themselves — the clerk
// presses "Use" on each:
//
//   review()    By rule, as the form is filled; no model, no tokens. What
//               the values say about each other and about what is on file:
//               a permit number of another kind than the type chosen, or of
//               another year than the date approved, or another region's; a
//               proponent or title already filed in another spelling; the
//               project type a specific type is usually filed under; the
//               register placing the permit in another province; a scan whose
//               file name names another permit.
//
//   readScan()  On request, once a PDF is chosen: VERA's model reads its
//               first pages and proposes the proponent, title, permit, dates
//               and place — what the document says, checked against the
//               lists the form offers. One call per scan; the same scan read
//               again comes from the cache (provider.complete), and the
//               guardrails there keep a page's own text from steering it.
// ---------------------------------------------------------------------------

const { connectToMongo, getDb } = require('../../config/db');
const provider = require('./provider');
const shortCache = require('../../shared/services/shortCache');
const pm = require('../../modules/ucds/services/permitMatch');
const { keyOf, tidy, distance } = require('./dataCorrections');
const { PROVINCES } = require('../provinces');
const projectTypeCheck = require('./projectTypeCheck');

const RECORDS = 'erms-records';
const records = () => getDb().collection(RECORDS);
// Kept with the record lists' cache: a save there clears these too.
const CACHE = 'erms:records:vera-guide:';
const CACHE_MS = 10 * 60 * 1000;

const PERMIT_CODES = ['ecc-original', 'ecc-amended', 'cnc', 'hw-generator', 'pto', 'dp', 'luc', 'coa', 'other'];
const PERMIT_LABEL = { 'ecc-original': 'ECC (Original)', 'ecc-amended': 'ECC (Amended)', cnc: 'CNC', 'hw-generator': 'HW Generator Registration', pto: 'Permit to Operate', dp: 'Discharge Permit' };
// PD 1586, the Environmental Impact Statement System: no ECC is older.
const FIRST_ECC = new Date(1978, 5, 11);
const FIELD_LABEL = {
  proponentName: 'Proponent',
  projectTitle: 'Project title',
  permitType: 'Permit type',
  permitNumber: 'Permit number',
  dateApproved: 'Date approved',
  dateAmended: 'Date amended',
  projectType: 'Project type',
  specificProjectType: 'Specific project type',
  province: 'Province',
  city: 'City / municipality',
  barangay: 'Barangay',
};

const str = (v, n = 300) => (typeof v === 'string' ? tidy(v).slice(0, n) : '');
const dateOf = (v) => {
  const d = v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};
const ymd = (d) => d.toISOString().slice(0, 10);
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const provinceByKey = new Map(PROVINCES.map((p) => [p.key, p]));
const provinceKeyOf = (v) => {
  const k = String(v || '').replace(/[\s_]+/g, '').toLowerCase();
  return PROVINCES.find((p) => p.key.toLowerCase() === k || p.value.replace(/_/g, '').toLowerCase() === k)?.key || null;
};

// ── What a permit number says about itself ───────────────────────────────────

/** The kind of permit a number is written as, or null when it does not say. */
function kindOfNumber(number) {
  const s = pm.clean(number);
  if (/^ECC\b|^ECC-/.test(s)) return 'ecc';
  if (/^CNC/.test(s)) return 'cnc';
  if (/^PTO/.test(s)) return 'pto';
  if (/^(W?W?DP|DP)\b|^(W?W?DP|DP)-/.test(s)) return 'dp';
  if (/(^|-)(GR|HW|HWID)(-|$)/.test(s)) return 'hw-generator';
  return null;
}
const KIND_TYPES = { ecc: ['ecc-original', 'ecc-amended'], cnc: ['cnc'], pto: ['pto'], dp: ['dp'], 'hw-generator': ['hw-generator'] };

/** The year a number carries ("ECC-OL-R03-2019-0573" → 2019), or null. */
function yearOfNumber(number) {
  const m = /(?:^|[^0-9])((?:19[789]|20[0-4])\d)(?=[^0-9]|$)/.exec(pm.clean(number));
  return m ? Number(m[1]) : null;
}

/** The region a number was issued in ("R03" → 3), or null. */
function regionOfNumber(number) {
  const m = /(?:^|-)R0?(\d{1,2})[A-Z]?(?=-|$)/.exec(pm.clean(number));
  return m ? Number(m[1]) : null;
}

// ── What is on file ──────────────────────────────────────────────────────────

/**
 * The spelling most records use for a value written another way: the same
 * words, other capitals, spacing or punctuation ("ABC  Corp." / "ABC CORP").
 * Null when the value is written as filed, or not filed at all.
 */
async function filedSpelling(field, value, scope, col = records()) {
  const key = keyOf(value);
  if (key.length < 4) return null;
  const found = await shortCache.cached(`${CACHE}spelling:${col.collectionName}:${field}:${JSON.stringify(scope)}:${key}`, CACHE_MS, async () => {
    // Every value with the same words, whatever stands between them; the
    // comparison key then decides (keyOf: "&" is "and", "w/" is "with").
    const words = key.split(' ').map((w) => (w === 'and' ? '(?:and|&)' : w === 'with' ? '(?:with|w/)' : esc(w)));
    const rx = new RegExp(`^[^a-z0-9]*${words.join('[^a-z0-9]*')}[^a-z0-9]*$`, 'i');
    const rows = await col
      .aggregate([{ $match: { ...scope, [field]: rx } }, { $group: { _id: `$${field}`, n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 10 }])
      .toArray();
    return rows.filter((r) => typeof r._id === 'string' && keyOf(r._id) === key).map((r) => ({ value: r._id, n: r.n }));
  });
  const best = found[0];
  if (!best || best.value === value || found.some((f) => f.value === value && f.n >= best.n)) return null;
  return best;
}

/** The project type a specific project type is filed under most often. */
async function usualProjectType(specific, scope) {
  const s = str(specific, 200);
  if (s.length < 3) return null;
  return shortCache.cached(`${CACHE}type-of:${JSON.stringify(scope)}:${s.toLowerCase()}`, CACHE_MS, async () => {
    const [top] = await records()
      .aggregate([
        { $match: { ...scope, 'project.otherType': new RegExp(`^\\s*${esc(s)}\\s*$`, 'i'), 'project.type': { $type: 'string', $ne: '' } } },
        { $group: { _id: '$project.type', n: { $sum: 1 } } },
        { $sort: { n: -1 } },
        { $limit: 1 },
      ])
      .toArray();
    return top ? { value: top._id, n: top.n } : null;
  });
}

/** The project types the form offers (Settings › ERMS › Menus). */
const projectTypeList = () => shortCache.cached(`${CACHE}project-types`, CACHE_MS, () => projectTypeCheck.projectTypes());

/** The register's establishment holding this permit number: { name, province key }. */
async function registerHolder(number) {
  const want = pm.normalise(number);
  if (want.length < 8) return null;
  return shortCache.cached(`${CACHE}register:${want}`, CACHE_MS, async () => {
    const loose = new RegExp(esc(pm.clean(number)).replace(/(\\[-.\s]|[\s\-–—_./])+/g, '[\\s\\-–—_./]*'), 'i');
    const rows = await getDb().collection('ucds-data').find({ ecc_cnc: loose }, { projection: { ecc_cnc: 1, name: 1, title: 1, province: 1, sort_key: 1 } }).limit(5).toArray();
    const row = rows.find((r) => pm.tokensOf(r.ecc_cnc).some((t) => pm.normalise(t) === want));
    return row ? { serial: row.sort_key || null, name: row.title || row.name || null, province: provinceKeyOf(row.province) } : null;
  });
}

// ── review: the rules ────────────────────────────────────────────────────────

/**
 * Suggestions for the form as it stands.
 * @param {object} v  the form's values (strings; dates as YYYY-MM-DD)
 * @param {{allowedProvinces: string[]|null}} scope  the provinces the clerk may see
 * @returns {Promise<Array<{id, level: 'warn'|'tip', field, message, fix?: {field, value, label}}>>}
 */
async function review(v = {}, { allowedProvinces = null } = {}) {
  await connectToMongo();
  const tips = [];
  const add = (tip) => tips.push(tip);
  const scope = Array.isArray(allowedProvinces) ? { 'location.province': { $in: allowedProvinces } } : {};

  const number = str(v.permitNumber, 120);
  const type = PERMIT_CODES.includes(v.permitType) ? v.permitType : null;
  const approved = dateOf(v.dateApproved);
  const amended = dateOf(v.dateAmended);

  if (number) {
    // Written with a recurring slip: an O for a zero, R3 for R03, a date glued on.
    const cleaned = pm.clean(number);
    if (cleaned && cleaned !== number.trim()) {
      add({ id: 'permit-written', level: 'tip', field: 'permitNumber', message: `The permit number reads best as ${cleaned} — the way the register writes it, so the two link.`, fix: { field: 'permitNumber', value: cleaned, label: `Use ${cleaned}` } });
    }
    const kind = kindOfNumber(number);
    if (kind && type && !KIND_TYPES[kind].includes(type)) {
      const to = KIND_TYPES[kind][0];
      add({ id: 'permit-type', level: 'warn', field: 'permitType', message: `The number is written as a${kind === 'ecc' ? 'n' : ''} ${kind.toUpperCase()} number, but the permit type is ${PERMIT_LABEL[type] || type}.`, fix: { field: 'permitType', value: to, label: `Make it ${PERMIT_LABEL[to]}` } });
    }
    const year = yearOfNumber(number);
    if (year && approved && approved.getFullYear() !== year && !(type === 'ecc-amended' || amended)) {
      add({ id: 'permit-year', level: 'warn', field: 'dateApproved', message: `The number is from ${year}, but the date approved is in ${approved.getFullYear()}. Check one of them against the document.` });
    } else if (year && !approved) {
      add({ id: 'permit-year-empty', level: 'tip', field: 'dateApproved', message: `The date approved is empty; the number says ${year}. Take the date from the document.` });
    }
    const region = regionOfNumber(number);
    if (region && region !== 3) {
      add({ id: 'permit-region', level: 'warn', field: 'permitNumber', message: `The number names Region ${region} (R${String(region).padStart(2, '0')}), not Region III. A permit from another region is filed only when the project is in Central Luzon.` });
    }
    const holder = await registerHolder(number).catch(() => null);
    if (holder?.province && v.province && holder.province !== v.province) {
      const p = provinceByKey.get(holder.province);
      add({ id: 'register-province', level: 'warn', field: 'province', message: `The register has this permit on ${holder.name || 'an establishment'}${holder.serial ? ` (${holder.serial})` : ''} in ${p?.label || holder.province}, not ${provinceByKey.get(v.province)?.label || v.province}.`, fix: { field: 'province', value: holder.province, label: `Use ${p?.label || holder.province}` } });
    }
  }

  if (approved) {
    if (approved > new Date()) add({ id: 'date-future', level: 'warn', field: 'dateApproved', message: 'The date approved is in the future.' });
    else if (approved < FIRST_ECC && (type || '').startsWith('ecc')) add({ id: 'date-early', level: 'warn', field: 'dateApproved', message: `The date approved is before ${FIRST_ECC.getFullYear()}, when ECCs began (PD 1586). Check the year.` });
    if (amended && amended < approved) add({ id: 'amended-before', level: 'warn', field: 'dateAmended', message: 'The date amended is before the date approved.' });
  }

  // Spelled as already filed, so lists, counts and searches find them together.
  for (const [field, path] of [['proponentName', 'proponentName'], ['projectTitle', 'projectTitle']]) {
    const value = str(v[field]);
    if (!value) continue;
    const filed = await filedSpelling(path, value, scope).catch(() => null);
    if (filed) add({ id: `${field}-spelling`, level: 'tip', field, message: `${FIELD_LABEL[field]} is filed as “${filed.value}” on ${filed.n} record${filed.n === 1 ? '' : 's'}.`, fix: { field, value: filed.value, label: 'Use that spelling' } });
  }

  const projectType = str(v.projectType, 200);
  const specific = str(v.specificProjectType, 200);
  const list = await projectTypeList().catch(() => []);
  if (!projectType && specific) {
    const usual = await usualProjectType(specific, scope).catch(() => null);
    if (usual) add({ id: 'project-type-from-specific', level: 'tip', field: 'projectType', message: `“${specific}” is filed under “${usual.value}” on ${usual.n} record${usual.n === 1 ? '' : 's'}.`, fix: { field: 'projectType', value: usual.value, label: 'Use it' } });
  } else if (projectType && list.length && !list.includes(projectType)) {
    const key = keyOf(projectType);
    const near = list.find((t) => keyOf(t) === key) || list.map((t) => ({ t, d: distance(keyOf(t), key, 3) })).filter((x) => x.d <= 2).sort((a, b) => a.d - b.d)[0]?.t;
    if (near) add({ id: 'project-type-list', level: 'tip', field: 'projectType', message: `The list writes it “${near}”.`, fix: { field: 'projectType', value: near, label: 'Use the list’s spelling' } });
    else add({ id: 'project-type-list', level: 'tip', field: 'projectType', message: 'This project type is not on the list. Choose one from the list where it fits, so the record is counted with its kind.' });
  }

  const fileName = str(v.fileName, 260);
  if (fileName) {
    // An ECC or CNC number in the name, up to its last digit ("… 0001 scan" stops at 0001).
    const inName = (fileName.replace(/\.[a-z0-9]{2,5}$/i, '').match(/(?:ECC|CNC)[\s\-_]*[A-Z0-9][\s\-_A-Z0-9]*\d/gi) || []).map((t) => t.replace(/_/g, '-'));
    if (number && inName.length && !inName.some((t) => pm.loosen(t).includes(pm.loosen(number)) || pm.loosen(number).includes(pm.loosen(t)))) {
      add({ id: 'file-number', level: 'warn', field: 'fileName', message: `The file's name names ${pm.clean(inName[0])}, not ${pm.clean(number)}. Is it the right scan?` });
    }
    if (!/\.pdf$/i.test(fileName)) add({ id: 'file-not-pdf', level: 'tip', field: 'fileName', message: 'A PDF is best: the library previews it, and VERA can read it to fill this form.' });
  } else if (v.isNew) {
    add({ id: 'no-scan', level: 'tip', field: 'fileName', message: 'No scan is attached. Attach it on the Document tab — VERA can then read it and suggest the fields.' });
  }

  return tips;
}

// ── readScan: the model reads the document ───────────────────────────────────

const SCAN_SYSTEM = [
  'You read the first pages of a document being filed by the Records Unit of EMB Region III (Central Luzon, Philippines): usually an Environmental Compliance Certificate (ECC), a Certificate of Non-Coverage (CNC), a hazardous waste generator registration, a permit to operate or a discharge permit.',
  'Write out only what the document itself says. Never guess: a value the pages do not show is null.',
  `Reply with JSON only: {"permitType": one of ${JSON.stringify(PERMIT_CODES)} or null, "permitNumber": the reference number exactly as printed or null, "dateApproved": "YYYY-MM-DD" (the date issued or approved) or null, "dateAmended": "YYYY-MM-DD" or null, "proponentName": string or null, "projectTitle": string or null, "projectType": exactly one item of PROJECT TYPES or null, "specificProjectType": a few words such as "Poultry Farm" or null, "province": one of ["Aurora","Bataan","Bulacan","Nueva Ecija","Pampanga","Tarlac","Zambales"] or null, "city": string or null, "barangay": string or null, "confidence": "high" | "medium" | "low"}`,
  'An amended ECC: permitType "ecc-amended", dateAmended the amendment\'s date, dateApproved the original\'s when printed.',
].join('\n');

/** The model's answer, checked field by field against what the form accepts. */
function suggestionsOf(answer, list) {
  const out = [];
  const add = (field, value) => value && out.push({ field, label: FIELD_LABEL[field], value });
  add('permitType', PERMIT_CODES.includes(answer.permitType) ? answer.permitType : null);
  add('permitNumber', str(answer.permitNumber, 120) || null);
  for (const f of ['dateApproved', 'dateAmended']) {
    const s = str(answer[f], 10);
    const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? dateOf(s) : null;
    add(f, d && d >= new Date(1970, 0, 1) && d <= new Date() ? ymd(d) : null);
  }
  add('proponentName', str(answer.proponentName, 300) || null);
  add('projectTitle', str(answer.projectTitle, 500) || null);
  const pt = str(answer.projectType, 200);
  add('projectType', (pt && list.find((t) => keyOf(t) === keyOf(pt))) || null);
  add('specificProjectType', str(answer.specificProjectType, 120) || null);
  add('province', provinceKeyOf(answer.province));
  add('city', str(answer.city, 120) || null);
  add('barangay', str(answer.barangay, 120) || null);
  return out;
}

/**
 * The model reads a scan the clerk has chosen and suggests the fields.
 * @returns {Promise<{ok: true, suggestions, confidence, model, cached} | {ok: false, status, message}>}
 */
async function readScan(cfg, buffer) {
  if (!provider.isOperational(cfg)) return { ok: false, status: 409, message: "VERA's AI model is not available right now. Fill the form from the document — VERA's checks above still help." };
  const { pdf, reason } = await projectTypeCheck.cutPages(buffer, 2);
  if (!pdf) {
    return { ok: false, status: 422, message: reason === 'not-pdf' ? 'VERA reads PDF scans. Save the scan as a PDF to have it read.' : reason === 'too-large' ? 'The scan is too large for VERA to read; its first pages are over the limit.' : 'VERA could not open this PDF — it may be damaged or protected.' };
  }
  await connectToMongo();
  const list = await projectTypeList().catch(() => []);
  let out;
  try {
    out = await provider.complete(cfg, {
      system: SCAN_SYSTEM,
      prompt: `PROJECT TYPES:\n${list.map((t) => `- ${t}`).join('\n')}\n\nRead the attached pages.`,
      maxTokens: 700,
      documents: [{ mimeType: 'application/pdf', data: pdf }],
      feature: 'upload-guide',
    });
  } catch (err) {
    const safe = provider.sanitizeError(err);
    return { ok: false, status: 503, message: safe.message };
  }
  const text = String(out.text || '');
  let answer = null;
  try {
    answer = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  } catch {
    answer = null;
  }
  if (!answer || typeof answer !== 'object') return { ok: false, status: 502, message: 'VERA could not make out the document. Fill the form from it by hand.' };
  return {
    ok: true,
    suggestions: suggestionsOf(answer, list),
    confidence: ['high', 'medium', 'low'].includes(answer.confidence) ? answer.confidence : null,
    model: out.model || null,
    cached: Boolean(out.cached),
  };
}

// ── Legal and Laboratory ─────────────────────────────────────────────────────
// Their forms are built from each document type's fields (Settings › ERMS),
// so the checks go by the field's key and kind: every date, every company or
// firm name, wherever a type has one — and the Legal docket and the
// Laboratory COC number, the keys their documents are filed under.

const DOCUMENTS = 'erms-documents';
const documents = () => getDb().collection(DOCUMENTS);
// Dates that look ahead by their nature: a conference to come, a calibration due.
const FUTURE_OK = new Set(['tcSchedule', 'dateDue']);
// [earlier, later, what it means when they are the other way round]
const DATE_ORDER = [
  ['novDateIssued', 'novDateReleased', 'The NOV is released before it was issued.'],
  ['novDateIssued', 'tcSchedule', 'The technical conference is set before the NOV was issued.'],
  ['dateOfSampling', 'dateReceived', 'The sample is received before it was taken.'],
  ['dateOfSampling', 'dateReported', 'The result is reported before the sample was taken.'],
  ['dateCalibrated', 'dateDue', 'The calibration falls due before it was done.'],
  ['dateCalibrated', 'dateIssued', 'The certificate is issued before the calibration was done.'],
];
// Names filed again and again, to be spelled as before.
const NAME_FIELDS = { legal: ['companyName', 'companyAddress'], laboratory: ['firmName', 'address'] };
// EMBR3-2023-PA-111, and the desktop system's EMBR3-2023-NE-82-C.
const DOCKET_RE = /^EMBR3-(\d{4})-([A-Z]{2})-(\d+)(?:-[A-Z])?$/;

/** A docket as typed, its separators and capitals put right ("embr3 2023 pa 111" → "EMBR3-2023-PA-111"). */
const docketWritten = (s) => String(s || '').toUpperCase().trim().replace(/[\s_.–—]+/g, '-').replace(/-+/g, '-');

/** Every document of the unit under one key value (a docket, a COC number), newest first. */
async function filedUnder(unit, field, value) {
  return documents()
    .find({ unit, [`fields.${field}`]: new RegExp(`^\\s*${esc(value)}\\s*$`, 'i') }, { projection: { serialNo: 1, docType: 1, fields: 1, province: 1, createdAt: 1 } })
    .sort({ createdAt: -1 })
    .limit(20)
    .toArray();
}

/**
 * Suggestions for a Legal or Laboratory form as it stands.
 * @param {{unit, docType: {code, fields}, province, fields: object, serialNo?, isNew?, fileName?}} input
 */
async function reviewUnit({ unit, docType, province, fields = {}, serialNo = null, isNew = false, fileName = null }) {
  await connectToMongo();
  const tips = [];
  const add = (tip) => tips.push(tip);
  const defs = new Map((docType?.fields || []).map((f) => [f.key, f]));
  const val = (key) => (defs.has(key) ? fields[key] : undefined);
  const labelOf = (key) => defs.get(key)?.label || key;
  const today = new Date();

  // Dates: none ahead unless it is meant to be, none implausibly old, and in their order.
  for (const [key, f] of defs) {
    if (f.type !== 'date') continue;
    const d = dateOf(fields[key]);
    if (!d) continue;
    if (d > today && !FUTURE_OK.has(key)) add({ id: `date-future-${key}`, level: 'warn', field: key, message: `${f.label} is in the future.` });
    else if (d.getFullYear() < 1990) add({ id: `date-early-${key}`, level: 'warn', field: key, message: `${f.label} is in ${d.getFullYear()}. Check the year.` });
  }
  for (const [a, b, msg] of DATE_ORDER) {
    const da = dateOf(val(a));
    const db = dateOf(val(b));
    if (da && db && db < da) add({ id: `order-${a}-${b}`, level: 'warn', field: b, message: `${msg} (${labelOf(a)} ${ymd(da)}, ${labelOf(b)} ${ymd(db)})` });
  }

  // The Legal docket: as the register writes it, of the province chosen, and
  // of a case that exists — with the company the case is under.
  const docket = str(val('docketNo'), 60);
  if (unit === 'legal' && docket) {
    const written = docketWritten(docket);
    const m = DOCKET_RE.exec(written);
    if (m && written !== docket) add({ id: 'docket-written', level: 'tip', field: 'docketNo', message: `The docket is written ${written}.`, fix: { field: 'docketNo', value: written, label: `Use ${written}` } });
    if (!m) add({ id: 'docket-form', level: 'tip', field: 'docketNo', message: 'A docket is written like EMBR3-2023-PA-111: the year, the province code, the case number.' });
    if (m) {
      const { PROVINCE_CODES } = require('../../modules/erms/services/docketService');
      const keyOfCode = Object.entries(PROVINCE_CODES).find(([, c]) => c === m[2])?.[0];
      if (keyOfCode && province && keyOfCode !== province) {
        const p = provinceByKey.get(keyOfCode);
        add({ id: 'docket-province', level: 'warn', field: 'province', message: `The docket's code ${m[2]} is ${p?.label || keyOfCode}, but the province chosen is ${provinceByKey.get(province)?.label || province}.`, fix: { field: 'province', value: keyOfCode, label: `Use ${p?.label || keyOfCode}` } });
      }
      const issued = dateOf(val('novDateIssued'));
      if (issued && issued.getFullYear() !== Number(m[1])) add({ id: 'docket-year', level: 'warn', field: 'novDateIssued', message: `The docket is of ${m[1]}, but the NOV is dated ${issued.getFullYear()}.` });
    }
    const filed = (await filedUnder('legal', 'docketNo', written).catch(() => [])).filter((d) => d.serialNo !== serialNo);
    const novs = filed.filter((d) => d.docType === 'nov');
    if (docType?.code === 'nov' && novs.length) {
      add({ id: 'docket-nov-twice', level: 'warn', field: 'docketNo', message: `This docket already has a Notice of Violation (${novs[0].serialNo}). A second NOV usually means a new case number — check it.` });
    } else if (docType?.code !== 'nov' && !filed.length && m) {
      add({ id: 'docket-unknown', level: 'warn', field: 'docketNo', message: 'No document is filed under this docket yet. Check the number — a case starts with its Notice of Violation.' });
    }
    const company = str(val('companyName'));
    const caseCompany = filed.find((d) => d.fields?.companyName)?.fields.companyName;
    if (company && caseCompany && keyOf(company) !== keyOf(caseCompany)) {
      add({ id: 'docket-company', level: 'warn', field: 'companyName', message: `The case ${written} is under “${caseCompany}”.`, fix: { field: 'companyName', value: caseCompany, label: 'Use the case’s company' } });
    }
  }

  // The Laboratory COC number: one COC per number; a report refers to one filed.
  const coc = str(val('cocNo'), 60);
  if (unit === 'laboratory' && coc) {
    const filed = (await filedUnder('laboratory', 'cocNo', coc).catch(() => [])).filter((d) => d.serialNo !== serialNo);
    const cocs = filed.filter((d) => d.docType === 'coc');
    if (docType?.code === 'coc' && cocs.length) add({ id: 'coc-twice', level: 'warn', field: 'cocNo', message: `COC ${coc} is already filed (${cocs[0].serialNo}${cocs[0].fields?.firmName ? `, ${cocs[0].fields.firmName}` : ''}).` });
    const firm = str(val('firmName'));
    const cocFirm = cocs[0]?.fields?.firmName;
    if (docType?.code !== 'coc' && firm && cocFirm && keyOf(firm) !== keyOf(cocFirm)) {
      add({ id: 'coc-firm', level: 'warn', field: 'firmName', message: `COC ${coc} is for “${cocFirm}”.`, fix: { field: 'firmName', value: cocFirm, label: 'Use the COC’s firm' } });
    }
  }

  // Names as already filed in the unit.
  for (const key of NAME_FIELDS[unit] || []) {
    const value = str(val(key));
    if (!value || tips.some((t) => t.field === key)) continue;
    const filed = await filedSpelling(`fields.${key}`, value, { unit }, documents()).catch(() => null);
    if (filed) add({ id: `${key}-spelling`, level: 'tip', field: key, message: `${labelOf(key)} is filed as “${filed.value}” on ${filed.n} document${filed.n === 1 ? '' : 's'}.`, fix: { field: key, value: filed.value, label: 'Use that spelling' } });
  }

  const name = str(fileName, 260);
  if (name && !/\.pdf$/i.test(name)) add({ id: 'file-not-pdf', level: 'tip', field: 'scan', message: 'A PDF is best: the library previews it, and VERA can read it to fill this form.' });
  else if (!name && isNew) add({ id: 'no-scan', level: 'tip', field: 'scan', message: 'No scan is chosen yet. Choose it on the last tab — VERA can then read it and suggest the fields.' });
  return tips;
}

/**
 * The model reads a Legal or Laboratory scan for the fields its document
 * type defines. Lists (officers, statuses, parameters) are given with their
 * items, and an answer not on the list is not offered.
 */
async function readUnitScan(cfg, buffer, { docType, lists = {} }) {
  if (!provider.isOperational(cfg)) return { ok: false, status: 409, message: "VERA's AI model is not available right now. Fill the form from the document — VERA's checks above still help." };
  const { pdf, reason } = await projectTypeCheck.cutPages(buffer, 2);
  if (!pdf) return { ok: false, status: 422, message: reason === 'not-pdf' ? 'VERA reads PDF scans. Save the scan as a PDF to have it read.' : 'VERA could not open this PDF — it may be damaged, protected or too large.' };
  const fields = (docType?.fields || []).filter((f) => f.type !== 'checkbox');
  const shape = fields.map((f) => {
    const kind = f.type === 'date' ? '"YYYY-MM-DD"' : f.type === 'number' ? 'number' : f.type === 'select' ? `one of ${JSON.stringify(f.options || [])}` : f.type === 'lookup' && lists[f.lookup]?.length ? `one item of LIST ${f.lookup}` : 'string';
    return `"${f.key}": ${kind} or null  — ${f.label}`;
  });
  const used = [...new Set(fields.filter((f) => f.type === 'lookup' && lists[f.lookup]?.length).map((f) => f.lookup))];
  const system = [
    `You read the first pages of a document being filed by the ${docType?.label || 'unit'} desk of EMB Region III (Central Luzon, Philippines).`,
    'Write out only what the document itself says. Never guess: a value the pages do not show is null.',
    `Reply with JSON only: {${shape.join(', ')}, "province": one of ["Aurora","Bataan","Bulacan","Nueva Ecija","Pampanga","Tarlac","Zambales"] or null, "confidence": "high" | "medium" | "low"}`,
  ].join('\n');
  const prompt = `${used.map((k) => `LIST ${k}:\n${lists[k].slice(0, 80).map((t) => `- ${t}`).join('\n')}`).join('\n\n')}\n\nRead the attached pages.`;
  let out;
  try {
    out = await provider.complete(cfg, { system, prompt, maxTokens: 900, documents: [{ mimeType: 'application/pdf', data: pdf }], feature: 'upload-guide' });
  } catch (err) {
    return { ok: false, status: 503, message: provider.sanitizeError(err).message };
  }
  const text = String(out.text || '');
  let answer = null;
  try {
    answer = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  } catch {
    answer = null;
  }
  if (!answer || typeof answer !== 'object') return { ok: false, status: 502, message: 'VERA could not make out the document. Fill the form from it by hand.' };
  const suggestions = [];
  for (const f of fields) {
    const raw = answer[f.key];
    let value = null;
    if (f.type === 'date') {
      const d = /^\d{4}-\d{2}-\d{2}$/.test(String(raw || '')) ? dateOf(raw) : null;
      value = d && d.getFullYear() >= 1990 && (d <= new Date() || FUTURE_OK.has(f.key)) ? ymd(d) : null;
    } else if (f.type === 'number') {
      value = Number.isFinite(Number(raw)) && raw !== null && raw !== '' ? Number(raw) : null;
    } else if (f.type === 'select') {
      value = (f.options || []).find((o) => keyOf(o) === keyOf(raw)) || null;
    } else if (f.type === 'lookup' && lists[f.lookup]?.length) {
      value = lists[f.lookup].find((o) => keyOf(o) === keyOf(raw)) || null;
    } else {
      value = str(raw, f.type === 'textarea' ? 1000 : 300) || null;
    }
    if (value !== null) suggestions.push({ field: f.key, label: f.label, value, type: f.type });
  }
  const province = provinceKeyOf(answer.province);
  if (province) suggestions.push({ field: 'province', label: 'Province', value: province, type: 'province' });
  return { ok: true, suggestions, confidence: ['high', 'medium', 'low'].includes(answer.confidence) ? answer.confidence : null, model: out.model || null, cached: Boolean(out.cached) };
}

module.exports = { review, readScan, reviewUnit, readUnitScan, suggestionsOf, kindOfNumber, yearOfNumber, regionOfNumber, docketWritten, DOCKET_RE };
