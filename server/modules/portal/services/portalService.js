const crypto = require('crypto');
const { ObjectId } = require('mongodb');
const { connectToMongo, getDb } = require('../../../config/db');
const { AppError, notFoundError, badRequest, forbidden, conflict } = require('../../../shared/middleware/errorHandler');
const { isRecordsUnit } = require('../../erms/services/accessRequestService');
const notifier = require('../../../services/notifier');
const hrpms = require('../../../services/hrpmsDirectory');
const terms = require('./portalTerms');
const settings = require('./portalSettings');
const availability = require('../../../services/ermsAvailability');
const { isDeveloper, hasDomain, DOMAINS, roleOf, ROLES, ermsUnitOf } = require('../../../services/authorization');

// ---------------------------------------------------------------------------
// The E-Universe Document Portal: a public room, outside the application,
// where anyone in the office asks for a scanned document and — once the
// Records Unit approves — reads it, there and only there.
//
// The rules, set by the office:
//
//   * A person enters the room by sending a request: their name, designation
//     (their section or unit — PISMU, AMTSS, EIA… suggested from HRPMS),
//     purpose and the time they need. They take a seat.
//     No E-Universe account is needed.
//   * The Records Unit approves (for a period, and for all pages or only some)
//     or declines, from inside E-Universe. Approved, the person reads the
//     document in the room until the period ends: no download, no print,
//     watermarked with who they are (services/portalDocument.js).
//   * A seat is held while the request waits for a decision and while the
//     approval runs. When it ends — expired, declined, revoked, or the person
//     leaves — the name leaves the room and everyone after it moves up.
//   * The room holds 50 names. The 51st waits in line, told how long until a
//     seat frees, and is seated automatically when one does.
//
// Who a request belongs to, without accounts: the browser that sent it. On
// asking, the browser is handed a ticket — 32 random bytes in an httpOnly
// cookie (page script cannot read it, so it cannot be copied out of the page
// and handed to someone else). Only its SHA-256 is kept here. Everything the
// requester does afterwards — see where they stand, open the document, leave
// — is answered for the browser that holds the ticket and nobody else.
// One active request per browser, and a few per address, so nobody holds
// several seats.
//
// This replaces sharing from ERMS: a document is no longer pushed to a named
// person from the record; people ask here, and the Records Unit decides.
//
// Seats are counted and filled under one in-process lock (`exclusive`), so
// two requests arriving together cannot both take the 50th seat. That holds
// for the single API process this application runs as; a second process
// would need the lock in the database instead.
// ---------------------------------------------------------------------------

const COLLECTION = 'portal-requests';
const RECORDS = 'erms-records';

const CAPACITY = 50;
// The line behind a full room; beyond this, asking is refused rather than
// queued for days.
const WAITING_CAP = 200;
// A request nobody decides gives its seat back after this long, so a quiet
// inbox cannot keep a seat from the people in line.
const PENDING_TTL_MS = 24 * 60 * 60 * 1000;
// Active requests from one network address: a shared PC may hold a few, a
// script may not fill the room.
const MAX_ACTIVE_PER_ADDRESS = 3;

// How long a person may ask for, and the Records Unit may grant, in minutes:
// these are offered as quick choices, and any whole number of minutes in the
// range is accepted. For a member of the public the page recommends three
// days at most (PUBLIC_RECOMMENDED_MAX_MINUTES) — longer asks draw questions.
const DURATIONS = [30, 60, 120, 240, 480, 1440, 4320];
const MIN_MINUTES = 15;
const MAX_MINUTES = 30 * 24 * 60;
const PUBLIC_RECOMMENDED_MAX_MINUTES = 3 * 24 * 60;
const validMinutes = (m) => Number.isInteger(m) && m >= MIN_MINUTES && m <= MAX_MINUTES;
// Once a document is first opened, the approval ends at most this long after.
const AFTER_FIRST_VIEW_MS = 24 * 60 * 60 * 1000;
// The most pages a "specific pages" approval may list.
const MAX_LISTED_PAGES = 500;

const SEATED = ['pending', 'approved'];
const ACTIVE = ['waiting', ...SEATED];
// waiting  in line behind a full room
// pending  seated, waiting for the Records Unit
// approved seated, reading until expiresAt
// declined | revoked | expired | lapsed (undecided too long) | left | cancelled (left the line)
const STATUSES = [...ACTIVE, 'declined', 'revoked', 'expired', 'lapsed', 'left', 'cancelled'];

// The ticket cookie, and how long a browser keeps it: the longest a request
// can live (a day in line, a day undecided, three days approved) and a margin.
const TICKET_COOKIE = 'eu_portal_ticket';
const TICKET_MAX_AGE_MS = 6 * 24 * 60 * 60 * 1000;

const collection = () => getDb().collection(COLLECTION);

async function ensureIndexes() {
  await connectToMongo();
  // The first version keyed requests on an E-Universe account.
  const existing = await collection().indexes().catch(() => []);
  for (const name of ['one_active_per_account', 'requester.username_1_createdAt_-1']) {
    if (existing.some((i) => i.name === name)) await collection().dropIndex(name).catch(() => {});
  }
  // One active request per browser, enforced by the database as well as here.
  await collection().createIndex({ ticketHash: 1 }, { unique: true, partialFilterExpression: { active: true }, name: 'one_active_per_ticket' });
  await collection().createIndex({ 'client.ip': 1, active: 1 });
  await collection().createIndex({ status: 1, enteredAt: 1 });
  await collection().createIndex({ status: 1, createdAt: 1 });
  await collection().createIndex({ createdAt: -1 });
}

// ── The lock ────────────────────────────────────────────────────────────────

