// ---------------------------------------------------------------------------
// VERA's analysis of an establishment's clearances and permits, against the
// laws in her library (lawRetrieval).
//
// Worked out by rule from the register row, never by the model, so the same
// record always gives the same findings:
//
//   missing       a permit the record shows is needed — by an inspection's NOV
//                 recommendation, an inspector's note ("No DP"), or a number
//                 the process implies — with no number on the register
//   expired       every listed expiry date has passed (some passed: noted)
//   expiring      the latest expiry falls within 90 days
//   noncompliant  the inspection recommended an NOV under the permit's law
//   conflict      "Not Applicable" on a permit the inspector found missing
//   dates         a date that cannot be right, or cannot be read
//   misfiled      a value in the wrong column (a PTO number among the
//                 discharge permits, a date in the NOV recommendation)
//
// Each finding names the sections of the enacted law it rests on. Where the
// permit itself comes from implementing rules (the PTO, the HW generator ID,
// the PCO accreditation), it says so: those rules are not in the library and
// VERA does not quote them.
//
// Used by the register check (registerCheck.js, every record), by Ask VERA
// (lookup.js, the firm asked about), and by the record's Clearances and
// Permits tab (POST /api/vera/permit-analysis).
// ---------------------------------------------------------------------------

const laws = require('./lawRetrieval');

const DAY = 24 * 3600 * 1000;
const SOON_DAYS = 90;

// The permits, each with the law that requires it, as the register keeps them.
const KINDS = [
  {
    key: 'ecc', label: 'ECC/CNC', law: 'PD1586', code: 'ecc_cnc', status: 'pd1586', violations: ['v_pd1586'], noted: /\bno\s+(ecc|cnc)\b|violated\s+ecc/i,
    basis: [['PD1586', '4'], ['PD1586', '5']], penalty: ['PD1586', '9'],
    rules: 'Whether a project needs an ECC or a CNC is set by the EIS System rules (DAO 2003-30), which the law library does not hold.',
  },
  {
    key: 'pto', label: 'Permit to Operate (air)', law: 'RA8749', code: 'pto_code', issued: 'pto_issued', expires: 'pto_expiration', status: 'ra8749', violations: ['v_ra8749'], noted: /\bno\s+(pto|poa|permit\s+to\s+operate)\b/i,
    basis: [['RA8749', '16']], penalty: ['RA8749', '47'],
    rules: "The Permit to Operate itself is required by the Clean Air Act's implementing rules (DAO 2000-81), which the law library does not hold.",
  },
  {
    key: 'wwdp', label: 'Wastewater Discharge Permit', law: 'RA9275', code: 'wwdp_code', issued: 'wwdp_issued', expires: 'wwdp_expiration', status: 'ra9275', violations: ['v_ra9275'], noted: /\bno\s+(dp|wwdp|discharge\s+permit)\b/i,
    basis: [['RA9275', '14'], ['RA9275', '27']], penalty: ['RA9275', '28'],
  },
  {
    key: 'hw', label: 'Hazardous Waste Generator ID', law: 'RA6969', code: 'haz_id', issued: 'haz_issued', status: 'ra6969', violations: ['v_ra6969_haz', 'v_ra6969_tchem'], noted: /\bno\s+(hw|haz\w*|generator)\b/i,
    basis: [['RA6969', '13']], penalty: ['RA6969', '14'],
    rules: "Registration as a hazardous waste generator is required by RA 6969's implementing rules (DAO 2013-22), which the law library does not hold.",
  },
  {
    key: 'pco', label: 'PCO accreditation', law: null, code: 'pco_no', expires: 'pco_validity', violations: ['v_ra9275', 'v_ra8749', 'v_ra6969_haz'], noted: /\bno\s+pco\b/i,
    basis: [['RA8749', '47'], ['RA9275', '28']],
    rules: 'The PCO accreditation is required by DAO 2014-02, which the law library does not hold; the Clean Air and Clean Water Acts name the pollution control officer among those liable for a violation.',
  },
  // The chemical, importer, TSD and TRC universes: checked when held.
  { key: 'chem', label: 'Chemical permit', law: 'RA6969', code: 'chemical_permit', issued: 'chem_permit_issued', expires: 'chem_permit_exp', whenHeld: true, basis: [['RA6969', '13']], rules: "The permit itself is set by RA 6969's implementing rules (DAO 1992-29), which the law library does not hold." },
  { key: 'importer', label: 'Importer clearance', law: 'RA6969', code: 'importer_clearance', issued: 'importer_clearance_issued', expires: 'importer_clearance_exp', whenHeld: true, basis: [['RA6969', '13']], rules: "The clearance itself is set by RA 6969's implementing rules (DAO 1992-29), which the law library does not hold." },
  { key: 'tsd', label: 'TSD facility registration', law: 'RA6969', code: 'tsd_ref_no', issued: 'tsd_issued', expires: 'tsd_expiration', whenHeld: true, basis: [['RA6969', '13']], rules: 'TSD registration is set by DAO 2013-22, which the law library does not hold.' },
  { key: 'trc', label: 'Transporter registration (TRC)', law: 'RA6969', code: 'tp_trc_ref_no', issued: 'tp_trc_issued', expires: 'tp_trc_expiration', whenHeld: true, basis: [['RA6969', '13']], rules: 'Transporter registration is set by DAO 2013-22, which the law library does not hold.' },
];
const KIND = Object.fromEntries(KINDS.map((k) => [k.key, k]));

