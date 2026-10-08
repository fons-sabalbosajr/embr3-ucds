const { connectToMongo, getDb } = require('../../../config/db');
const { badRequest, forbidden } = require('../../../shared/middleware/errorHandler');
const { ERMS_UNITS, ERMS_UNIT_VALUES, canSeeErmsUnit, canAccessAllYears, isErmsEndUser, ermsUnitOf } = require('../../../services/authorization');
const config = require('./configService');

// ---------------------------------------------------------------------------
// The upload tally: who filed how many of what, each day, and a supervisor's
// check that the day's count is right.
//
// The desktop system kept this in every unit as two tables — an upload
// counter per person per day (tb_uploadcounter: ECC_Original, CNC, … NOV,
// TC, … Lab_Test_Results, COC, …) and a collector per day — each row signed
// off with Checked_by, Check_Date and Remarks. 1,594 rows for the Records
// Unit alone, checked until August 2025.
//
// Here the counts are not stored: they are computed from the documents
// themselves (document.uploadedAt and uploadedBy on erms-records and
// erms-documents), so they cannot drift from what was filed, and the
// migrated records count for the days the desktop system filed them. Only
// the check is stored — erms-upload-checks, one per unit, day and person —
// with a snapshot of the counts it approved, so a day that changed after it
// was checked says so.
//
// Days are Philippine days (UTC+8): a scan filed at 7 a.m. counts for that
// morning, not the evening before.
// ---------------------------------------------------------------------------

const CHECKS = 'erms-upload-checks';
const TZ = '+08:00';
const MAX_DAYS = 366;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

const checks = () => getDb().collection(CHECKS);

async function ensureIndexes() {
  await connectToMongo();
  await checks().createIndex({ unit: 1, date: -1 });
}

function assertUnit(unit) {
  const key = String(unit || '').toLowerCase();
  if (!ERMS_UNIT_VALUES.includes(key)) throw badRequest('Unknown unit.', 'UNIT_UNKNOWN');
  return key;
}

function assertCanSee(user, unit) {
  if (!canSeeErmsUnit(user, unit)) throw forbidden('This unit is not part of your account.', 'UNIT_FORBIDDEN');
}

/** Who may check a day: the unit's own staff, and the Developer/Administrator. */
const canCheck = (user, unit) => canAccessAllYears(user) || (isErmsEndUser(user) && ermsUnitOf(user) === unit);

/** Today in the Philippines, as YYYY-MM-DD. */
const today = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** A validated { from, to } — the last 31 days when not given. */
function rangeOf({ from, to } = {}) {
  const end = DAY_RE.test(String(to || '')) ? String(to) : today();
  const start = DAY_RE.test(String(from || '')) ? String(from) : addDays(end, -30);
  if (Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end))) throw badRequest('The dates are not valid.', 'RANGE_INVALID');
  if (start > end) throw badRequest('The start date is after the end date.', 'RANGE_INVALID');
  if ((Date.parse(end) - Date.parse(start)) / 86400000 >= MAX_DAYS) throw badRequest(`Choose at most ${MAX_DAYS} days.`, 'RANGE_TOO_LONG');
  return { from: start, to: end, since: new Date(`${start}T00:00:00${TZ}`), until: new Date(`${end}T23:59:59.999${TZ}`) };
}

/** The collection, the filter and the "kind" expression for a unit's uploads. */
function sourceOf(unit) {
  if (unit === ERMS_UNITS.RECORDS) {
    return { collection: 'erms-records', match: {}, kind: '$permit.type' };
  }
  return { collection: 'erms-documents', match: { unit }, kind: '$docType' };
}

/**
 * The counts for a unit over a range, one row per day and person:
 * [{ date, uploader, counts: { <kind>: n }, total }]. `only` narrows to one
 * day and person (for a check).
 */
async function count(unit, range, only = null) {
  const src = sourceOf(unit);
  const match = { ...src.match, 'document.uploadedAt': { $gte: range.since, $lte: range.until } };
  if (only?.uploader !== undefined) match['document.uploadedBy'] = only.uploader || null;
  const rows = await getDb()
    .collection(src.collection)
    .aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$document.uploadedAt', timezone: TZ } },
            uploader: { $ifNull: ['$document.uploadedBy', ''] },
            kind: { $ifNull: [src.kind, 'other'] },
          },
          n: { $sum: 1 },
        },
      },
    ])
    .toArray();

  const byKey = new Map();
  for (const r of rows) {
    if (only?.date && r._id.date !== only.date) continue;
    const key = `${r._id.date}|${r._id.uploader}`;
    if (!byKey.has(key)) byKey.set(key, { date: r._id.date, uploader: r._id.uploader, counts: {}, total: 0 });
    const row = byKey.get(key);
    row.counts[r._id.kind] = (row.counts[r._id.kind] || 0) + r.n;
    row.total += r.n;
  }
  return [...byKey.values()].sort((a, b) => b.date.localeCompare(a.date) || a.uploader.localeCompare(b.uploader));
}

const checkId = (unit, date, uploader) => `${unit}|${date}|${uploader}`;

/** Account names for the usernames in the rows; a legacy row already carries a name. */
async function namesOf(uploaders) {
  const users = await getDb()
    .collection('users')
    .find({ username: { $in: [...new Set(uploaders.filter(Boolean))] } }, { projection: { username: 1, name: 1 } })
    .toArray();
  return new Map(users.map((u) => [u.username, u.name || u.username]));
}

/**
 * The tally for a unit: the kinds it counts (its configured document or
 * permit types, then any other found), a row per day and person with its
 * check, and the totals.
 */
