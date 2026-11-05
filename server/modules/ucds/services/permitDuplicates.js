// ---------------------------------------------------------------------------
// One permit on several establishments, settled from the ERMS documents
// (28 Oct 2026; part of VERA's register check, registerCheck.js).
//
// The 2027 register had 431 ECC/CNC numbers written on more than one
// establishment (925 firms; 39 of the groups touch the healthcare list).
// The ERMS Document Library holds the ECC and CNC documents themselves, with
// the proponent and the project they were issued to. For each shared number:
//
//   - The documents name one of the firms (proponent or project agree with
//     it): that firm keeps the number. Each OTHER firm whose own ECC/CNC is
//     in ERMS — a document of the same province naming that firm, with a
//     different number — gets a proposal to take its own number. "likely"
//     when the proponent and the project both agree, "review" otherwise.
//     A person applies each one; it can be undone.
//   - The firms are one establishment entered twice (the same project
//     title): listed for review. Which row to keep is for the Planning Unit;
//     the same firm may rightly be on two lists (TSD and chemicals, say).
//   - Anything else — no document, the documents name several firms or
//     none — is listed for review with what ERMS says.
//
// Only ECC and CNC documents count: an HW generator registration in ERMS is
// not anyone's ECC/CNC. Names are compared as register links compares them
// (services/vera/registerLinks namesAgree), and numbers as the ERMS anchor
// does (permitMatch).
// ---------------------------------------------------------------------------

const { getDb } = require('../../../config/db');
const pm = require('./permitMatch');
const { namesAgree, nameKey } = require('../../../services/vera/registerLinks');

const ECC_TYPES = ['ecc-original', 'ecc-amended', 'cnc'];
// Every group, not a sample: these are worked through one by one (431 in 2027).
const MAX_SAMPLES = 1000;

const blank = (v) => v == null || /^(\s*|n\/?a|-+|none|null|tba|tbd)$/i.test(String(v).trim());
const provinceKey = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');

/** The key a register permit is grouped by: its first number, padding and separators aside. */
const permitKey = (v) => {
  const first = pm.numbersIn(v)[0] || v;
  return pm.unpadded(first) || pm.loosen(first);
};

/** Does an ERMS document name this register firm, by proponent or project? */
const names = (rec, row) =>
  namesAgree(rec.proponentName, row.name) || namesAgree(rec.proponentName, row.title) || namesAgree(rec.projectTitle, row.name) || namesAgree(rec.projectTitle, row.title);

/** Both the proponent and the project agree: as sure as names get. */
const namesBoth = (rec, row) =>
  (namesAgree(rec.proponentName, row.name) || namesAgree(rec.proponentName, row.title)) && (namesAgree(rec.projectTitle, row.title) || namesAgree(rec.projectTitle, row.name));

/** One establishment entered twice: the same project title (a proponent alone may hold many). */
const sameEstablishment = (a, b) => namesAgree(a.title, b.title) || (blank(a.title) && blank(b.title) && namesAgree(a.name, b.name));

const numbersOf = (rec) => [rec.permit?.number, ...(rec.permit?.refs || []).map((x) => x.number)].filter((n) => !blank(n));

const day = (d) => {
  const t = d ? new Date(d) : null;
  return t && !Number.isNaN(t.getTime()) ? t.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium' }) : null;
};

/** The ERMS ECC/CNC documents, for a caller to read alongside its own reads. */
function ermsPermitRecords() {
  return getDb()
    .collection('erms-records')
    .find(
      { isAttachment: { $ne: true }, 'permit.type': { $in: ECC_TYPES }, $or: [{ 'permit.number': { $nin: [null, ''] } }, { 'permit.refs.number': { $nin: [null, ''] } }] },
      { projection: { serialNo: 1, permit: 1, proponentName: 1, projectTitle: 1, location: 1 } }
    )
    .toArray();
}

/**
 * @param {Array<{_id, sort_key, title, name, province, ecc_cnc}>} rows every register row with a permit
 * @param {{records?: object[]}} [opts] the ERMS ECC/CNC documents, when the caller has them
 * @returns {Promise<{proposals: object[], review: object[], notes: string[], groups: number}>}
 */