// Every register field the analysis reads, for projections.
const FIELDS = [
  ...new Set([
    'sort_key', 'name', 'title', 'city', 'province', 'permit_process', 'date_approved', 'with_nov',
    ...KINDS.flatMap((k) => [k.code, k.issued, k.expires, k.status, ...(k.violations || [])].filter(Boolean)),
  ]),
];

// ── Reading the cells ────────────────────────────────────────────────────────

const text = (v) => (v == null ? '' : String(v).replace(/[‐-―−]/g, '-').trim());
const NA_RE = /^\s*(not\s+applicable|n\s*\/?\s*a)\s*\.?\s*$/i;
const INTERCONNECTED_RE = /\binter-?connect/i;

const MON = '(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';
const monthOf = (s) => ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(String(s).slice(0, 3).toLowerCase()) + 1;
const DATE_PATTERNS = [
  [/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g, (m) => [m[1], m[2], m[3]]],
  [/\b(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})(?!\d)/g, (m) => [m[3], m[1], m[2]]],
  [new RegExp(`\\b${MON}\\s+(\\d{1,2}),?\\s*(\\d{4})\\b`, 'gi'), (m) => [m[3], monthOf(m[1]), m[2]]],
  [new RegExp(`\\b(\\d{1,2})\\s+${MON},?\\s*(\\d{4})\\b`, 'gi'), (m) => [m[3], monthOf(m[2]), m[1]]],
];
// "2024-2027", "Nov 2024-2027": a PCO's validity, to the end of the last year.
const YEAR_RANGE = /\b(?:19|20)\d{2}\s*-\s*((?:19|20)\d{2})\b/g;