async function tally(user, unitKey, query = {}) {
  const unit = assertUnit(unitKey);
  assertCanSee(user, unit);
  const range = rangeOf(query);
  await connectToMongo();

  const [rows, unitCfg, checked] = await Promise.all([
    count(unit, range),
    config.unit(unit),
    checks().find({ unit, date: { $gte: range.from, $lte: range.to } }).toArray(),
  ]);
  const names = await namesOf(rows.map((r) => r.uploader));
  const checkOf = new Map(checked.map((c) => [checkId(unit, c.date, c.uploader), c]));

  const configured = (unitCfg?.docTypes || []).map((t) => ({ code: t.code, label: t.label }));
  const seen = new Set(rows.flatMap((r) => Object.keys(r.counts)));
  // Every configured kind is a column, filed that period or not, as the
  // desktop counter had a column for each; then any other kind found.
  const kinds = [...configured, ...[...seen].filter((c) => !configured.some((k) => k.code === c)).map((c) => ({ code: c, label: c }))];

  const totals = { counts: {}, total: 0, checked: 0, unchecked: 0, changed: 0 };
  const out = rows.map((r) => {
    const c = checkOf.get(checkId(unit, r.date, r.uploader));
    const check = c
      ? { checkedBy: c.checkedBy, checkedByName: c.checkedByName, checkedAt: c.checkedAt, remarks: c.remarks || null, total: c.total, changed: c.total !== r.total }
      : null;
    for (const [k, n] of Object.entries(r.counts)) totals.counts[k] = (totals.counts[k] || 0) + n;
    totals.total += r.total;
    if (!check) totals.unchecked += 1;
    else if (check.changed) totals.changed += 1;
    else totals.checked += 1;
    // `own`: the viewer's uploads, which they may not check themselves.
    return { ...r, uploaderName: names.get(r.uploader) || r.uploader || 'Unknown', check, own: isSelf(user, r.uploader) };
  });

  return { unit, from: range.from, to: range.to, kinds, rows: out, totals, canCheck: canCheck(user, unit) };
}

/** Whether `uploader` (a username, or a legacy display name) is this person. */
const isSelf = (user, uploader) => {
  const u = String(uploader || '').trim().toLowerCase();
  return Boolean(u) && [user?.username, user?.name].some((v) => String(v || '').trim().toLowerCase() === u);
};

/**
 * Check days: `entries` is [{ date, uploader }]. The counts are read again
 * here, not taken from the screen, and stored with the check. A person does
 * not check their own uploads — the point of the check is a second pair of
 * eyes. Returns { checked: [...], skipped: [{ date, uploader, reason }] }.
 */
async function check(user, unitKey, { entries = [], remarks = null } = {}) {
  const unit = assertUnit(unitKey);
  assertCanSee(user, unit);
  if (!canCheck(user, unit)) throw forbidden('Only the unit\'s own staff check its uploads.', 'UNIT_WRITE_FORBIDDEN');
  const list = (Array.isArray(entries) ? entries : []).slice(0, 200);
  if (!list.length) throw badRequest('Choose the days to check.', 'NOTHING_TO_CHECK');
  await connectToMongo();

  const note = remarks ? String(remarks).trim().slice(0, 500) || null : null;
  const done = [];
  const skipped = [];
  for (const e of list) {
    const date = String(e?.date || '');
    const uploader = String(e?.uploader ?? '');
    if (!DAY_RE.test(date)) {
      skipped.push({ date, uploader, reason: 'bad-date' });
      continue;
    }
    if (isSelf(user, uploader)) {
      skipped.push({ date, uploader, reason: 'own-uploads' });
      continue;
    }
    const [row] = await count(unit, rangeOf({ from: date, to: date }), { date, uploader });
    if (!row) {
      skipped.push({ date, uploader, reason: 'nothing-filed' });
      continue;
    }
    const doc = {
      unit,
      date,
      uploader,
      counts: row.counts,
      total: row.total,
      remarks: note,
      checkedBy: user?.username || 'unknown',
      checkedByName: user?.name || null,
      checkedAt: new Date(),
    };
    await checks().replaceOne({ _id: checkId(unit, date, uploader) }, { _id: checkId(unit, date, uploader), ...doc }, { upsert: true });
    done.push(doc);
  }
  return { checked: done, skipped };
}

/** Take a check back (a mistake, or a day re-opened). The unit's staff, not the person checked. */
async function uncheck(user, unitKey, { date, uploader }) {
  const unit = assertUnit(unitKey);
  assertCanSee(user, unit);
  if (!canCheck(user, unit)) throw forbidden('Only the unit\'s own staff check its uploads.', 'UNIT_WRITE_FORBIDDEN');
  if (isSelf(user, uploader)) throw forbidden('A check on your own uploads is for someone else to change.', 'OWN_UPLOADS');
  await connectToMongo();
  const removed = await checks().findOneAndDelete({ _id: checkId(unit, String(date), String(uploader ?? '')) }, { includeResultMetadata: false });
  return (removed && removed.unit ? removed : removed?.value) || null;
}

/** The tally as CSV: a row per day and person, a column per kind. */
function toCsv(result) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = ['Date', 'Uploaded by', ...result.kinds.map((k) => k.label), 'Total', 'Checked by', 'Checked on', 'Remarks'];
  const lines = result.rows.map((r) =>
    [
      r.date,
      r.uploaderName,
      ...result.kinds.map((k) => r.counts[k.code] || 0),
      r.total,
      r.check ? r.check.checkedByName || r.check.checkedBy : '',
      r.check ? new Date(r.check.checkedAt).toISOString().slice(0, 10) : '',
      r.check?.remarks || '',
    ]
      .map(esc)
      .join(',')
  );
  return [header.map(esc).join(','), ...lines].join('\n');
}

module.exports = { CHECKS, ensureIndexes, tally, check, uncheck, toCsv, rangeOf, canCheck };
