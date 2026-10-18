// ---------------------------------------------------------------------------
// VERA's tracking notes for the Progress Tracker: what stands out in the
// season's figures, as plain sentences — the province furthest behind, the
// additions still waiting for their duplicate check, the colours nobody has
// given a meaning — each with a question to ask VERA about it.
//
// And the same figures as the plain lines VERA quotes when asked (VERA's
// figures, services/vera/figures): counts only, never a firm or a serial.
//
// Pure: the overview's matrix and summary in, sentences out. No model; the
// notes read the same whether or not VERA's AI is switched on.
// ---------------------------------------------------------------------------

const fmt = (n) => new Intl.NumberFormat('en-PH').format(n ?? 0);
// The tracker's groups as the Planning Unit names them.
const GROUP_LABEL = { province: 'Monitoring Plan', healthcare: 'Healthcare & special lists', other: 'Other lists' };
// The permits followed one by one — never added together, as they are different things.
const KINDS = [['ecc', 'ECC/CNC'], ['pto', 'PTO'], ['wwdp', 'WWDP'], ['haz', 'HWG ID'], ['pco', 'PCO']];
const EXTRA_KINDS = [['tsd', 'TSD'], ['trc', 'TP/TRC'], ['chemical', 'Chemical permit'], ['importer', 'Importer clearance']];
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const label = (u) => String(u).replace(/_/g, ' ');
const addedOf = (u) => (u.added?.erms || 0) + (u.added?.ecconline || 0) + (u.added?.other || 0);
const pendingOf = (u) => u.review || 0;

/** [{ tone: 'info'|'warn'|'good', text, ask }] — the most useful first, at most eight. */
function notesFor({ matrix = [], summary, stale, legend = {} }) {
  const notes = [];
  const s = summary?.raw || {};
  const provinces = matrix.filter((u) => u.group === 'province');
  if (stale) {
    notes.push({
      tone: 'warn',
      text: 'The season baseline was read before the tracker counted only the main province sheets, so "since the baseline" changes are not comparable. Take a new baseline.',
      ask: 'Why should I take a new baseline in the Progress Tracker?',
    });
  }

  const added = (s.additions?.erms || 0) + (s.additions?.ecconline || 0) + (s.additions?.other || 0);
  if (s.rows) {
    notes.push({
      tone: 'info',
      text: `The main sheets hold ${fmt(s.rows)} firms: ${fmt(s.base)} baseline, ${fmt(s.additions?.erms)} added from ERMS and ${fmt(s.additions?.ecconline)} from ECC Online (${pct(added, s.rows)}% new).`,
      ask: 'Break down the firms added from ERMS and ECC Online by province.',
    });
  }

  // Highlighting: the share of each province's baseline firms someone has coloured.
  const reviewed = provinces.filter((u) => u.base > 0).map((u) => ({ u, p: pct(u.coloredBase, u.base) }));
  if (reviewed.length > 1) {
    reviewed.sort((a, b) => a.p - b.p);
    const low = reviewed[0];
    const high = reviewed[reviewed.length - 1];
    notes.push({
      tone: low.p < 25 ? 'warn' : 'info',
      text: `${label(low.u.unit)} is furthest behind on highlighting: ${low.p}% of its ${fmt(low.u.base)} baseline firms are coloured (${fmt(low.u.notModified)} untouched). ${label(high.u.unit)} leads at ${high.p}%.`,
      ask: `Which provinces have the least highlighting progress, and how many firms are left in ${label(low.u.unit)}?`,
    });
  }

  // Additions still on the review sheets.
  const waiting = matrix.filter((u) => pendingOf(u) > 0).sort((a, b) => pendingOf(b) - pendingOf(a));
  if (waiting.length) {
    const total = waiting.reduce((a, u) => a + pendingOf(u), 0);
    const top = waiting[0];
    const sheets = Object.entries(top.reviewSheets || {})
      .map(([n, c]) => `${fmt(c)} in ${n}`)
      .join(', ');
    notes.push({
      tone: 'warn',
      text: `${fmt(total)} firms are waiting on review sheets, not yet on a main sheet. Most in ${label(top.unit)}: ${sheets || fmt(pendingOf(top))}.`,
      ask: 'How many firms are still waiting on the review sheets, per province?',
    });
  }

  // Newly issued permits not yet encoded: the kind furthest behind.
  const issuedKinds = KINDS.map(([k, name]) => ({ name, ...(summary?.permits?.byKind?.[k] || {}) })).filter((k) => k.issued > 0);
  if (issuedKinds.length) {
    issuedKinds.sort((a, b) => pct(a.inRaw, a.issued) - pct(b.inRaw, b.issued));
    const low = issuedKinds[0];
    const encoding = matrix.filter((u) => u.issued > 0).sort((a, b) => pct(a.inRaw, a.issued) - pct(b.inRaw, b.issued));
    const where = encoding[0] ? ` By province, ${label(encoding[0].unit)} is lowest at ${pct(encoding[0].inRaw, encoding[0].issued)}%.` : '';
    notes.push({
      tone: pct(low.inRaw, low.issued) >= 90 ? 'good' : 'info',
      text: `Of the newly issued permits, ${low.name} is furthest behind: ${fmt(low.inRaw)} of ${fmt(low.issued)} in the RAW data (${pct(low.inRaw, low.issued)}%).${where}`,
      ask: 'Break down the newly issued permits by kind: how many of each are already in the RAW data?',
    });
  }

  // Colours in use with no meaning in the legend.
  const unnamed = [];
  for (const u of matrix) for (const c of u.colours || []) if (!legend[u.unit]?.[c.family] && c.rows >= 5) unnamed.push({ u, c });
  if (unnamed.length) {
    unnamed.sort((a, b) => b.c.rows - a.c.rows);
    const { u, c } = unnamed[0];
    notes.push({
      tone: 'info',
      text: `${unnamed.length} colour${unnamed.length === 1 ? ' is' : 's are'} used without a meaning in the legend, the largest ${c.family} on ${fmt(c.rows)} rows in ${label(u.unit)}. Name it under Edit legend.`,
      ask: 'What does each highlight colour mean, and which colours have no meaning yet?',
    });
  }

  // Provinces with no additions at all: possibly not yet reached.
  const none = provinces.filter((u) => u.rows > 0 && addedOf(u) === 0);
  if (none.length && provinces.length > none.length) {
    notes.push({
      tone: 'info',
      text: `No firms added yet in ${none.map((u) => label(u.unit)).join(', ')}.`,
      ask: 'Which provinces have no added firms yet?',
    });
  }

  if (s.rows && reviewed.length && reviewed.every((r) => r.p >= 95)) {
    notes.push({ tone: 'good', text: 'Every province has at least 95% of its baseline firms highlighted.', ask: 'Summarise the updating progress for the season.' });
  }
  return notes.slice(0, 8);
}