function makeDate(y, m, d) {
  let year = Number(y);
  if (year < 100) year += year < 70 ? 2000 : 1900;
  const month = Number(m);
  const day = Number(d);
  if (year < 1970 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const out = new Date(year, month - 1, day);
  return out.getMonth() === month - 1 ? out : null;
}

/** The dates in a cell, in the order written: { dates, unreadable }. */
function readDates(value, { ranges = false } = {}) {
  if (value instanceof Date) return { dates: Number.isNaN(value.getTime()) ? [] : [value], unreadable: false };
  // An Excel serial day that came through as a number.
  if (typeof value === 'number') {
    if (value > 20000 && value < 80000) {
      const d = new Date(Date.UTC(1899, 11, 30) + value * DAY);
      return { dates: [new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())], unreadable: false };
    }
    return { dates: [], unreadable: true };
  }
  const s = text(value);
  if (!s || NA_RE.test(s)) return { dates: [], unreadable: false };
  const found = [];
  for (const [re, parts] of DATE_PATTERNS) {
    for (const m of s.matchAll(re)) {
      const d = makeDate(...parts(m));
      if (d) found.push({ at: m.index, end: m.index + m[0].length, d });
    }
  }
  if (ranges) {
    for (const m of s.matchAll(YEAR_RANGE)) {
      if (!found.some((f) => m.index < f.end && f.at < m.index + m[0].length)) found.push({ at: m.index, end: m.index + m[0].length, d: new Date(Number(m[1]), 11, 31) });
    }
  }
  found.sort((a, b) => a.at - b.at);
  const dates = [];
  let end = -1;
  for (const f of found) {
    if (f.at < end) continue;
    dates.push(f.d);
    end = f.end;
  }
  return { dates, unreadable: dates.length === 0 };
}

/** The permit numbers in a cell: one per line, or separated by commas, semicolons or " / ". */
function numbersIn(value) {
  return [
    ...new Set(
      text(value)
        .split(/[\n,;]+|\s*\/\s+|\s+\/\s*/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 6 && (t.match(/\d/g) || []).length >= 4)
    ),
  ];
}

// What kind of permit a number is, by its shape (as the register writes them).
const SHAPES = [
  ['pto', /^(PTO|FLA|POA)\b/],
  ['wwdp', /^(WW)?DP\b/],
  ['pco', /RIII|^COA\b|^\d{3,5}-\d{4}[A-L]-|^\d{4}[A-L]-0?3|^R-\d{4}[A-L]-/],
  ['hw', /^(OL-?)?(M-?)?G-?R?-?\s?(R-?)?0?3\b|^OL-GR?-/],
  ['ecc', /^(ECC|CNC)\b|^RO?0?3-\d|^III-\d|^0?3[A-Z]{2}-\d/],
];
const kindOf = (number) => {
  const s = text(number).toUpperCase();
  return (SHAPES.find(([, re]) => re.test(s)) || [])[0] || null;
};

const STATUS_RE = /^\s*(non[\s-]*)?compliant\s*(\(\s*survey\s*\))?\s*$/i;
/** The NOV recommendation of an inspection: { nonCompliant, survey } — or { other } for anything else. */
function statusOf(value) {
  const s = text(value);
  if (!s) return null;
  const m = STATUS_RE.exec(s);
  if (!m) return { other: s };
  return { nonCompliant: Boolean(m[1]), survey: Boolean(m[2]), text: s };
}

