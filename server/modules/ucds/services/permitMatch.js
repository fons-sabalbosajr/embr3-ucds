// ---------------------------------------------------------------------------
// Linking an ERMS record to the UCDS establishment register.
//
// The two systems were maintained independently for years, so permit numbers
// agree in substance but not in spelling. Three things had to be handled:
//
//   * A register cell can hold several permit numbers at once, e.g.
//     "03BU-0403-07-203-120A, CNC-OL-R03-2017-10-01090". Each is indexed.
//   * Prefix conventions differ: ERMS writes "R03-2017-0370" where the
//     register writes "ECC-OL-R03-2017-0370".
//   * Hazardous-waste registrations are not in ecc_cnc at all; they are in
//     haz_id.
//
// Matching is layered from strictest to loosest, and every layer refuses an
// ambiguous key — one that resolves to more than one establishment — so a
// loose rule can never invent a link.
//
// The ERMS side was typed by hand, so a value is cleaned before any layer
// sees it (see `clean`) and may hold more than one number (see `numbersIn`).
// ---------------------------------------------------------------------------

const SPLIT = /[,;]+/;

const MONTH = '(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC)[A-Z]*\\.?';
// A date written after the number, sometimes glued to it:
// "03NE070124-025-116A12 MARCH 2007", "R03-1103-0138 March 5, 2011".
const TRAILING_DATE = new RegExp(`\\s*(?:\\d{1,2}\\s*${MONTH},?\\s*\\d{4}|${MONTH}\\s*\\d{1,2},?\\s*\\d{4})\\s*$`, 'i');

/**
 * The typing slips that recur in the ERMS permit field, put right:
 *
 *   ‐ – — ‑ −            any dash → "-"
 *   RO3-1103-0138         the letter O for a zero → R03-1103-0138
 *   O3TA-0712-14-…        a leading O for a zero  → 03TA-0712-14-…
 *   R3-2017-0370          the region without its zero → R03-2017-0370
 *   … 116A12 MARCH 2007   a date after the number → dropped
 *
 * Applied to both sides, so a register cell with the same slip still agrees.
 */
function clean(s) {
  let out = String(s || '')
    .toUpperCase()
    .replace(/[‐-―−﹘﹣－]/g, '-')
    .trim();
  out = out.replace(TRAILING_DATE, '');
  out = out
    .replace(/(^|[^A-Z])RO(?=\d)/g, '$1R0')
    .replace(/(^|[^A-Z0-9])O(?=\d)/g, '$10')
    .replace(/(^|[^A-Z])R0?3(?=[^0-9]|$)/g, '$1R03');
  return out.trim();
}

