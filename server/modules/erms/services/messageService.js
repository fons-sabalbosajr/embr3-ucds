const { connectToMongo, getDb, ObjectId } = require('../../../config/db');
const { badRequest, forbidden, notFoundError } = require('../../../shared/middleware/errorHandler');
const { DOMAINS, ERMS_UNIT_LABELS, ermsUnitOf, hasDomain, roleOf, ROLE_LABELS } = require('../../../services/authorization');

// ---------------------------------------------------------------------------
// The Action Center: short messages between the people who work in ERMS.
//
// The desktop system had one (tb_actioncenter_inbox, and
// tb_actioncenter_deletemsg for what a person removed): an administrator
// asked a unit to update its folders, a clerk asked for a clarification.
// Each message had a purpose, a subject and the details, and was numbered
// ERMSAC-<year><sequence>; this keeps that shape and that numbering.
//
// One recipient per message, as there. Deleting removes a message from the
// deleter's own view only — the other party still has it — and nothing is
// ever erased, as the desktop system moved a deleted message aside rather
// than dropping it.
// ---------------------------------------------------------------------------

const COLLECTION = 'erms-messages';
const SEQUENCES = 'erms-sequences';
const PURPOSES = ['Modification', 'Clarification', 'Request', 'Information', 'Reminder'];

const collection = () => getDb().collection(COLLECTION);

async function ensureIndexes() {
  await connectToMongo();
  await collection().createIndex({ 'to.username': 1, sentAt: -1 });
  await collection().createIndex({ 'from.username': 1, sentAt: -1 });
  await collection().createIndex({ msgId: 1 }, { unique: true });
}

/** How a person is named on a message: who, and in which unit. */
const party = (u) => ({
  username: u.username,
  name: u.name || u.username,
  unit: ermsUnitOf(u),
  unitLabel: ERMS_UNIT_LABELS[ermsUnitOf(u)] || ROLE_LABELS[roleOf(u)] || null,
});

const mayUseErms = (u) => Boolean(u) && hasDomain(u, DOMAINS.ERMS);

async function nextMsgId() {
  const year = new Date().getFullYear();
  const _id = `message:${year}`;
  const result = await getDb()
    .collection(SEQUENCES)
    .findOneAndUpdate({ _id }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after', includeResultMetadata: false });
  const seq = (result && typeof result.seq === 'number' ? result : result?.value)?.seq;
  if (typeof seq !== 'number') throw new Error('Could not number the message.');
  return `ERMSAC-${year}${String(seq).padStart(6, '0')}`;
}

/** The accounts a message can go to: anyone else who works in ERMS. */
async function people(user, q = '') {
  await connectToMongo();
  const filter = { username: { $ne: user?.username } };
  const text = String(q || '').trim();
  if (text) {
    const rx = new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { username: rx }, { division: rx }];
  }
  const rows = await getDb()
    .collection('users')
    .find(filter, { projection: { username: 1, name: 1, permission: 1, domains: 1, ermsUnit: 1, division: 1 } })
    .sort({ name: 1 })
    .limit(200)
    .toArray();
  return rows.filter(mayUseErms).slice(0, 25).map((u) => ({ ...party(u), division: u.division || null }));
}

async function send(user, { to, purpose, subject, details }) {
  await connectToMongo();
  const projection = { username: 1, name: 1, permission: 1, domains: 1, ermsUnit: 1 };
  // The sender as the account says now, not as the session remembered it.
  const sender = (await getDb().collection('users').findOne({ username: user?.username }, { projection })) || user;
  const recipient = await getDb().collection('users').findOne({ username: String(to || '') }, { projection });
  if (!recipient || !mayUseErms(recipient)) throw notFoundError('No ERMS account by that name.', 'RECIPIENT_NOT_FOUND');
  if (recipient.username === user?.username) throw badRequest('Choose someone other than yourself.', 'RECIPIENT_SELF');
  if (!PURPOSES.includes(purpose)) throw badRequest('Choose the purpose of the message.', 'PURPOSE_REQUIRED');
  if (!String(subject || '').trim()) throw badRequest('Give the message a subject.', 'SUBJECT_REQUIRED');
  const doc = {
    msgId: await nextMsgId(),
    from: party(sender),
    to: party(recipient),
    purpose,
    subject: String(subject || '').trim().slice(0, 200),
    details: String(details || '').trim().slice(0, 4000),
    sentAt: new Date(),
    readAt: null,
    deletedBy: [],
  };
  const { insertedId } = await collection().insertOne(doc);
  // The recipient hears of it now — an administrator asked for full access
  // to a Legal or Laboratory document, among others.
  require('../../../services/notifier').notifyLater([recipient.username], {
    kind: purpose === 'Request' ? 'erms-request-message' : 'erms-message',
    tag: `message-${insertedId}`,
    title: `${purpose === 'Request' ? 'Request' : 'Message'} from ${doc.from?.name || doc.from?.username || 'an ERMS user'}`,
    body: doc.subject,
    url: '/e-universe/erms/messages',
  });
  return view({ _id: insertedId, ...doc }, user);
}

/** A message as `user` sees it: theirs to read, with which side they are on. */
function view(m, user) {
  const { _id, deletedBy, ...rest } = m;
  return { id: String(_id), ...rest, box: m.to?.username === user?.username ? 'inbox' : 'sent', unread: m.to?.username === user?.username && !m.readAt };
}

/** The inbox or the sent box, newest first, without what this person deleted. */
async function list(user, { box = 'inbox', page = 1, pageSize = 25 } = {}) {
  await connectToMongo();
  const me = user?.username;
  const filter = box === 'sent' ? { 'from.username': me } : { 'to.username': me };
  filter.deletedBy = { $ne: me };
  const size = Math.min(Math.max(Number(pageSize) || 25, 1), 100);
  const skip = (Math.max(Number(page) || 1, 1) - 1) * size;
  const [items, total, unread] = await Promise.all([
    collection().find(filter).sort({ sentAt: -1 }).skip(skip).limit(size).toArray(),
    collection().countDocuments(filter),
    unreadCount(user),
  ]);
  return { items: items.map((m) => view(m, user)), total, unread, purposes: PURPOSES };
}

async function unreadCount(user) {
  await connectToMongo();
  return collection().countDocuments({ 'to.username': user?.username, readAt: null, deletedBy: { $ne: user?.username } });
}

async function own(user, id) {
  if (!ObjectId.isValid(String(id))) throw notFoundError('Message not found.', 'MESSAGE_NOT_FOUND');
  await connectToMongo();
  const m = await collection().findOne({ _id: new ObjectId(String(id)) });
  if (!m || (m.to?.username !== user?.username && m.from?.username !== user?.username)) throw notFoundError('Message not found.', 'MESSAGE_NOT_FOUND');
  return m;
}

/** Mark a message read or unread. Only its recipient does. */
async function mark(user, id, { read }) {
  const m = await own(user, id);
  if (m.to?.username !== user?.username) throw forbidden('Only the recipient marks a message read.', 'NOT_RECIPIENT');
  const readAt = read === false ? null : m.readAt || new Date();
  await collection().updateOne({ _id: m._id }, { $set: { readAt } });
  return view({ ...m, readAt }, user);
}

/** Remove a message from this person's view. The other party keeps it. */
async function remove(user, id) {
  const m = await own(user, id);
  await collection().updateOne({ _id: m._id }, { $addToSet: { deletedBy: user.username } });
  return { id: String(m._id), msgId: m.msgId };
}

module.exports = { COLLECTION, PURPOSES, ensureIndexes, people, send, list, unreadCount, mark, remove };