// One formatter, shared: toLocaleDateString builds a new one each time, and over
// a register's dates that was 4.5 s of Node's one thread in a 17 s check (4 Nov
// 2026), the largest single cost in it. format() throws on an invalid date, where
// toLocaleDateString said so.
const DATE_FORMAT = new Intl.DateTimeFormat('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
const fmtDate = (d) => (Number.isNaN(d.getTime()) ? 'Invalid Date' : DATE_FORMAT.format(d));
const oneLine = (v) => text(v).split(/\s*\n+\s*/).filter(Boolean).join('; ');
const lawName = (id) => laws.LAWS.get(id)?.number || id;
const shortLaw = (id) => (id ? id.replace(/^(RA|PD)(\d+)$/, (_, a, n) => `${a} ${n}`) : '');

// ── One record ───────────────────────────────────────────────────────────────

/**
 * The analysis of one register row.
 * @returns {{permits: object[], findings: object[], summary: {high, medium, low}}}
 */
function analyze(row, { today = new Date() } = {}) {
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const permits = [];
  const findings = [];
  const add = (kind, code, severity, message, refs = [], extra = {}) => findings.push({ kind: kind.key, label: kind.label, code, severity, text: message, refs, rules: refs.length ? kind.rules || null : null, ...extra });
  // The inspector's notes under the permit's law; for the PCO, only those about the PCO.
  const notesOf = (kind) => {
    const all = (kind.violations || []).map((f) => oneLine(row[f])).filter(Boolean);
    if (kind.key !== 'pco') return all.join('; ');
    return [...new Set(all.flatMap((n) => n.split(/\s*[,;]\s*/)).filter((n) => kind.noted.test(n)))].join('; ');
  };
  const required = {};

  for (const kind of KINDS) {
    const raw = text(row[kind.code]);
    const numbers = numbersIn(row[kind.code]);
    if (kind.whenHeld && !raw) continue;
    const notNeeded = NA_RE.test(raw) || (kind.key === 'wwdp' && INTERCONNECTED_RE.test(raw)) || (kind.key === 'ecc' && NA_RE.test(text(row.permit_process)));
    const status = kind.status ? statusOf(row[kind.status]) : null;
    const notes = notesOf(kind);
    const notedMissing = Boolean(kind.noted && kind.noted.test(notes));
    const expiry = kind.expires ? readDates(row[kind.expires], { ranges: kind.key === 'pco' }) : null;
    const issued = kind.issued ? readDates(row[kind.issued]) : null;

    // Whether the record shows the permit is needed.
    let needed;
    if (kind.key === 'ecc') needed = !notNeeded;
    else if (kind.key === 'pco') needed = ['pto', 'wwdp', 'hw'].some((k) => required[k]) || Boolean(raw) || notedMissing;
    else needed = numbers.length > 0 || Boolean(status && !status.other) || notedMissing || (Boolean(raw) && !notNeeded);
    if (notNeeded) needed = false;
    required[kind.key] = needed;

    const p = {
      key: kind.key,
      label: kind.label,
      law: kind.law,
      lawLabel: kind.law ? shortLaw(kind.law) : 'DAO 2014-02',
      numbers,
      written: raw ? oneLine(raw) : '',
      issued: issued?.dates.map(fmtDate) || [],
      expires: expiry?.dates.length ? fmtDate(new Date(Math.max(...expiry.dates))) : null,
      status: status?.text || null,
      notes: notes || null,
      state: 'not-assessed',
    };
    permits.push(p);
    const basis = kind.penalty ? [...kind.basis, kind.penalty] : kind.basis;
    const lawWord = kind.law ? ` under ${shortLaw(kind.law)}` : '';
    const nov = status?.nonCompliant ? `the inspection${status.survey ? ' (survey)' : ''} recommended an NOV${lawWord}` : '';

    // The NOV recommendation column holding something else.
    if (status?.other) {
      const what = kindOf(status.other) ? `a permit number (${status.other})` : readDates(status.other).dates.length ? `a date (${status.other})` : `"${status.other.slice(0, 60)}"`;
      add(kind, 'misfiled', 'low', `The ${shortLaw(kind.law)} NOV recommendation column holds ${what} instead of Compliant or Non-Compliant.`);
    }
    // Numbers of another kind in this permit's column.
    for (const n of numbers) {
      const k = kindOf(n);
      if (k && k !== kind.key && KIND[k] && !(kind.key === 'pco' && k === 'ecc')) add(kind, 'misfiled', 'low', `${n} looks like a ${KIND[k].label} number but is in the ${kind.label} column.`);
    }

    if (notNeeded) {
      p.state = 'not-needed';
      if (notedMissing) add(kind, 'conflict', 'medium', `The register marks the ${kind.label} "${raw}", but the inspector noted "${notes}".`, kind.basis);
      continue;
    }

    if (!numbers.length) {
      if (!needed) continue;
      p.state = 'missing';
      const said = raw ? ` (the register says "${oneLine(raw).slice(0, 60)}")` : '';
      if (notedMissing || status?.nonCompliant) {
        const why = [notedMissing ? `the inspector noted "${notes}"` : '', nov].filter(Boolean).join(', and ');
        add(kind, 'missing', 'high', `No ${kind.label} on the register${said}: ${why}.`, basis);
      } else if (kind.key === 'ecc') {
        add(kind, 'missing', 'medium', `No ECC/CNC number on the register${said}${row.permit_process ? ` though its permit process is "${oneLine(row.permit_process)}"` : ''}.`, kind.basis);
      } else if (kind.key === 'pco') {
        // DAO 2014-02's requirement, not the Acts': low until an inspector notes it.
        add(kind, 'missing', 'low', `No PCO accreditation on the register${said}, though the firm holds or needs permits under the Clean Air, Clean Water or Toxic Substances Acts.`, kind.basis);
      } else {
        add(kind, 'missing', 'medium', `No ${kind.label} number on the register${said}, though the inspection marked the firm ${status?.text || 'as covered'}${lawWord} — it may simply not have been encoded.`, kind.basis);
      }
      continue;
    }

    // A number on file: its dates.
    p.state = 'on-file';
    if (expiry) {
      const ds = expiry.dates;
      if (ds.length) {
        const latest = new Date(Math.max(...ds));
        const lapsed = ds.filter((d) => d < now);
        if (latest < now) {
          p.state = 'expired';
          add(kind, 'expired', 'high', `${kind.label} expired on ${fmtDate(latest)}${ds.length > 1 ? ` (the latest of ${ds.length} listed)` : ''}${kind.key === 'wwdp' ? ' — operating a discharging facility without a valid permit is prohibited' : ''}.`, basis);
        } else {
          p.state = latest - now <= SOON_DAYS * DAY ? 'expiring' : 'valid';
          if (p.state === 'expiring') add(kind, 'expiring', 'medium', `${kind.label} expires on ${fmtDate(latest)}, within ${Math.ceil((latest - now) / DAY)} days — due for renewal.`, kind.basis);
          if (lapsed.length) add(kind, 'expired', 'low', `${lapsed.length} of the ${ds.length} ${kind.label} expiry dates listed have passed (${lapsed.map(fmtDate).join(', ')}): unless those permits were renewed or their sources retired, they have lapsed.`, kind.basis);
        }
      } else if (expiry.unreadable && text(row[kind.expires])) {
        add(kind, 'dates', 'low', `The ${kind.label} expiry cannot be read as a date ("${oneLine(row[kind.expires]).slice(0, 40)}").`);
      } else if (['pto', 'wwdp'].includes(kind.key)) {
        add(kind, 'dates', 'low', `${kind.label} ${numbers[0]} has no expiry date on the register.`);
      }
    }
    if (issued?.dates.length) {
      const future = issued.dates.filter((d) => d - now > DAY);
      if (future.length) add(kind, 'dates', 'low', `${kind.label} issue date ${future.map(fmtDate).join(', ')} is in the future.`);
      if (expiry?.dates.length === issued.dates.length) {
        const bad = issued.dates.map((d, i) => [d, expiry.dates[i]]).filter(([i, e]) => e <= i);
        if (bad.length) add(kind, 'dates', 'low', `${kind.label} expires on or before it was issued (${bad.map(([i, e]) => `issued ${fmtDate(i)}, expires ${fmtDate(e)}`).join('; ')}).`);
      }
    }
    if (status?.nonCompliant) add(kind, 'noncompliant', p.state === 'expired' ? 'high' : 'medium', `A ${kind.label} is on file, but ${nov}${notes ? `; the inspector noted "${notes}"` : ''}.`, kind.penalty ? [kind.penalty, ...kind.basis] : kind.basis);
  }

  const rank = { high: 0, medium: 1, low: 2 };
  findings.sort((a, b) => rank[a.severity] - rank[b.severity]);
  const summary = { high: 0, medium: 0, low: 0 };
  for (const f of findings) summary[f.severity] += 1;
  return { permits, findings, summary, nov: /^y/i.test(text(row.with_nov)) };
}

// ── The law behind the findings ──────────────────────────────────────────────

const refKey = ([law, section]) => `${law}:${section}`;

/** The distinct law sections the findings rest on, as [law, section] pairs. */
function refsOf(findings) {
  return [...new Map(findings.flatMap((f) => f.refs).map((r) => [refKey(r), r])).values()];
}

/** "R.A. No. 9275, Sec. 14 and 27; penalty Sec. 28" for a finding. */
function citation(refs) {
  const byLaw = new Map();
  for (const [law, sec] of refs) byLaw.set(law, [...(byLaw.get(law) || []), sec]);
  return [...byLaw].map(([law, secs]) => `${lawName(law)}, Sec. ${secs.join(', ')}`).join('; ');
}

/** For a screen: each section's heading and verbatim text, from the library. */
function lawTextOf(refs) {
  return laws.sections(refs).reduce((out, c) => {
    const key = `${c.law}:${c.section}`;
    const had = out.find((x) => x.key === key);
    if (had) had.text += `\n${c.text}`;
    else out.push({ key, law: c.law, section: c.section, label: `${c.lawNumber}, Sec. ${c.section}`, heading: c.heading || '', lawShort: c.lawShort, text: c.text, url: c.url });
    return out;
  }, []);
}

// ── For Ask VERA ─────────────────────────────────────────────────────────────

// A question about a firm's permits or compliance (with a name or serial).
const PERMIT_ASK_RE =
  /\b(permits?|clearances?|ecc|cnc|pto|wwdp|discharge\s+permit|permit\s+to\s+operate|haz(?:waste)?\s*id|hw\s*id|pco|complian(?:t|ce)|non[-\s]?compliant|expir\w*|validity|lapsed|renew\w*|violations?|missing|lacking|kulang)\b/i;
const wantsPermits = (message) => PERMIT_ASK_RE.test(String(message || ''));

/** One firm's permit file, as plain lines VERA may quote. */
function dossier(row, { today = new Date(), register = '', scans = [] } = {}) {
  const a = analyze(row, { today });
  const where = [row.city, String(row.province || '').replace(/_/g, ' ')].filter(Boolean).join(', ');
  const lines = [`PERMIT FILE — ${row.sort_key || '—'} · ${row.name || '—'} · ${row.title || '—'}${where ? ` · ${where}` : ''}${register ? ` (${register})` : ''}`, 'Permits on the register:'];
  for (const p of a.permits) {
    const kind = KIND[p.key];
    const head = `- ${p.label}${kind.law ? ` (${lawName(kind.law)})` : ' (DAO 2014-02)'}: `;
    if (p.state === 'not-needed') lines.push(`${head}marked "${p.written}"`);
    else if (!p.numbers.length) lines.push(`${head}none on the register${p.written ? ` (written: "${p.written.slice(0, 60)}")` : ''}${p.status ? ` · NOV recommendation: ${p.status}` : ''}${p.notes ? ` · inspector noted: ${p.notes}` : ''}`);
    else
      lines.push(
        `${head}${p.numbers.join(', ')}${p.key === 'ecc' && row.permit_process ? ` · ${oneLine(row.permit_process)}` : ''}${p.issued.length ? ` · issued ${p.issued.join(', ')}` : ''}${p.expires ? ` · ${p.state === 'expired' ? 'expired' : 'valid until'} ${p.expires}` : ''}${p.status ? ` · NOV recommendation: ${p.status}` : ''}${p.notes ? ` · inspector noted: ${p.notes}` : ''}`
      );
  }
  lines.push(`- Notice of Violation previously issued: ${a.nov ? 'yes' : text(row.with_nov) ? 'no' : 'not recorded'}`);
  if (scans.length) lines.push(`Scans in the ERMS Document Library: ${scans.map((s) => `${s.number} (${s.serialNo}${s.hasScan ? '' : ', no scan yet'})`).join('; ')}`);
  lines.push(`Findings (worked out by rule from the register as of ${fmtDate(today)}), most serious first:`);
  if (!a.findings.length) lines.push('- None: every permit the record shows is needed is on the register and in date.');
  a.findings.forEach((f, i) => lines.push(`${i + 1}. ${f.severity.toUpperCase()} — ${f.text}${f.refs.length ? ` Law: ${citation(f.refs)}.` : ' (A register entry to correct, not a legal finding.)'}${f.rules ? ` Note: ${f.rules}` : ''}`));
  return { text: lines.join('\n'), refs: refsOf(a.findings), analysis: a };
}

/**
 * After the model answers from a permit file: every date and permit number it
 * states must be in the file it was given. A model that "helpfully" works out
 * an expiry from an issue date is caught here, not trusted.
 * @returns {string[]} what the answer states that the file does not
 */
function verifyFacts(answer, given) {
  const squash = (s) => text(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const known = squash(given);
  const days = new Set(readDates(given).dates.map((d) => d.toDateString()));
  const out = [];
  for (const d of readDates(answer).dates) if (!days.has(d.toDateString())) out.push(`the date ${fmtDate(d)}`);
  for (const n of text(answer).match(/\b[A-Z0-9]{1,6}(?:-[A-Z0-9]{1,8}){2,}\b/gi) || []) {
    if (kindOf(n) && !known.includes(squash(n))) out.push(`the number ${n}`);
  }
  return [...new Set(out)];
}

// ── For the register check: every record ─────────────────────────────────────

const GROUPS = [
  { key: 'permit-missing', codes: ['missing', 'conflict'], label: 'Permits the record shows are needed but are not on the register', hint: 'An inspection found the firm non-compliant, an inspector noted the permit missing, or the number was never encoded. Confirm against the firm\'s file, then encode the number or follow up.' },
  { key: 'expired', codes: ['expired'], label: 'Permits past their expiry', hint: 'Due for renewal: confirm with the firm, then update the permit and its dates. A discharging facility without a valid permit is a prohibited act under RA 9275.' },
  { key: 'permit-expiring', codes: ['expiring'], label: `Permits expiring within ${SOON_DAYS} days`, hint: 'Remind the firm to renew before the date.' },
  { key: 'permit-noncompliant', codes: ['noncompliant'], label: 'Permits on file, but the inspection recommended an NOV', hint: 'The last inspection found the firm non-compliant under the permit\'s law: for the Legal Services Unit.' },
  { key: 'permit-entries', codes: ['dates', 'misfiled'], label: 'Permit entries to correct (dates, wrong columns)', hint: 'Register entries, not legal findings: a date that cannot be right or read, or a value typed in the wrong column.' },
];

/** Collects the review groups over a pass of the register (call add() per row, then groups()). */
function collector({ today = new Date(), maxSamples = 100 } = {}) {
  const buckets = new Map(GROUPS.map((g) => [g.key, { count: 0, samples: [], refs: new Map() }]));
  const groupOf = new Map(GROUPS.flatMap((g) => g.codes.map((c) => [c, g.key])));
  const rank = { high: 0, medium: 1, low: 2 };
  return {
    add(row) {
      const { findings } = analyze(row, { today });
      for (const f of findings) {
        const b = buckets.get(groupOf.get(f.code));
        b.count += 1;
        for (const r of f.refs) b.refs.set(refKey(r), r);
        b.samples.push({ sort_key: row.sort_key, title: row.title || row.name || '', province: row.province || '', detail: f.text, severity: f.severity, permit: f.label, law: f.refs.length ? citation(f.refs) : '' });
        // Keep the most serious, a bounded number.
        if (b.samples.length > maxSamples * 2) {
          b.samples.sort((x, y) => rank[x.severity] - rank[y.severity]);
          b.samples.length = maxSamples;
        }
      }
    },
    groups() {
      return GROUPS.map((g) => {
        const b = buckets.get(g.key);
        b.samples.sort((x, y) => rank[x.severity] - rank[y.severity]);
        const refs = [...b.refs.values()];
        return { key: g.key, label: g.label, hint: g.hint, count: b.count, samples: b.samples.slice(0, maxSamples), law: refs.length ? citation(refs) : '' };
      });
    },
  };
}

module.exports = { KINDS, FIELDS, SOON_DAYS, analyze, readDates, numbersIn, kindOf, statusOf, refsOf, citation, lawTextOf, wantsPermits, PERMIT_ASK_RE, dossier, verifyFacts, collector, GROUPS };
