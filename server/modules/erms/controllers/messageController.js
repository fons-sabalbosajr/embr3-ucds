const { principalOf } = require('../../../middleware/auth');
const audit = require('../../../shared/services/audit');
const { DOMAINS } = require('../../../services/authorization');
const messages = require('../services/messageService');

// ---------------------------------------------------------------------------
// The Action Center (see services/messageService.js).
// ---------------------------------------------------------------------------

async function list(req, res, next) {
  try {
    res.json(await messages.list(principalOf(req), req.query));
  } catch (error) {
    next(error);
  }
}

async function unread(req, res, next) {
  try {
    res.json({ unread: await messages.unreadCount(principalOf(req)) });
  } catch (error) {
    next(error);
  }
}

async function people(req, res, next) {
  try {
    res.json({ people: await messages.people(principalOf(req), req.query.q) });
  } catch (error) {
    next(error);
  }
}

async function send(req, res, next) {
  try {
    const message = await messages.send(principalOf(req), req.body || {});
    await audit.record(req, {
      domain: DOMAINS.ERMS,
      action: 'message-send',
      label: `message ${message.msgId} sent to ${message.to.username}`,
      collection: messages.COLLECTION,
      documentId: message.msgId,
      changes: { to: message.to.username, purpose: message.purpose, subject: message.subject },
      includeBody: false,
    });
    res.status(201).json({ message });
  } catch (error) {
    next(error);
  }
}

async function mark(req, res, next) {
  try {
    res.json({ message: await messages.mark(principalOf(req), req.params.id, req.body || {}) });
  } catch (error) {
    next(error);
  }
}

async function remove(req, res, next) {
  try {
    const removed = await messages.remove(principalOf(req), req.params.id);
    await audit.record(req, { domain: DOMAINS.ERMS, action: 'message-delete', label: `message ${removed.msgId} deleted from view`, collection: messages.COLLECTION, documentId: removed.msgId, includeBody: false });
    res.json(removed);
  } catch (error) {
    next(error);
  }
}

module.exports = { list, unread, people, send, mark, remove };