const normalise = (s) =>
  clean(s).replace(/[\s._]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');

const loosen = (s) => clean(s).replace(/[^A-Z0-9]/g, '');

/**
 * Zero padding and the order of separators set aside, the letters kept:
 * "ECC-OL-R03-2017-370", "ECC OL R03 2017 0370" and "ECC-OL-R3-2017-00370"
 * are one number. Tried after the exact and loose spellings and before the
 * blunt digits-only fallback, so a padding difference no longer depends on
 * the names agreeing.
 */
const unpadded = (s) =>
  (clean(s).match(/[A-Z]+|\d+/g) || []).map((g) => (/^\d+$/.test(g) ? String(Number(g)) : g)).join('-');

const digitsOf = (s) => String(s || '').replace(/\D/g, '');

// Words a clerk wrote between two numbers in one cell.
const BETWEEN = /[,;&/()[\]]+|\bAND\b|\b(?:AMEND(?:ED|ING|MENT|S)?|ORIG(?:INAL)?|FORMERLY|PREVIOUS(?:LY)?|OLD|NEW|REF(?:ERENCE)?(?:\s*NO)?)\b\s*:?/i;

/**
 * The permit numbers in one ERMS value. Usually one; "Amended: X Original: Y",
 * "X (AMENDING Y)" and "X & Y" give two. Text with no number in it (a name,
 * an address, "NO REF NUMBER") gives none.
 */
function numbersIn(value) {
  return String(value || '')
    .split(new RegExp(BETWEEN.source, 'gi'))
    .map((t) => clean(t).replace(/^[\s:-]+|[\s:-]+$/g, ''))
    .filter((t) => t && t.length >= 6 && (t.match(/\d/g) || []).length >= 4 && !/^FORM\b/.test(t));
}

// ---------------------------------------------------------------------------
// Hazardous Waste Generator ids.
//
// Both systems use one series, written many ways:
//
//   GR-R3-08-00017   GR3-08-00011   GR R3-08-00042   GR-03-08-0105
//   OL-GR-R3-77-002894      OL- marks an online-process registration
//   M-GR-R3-69-00123        M- marks a manually generated id
//
// The M is a real distinction and stays in the key. The OL prefix, the
// separator style and the zero padding are all noise and do not.
// ---------------------------------------------------------------------------
const HW_RE =
  /^(?:OL[\s\-‐]*)?(M[\s\-‐]*)?G[\s\-‐]*R?[\s\-‐]*(?:R[\s\-‐]*)?0?3[\s\-‐]*(\d+)[\s\-‐]*(\d+)\s*$/i;

function hwKey(raw) {
  const s = String(raw || '').trim().replace(/[‐-―−]/g, '-');
  const m = HW_RE.exec(s);
  if (!m) return null;
  const [, manual, series, serial] = m;
  return `${manual ? 'M' : ''}|${Number(series)}|${Number(serial)}`;
}

/** Individual permit numbers inside one register cell. */
function tokensOf(cell) {
  return String(cell || '')
    .split(SPLIT)
    .map((t) => t.trim().replace(/^['"]+|['"]+$/g, ''))
    .filter((t) => t && t.length >= 6 && /\d/.test(t) && !/^in[-\s]?process$/i.test(t));
}

/**
 * Index the register by every spelling of every permit number it mentions.
 *
 * A key that maps to more than one establishment is marked ambiguous and will
 * not be used for matching.
 */
function buildIndex(registerRows) {
  const layers = { exact: new Map(), loose: new Map(), unpadded: new Map(), hw: new Map(), digits: new Map() };

  const add = (layer, key, row) => {
    if (!key) return;
    const existing = layer.get(key);
    if (!existing) {
      layer.set(key, { row, ambiguous: false, rows: [row] });
    } else if (existing.row.sort_key !== row.sort_key) {
      existing.ambiguous = true;
      if (!existing.rows.some((r) => r.sort_key === row.sort_key)) existing.rows.push(row);
    }
  };

  for (const row of registerRows) {
    for (const field of ['ecc_cnc', 'haz_id']) {
      for (const token of tokensOf(row[field])) {
        add(layers.exact, normalise(token), row);
        add(layers.loose, loosen(token), row);
        const u = unpadded(token);
        // Two groups at least, or it is just a number.
        if (u.split('-').length >= 3) add(layers.unpadded, u, row);
        add(layers.hw, hwKey(token), row);
        const d = digitsOf(token);
        // Short digit runs collide across unrelated permits.
        if (d.length >= 8) add(layers.digits, d, row);
      }
    }
  }

  return layers;
}

/** One number against the layers, strictest first. */
function matchOne(index, permitNumber) {
  const attempts = [
    ['exact', normalise(permitNumber)],
    ['loose', loosen(permitNumber)],
    ['unpadded', unpadded(permitNumber).split('-').length >= 3 ? unpadded(permitNumber) : null],
    // Structural: precise about the M marker and the series segment, so it is
    // tried before the blunt digits-only fallback.
    ['hw', hwKey(permitNumber) || hwKey(clean(permitNumber))],
    // Raw digits, not cleaned ones: "CNC-R3-0908-0020" must not become the
    // ECC "R03-0908-0020", nor "M-GR-R3-…" the plain "GR-03-…".
    ['digits', digitsOf(permitNumber)],
  ];

  for (const [strategy, key] of attempts) {
    if (!key) continue;
    if (strategy === 'digits' && key.length < 8) continue;
    const hit = index[strategy].get(key);
    if (hit && !hit.ambiguous) return { row: hit.row, strategy };
  }
  return null;
}

/**
 * @returns {{row, strategy}|null} the matched establishment and how it was found
 *
 * The value as a whole is tried first; failing that, each number inside it.
 * Two numbers in one cell that point at different establishments link to
 * neither — that is for a person (or VERA's report) to decide.
 */
function findMatch(index, permitNumber) {
  const whole = matchOne(index, permitNumber);
  if (whole) return whole;

  const parts = numbersIn(permitNumber);
  if (parts.length === 1 && parts[0] === clean(permitNumber)) return null;
  let found = null;
  for (const part of parts) {
    const hit = matchOne(index, part);
    if (!hit) continue;
    if (found && found.row.sort_key !== hit.row.sort_key) return null;
    found = found || { ...hit, strategy: `${hit.strategy}:part` };
  }
  return found;
}

/**
 * Every establishment a number could mean, for the cases findMatch refuses:
 * an ambiguous key, or a cell whose numbers disagree. VERA's report uses it to
 * pick between them by the proponent's name.
 */
function candidatesOf(index, permitNumber) {
  const seen = new Map();
  for (const n of [permitNumber, ...numbersIn(permitNumber)]) {
    for (const [layer, key] of [
      ['exact', normalise(n)],
      ['loose', loosen(n)],
      ['unpadded', unpadded(n)],
      ['hw', hwKey(clean(n))],
    ]) {
      const hit = key && index[layer].get(key);
      if (!hit) continue;
      for (const row of hit.rows) if (!seen.has(row.sort_key)) seen.set(row.sort_key, { row, strategy: layer });
    }
  }
  return [...seen.values()];
}

module.exports = { buildIndex, findMatch, candidatesOf, numbersIn, clean, tokensOf, normalise, loosen, unpadded, digitsOf, hwKey };
