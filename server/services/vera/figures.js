// ---------------------------------------------------------------------------
// VERA's figures: the counts behind "how many…", "what is the total…",
// "break it down by province", for the person asking.
//
// VERA still cannot read a record. What it gets here is what the person's
// own dashboards already show them — totals and breakdowns, never a name,
// a serial or a document — computed by the very functions those dashboards
// use, under the same rules:
//
//   ERMS Records      recordService.dashboardStats, scoped to the person's
//                     provinces (all of them for the Developer)
//   Legal, Laboratory unitDocumentService.dashboard, for the units on the
//                     account — refused for any other unit
//   Central DB        establishments per province in the person's active
//                     year, scoped exactly as the register screen is
//   Document Portal   the room and its requests, for the units the person
//                     decides for (portalService.sourcesFor) — nobody else
//   Administration    accounts by role and how many are online, for the
//                     admin domain only
//   The application   how many screens this account can open, from VERA's
//                     own page list
//   Progress Tracker  the season's updating figures per province — the
//                     Developer only, as the tracker screen is; asked on
//                     that screen, every question gets them
//
// Each block is computed only when asked for, so a question that names the
// Laboratory does not count the register. Everything is cached briefly by
// the services underneath.
// ---------------------------------------------------------------------------

const { connectToMongo, getDb, collections } = require('../../config/db');
const { canAccessAllYears, ermsUnitsOf, authorizedProvinces, roleOf, ROLE_LABELS, domainsOf, isDeveloper } = require('../authorization');
const { userProvinceKeys, provinceFilter, PROVINCES } = require('../provinces');

const COUNT_RE =
  /\b(how\s+many|how\s+much|number\s+of|no\.?\s+of|total|totals|count|counts|counting|tally|statistics?|stats|figures?|breakdown|break\s+(it\s+)?down|per\s+(province|type|year|unit|kind)|by\s+(province|type|year|unit|kind)|percentage|ilan|ilang|bilang|kabuuan|summary\s+of)\b/i;

// The Progress Tracker's words: on its screen every question is about it.
const PROGRESS_PAGE = 'progress-tracker';
const PROGRESS_RE =
  /\b(progress|tracker|updating|season|baseline|highlight\w*|colou?r(ed|s|ing)?|legend|ecc\s*online|added|additions?|encod\w*|behind|pending|review\s+sheets?|main\s+sheets?)\b/i;

/** Whether the message asks for a count or a breakdown (on the tracker's screen, anything does). */
function wantsFigures(message, page = '') {
  return page === PROGRESS_PAGE || COUNT_RE.test(String(message || ''));
}

const fmt = (n) => new Intl.NumberFormat('en-PH').format(n ?? 0);
const provinceName = (key) => PROVINCES.find((p) => p.key === key)?.label || key || 'No province';
const list = (rows, label, n = 12) =>
  rows
    .filter((r) => r.count > 0)
    .slice(0, n)
    .map((r) => `${label(r)}: ${fmt(r.count)}`)
    .join('; ');

/** Which blocks the question is about; all of the person's when it names none. */
function topicsOf(message) {
  const m = String(message || '').toLowerCase();
  const named = {
    records: /\b(record|records|permit|permits|ecc|cnc|fsn|document library|records unit|scan(s|ned)?|uploads?)\b/.test(m),
    legal: /\b(legal|nov|notice of violation|docket|case|cases)\b/.test(m),
    laboratory: /\b(lab|laboratory|coc|sample|samples|test result)\b/.test(m),
    ucds: /\b(establishment|establishments|register|central db|ucds|firm|firms|monitoring)\b/.test(m),
    portal: /\b(portal|room|seat|seats|waiting\s+line|queue|requesters?)\b/.test(m),
    accounts: /\b(user|users|account|accounts|online|people|staff)\b/.test(m),
    screens: /\b(screen|screens|page|pages|menu|menus|link|links|module|modules|feature|features)\b/.test(m),
    progress: PROGRESS_RE.test(m),
    tables: /\b(tables?|my\s+table|rows?|columns?)\b/.test(m),
  };
  const any = Object.values(named).some(Boolean);
  return any ? named : { records: true, legal: true, laboratory: true, ucds: true, portal: false, accounts: false, screens: false, progress: false, tables: false };
}

async function progressBlock() {
  const tracker = require('../progressTracker');
  const { figuresLines } = require('../progressTracker/notes');
  return figuresLines(await tracker.overview(null));
}

