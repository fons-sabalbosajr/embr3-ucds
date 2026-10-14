const { connectToMongo, getDb } = require('../../../config/db');
const { notFoundError, badRequest } = require('../../../shared/middleware/errorHandler');
const notifier = require('../../../services/notifier');
const portal = require('./portalService');

// ---------------------------------------------------------------------------
// A conversation about one Document Portal request, between the person who
// asked and the staff who decide it (the unit that keeps the document, an
// Administrator with ERMS, the Developer) — so a question either way does
// not need a phone call.
//
// Temporary by design: a conversation left idle for 12 hours is deleted —
// MongoDB's TTL monitor removes it (an index on lastActivityAt), and every
// read here ignores an idle one in the meantime, since the monitor runs only
// about once a minute.
//
// The requester is reached by their browser's ticket, as everywhere on the
// portal; staff by their E-Universe session and the units they decide for.
// Both sides hear new messages at once: the requester's page through its
// ticket's socket room, staff through a notice and the desk's live ping.
// ---------------------------------------------------------------------------

const COLLECTION = 'portal-chats';
const IDLE_MS = 12 * 60 * 60 * 1000;
const MAX_TEXT = 1000;
const MAX_MESSAGES = 300;

const collection = () => getDb().collection(COLLECTION);

async function ensureIndexes() {
  await connectToMongo();
  await collection().createIndex({ requestId: 1 }, { unique: true });
  // Deleted by MongoDB 12 hours after the last message.
  await collection().createIndex({ lastActivityAt: 1 }, { expireAfterSeconds: IDLE_MS / 1000, name: 'idle_12h' });
}

const fresh = () => ({ lastActivityAt: { $gt: new Date(Date.now() - IDLE_MS) } });
const clean = (text) => String(text || '').replace(/\s+$/g, '').trim().slice(0, MAX_TEXT);

/** The conversation as either side sees it. */
function view(chat, side) {
  if (!chat) return { messages: [], unread: 0, expiresAt: null };
  const readAt = side === 'staff' ? chat.staffReadAt : chat.requesterReadAt;
  const other = side === 'staff' ? 'requester' : 'staff';
  return {
    messages: (chat.messages || []).map((m) => ({ id: m.id, from: m.from, name: m.name, text: m.text, at: m.at })),
    unread: (chat.messages || []).filter((m) => m.from === other && (!readAt || m.at > readAt)).length,
    lastActivityAt: chat.lastActivityAt,
    // When it goes, if nobody writes again.
    expiresAt: new Date(chat.lastActivityAt.getTime() + IDLE_MS),
  };
}

async function append(request, message) {
  const now = new Date();
  const entry = { id: `${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`, ...message, at: now };
  const readField = message.from === 'staff' ? 'staffReadAt' : 'requesterReadAt';
  // A conversation idle past its 12 hours starts again, empty.
  await collection().deleteOne({ requestId: request._id, lastActivityAt: { $lte: new Date(now.getTime() - IDLE_MS) } });
  const res = await collection().findOneAndUpdate(
    { requestId: request._id },
    {
      $push: { messages: { $each: [entry], $slice: -MAX_MESSAGES } },
      $set: { lastActivityAt: now, [readField]: now, source: request.source || 'records', requesterName: request.requesterName },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true, returnDocument: 'after' }
  );
  return res?.value ?? res;
}

// ── The requester (by ticket) ───────────────────────────────────────────────

async function requestOf(ticket) {
  const request = await portal.latestFor(ticket);
  if (!request) throw notFoundError('Send a request first — the conversation is about your request.', 'NO_REQUEST');
  return request;
}

/** This browser's conversation with the unit that keeps the document, marked read. */
async function forRequester(ticket) {
  const request = await requestOf(ticket);
  await connectToMongo();
  const chat = await collection().findOneAndUpdate({ requestId: request._id, ...fresh() }, { $set: { requesterReadAt: new Date() } }, { returnDocument: 'after' });
  return { requestId: String(request._id), unit: request.source || 'records', ...view(chat?.value ?? chat, 'requester') };
}

/** Unread replies for this browser, without marking them read — for the page's badge. */
async function unreadForRequester(ticket) {
  const request = await portal.latestFor(ticket);
  if (!request) return 0;
  await connectToMongo();
  return view(await collection().findOne({ requestId: request._id, ...fresh() }), 'requester').unread;
}

async function postFromRequester(ticket, text) {
  const body = clean(text);
  if (!body) throw badRequest('Type a message.', 'EMPTY');
  const request = await requestOf(ticket);
  await connectToMongo();
  const chat = await append(request, { from: 'requester', name: request.requesterName, text: body });
  // Staff hear of it at once: a notice to the people who decide, and a ping to every open desk.
  notifier.notifyLater(() => portal.deciders(request.source || 'records'), {
    kind: 'portal-chat',
    tag: `portal-chat-${request._id}`,
    title: `Message from ${request.requesterName}`,
    body: `${portal.docLabel(request)}: “${body.slice(0, 140)}”`,
    url: portal.DESK_URL,
  });
  notifier.broadcast('portal:chat', { at: new Date().toISOString() });
  return view(chat, 'requester');
}

// ── Staff (by session) ──────────────────────────────────────────────────────

async function requestInReach(id, user) {
  const sources = portal.requireDecider(user);
  await connectToMongo();
  const request = await getDb().collection(portal.COLLECTION).findOne({ _id: portal.byId(id), ...portal.inReach(sources) });
  if (!request) throw notFoundError('Request not found.', 'REQUEST_NOT_FOUND');
  return request;
}

/** One request's conversation, marked read by staff. */
async function forStaff(id, user) {
  const request = await requestInReach(id, user);
  const chat = await collection().findOneAndUpdate({ requestId: request._id, ...fresh() }, { $set: { staffReadAt: new Date() } }, { returnDocument: 'after' });
  return { requestId: String(request._id), requesterName: request.requesterName, ...view(chat?.value ?? chat, 'staff') };
}

async function postFromStaff(id, user, text) {
  const body = clean(text);
  if (!body) throw badRequest('Type a message.', 'EMPTY');
  const request = await requestInReach(id, user);
  const chat = await append(request, { from: 'staff', name: user.name || user.username, username: user.username, text: body });
  // The requester's page hears it at once (its ticket's socket room).
  const unit = portal.UNIT_NAME[request.source || 'records'] || portal.UNIT_NAME.records;
  notifier.emitTo(portal.ticketRoom(request._id), 'portal:chat', { title: `New message from ${unit}`, body: body.slice(0, 140), at: new Date().toISOString() });
  notifier.broadcast('portal:chat', { at: new Date().toISOString() });
  return view(chat, 'staff');
}

/** The conversations in this account's reach: per request, how many messages wait unread. */
async function summaryForStaff(user) {
  const sources = portal.requireDecider(user);
  await connectToMongo();
  const chats = await collection()
    .find({ ...fresh(), $or: [{ source: { $in: sources } }, ...(sources.includes('records') ? [{ source: { $exists: false } }] : [])] })
    .project({ requestId: 1, messages: 1, staffReadAt: 1, lastActivityAt: 1, requesterName: 1 })
    .toArray();
  return chats.map((c) => ({ requestId: String(c.requestId), requesterName: c.requesterName, messages: (c.messages || []).length, unread: view(c, 'staff').unread, lastActivityAt: c.lastActivityAt }));
}

module.exports = { COLLECTION, IDLE_MS, ensureIndexes, forRequester, unreadForRequester, postFromRequester, forStaff, postFromStaff, summaryForStaff };