async function ermsPermitFindings(rows, { records } = {}) {
  // The shared numbers first: no ERMS read when there are none.
  const groups = new Map();
  for (const row of rows) {
    if (blank(row.ecc_cnc)) continue;
    const key = permitKey(row.ecc_cnc);
    if (!key || key.length < 6) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const shared = [...groups.entries()].filter(([, g]) => g.length > 1);
  if (!shared.length) return { proposals: [], review: [], notes: [], groups: 0 };

  const recs = records || (await ermsPermitRecords());
  const index = pm.buildIndex(recs.map((r) => ({ sort_key: r.serialNo, ecc_cnc: numbersOf(r).join(', '), rec: r })));
  const byName = new Map();
  for (const r of recs) {
    for (const k of new Set([nameKey(r.proponentName), nameKey(r.projectTitle)])) {
      if (!k) continue;
      if (!byName.has(k)) byName.set(k, []);
      byName.get(k).push(r);
    }
  }

  const proposals = [];
  const twice = [];
  const unsettled = [];
  const ref = (r) => `${r.sort_key} (${r.title || r.name || 'no title'})`;

  for (const [key, g] of shared) {
    if (g.every((row) => sameEstablishment(row, g[0]))) {
      twice.push({ sort_key: g.map((r) => r.sort_key).join(', '), title: g[0].title || g[0].name || '', province: g[0].province || '', detail: `${g[0].ecc_cnc} — the same project title on ${g.length} rows` });
      continue;
    }
    const holders = pm.candidatesOf(index, g[0].ecc_cnc).map((c) => c.row.rec);
    // Whose number it is: the document's project picks first — one developer
    // is the proponent of many subdivisions, so the proponent alone would name
    // every one of them. Failing a project match, the proponent.
    const byProject = g.filter((row) => holders.some((rec) => namesAgree(rec.projectTitle, row.title) || namesAgree(rec.projectTitle, row.name)));
    const owners = byProject.length === 1 ? byProject : g.filter((row) => holders.some((rec) => names(rec, row)));
    const what = !holders.length
      ? 'no ECC/CNC document in ERMS'
      : owners.length === 1
        ? `ERMS ${holders.map((h) => h.serialNo).join(', ')} names ${owners[0].sort_key}`
        : owners.length
          ? `ERMS names ${owners.length} of them`
          : `ERMS ${holders.map((h) => h.serialNo).join(', ')} names none of them (${holders[0].proponentName || holders[0].projectTitle || '—'})`;

    let settled = 0;
    if (owners.length === 1) {
      const owner = owners[0];
      for (const row of g) {
        if (row === owner || sameEstablishment(row, owner)) continue;
        const pool = [...new Set([...(byName.get(nameKey(row.name)) || []), ...(byName.get(nameKey(row.title)) || [])])].filter(
          (r) => (!provinceKey(r.location?.province) || !provinceKey(row.province) || provinceKey(r.location.province) === provinceKey(row.province)) && names(r, row)
        );
        // Its own number: not the one it shares.
        const own = [...new Map(pool.filter((r) => !numbersOf(r).some((n) => permitKey(n) === key)).map((r) => [permitKey(numbersOf(r)[0]), r])).values()];
        const both = own.filter((r) => namesBoth(r, row));
        const pick = both.length === 1 ? both[0] : own.length === 1 ? own[0] : null;
        if (!pick) continue;
        const to = String(pick.permit?.number || numbersOf(pick)[0]).trim();
        const approved = day(pick.permit?.dateApproved);
        settled += 1;
        proposals.push({
          field: 'ecc_cnc',
          // The record and the values the apply checks against.
          recordId: row._id,
          sort_key: row.sort_key,
          oldValue: row.ecc_cnc,
          newValue: to,
          fsn: pick.serialNo,
          from: `${row.sort_key} · ${row.ecc_cnc}`,
          to: `${to}  (ERMS ${pick.serialNo}${approved ? `, approved ${approved}` : ''})`,
          count: 1,
          reason: `${pick.permit?.label || 'ECC/CNC'} in ERMS for "${pick.projectTitle || pick.proponentName}" — the shared number is ${owner.sort_key}'s`,
          method: 'erms',
          confidence: both.length === 1 ? 'likely' : 'review',
        });
      }
    }
    if (settled < g.length - 1) {
      unsettled.push({ sort_key: g.map((r) => r.sort_key).join(', '), title: g.map((r) => r.title || r.name).filter(Boolean).slice(0, 2).join(' / '), province: g[0].province || '', detail: `${g[0].ecc_cnc} — ${what}${settled ? `; ${settled} firm(s) settled above` : ''}` });
    }
  }

  return {
    groups: shared.length,
    proposals,
    review: [
      {
        key: 'duplicate-permits',
        label: 'The same permit on more than one firm',
        hint: "What the ERMS documents say about each. Where they name the firm that holds the number and VERA found the other firms' own ECC/CNC, the corrections are above.",
        count: unsettled.length,
        samples: unsettled.slice(0, MAX_SAMPLES),
      },
      {
        key: 'same-firm-twice',
        label: 'One establishment entered twice',
        hint: 'The same project and the same permit on two rows. Keep one; the same firm may rightly be on two lists (TSD and chemicals, say).',
        count: twice.length,
        samples: twice.slice(0, MAX_SAMPLES),
      },
    ],
    notes: [
      `${shared.length} permits written on more than one firm, checked against ${recs.length} ECC/CNC documents in ERMS: ${proposals.length} firm(s) can take their own number from ERMS, ${twice.length} look like one establishment entered twice, ${unsettled.length} need a person.`,
    ],
  };
}

module.exports = { ermsPermitFindings, ermsPermitRecords, permitKey, sameEstablishment };