async function recordsBlock(user) {
  const recordService = require('../../modules/erms/services/recordService');
  const scope = canAccessAllYears(user) ? null : userProvinceKeys(user);
  const s = await recordService.dashboardStats(scope);
  const thisYear = new Date().getFullYear();
  const permitLabel = (code) => (recordService.PERMIT_TYPES.find((t) => t.code === code) || {}).label || code || 'Unspecified';
  return [
    `ERMS Records (document library${scope ? `, your provinces: ${scope.map(provinceName).join(', ')}` : ', all provinces'}):`,
    `- Total records: ${fmt(s.total)}`,
    `- Linked to the Central DB register: ${fmt(s.linked)}; not linked: ${fmt(s.unlinked)}`,
    `- Needing review (values to check): ${fmt(s.flagged)}`,
    `- Approved in ${thisYear}: ${fmt(s.byYear?.find((y) => y._id === thisYear)?.count || 0)}`,
    s.byType?.length ? `- By permit type: ${list(s.byType.map((r) => ({ ...r, label: permitLabel(r._id) })), (r) => r.label)}` : '',
    s.byProvince?.length ? `- By province: ${list(s.byProvince, (r) => provinceName(r._id))}` : '',
    s.byProjectType?.length ? `- Most filed project types: ${list(s.byProjectType, (r) => r.label || r._id, 6)}` : '',
  ].filter(Boolean);
}

async function unitBlock(user, unit) {
  const units = require('../../modules/erms/services/unitDocumentService');
  const d = await units.dashboard(user, unit);
  const name = unit === 'legal' ? 'ERMS Legal Services' : 'ERMS Laboratory';
  return [
    `${name}:`,
    `- Total documents: ${fmt(d.total)}`,
    d.filedThisYear !== undefined ? `- Filed this year: ${fmt(d.filedThisYear)}` : '',
    d.uploadedLast30Days !== undefined ? `- Filed in the last 30 days: ${fmt(d.uploadedLast30Days)}` : '',
    d.withoutFile !== undefined ? `- Without a scan on file: ${fmt(d.withoutFile)}` : '',
    d.byType?.length ? `- By kind of document: ${list(d.byType, (r) => r.label || r.docType, 20)}` : '',
    d.byProvince?.length ? `- By province: ${list(d.byProvince, (r) => r.label || provinceName(r.province))}` : '',
  ].filter(Boolean);
}

