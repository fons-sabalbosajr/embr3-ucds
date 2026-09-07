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
// ---------------------------------------------------------------------------

const SPLIT = /[,;]+/;

const normalise = (s) =>
  String(s || '').toUpperCase().replace(/[\s._]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');

const loosen = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const digitsOf = (s) => String(s || '').replace(/\D/g, '');

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
  const layers = { exact: new Map(), loose: new Map(), digits: new Map() };

  const add = (layer, key, row) => {
    if (!key) return;
    const existing = layer.get(key);
    if (!existing) {
      layer.set(key, { row, ambiguous: false });
    } else if (existing.row.sort_key !== row.sort_key) {
      existing.ambiguous = true;
    }
  };

  for (const row of registerRows) {
    for (const field of ['ecc_cnc', 'haz_id']) {
      for (const token of tokensOf(row[field])) {
        add(layers.exact, normalise(token), row);
        add(layers.loose, loosen(token), row);
        const d = digitsOf(token);
        // Short digit runs collide across unrelated permits.
        if (d.length >= 8) add(layers.digits, d, row);
      }
    }
  }

  return layers;
}

/**
 * @returns {{row, strategy}|null} the matched establishment and how it was found
 */
function findMatch(index, permitNumber) {
  const attempts = [
    ['exact', normalise(permitNumber)],
    ['loose', loosen(permitNumber)],
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

module.exports = { buildIndex, findMatch, tokensOf, normalise, loosen, digitsOf };