let chain = Promise.resolve();
function exclusive(fn) {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

// ── Who ─────────────────────────────────────────────────────────────────────

/**
 * Who decides: the Records Unit's own staff, an Administrator with ERMS, and
 * the Developer — the same people told of a new request
 * (notifier.documentDeciders). Not Legal or Laboratory staff.
 */
const canDecide = (user) => sourcesFor(user).length > 0;

// Where a document comes from: the Records library, or a unit's own
// documents (Legal Services, Laboratory). Each is decided by the unit that
// keeps it.
const SOURCES = ['records', 'legal', 'laboratory'];
const UNIT_DOCS = 'erms-documents';

/**
 * Whose requests this account decides: the Developer and an Administrator
 * with ERMS, every unit's; a unit's own staff, their unit's (the Records
 * Unit — isRecordsUnit — the Records library's).
 */
function sourcesFor(user) {
  if (!user) return [];
  if (isDeveloper(user) || (roleOf(user) === ROLES.ADMIN && hasDomain(user, DOMAINS.ERMS))) return SOURCES;
  if (isRecordsUnit(user)) return ['records'];
  const unit = roleOf(user) === ROLES.RECORDS ? ermsUnitOf(user) : null;
  return unit && SOURCES.includes(unit) ? [unit] : [];
}
const sourceOf = (doc) => doc?.source || 'records';
const capital = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
const UNIT_NAME = { records: 'the Records Unit', legal: 'the Legal Services Unit', laboratory: 'the Laboratory' };

const account = (user) => ({
  userId: user?.userId ? String(user.userId) : null,
  username: user?.username || null,
  name: user?.name || null,
});

const TICKET_RE = /^[A-Za-z0-9_-]{43}$/;
const newTicket = () => crypto.randomBytes(32).toString('base64url');
const hashOf = (ticket) => (TICKET_RE.test(String(ticket || '')) ? crypto.createHash('sha256').update(ticket).digest('hex') : null);

/** The request is the one this ticket was issued for. */
const isOwner = (doc, ticket) => {
  const hash = hashOf(ticket);
  return Boolean(hash && doc?.ticketHash && doc.ticketHash === hash);
};

/** The active request a browser's ticket names, or null. */
async function activeFor(ticket) {
  const hash = hashOf(ticket);
  if (!hash) return null;
  await connectToMongo();
  return collection().findOne({ ticketHash: hash, active: true });
}

/** The ticket out of a Cookie header — for a socket, which has no cookie parser. */
function ticketFromCookieHeader(header) {
  const pair = String(header || '')
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${TICKET_COOKIE}=`));
  if (!pair) return null;
  try {
    return decodeURIComponent(pair.slice(TICKET_COOKIE.length + 1));
  } catch {
    return null;
  }
}

// ── Pages ───────────────────────────────────────────────────────────────────

/**
 * "1-3, 5, 8-10" → [1, 2, 3, 5, 8, 9, 10]. Refuses anything else, so what
 * the Records Unit typed is what is served.
 */
function parsePages(spec) {
  const text = String(spec || '').trim();
  if (!text) throw badRequest('List the pages to show, for example 1-3, 5.', 'PAGES_REQUIRED');
  const out = new Set();
  for (const part of text.split(',')) {
    const m = /^\s*(\d{1,5})\s*(?:-\s*(\d{1,5})\s*)?$/.exec(part);
    if (!m) throw badRequest(`“${part.trim()}” is not a page or a range of pages.`, 'PAGES_INVALID');
    const from = Number(m[1]);
    const to = m[2] ? Number(m[2]) : from;
    if (from < 1 || to < from) throw badRequest(`“${part.trim()}” is not a page or a range of pages.`, 'PAGES_INVALID');
    for (let p = from; p <= to; p += 1) {
      out.add(p);
      if (out.size > MAX_LISTED_PAGES) throw badRequest(`List at most ${MAX_LISTED_PAGES} pages, or allow every page.`, 'PAGES_TOO_MANY');
    }
  }
  return [...out].sort((a, b) => a - b);
}

/** The list back as the shortest spec: [1,2,3,5] → "1-3, 5". */
function pagesSpec(list) {
  const parts = [];
  for (let i = 0; i < list.length; i += 1) {
    let j = i;
    while (j + 1 < list.length && list[j + 1] === list[j] + 1) j += 1;
    parts.push(j > i ? `${list[i]}-${list[j]}` : String(list[i]));
    i = j;
  }
  return parts.join(', ');
}

// ── Views ───────────────────────────────────────────────────────────────────

/** Everything about a request, for the Records Unit. Never the ticket. */
function deskView(doc) {
  if (!doc) return null;
  const { _id, active, ticketHash, ...rest } = doc;
  return { id: String(_id), ...rest };
}

/**
 * The requester's own request, as their browser sees it: what they asked
 * for and where it stands. Not the file's name on the share, not the
 * network details kept for the audit.
 */
function mineView(doc) {
  if (!doc) return null;
  return {
    id: String(doc._id),
    // Which unit keeps it (and so decides): records, legal or laboratory.
    source: sourceOf(doc),
    serialNo: doc.serialNo,
    permitNumber: doc.permitNumber || null,
    proponentName: doc.proponentName,
    projectTitle: doc.projectTitle,
    permitLabel: doc.permitLabel,
    permitType: doc.permitType || null,
    requesterName: doc.requesterName,
    requesterType: doc.requesterType || null,
    designation: doc.designation,
    purpose: doc.purpose,
    desiredMinutes: doc.desiredMinutes,
    status: doc.status,
    createdAt: doc.createdAt,
    enteredAt: doc.enteredAt,
    pendingUntil: doc.pendingUntil,
    decidedAt: doc.decidedAt,
    decisionNote: doc.decisionNote,
    grantedMinutes: doc.grantedMinutes,
    expiresAt: doc.expiresAt,
    pages: doc.pages,
    endedAt: doc.endedAt,
    // Opening the document starts a 24-hour limit (AFTER_FIRST_VIEW_MS).
    firstViewedAt: doc.firstViewedAt || null,
    // Whether this person may take the file — the Developer's to allow (viewer tools).
    downloadAllowed: doc.downloadAllowed === true,
  };
}

/**
 * Who sees who is in the room. Other visitors see seats and clocks, never a
 * name or a designation; the people who keep the documents — anyone with
 * ERMS, and the Developer — see who is waiting for what, here as on their
 * desk. Decided from the E-Universe sign-in the request arrives with, if any.
 */
const seesNames = (viewer) => Boolean(viewer) && (isDeveloper(viewer) || hasDomain(viewer, DOMAINS.ERMS));

/**
 * What the room shows of a person: an EMB Region III employee's section or
 * unit; for anyone else only what kind of requester they are — a citizen's
 * school or occupation is the Records Unit's to know, not the room's
 * (Data Privacy Act: proportionality).
 */
const roomDesignation = (doc) =>
  doc.requesterType && terms.isPublicRequester(doc.requesterType) ? terms.typeOf(doc.requesterType).label : doc.designation;

/**
 * A seat in the room: its clock, and — to the person in it, and to ERMS
 * staff — the name and designation. Never the document or the purpose.
 */
function seatView(doc, ticket, index, named) {
  const mine = isOwner(doc, ticket);
  return {
    position: index + 1,
    name: named || mine ? doc.requesterName : null,
    designation: named || mine ? roomDesignation(doc) : null,
    status: doc.status,
    enteredAt: doc.enteredAt,
    expiresAt: doc.status === 'approved' ? doc.expiresAt : null,
    holdUntil: doc.status === 'pending' ? doc.pendingUntil : null,
    mine,
  };
}

/**
 * When each seat is expected to free, soonest first: an approval at its
 * expiry; a request still waiting for a decision as if approved now for the
 * time it asked (it may be declined sooner, or held to its 24-hour limit).
 */
function releaseTimes(seated, now = new Date()) {
  return seated
    .map((d) =>
      d.status === 'approved'
        ? d.expiresAt
        : new Date(Math.min(d.pendingUntil.getTime(), now.getTime() + d.desiredMinutes * 60000))
    )
    .sort((a, b) => a - b);
}

// ── Notices ─────────────────────────────────────────────────────────────────

const DESK_URL = '/universe/erms/portal-requests';
const WATCHERS = 'portal-watchers';
const ticketRoom = (id) => `portal-ticket:${id}`;
/**
 * Who hears of a request: the deciders of the unit that keeps the document
 * (sourcesFor) — the Records Unit's are notifier.documentDeciders.
 */
async function deciders(source = 'records') {
  if (source === 'records') return notifier.documentDeciders(null);
  await connectToMongo();
  const rows = await getDb()
    .collection('users')
    .find({ permission: { $in: [ROLES.DEVELOPER, ROLES.ADMIN, ROLES.RECORDS] } }, { projection: { username: 1, permission: 1, domains: 1, ermsUnit: 1 } })
    .toArray();
  return rows.filter((u) => sourcesFor(u).includes(source)).map((u) => u.username);
}

// Every open room — the public page and the Records Unit's desk — looks
// again. The ping carries no data; each asks the API for what it may see.
const roomChanged = () => notifier.broadcast('portal:room', { at: new Date().toISOString() }, [WATCHERS]);

/** The requester's own browser, on the portal page: their request changed. */
function tellRequester(doc, notice) {
  notifier.emitTo(ticketRoom(doc._id), 'portal:mine', { ...notice, status: notice.status || doc.status, at: new Date().toISOString() });
}

// How a document is named to people: its ECC reference number and project title.
const docLabel = (doc) => [doc.permitNumber || doc.serialNo, doc.projectTitle].filter(Boolean).join(' — ');
const minutesLabel = (m) => (m % 1440 === 0 ? `${m / 1440} day${m === 1440 ? '' : 's'}` : m % 60 === 0 ? `${m / 60} hour${m === 60 ? '' : 's'}` : `${m} minutes`);

function tellDeciders(doc) {
  notifier.notifyLater(() => deciders(sourceOf(doc)), {
    kind: 'portal-request',
    tag: `portal-${doc._id}`,
    title: 'Document Portal request',
    body: `${doc.requesterName} (${doc.designation}) asks to view ${docLabel(doc)} for ${minutesLabel(doc.desiredMinutes)}. “${String(doc.purpose).slice(0, 120)}”`,
    url: DESK_URL,
  });
}

/**
 * The portal page's socket says it is watching the room; with a ticket in
 * its cookies, it also hears about its own request. Registered with the
 * notifier, which runs it for every connection.
 */
notifier.onSocket((socket) => {
  socket.on('portal:watch', async (payload, ack) => {
    try {
      socket.join(WATCHERS);
      const mine = await activeFor(ticketFromCookieHeader(socket.handshake.headers.cookie));
      if (mine) socket.join(ticketRoom(mine._id));
      if (typeof ack === 'function') ack({ ok: true, mine: Boolean(mine) });
    } catch {
      if (typeof ack === 'function') ack({ ok: false });
    }
  });
});

// ── How a request ended ─────────────────────────────────────────────────────
//
// Every ending is kept on the request (`ended`: how, by whom, the note) so
// the Records Unit's history says what happened, and the endings nobody
// pressed a button for — time up, never decided — are written to the audit
// trail too (app-logs), so the ERMS log history has them beside the ones
// staff caused.

const SYSTEM = Object.freeze({ userId: null, username: null, name: 'E-Universe (automatic)' });
const END = Object.freeze({
  timeUp: 'The approved time ran out',
  timeUpAfterView: 'Ended 24 hours after the document was first opened',
  lapsed: 'Not decided within a day',
  declined: 'Declined by the unit that keeps the document',
  revoked: 'Access ended early by the unit that keeps the document',
  left: 'The requester left the room',
  cancelled: 'The requester left the waiting line',
});

/** An automatic ending, in the audit trail (the ones staff cause are written by the controller). */
function logEnded(doc, status, how) {
  getDb()
    .collection('app-logs')
    .insertOne({
      userId: null,
      username: null,
      domain: 'erms',
      method: null,
      path: null,
      actionType: 'portal-ended',
      actionLabel: `Document Portal: ${how.toLowerCase()}`,
      targetCollection: COLLECTION,
      documentId: String(doc._id),
      changes: { serialNo: doc.serialNo, requesterName: doc.requesterName, status, how, views: doc.views || 0, firstViewedAt: doc.firstViewedAt || null },
      requestData: null,
      timestamp: new Date(),
    })
    .catch((err) => console.warn('[portal] could not log an ending:', err.message));
}

// ── Keeping the room ────────────────────────────────────────────────────────

/**
 * End what has run out and seat the people in line. Runs under the lock;
 * call `sweep()` from outside it.
 */
async function sweepNow(now = new Date()) {
  await connectToMongo();
  let changed = false;
  const { closedOnWeekends } = await settings.read();

  // Approvals that ran out.
  const expired = await collection().find({ status: 'approved', expiresAt: { $lte: now } }).toArray();
  for (const doc of expired) {
    const ending = doc.viewCapApplied ? END.timeUpAfterView : END.timeUp;
    const res = await collection().updateOne(
      { _id: doc._id, status: 'approved' },
      { $set: { status: 'expired', endedAt: doc.expiresAt, ended: { how: ending, by: SYSTEM, note: null } }, $unset: { active: '' } }
    );
    if (!res.modifiedCount) continue;
    changed = true;
    logEnded(doc, 'expired', ending);
    tellRequester(doc, { status: 'expired', title: 'Your access has ended', body: `The time approved for ${docLabel(doc)} is over. Send a new request if you need it again.` });
  }

  // Requests nobody decided in time.
  const lapsed = await collection().find({ status: 'pending', pendingUntil: { $lte: now } }).toArray();
  for (const doc of lapsed) {
    const res = await collection().updateOne(
      { _id: doc._id, status: 'pending' },
      { $set: { status: 'lapsed', endedAt: now, ended: { how: END.lapsed, by: SYSTEM, note: null } }, $unset: { active: '' } }
    );
    if (!res.modifiedCount) continue;
    changed = true;
    logEnded(doc, 'lapsed', END.lapsed);
    tellRequester(doc, { status: 'lapsed', title: 'Your request lapsed', body: `${capital(UNIT_NAME[sourceOf(doc)])} did not decide on ${docLabel(doc)} within a day, so your seat went to the next person. You may ask again.` });
  }

  // Seat the line, oldest first, while there is room.
  let free = CAPACITY - (await collection().countDocuments({ status: { $in: SEATED } }));
  while (free > 0) {
    const seatedAt = new Date();
    const res = await collection().findOneAndUpdate(
      { status: 'waiting' },
      { $set: { status: 'pending', enteredAt: seatedAt, pendingUntil: settings.addOpenTime(seatedAt, PENDING_TTL_MS, closedOnWeekends) } },
      { sort: { createdAt: 1 }, returnDocument: 'after' }
    );
    const doc = res?.value ?? res;
    if (!doc || !doc._id) break;
    free -= 1;
    changed = true;
    tellRequester(doc, { status: 'pending', title: 'You are in the room', body: `A seat opened. Your request for ${docLabel(doc)} is now with ${UNIT_NAME[sourceOf(doc)]}.` });
    tellDeciders(doc);
  }

  if (changed) roomChanged();
  return changed;
}

let lastSweep = 0;
const sweep = () => exclusive(() => {
  lastSweep = Date.now();
  return sweepNow();
});
/** A sweep before a read, unless one ran in the last few seconds. */
const freshen = () => (Date.now() - lastSweep > 5000 ? sweep() : Promise.resolve(false));

let timer = null;
/** The clock that ends approvals on time with nobody looking. Called once from server.js. */
function start(intervalMs = 15000) {
  if (timer) return;
  timer = setInterval(() => sweep().catch((err) => console.warn('[portal] sweep:', err.message)), intervalMs);
  timer.unref?.();
}

// ── Finding a document ──────────────────────────────────────────────────────

/**
 * Documents in the library that have a scan, matched on serial, permit
 * number, proponent or project title. Only what identifies the document:
 * no file name, no location on the share.
 */
async function search(q, { limit = 30 } = {}) {
  await connectToMongo();
  const text = String(q || '').trim();
  if (text.length < 2) return [];
  const rx = new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const max = Math.min(Number(limit) || 30, 40);
  // A unit the Developer has taken down is not searched (ermsAvailability).
  const down = await availability.downUnits();
  const open = ['legal', 'laboratory'].filter((u) => !down.includes(u));
  const [records, unitDocs] = await Promise.all([
    down.includes('records') ? [] : getDb()
      .collection(RECORDS)
      .find(
        { 'document.fileName': { $nin: [null, ''] }, $or: [{ serialNo: rx }, { 'permit.number': rx }, { proponentName: rx }, { projectTitle: rx }] },
        { projection: RECORD_PROJECTION }
      )
      .sort({ 'document.uploadedAt': -1 })
      .limit(max)
      .toArray(),
    // Legal Services and Laboratory documents with a scan, by docket or
    // reference number, company or subject, or serial.
    getDb()
      .collection(UNIT_DOCS)
      .find(
        {
          unit: { $in: open },
          'document.fileName': { $nin: [null, ''] },
          $or: [{ serialNo: rx }, { title: rx }, { 'fields.docketNo': rx }, { 'fields.referenceNo': rx }, { 'fields.companyName': rx }, { 'fields.firmName': rx }, { 'fields.subject': rx }],
        },
        { projection: UNIT_PROJECTION }
      )
      .sort({ createdAt: -1 })
      .limit(max)
      .toArray(),
  ]);
  return [...records.map((r) => asPortalDoc('records', r)), ...unitDocs.map((d) => asPortalDoc(d.unit, d))].slice(0, max).map(searchView);
}

const RECORD_PROJECTION = {
  serialNo: 1, proponentName: 1, projectTitle: 1, 'permit.type': 1, 'permit.label': 1, 'permit.number': 1,
  'location.province': 1, 'location.provinceLabel': 1, isAttachment: 1, document: 1,
};
const UNIT_PROJECTION = { unit: 1, serialNo: 1, docType: 1, docTypeLabel: 1, title: 1, fields: 1, province: 1, provinceLabel: 1, document: 1 };

/**
 * A document in the portal's one shape, wherever it is kept: a Records
 * library record, or a Legal Services / Laboratory document. `reference` is
 * how it is named — the ECC (permit) reference number, a docket or a
 * reference number — and `title` the project, company or subject.
 */
function asPortalDoc(source, d) {
  if (source === 'records') {
    return {
      source: 'records',
      serialNo: d.serialNo,
      reference: d.permit?.number || null,
      title: d.projectTitle || null,
      proponentName: d.proponentName || null,
      permitType: d.permit?.type || null,
      permitLabel: d.permit?.label || d.permit?.type || null,
      province: d.location?.provinceLabel || d.location?.province || null,
      isAttachment: d.isAttachment === true,
      document: d.document || null,
    };
  }
  const f = d.fields || {};
  return {
    source,
    serialNo: d.serialNo,
    reference: f.docketNo || f.referenceNo || f.orNumber || f.pabCaseNo || null,
    title: d.title || f.companyName || f.firmName || f.subject || null,
    proponentName: f.companyName || f.firmName || null,
    permitType: `${source}:${d.docType}`,
    permitLabel: d.docTypeLabel || d.docType || null,
    province: d.provinceLabel || d.province || null,
    isAttachment: false,
    document: d.document || null,
  };
}

/** Why the room is closed, in words, with when it opens. */
function closedMessage(state) {
  const when = state.opensAt ? state.opensAt.toLocaleString('en-PH', { timeZone: 'Asia/Manila', weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'soon';
  return `The Document Portal is closed on weekends. It opens again on ${when}.`;
}

/** What a search result says — never where the file is. */
const searchView = (p) => ({
  source: p.source,
  serialNo: p.serialNo,
  proponentName: p.proponentName,
  projectTitle: p.title,
  permit: { type: p.permitType, label: p.permitLabel, number: p.reference },
  province: p.province,
  isAttachment: p.isAttachment,
});

/**
 * One document by where it is kept and its serial, in the portal's shape;
 * null when there is none — or while its unit is down for maintenance, so it
 * can be neither asked for nor read (ermsAvailability).
 */
async function findDocument(source, serialNo) {
  await connectToMongo();
  if (await availability.isDown(source || 'records')) return null;
  if (source === 'records') {
    const r = await getDb().collection(RECORDS).findOne({ serialNo }, { projection: RECORD_PROJECTION });
    return r ? asPortalDoc('records', r) : null;
  }
  if (!SOURCES.includes(source)) return null;
  const d = await getDb().collection(UNIT_DOCS).findOne({ unit: source, serialNo }, { projection: UNIT_PROJECTION });
  return d ? asPortalDoc(source, d) : null;
}

// ── The room ────────────────────────────────────────────────────────────────

/**
 * The room as this visitor sees it; `mine` is the request this browser's
 * ticket names; `viewer` the E-Universe sign-in the page arrived with, if
 * any (ERMS staff and the Developer see names — seesNames).
 */
async function room(ticket, viewer = null) {
  const named = seesNames(viewer);
  await freshen();
  await connectToMongo();
  const now = new Date();
  const [seated, waiting, mine] = await Promise.all([
    collection().find({ status: { $in: SEATED } }).sort({ enteredAt: 1 }).toArray(),
    collection().find({ status: 'waiting' }).sort({ createdAt: 1 }).limit(WAITING_CAP).toArray(),
    activeFor(ticket),
  ]);
  const release = releaseTimes(seated, now);
  const full = seated.length >= CAPACITY;
  return {
    capacity: CAPACITY,
    seated: seated.length,
    full,
    // When the next seat is expected to free, for a full room.
    nextSeatAt: full ? release[0] || null : null,
    seats: seated.map((d, i) => seatView(d, ticket, i, named)),
    waiting: waiting.map((d, i) => {
      const own = isOwner(d, ticket);
      return {
        position: i + 1,
        name: named || own ? d.requesterName : null,
        designation: named || own ? roomDesignation(d) : null,
        since: d.createdAt,
        // The i-th seat to free is this person's, when the room is full.
        etaAt: release[i] || null,
        mine: own,
      };
    }),
    // Whether this visitor is shown who is who (ERMS staff, the Developer).
    named,
    mine: mineView(mine),
    // Suggestions for the Designation box, from HRPMS (services/hrpmsDirectory).
    designations: await hrpms.designations(),
    durations: DURATIONS,
    minMinutes: MIN_MINUTES,
    maxMinutes: MAX_MINUTES,
    publicRecommendedMaxMinutes: PUBLIC_RECOMMENDED_MAX_MINUTES,
    // Open, or closed for the weekend until `opensAt` (services/portalSettings).
    roomState: await settings.roomState(now),
    now,
  };
}

/** The latest request this browser's ticket names, as stored — for the chat (services/portalChat). */
async function latestFor(ticket) {
  const hash = hashOf(ticket);
  if (!hash) return null;
  await connectToMongo();
  return collection().findOne({ ticketHash: hash }, { sort: { createdAt: -1 } });
}

/** The latest request this browser's ticket names, active or not — to say how the last one ended. */
async function lastFor(ticket) {
  const hash = hashOf(ticket);
  if (!hash) return null;
  await connectToMongo();
  return mineView(await collection().findOne({ ticketHash: hash }, { sort: { createdAt: -1 } }));
}

// ── Asking ──────────────────────────────────────────────────────────────────

/**
 * Enter the room. `client` is the requesting browser: the ticket it already
 * holds (if any), and its address and user agent for the audit.
 * Returns the request and a new ticket for the browser to keep.
 */
async function create(input, client = {}) {
  const requesterName = String(input.requesterName || '').trim().replace(/\s+/g, ' ').slice(0, 120);
  const designation = String(input.designation || '').trim().replace(/\s+/g, ' ').slice(0, 120);
  const purpose = String(input.purpose || '').trim().slice(0, 1000);
  const desiredMinutes = Number(input.desiredMinutes);
  if (requesterName.length < 2) throw badRequest('Enter the requester’s name.', 'NAME_REQUIRED');
  const requesterType = String(input.requesterType || '');
  const kind = terms.typeOf(requesterType);
  if (!kind) throw badRequest('Say whether you are an EMB Region III employee, a private citizen, a student or a government employee of another agency.', 'REQUESTER_TYPE_REQUIRED');
  if (designation.length < 2) throw badRequest(`Enter your ${kind.designationLabel.toLowerCase()}.`, 'DESIGNATION_REQUIRED');

  // A member of the public asks under Freedom of Information (EO 2, s. 2016):
  // contact details and valid proof of identification. Everyone accepts the
  // Data Privacy terms; the public, the FOI terms too (services/portalTerms).
  const publicRequester = kind.public;
  const contact = String(input.contact || '').trim().slice(0, 120);
  const idType = String(input.idType || '').trim();
  if (publicRequester) {
    const email = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contact);
    const mobile = /^(\+?63|0)9\d{2}[\s-]?\d{3}[\s-]?\d{4}$/.test(contact);
    if (!email && !mobile) throw badRequest('Give an email address or a mobile number (09XX XXX XXXX) where the office can reach you.', 'CONTACT_REQUIRED');
    if (!terms.ID_TYPES.includes(idType)) throw badRequest('Choose the valid ID you will present if the office asks.', 'ID_TYPE_REQUIRED');
  }
  if (input.termsVersion !== terms.TERMS_VERSION) {
    throw conflict('The terms on this page have changed. Reload the page, read them, and accept them again.', 'TERMS_CHANGED');
  }
  const accepted = { foi: input.acceptFoi === true, privacy: input.acceptPrivacy === true };
  const missing = terms.termsFor(requesterType).filter((t) => !accepted[t]);
  if (missing.length) {
    throw badRequest(missing.includes('foi') ? 'Read and accept the Freedom of Information and Data Privacy terms to send your request.' : 'Read and accept the Data Privacy terms to send your request.', 'TERMS_NOT_ACCEPTED');
  }
  if (purpose.length < 5) throw badRequest('Say what the document is needed for.', 'PURPOSE_REQUIRED');
  if (!validMinutes(desiredMinutes)) throw badRequest('Ask for between 15 minutes and 30 days.', 'DURATION_INVALID');

  // The room is closed on weekends when the Developer says so (services/portalSettings).
  const state = await settings.roomState();
  if (!state.open) throw new AppError(closedMessage(state), 423, 'ROOM_CLOSED');

  const source = SOURCES.includes(input.source) ? input.source : 'records';
  const record = await findDocument(source, String(input.serialNo || ''));
  if (!record) throw notFoundError('No document with that serial number.', 'RECORD_NOT_FOUND');
  if (!record.document?.fileName) throw badRequest('This document has no scan to view.', 'NO_DOCUMENT');
  const { closedOnWeekends } = await settings.read();

  const ip = String(client.ip || '').slice(0, 64) || null;
  return exclusive(async () => {
    await sweepNow();
    if (await activeFor(client.ticket)) {
      throw conflict('This browser already has a request in the Document Portal. Leave it first to ask for another document.', 'ALREADY_IN_ROOM');
    }
    if (ip && (await collection().countDocuments({ 'client.ip': ip, active: true })) >= MAX_ACTIVE_PER_ADDRESS) {
      throw new AppError(`This computer already has ${MAX_ACTIVE_PER_ADDRESS} requests in the Document Portal. Wait for one to end, or leave one.`, 429, 'TOO_MANY_FROM_ADDRESS');
    }
    const [seatedCount, waitingCount] = await Promise.all([
      collection().countDocuments({ status: { $in: SEATED } }),
      collection().countDocuments({ status: 'waiting' }),
    ]);
    const seat = seatedCount < CAPACITY && waitingCount === 0;
    if (!seat && waitingCount >= WAITING_CAP) {
      throw new AppError('The room and its waiting line are full. Please try again later.', 429, 'LINE_FULL');
    }
    const ticket = newTicket();
    const now = new Date();
    const doc = {
      // Where it is kept — the Records library, Legal Services or the Laboratory — and so who decides.
      source,
      serialNo: record.serialNo,
      // The ECC (permit), docket or reference number: with the title, how the document is named everywhere.
      permitNumber: record.reference,
      proponentName: record.proponentName,
      projectTitle: record.title,
      permitLabel: record.permitLabel,
      // The kind of document — an ERMS permit type, or "legal:nov", "laboratory:ltr"… — for its category and colour.
      permitType: record.permitType,
      province: record.province,
      fileName: record.document.fileName,
      requesterName,
      // emb-employee | government | student | citizen (services/portalTerms)
      requesterType,
      designation,
      // A member of the public's contact and the kind of ID they will show (EO 2); not kept for employees.
      contact: publicRequester ? contact : null,
      idType: publicRequester ? idType : null,
      purpose,
      desiredMinutes,
      // What they accepted, and when — the version names the exact wording.
      consents: {
        version: terms.TERMS_VERSION,
        acceptedAt: now,
        ...(publicRequester ? { foi: true } : {}),
        privacy: true,
      },
      ticketHash: hashOf(ticket),
      // For the audit and the watermark: where the request came from.
      client: { ip, userAgent: String(client.userAgent || '').slice(0, 300) || null },
      status: seat ? 'pending' : 'waiting',
      active: true,
      createdAt: now,
      enteredAt: seat ? now : null,
      // A day to decide — weekdays only when the room closes on weekends.
      pendingUntil: seat ? settings.addOpenTime(now, PENDING_TTL_MS, closedOnWeekends) : null,
      decidedBy: null,
      decidedAt: null,
      decisionNote: null,
      grantedMinutes: null,
      expiresAt: null,
      pages: null,
      endedAt: null,
      views: 0,
      lastViewedAt: null,
    };
    const { insertedId } = await collection().insertOne(doc);
    const saved = { ...doc, _id: insertedId };
    if (seat) tellDeciders(saved);
    roomChanged();
    return { request: mineView(saved), ticket, position: seat ? null : waitingCount + 1, audit: deskView(saved) };
  });
}

// ── Deciding (the Records Unit, inside E-Universe) ──────────────────────────

const byId = (id) => {
  if (!ObjectId.isValid(String(id))) throw notFoundError('Request not found.', 'REQUEST_NOT_FOUND');
  return new ObjectId(String(id));
};

/** The units this account decides for; refused when none. */
const requireDecider = (user) => {
  const sources = sourcesFor(user);
  if (!sources.length) throw forbidden('Only the unit that keeps a document decides Document Portal requests for it.', 'RECORDS_UNIT_ONLY');
  return sources;
};
// A request is in reach of a decider when its document is kept by one of their units.
const inReach = (sources) => ({ $or: [{ source: { $in: sources } }, ...(sources.includes('records') ? [{ source: { $exists: false } }] : [])] });

/**
 * Approve (for a period, all pages or a list) or decline. Records Unit only.
 * The period runs from now, computed here.
 */
async function decide(id, user, { decision, minutes, allPages, pages, note } = {}) {
  const sources = requireDecider(user);
  if (!['approved', 'declined'].includes(decision)) throw badRequest('Decision must be approved or declined.');
  const _id = byId(id);
  let pageRule = null;
  let granted = null;
  if (decision === 'approved') {
    granted = Number(minutes);
    if (!validMinutes(granted)) throw badRequest('Grant between 15 minutes and 30 days.', 'DURATION_INVALID');
    pageRule = allPages === false || allPages === 'false' ? { all: false, list: parsePages(pages) } : { all: true, list: null };
    if (!pageRule.all) pageRule.spec = pagesSpec(pageRule.list);
  }

  return exclusive(async () => {
    await connectToMongo();
    const now = new Date();
    const set = {
      status: decision,
      decidedBy: account(user),
      decidedAt: now,
      decisionNote: String(note || '').trim().slice(0, 500) || null,
    };
    const update = { $set: set };
    if (decision === 'approved') {
      Object.assign(set, { grantedMinutes: granted, expiresAt: new Date(now.getTime() + granted * 60000), pages: pageRule });
    } else {
      set.endedAt = now;
      set.ended = { how: END.declined, by: account(user), note: set.decisionNote };
      update.$unset = { active: '' };
    }
    const res = await collection().findOneAndUpdate({ _id, status: 'pending', ...inReach(sources) }, update, { returnDocument: 'after' });
    const doc = res?.value ?? res;
    if (!doc || !doc._id) {
      if (!(await collection().countDocuments({ _id, ...inReach(sources) }))) throw notFoundError('Request not found.', 'REQUEST_NOT_FOUND');
      throw conflict('This request is no longer waiting for a decision.', 'NOT_PENDING');
    }

    tellRequester(doc, {
      title: decision === 'approved' ? 'Your request was approved' : 'Your request was declined',
      body:
        decision === 'approved'
          ? `You may open ${docLabel(doc)} here for ${minutesLabel(granted)}${pageRule.all ? '' : `, pages ${pageRule.spec}`}.`
          : `Your request for ${docLabel(doc)} was declined.${set.decisionNote ? ` “${set.decisionNote.slice(0, 120)}”` : ''}`,
    });
    // A decline frees a seat for the line.
    if (decision === 'declined') await sweepNow();
    roomChanged();
    return deskView(doc);
  });
}

/** End someone's seat early — a pending request or a running approval. Records Unit only. */
async function revoke(id, user, { note } = {}) {
  const sources = requireDecider(user);
  const _id = byId(id);
  return exclusive(async () => {
    const now = new Date();
    const why = String(note || '').trim().slice(0, 500) || null;
    const res = await collection().findOneAndUpdate(
      { _id, status: { $in: SEATED }, ...inReach(sources) },
      {
        $set: { status: 'revoked', endedAt: now, decidedBy: account(user), decidedAt: now, decisionNote: why, ended: { how: END.revoked, by: account(user), note: why } },
        $unset: { active: '' },
      },
      { returnDocument: 'after' }
    );
    const doc = res?.value ?? res;
    if (!doc || !doc._id) {
      if (!(await collection().countDocuments({ _id, ...inReach(sources) }))) throw notFoundError('Request not found.', 'REQUEST_NOT_FOUND');
      throw conflict('This request is not in the room.', 'NOT_SEATED');
    }
    tellRequester(doc, {
      title: 'Your access was withdrawn',
      body: `${capital(UNIT_NAME[sourceOf(doc)])} ended your access to ${docLabel(doc)}.${doc.decisionNote ? ` “${doc.decisionNote.slice(0, 120)}”` : ''}`,
    });
    await sweepNow();
    roomChanged();
    return deskView(doc);
  });
}

/** One request, for the Records Unit. */
async function get(id, user) {
  const sources = requireDecider(user);
  const _id = byId(id);
  await connectToMongo();
  const doc = await collection().findOne({ _id, ...inReach(sources) });
  if (!doc) throw notFoundError('Request not found.', 'REQUEST_NOT_FOUND');
  return doc;
}

/**
 * The desk's filters, as one query: words (requester, ECC number, project,
 * proponent, serial, designation, contact), the kind of requester, the kind
 * of document (the unit that keeps it, and its type), and when the request
 * was made. `outcome` narrows the history.
 */
function deskFilter({ q, requesterType, permitTypes, source, from, to } = {}) {
  const filter = {};
  const text = String(q || '').trim();
  if (text) {
    const rx = new RegExp(text.slice(0, 120).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = ['requesterName', 'permitNumber', 'projectTitle', 'proponentName', 'serialNo', 'designation', 'contact'].map((f) => ({ [f]: rx }));
  }
  if (requesterType && terms.TYPE_VALUES.includes(requesterType)) filter.requesterType = requesterType;
  const types = String(permitTypes || '')
    .split(',')
    .map((t) => t.trim())
    .filter((t) => /^[a-z-]{2,30}$/.test(t));
  // A Records request from before units were kept has no source: it is a Records one.
  const recordsOnly = { $nin: SOURCES.filter((x) => x !== 'records') };
  if (SOURCES.includes(source)) filter.source = source === 'records' ? recordsOnly : source;
  if (types.length) {
    filter.permitType = types.includes('other') ? { $nin: KNOWN_TYPES.filter((t) => !types.includes(t)) } : { $in: types };
    // "Other" is the Records library's other kinds — not Legal or Laboratory documents.
    if (types.includes('other')) filter.source = recordsOnly;
  }
  const created = {};
  if (from && !Number.isNaN(Date.parse(from))) created.$gte = new Date(from);
  if (to && !Number.isNaN(Date.parse(to))) created.$lte = new Date(to);
  if (Object.keys(created).length) filter.createdAt = created;
  return filter;
}
// Document kinds with a category of their own on the page (front-end docTypes.js); the rest are "other".
const KNOWN_TYPES = ['ecc-original', 'ecc-amended', 'cnc', 'pto', 'dp', 'hw-generator'];

/** The Records Unit's desk: what waits for a decision, what is running, and what ended — filtered. */
async function desk(user, { limit = 100, outcome, ...filters } = {}) {
  const sources = requireDecider(user);
  await freshen();
  // Only the requests for documents this account's units keep.
  const base = { $and: [deskFilter(filters), inReach(sources)] };
  const ended = outcome && STATUSES.includes(outcome) && !ACTIVE.includes(outcome) ? outcome : { $nin: ACTIVE };
  const [pending, approved, waiting, history] = await Promise.all([
    collection().find({ ...base, status: 'pending' }).sort({ enteredAt: 1 }).toArray(),
    collection().find({ ...base, status: 'approved' }).sort({ expiresAt: 1 }).toArray(),
    collection().find({ ...base, status: 'waiting' }).sort({ createdAt: 1 }).limit(WAITING_CAP).toArray(),
    collection().find({ ...base, status: ended }).sort({ endedAt: -1, createdAt: -1 }).limit(Math.min(Number(limit) || 100, 500)).toArray(),
  ]);
  return {
    pending: pending.map(deskView),
    approved: approved.map(deskView),
    waiting: waiting.map(deskView),
    history: history.map(deskView),
    durations: DURATIONS,
    capacity: CAPACITY,
    minMinutes: MIN_MINUTES,
    maxMinutes: MAX_MINUTES,
    // For one unit when the desk is asked for one (a unit's own dashboard).
    today: await todayFigures(SOURCES.includes(filters.source) ? { $and: [inReach(sources), { source: deskFilter({ source: filters.source }).source }] } : inReach(sources)),
    // The units whose requests this account decides.
    sources,
    // Whether this account may change an approved seat's access, and the room's settings (the Developer only).
    canAdjustAccess: isDeveloper(user),
    settings: isDeveloper(user) ? await settings.read() : null,
    roomState: await settings.roomState(),
  };
}

/** Midnight today in the office's time zone (UTC+8, no daylight saving). */
function startOfToday(now = new Date()) {
  const manila = new Date(now.getTime() + 8 * 3600000);
  return new Date(Date.UTC(manila.getUTCFullYear(), manila.getUTCMonth(), manila.getUTCDate()) - 8 * 3600000);
}

/** The day's figures for the ERMS dashboard: asked, approved, declined, opened. */
async function todayFigures(scope = {}) {
  const since = startOfToday();
  const [requested, approved, declined, opened] = await Promise.all([
    collection().countDocuments({ ...scope, createdAt: { $gte: since } }),
    collection().countDocuments({ ...scope, decidedAt: { $gte: since }, grantedMinutes: { $ne: null } }),
    collection().countDocuments({ ...scope, decidedAt: { $gte: since }, status: 'declined' }),
    collection().countDocuments({ ...scope, lastViewedAt: { $gte: since } }),
  ]);
  return { since, requested, approved, declined, opened };
}

// ── The requester, by ticket ────────────────────────────────────────────────

/** Leave the room (or the line). */
async function leave(ticket) {
  return exclusive(async () => {
    const current = await activeFor(ticket);
    if (!current) throw notFoundError('This browser has no request in the Document Portal.', 'NO_REQUEST');
    const res = await collection().findOneAndUpdate(
      { _id: current._id, status: current.status },
      {
        $set: {
          status: current.status === 'waiting' ? 'cancelled' : 'left',
          endedAt: new Date(),
          ended: { how: current.status === 'waiting' ? END.cancelled : END.left, by: { userId: null, username: null, name: current.requesterName }, note: null },
        },
        $unset: { active: '' },
      },
      { returnDocument: 'after' }
    );
    const doc = res?.value ?? res;
    if (!doc || !doc._id) throw conflict('This request has already ended.', 'ALREADY_ENDED');
    await sweepNow();
    roomChanged();
    return { request: mineView(doc), audit: deskView(doc) };
  });
}

/**
 * The request behind a document being opened: this browser's, approved,
 * and not yet expired — checked against the clock here, not only by the
 * sweep, so an approval stops working at the second it ends.
 */
async function forViewing(ticket) {
  const doc = await activeFor(ticket);
  if (!doc) throw notFoundError('This browser has no request in the Document Portal.', 'NO_REQUEST');
  if (doc.status !== 'approved') throw forbidden('Your request is not approved for viewing yet.', 'NOT_APPROVED');
  if (!doc.expiresAt || doc.expiresAt <= new Date()) throw forbidden('The time approved for this document is over.', 'EXPIRED');
  // Closed rooms open nothing (services/portalSettings).
  const state = await settings.roomState();
  if (!state.open) throw new AppError(closedMessage(state), 423, 'ROOM_CLOSED');
  return doc;
}

/**
 * The document was opened. Counted, and — the first time — the approval is
 * cut to 24 hours from now if it ran longer: once someone has read a
 * document, they do not keep it for days. Returns when the approval now ends.
 */
async function recordView(id, now = new Date()) {
  const _id = byId(id);
  await collection().updateOne({ _id }, { $inc: { views: 1 }, $set: { lastViewedAt: now } });
  const cap = new Date(now.getTime() + AFTER_FIRST_VIEW_MS);
  // Only the first opening sets firstViewedAt; the filter makes it once-only.
  const res = await collection().findOneAndUpdate(
    { _id, status: 'approved', firstViewedAt: null },
    [{ $set: { firstViewedAt: now, expiresAt: { $min: ['$expiresAt', cap] }, viewCapApplied: { $gt: ['$expiresAt', cap] } } }],
    { returnDocument: 'after' }
  );
  const doc = res?.value ?? res;
  if (doc && doc._id) {
    if (doc.viewCapApplied) {
      tellRequester(doc, {
        status: 'approved',
        title: 'Your access now ends in 24 hours',
        body: `You opened ${docLabel(doc)}. From the first opening, a document stays available for 24 hours — until ${doc.expiresAt.toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}.`,
      });
    }
    roomChanged();
    return doc.expiresAt;
  }
  return (await collection().findOne({ _id }, { projection: { expiresAt: 1 } }))?.expiresAt || null;
}

/** Whether this approved request may take the file: the Developer allowed it for this seat. */
const downloadAllowed = (doc) => doc.downloadAllowed === true;

/**
 * Change an approved seat's access — the Developer only, once the Records
 * Unit has approved it: how long is left (counted from now; this may run
 * past the 24 hours after a first opening — the Developer's call), which
 * pages, and whether this one requester may download the file. Every
 * change is kept on the request (`adjustments`) and told to the requester.
 */
async function adjustAccess(id, user, { minutes, allPages, pages, downloadAllowed: download, note } = {}) {
  if (!isDeveloper(user)) throw forbidden('Only the Developer changes an approved seat’s access.', 'DEVELOPER_ONLY');
  const _id = byId(id);
  const now = new Date();
  const set = {};
  const changes = {};
  if (minutes !== undefined && minutes !== null) {
    const m = Number(minutes);
    if (!validMinutes(m)) throw badRequest('Set between 15 minutes and 30 days.', 'DURATION_INVALID');
    set.expiresAt = new Date(now.getTime() + m * 60000);
    changes.timeLeft = minutesLabel(m);
  }
  if (allPages !== undefined) {
    const rule = allPages === false ? { all: false, list: parsePages(pages) } : { all: true, list: null };
    if (!rule.all) rule.spec = pagesSpec(rule.list);
    set.pages = rule;
    changes.pages = rule.all ? 'all' : rule.spec;
  }
  if (typeof download === 'boolean') {
    set.downloadAllowed = download;
    changes.download = download ? 'allowed' : 'off';
  }
  if (!Object.keys(set).length) throw badRequest('Nothing to change.', 'NOTHING_TO_CHANGE');

  return exclusive(async () => {
    const entry = { at: now, by: account(user), changes, note: String(note || '').trim().slice(0, 300) || null };
    const res = await collection().findOneAndUpdate(
      { _id, status: 'approved' },
      { $set: set, $push: { adjustments: entry } },
      { returnDocument: 'after' }
    );
    const doc = res?.value ?? res;
    if (!doc || !doc._id) {
      if (!(await collection().countDocuments({ _id }))) throw notFoundError('Request not found.', 'REQUEST_NOT_FOUND');
      throw conflict('Only an approved seat’s access can be changed.', 'NOT_APPROVED');
    }
    const said = [
      changes.timeLeft && `access now ends ${doc.expiresAt.toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}`,
      changes.pages && (changes.pages === 'all' ? 'all pages' : `pages ${changes.pages}`),
      changes.download && (changes.download === 'allowed' ? 'you may download the file' : 'downloading is off'),
    ].filter(Boolean);
    tellRequester(doc, { status: 'approved', title: 'Your access was updated', body: `${docLabel(doc)}: ${said.join('; ')}.` });
    roomChanged();
    return deskView(doc);
  });
}

module.exports = {
  COLLECTION,
  CAPACITY,
  WAITING_CAP,
  PENDING_TTL_MS,
  MAX_ACTIVE_PER_ADDRESS,
  DURATIONS,
  STATUSES,
  TICKET_COOKIE,
  TICKET_MAX_AGE_MS,
  ensureIndexes,
  start,
  sweep,
  canDecide,
  sourcesFor,
  todayFigures,
  requireDecider,
  inReach,
  latestFor,
  ticketRoom,
  deciders,
  docLabel,
  byId,
  DESK_URL,
  SOURCES,
  UNIT_NAME,
  findDocument,
  parsePages,
  pagesSpec,
  hashOf,
  search,
  room,
  lastFor,
  create,
  decide,
  revoke,
  get,
  desk,
  leave,
  forViewing,
  recordView,
  downloadAllowed,
  adjustAccess,
  END,
  MIN_MINUTES,
  MAX_MINUTES,
  PUBLIC_RECOMMENDED_MAX_MINUTES,
  AFTER_FIRST_VIEW_MS,
};