async function ucdsBlock(user, activeYear) {
  const yearService = require('../yearService');
  const year = Number(activeYear) || new Date().getFullYear();
  const container = await yearService.getYear(year).catch(() => null);
  const keys = container ? authorizedProvinces(user, container) : userProvinceKeys(user);
  const filter = provinceFilter(keys);
  await connectToMongo();
  // A year loaded from its own RAW universe (2027 on) keeps its own register (services/yearScope.js registerOf).
  const register = container?.register && /^ucds-data-\d{4}$/.test(container.register) ? getDb().collection(container.register) : collections.ucds;
  const rows = await register
    .aggregate([
      ...(filter ? [{ $match: filter }] : []),
      // Spelled several ways in the data ("Nueva_Ecija", " tarlac"): one row each.
      { $group: { _id: { $toLower: { $trim: { input: { $ifNull: ['$province', ''] } } } }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ])
    .toArray();
  const total = rows.reduce((a, r) => a + r.count, 0);
  return [
    `Universe Central DB register (${year} data${keys?.length && keys.length < 7 ? `, your provinces` : ''}):`,
    `- Total establishments: ${fmt(total)}`,
    rows.length ? `- By province: ${list(rows, (r) => PROVINCES.find((p) => [p.key, p.value, p.label].some((n) => n.toLowerCase() === r._id))?.label || r._id || 'No province')}` : '',
  ].filter(Boolean);
}

/** The Planning Unit's own tables in the active year: their names, rows and columns. */
async function tablesBlock(activeYear) {
  const year = Number(activeYear) || new Date().getFullYear();
  await connectToMongo();
  const tables = await getDb()
    .collection(require('../menuItems').COLLECTION)
    .find({ year, kind: 'table' }, { projection: { label: 1, table: 1 } })
    .sort({ label: 1 })
    .limit(40)
    .toArray();
  if (!tables.length) return [`Planning Unit tables (${year}): none added yet.`];
  return [
    `Planning Unit tables (${year}): ${fmt(tables.length)}`,
    ...tables.map((t) => `- ${t.label}: ${fmt(t.table?.rowCount || 0)} row(s), ${fmt(t.table?.columns?.length || 0)} column(s)${(t.table?.columns || []).some((c) => c.type === 'formula') ? ', with formulas' : ''}`),
  ];
}

const UNIT_WORDS = { records: 'Records Unit', legal: 'Legal Services', laboratory: 'Laboratory' };

async function portalBlock(user) {
  const portal = require('../../modules/portal/services/portalService');
  const sources = portal.sourcesFor(user);
  if (!sources.length) return [];
  await connectToMongo();
  const col = getDb().collection(portal.COLLECTION);
  const mine = portal.inReach(sources);
  const [pending, approved, waiting, seated, today] = await Promise.all([
    col.countDocuments({ ...mine, status: 'pending' }),
    col.countDocuments({ ...mine, status: 'approved' }),
    col.countDocuments({ ...mine, status: 'waiting' }),
    col.countDocuments({ status: { $in: ['pending', 'approved'] } }),
    portal.todayFigures(mine),
  ]);
  const whose = sources.length === portal.SOURCES.length ? 'all units' : sources.map((x) => UNIT_WORDS[x] || x).join(', ');
  return [
    `Document Portal (requests for ${whose}):`,
    `- Room: ${fmt(seated)} of ${fmt(portal.CAPACITY)} seats taken (all units together)`,
    `- Awaiting a decision: ${fmt(pending)}; reading now (approved): ${fmt(approved)}; in the waiting line: ${fmt(waiting)}`,
    `- Today: ${fmt(today.requested)} requested, ${fmt(today.approved)} approved, ${fmt(today.declined)} declined, ${fmt(today.opened)} opened`,
  ];
}

async function accountsBlock() {
  await connectToMongo();
  const users = getDb().collection('users');
  const [total, byRole, online] = await Promise.all([
    users.countDocuments({}),
    users.aggregate([{ $group: { _id: '$permission', count: { $sum: 1 } } }, { $sort: { count: -1 } }]).toArray(),
    users.countDocuments({ status: 'online' }),
  ]);
  return [
    'Accounts:',
    `- Total accounts: ${fmt(total)}; online now: ${fmt(online)}`,
    `- By account type: ${list(byRole, (r) => ROLE_LABELS?.[r._id] || r._id || 'Unassigned')}`,
  ];
}

function screensBlock(pageLabels) {
  const labels = Object.values(pageLabels || {}).filter(Boolean);
  if (!labels.length) return [];
  return [`Screens this account can open: ${labels.length} (${labels.slice(0, 40).join(', ')})`];
}

/**
 * The figures block for a staff member's question, as plain lines VERA may
 * quote — or null when the question asks for no count, or nothing applies.
 * @param {object} user  the signed-in account (principalOf)
 */
async function figuresFor(message, user, { activeYear, pageLabels, page = '' } = {}) {
  if (!user || !wantsFigures(message, page)) return null;
  // On the tracker's screen the question is about the tracker, whatever else it names.
  const topics = page === PROGRESS_PAGE ? { progress: true } : topicsOf(message);
  const domains = domainsOf(user);
  const units = ermsUnitsOf(user);
  const jobs = [];
  // Records: for the Records Unit, and for an ERMS account with no unit of its
  // own (it reaches the Document Library) — not for Legal or Laboratory staff.
  const seesRecords = domains.includes('erms') && (units.includes('records') || !units.length);
  if (topics.records && seesRecords) jobs.push(recordsBlock(user));
  if (topics.legal && units.includes('legal')) jobs.push(unitBlock(user, 'legal'));
  if (topics.laboratory && units.includes('laboratory')) jobs.push(unitBlock(user, 'laboratory'));
  if (topics.ucds && domains.includes('ucds')) jobs.push(ucdsBlock(user, activeYear));
  if (topics.portal && domains.includes('erms')) jobs.push(portalBlock(user));
  if (topics.accounts && domains.includes('admin')) jobs.push(accountsBlock());
  if (topics.screens) jobs.push(Promise.resolve(screensBlock(pageLabels)));
  if (topics.progress && isDeveloper(user)) jobs.push(progressBlock());
  if (topics.tables && domains.includes('ucds')) jobs.push(tablesBlock(activeYear));
  if (!jobs.length) return null;
  // One block failing (a unit not configured, a slow read) does not cost the others.
  const blocks = (await Promise.allSettled(jobs)).filter((r) => r.status === 'fulfilled' && r.value?.length).map((r) => r.value.join('\n'));
  if (!blocks.length) return null;
  const asOf = new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });
  return { text: blocks.join('\n\n'), asOf, role: roleOf(user) };
}

module.exports = { wantsFigures, figuresFor, topicsOf };