/** The season's figures as the lines VERA quotes (services/vera/figures). */
function figuresLines(o) {
  if (!o?.season) return ['Progress Tracker: no activity season yet.'];
  const s = o.summary.raw;
  const p = o.summary.permits;
  const lines = [
    `Progress Tracker — ${o.season.name} (${o.season.open ? 'live' : o.season.status === 'closed' ? 'closed' : 'not running'}${o.season.lastPoll?.at ? `, files last checked ${new Date(o.season.lastPoll.at).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })}` : ''}). Counts are from the MAIN worksheet of each RAW file only:`,
    `- Firms: ${fmt(s.rows)} total = ${fmt(s.base)} baseline + ${fmt(s.additions?.erms)} added from ERMS + ${fmt(s.additions?.ecconline)} added from ECC Online${s.additions?.other ? ` + ${fmt(s.additions.other)} from other sources` : ''}`,
    `- Waiting on review sheets (not on a main sheet yet): ${fmt(s.review)}; set aside: ${fmt(s.byCategory?.duplicate?.now)} duplicates, ${fmt(s.byCategory?.delisting?.now)} for delisting, ${fmt(s.byCategory?.deletion?.now)} for deletion`,
    '',
    'Permits on the main sheets, each kind on its own (never add the kinds together) — baseline firms + added from ERMS + added from ECC Online:',
    ...[...KINDS, ...EXTRA_KINDS]
      .filter(([k], i) => i < KINDS.length || s.permitKinds?.[k]?.now)
      .map(([k, name]) => {
        const x = s.permitKinds?.[k] || {};
        return `- ${name}: ${fmt(x.now)} = ${fmt(x.base)} + ${fmt(x.erms)} ERMS + ${fmt(x.ecconline)} ECC Online`;
      }),
    '',
    `Newly issued permits (the season's lists), each kind on its own — already in the RAW data, of issued:`,
    ...[...KINDS, ...EXTRA_KINDS]
      .filter(([k], i) => i < KINDS.length || p.byKind?.[k]?.issued)
      .map(([k, name]) => {
        const x = p.byKind?.[k];
        if (!x?.issued) return `- ${name}: no newly issued list in the folder`;
        const src = x.bySource || {};
        return `- ${name}: ${fmt(x.inRaw)} of ${fmt(x.issued)} (${pct(x.inRaw, x.issued)}%), ${fmt(x.issued - x.inRaw)} to encode; found on ${fmt(src.base)} baseline firms, ${fmt(src.erms)} ERMS additions, ${fmt(src.ecconline)} ECC Online additions`;
      }),
    '',
    'Per province or list (firms = baseline + ERMS + ECC Online; highlighted = baseline firms coloured as updated):',
  ];
  for (const u of o.matrix || []) {
    const colours = (u.colours || []).map((c) => `${c.family}${c.label ? ` "${c.label}"` : ''} ${fmt(c.rows)}`).join(', ');
    const permits = [...KINDS, ...EXTRA_KINDS].filter(([k]) => u.permits?.[k])
      .map(([k, name]) => `${name} ${fmt(u.permits[k])} (+${fmt(u.addedPermitsByKind?.erms?.[k])} ERMS, +${fmt(u.addedPermitsByKind?.ecconline?.[k])} ECC Online)`)
      .join(', ');
    const issued = [...KINDS, ...EXTRA_KINDS].filter(([k]) => u.issuedByKind?.[k]?.issued)
      .map(([k, name]) => `${name} ${fmt(u.issuedByKind[k].inRaw)}/${fmt(u.issuedByKind[k].issued)}`)
      .join(', ');
    lines.push(
      `- ${label(u.unit)} [${GROUP_LABEL[u.group] || u.group}]: ${fmt(u.rows)} firms = ${fmt(u.base)} + ${fmt(u.added.erms)} ERMS + ${fmt(u.added.ecconline)} ECC Online; ` +
        `highlighted ${fmt(u.coloredBase)} of ${fmt(u.base)} baseline (${pct(u.coloredBase, u.base)}%), ${fmt(u.notModified)} untouched (no colour); ` +
        (permits ? `permits: ${permits}; ` : '') +
        `review ${fmt(u.review)}; duplicates ${fmt(u.duplicate)}, delisting ${fmt(u.delisting)}, deletion ${fmt(u.deletion)}` +
        (issued ? `; newly issued encoded: ${issued}` : '') +
        (colours ? `; colours: ${colours}` : '')
    );
  }
  const notes = o.notes || [];
  if (notes.length) lines.push('', 'Tracking notes:', ...notes.map((n) => `- ${n.text}`));
  return lines;
}

module.exports = { notesFor, figuresLines };
