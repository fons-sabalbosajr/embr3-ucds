const portal = require('../services/portalService');
const portalTerms = require('../services/portalTerms');
const portalSettings = require('../services/portalSettings');
const chat = require('../services/portalChat');
const { prepare, countPages, PortalDocumentError } = require('../services/portalDocument');
const audit = require('../../../shared/services/audit');
const { principalOf } = require('../../../middleware/auth');
const { DOMAINS } = require('../../../services/authorization');
const { sessionCookieOptions } = require('../../../config/security');
const nas = require('../../../services/nasStorage');
const { recordFileEvent } = require('../../../services/nasAudit');

// ---------------------------------------------------------------------------
// The Document Portal's routes (see services/portalService.js for the rules).
//
// Two sides:
//
//   The public page (/e-universe/document-portal). No sign-in. A browser
//   searches, enters the room and asks; it is then handed a ticket in an
//   httpOnly cookie, and everything after — where it stands, opening the
//   document, leaving — is answered for that ticket only.
//
//   The Records Unit's desk, inside E-Universe: decide, end access early,
//   see what ran. A session with ERMS, and the Records Unit check in the
//   service.
//
// The document itself is served only to the browser whose request was
// approved, only while the approval runs, cut to the approved pages and
// watermarked with who asked (services/portalDocument.js) — never addressed
// by a path, never as a download.
// ---------------------------------------------------------------------------

const audited = (req, action, label, documentId, changes) =>
  audit.record(req, { domain: DOMAINS.ERMS, action, label, collection: portal.COLLECTION, documentId, changes, includeBody: false });

const wrap = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (err) {
    next(err);
  }
};

const ticketOf = (req) => req.cookies?.[portal.TICKET_COOKIE] || null;
const clientOf = (req) => ({ ticket: ticketOf(req), ip: req.ip, userAgent: req.get('user-agent') });

/** The browser keeps its ticket where page script cannot read it. */
function giveTicket(res, ticket) {
  res.cookie(portal.TICKET_COOKIE, ticket, { ...sessionCookieOptions(), path: '/', maxAge: portal.TICKET_MAX_AGE_MS });
}

// ── The public page ─────────────────────────────────────────────────────────

/** Who may ask, and the FOI and Data Privacy terms, as the page shows them. */
const terms = (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json(portalTerms.publicTerms());
};

const search = wrap(async (req, res) => {
  res.json({ results: await portal.search(req.query.q) });
});

const room = wrap(async (req, res) => {
  const ticket = ticketOf(req);
  // A signed-in ERMS user or the Developer sees who is in the room; anyone else, seats and clocks.
  const view = await portal.room(ticket, principalOf(req));
  // Replies from staff not read yet (services/portalChat).
  view.chatUnread = await chat.unreadForRequester(ticket).catch(() => 0);
  // Nothing running for this browser: how its last request ended, if it was lately.
  if (!view.mine) {
    const last = await portal.lastFor(ticket);
    view.last = last && last.endedAt && Date.now() - new Date(last.endedAt).getTime() < 24 * 3600000 ? last : null;
  }
  res.json(view);
});

const create = wrap(async (req, res) => {
  const result = await portal.create(req.body, clientOf(req));
  giveTicket(res, result.ticket);
  await audited(req, 'portal-request', result.position ? 'Document Portal: joined the waiting line' : 'Document Portal: entered the room', result.request.id, {
    serialNo: result.audit.serialNo,
    requesterName: result.audit.requesterName,
    requesterType: result.audit.requesterType,
    designation: result.audit.designation,
    purpose: result.audit.purpose,
    desiredMinutes: result.audit.desiredMinutes,
    // The terms they accepted (services/portalTerms), by version.
    consents: result.audit.consents,
    ip: result.audit.client?.ip,
  });
  res.status(201).json({ request: result.request, position: result.position });
});

const leave = wrap(async (req, res) => {
  const { request, audit: full } = await portal.leave(ticketOf(req));
  await audited(req, 'portal-leave', 'Document Portal: left the room', request.id, { serialNo: request.serialNo, status: request.status, requesterName: full.requesterName, ip: req.ip });
  res.json({ request });
});

// ── The file ────────────────────────────────────────────────────────────────

const NAS_FAILURES = {
  'not-configured': [503, 'NAS_NOT_CONFIGURED', 'The records share is not configured on the server.'],
  disabled: [503, 'NAS_DISABLED', 'Document access is turned off.'],
  'invalid-path': [422, 'BAD_STORED_PATH', 'The stored file path for this record cannot be resolved.'],
  missing: [404, 'FILE_MISSING', 'The document is recorded but is not on the records share.'],
  'not-a-file': [404, 'FILE_MISSING', 'The document is recorded but is not on the records share.'],
  denied: [502, 'NAS_DENIED', 'The server is not permitted to read this document.'],
  unreachable: [502, 'NAS_UNREACHABLE', 'The records share could not be reached.'],
};

/**
 * The record's file, read whole from the share. Looked up by the request's
 * serial number on the server: nothing the browser sends names a file.
 * Returns null after answering when it cannot be read.
 */
async function readFile(req, res, request) {
  // Kept in the Records library or in a unit's own documents (Legal, Laboratory).
  const source = request.source || 'records';
  const record = await portal.findDocument(source, request.serialNo);
  const stored = record?.document?.sharePath || record?.document?.filePath;
  const containerKey = String(record?.document?.container || (source === 'records' ? nas.RECORDS_KEY : source)).toLowerCase();
  if (!stored) {
    res.status(404).json({ code: 'NO_DOCUMENT', message: 'This record no longer has a document filed against it.' });
    return null;
  }
  const file = await nas.statFile(stored, containerKey);
  if (!file.ok) {
    const [status, code, message] = NAS_FAILURES[file.reason] || [502, 'NAS_ERROR', 'The document could not be read.'];
    await recordFileEvent(req, { operation: 'portal-read', serialNo: request.serialNo, containerKey, fileName: record.document?.fileName, success: false, detail: file.reason });
    res.status(status).json({ code, message });
    return null;
  }
  const buffer = await new Promise((resolve, reject) => {
    const chunks = [];
    nas.openStream(file.resolved).on('data', (c) => chunks.push(c)).on('end', () => resolve(Buffer.concat(chunks))).on('error', reject);
  });
  return { buffer, file, containerKey };
}

function refusePrepared(res, err) {
  if (err instanceof PortalDocumentError) return res.status(err.status).json({ code: err.code, message: err.message });
  throw err;
}

/**
 * The request must be this browser's, approved and running — checked
 * before anything about the share, so nobody else learns even whether the
 * document can be read.
 */
const approvedOwn = wrap(async (req, res, next) => {
  req.portalRequest = await portal.forViewing(ticketOf(req));
  next();
});

/** The approved pages, watermarked for this reader. */
const document = wrap(async (req, res) => {
  const request = req.portalRequest;
  const read = await readFile(req, res, request);
  if (!read) return;
  let prepared;
  try {
    prepared = await prepare(read.buffer, read.file.contentType, request, new Date(), { watermark: (await portalSettings.read()).watermark });
  } catch (err) {
    refusePrepared(res, err);
    return;
  }

  // A download only when the Developer allowed it (services/portalSettings):
  // for everyone, or for this requester.
  const download = req.query.download === '1';
  if (download && !portal.downloadAllowed(request)) {
    res.status(403).json({ code: 'DOWNLOAD_NOT_ALLOWED', message: 'This document can be read here but not downloaded.' });
    return;
  }

  // Opened (or taken): counted, and the first time the approval is cut to 24 hours.
  const expiresAt = await portal.recordView(request._id);
  await recordFileEvent(req, {
    operation: download ? 'portal-download' : 'portal-view',
    serialNo: request.serialNo,
    containerKey: read.containerKey,
    fileName: read.file.fileName,
    success: true,
    bytes: prepared.bytes.length,
    detail: `request ${request._id} (${request.requesterName}, ${request.designation}); pages ${request.pages?.all === false ? request.pages.spec : 'all'} of ${prepared.total}`,
  });

  // Inline for reading; an attachment only for an allowed download. A name
  // from the ECC reference number, never the one on the share.
  const fileLabel = String(request.permitNumber || request.serialNo || 'document').replace(/[^A-Za-z0-9._-]+/g, '-');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', download ? `attachment; filename="${fileLabel}.pdf"` : 'inline; filename="e-universe-portal.pdf"');
  res.setHeader('Content-Length', prepared.bytes.length);
  // Not kept by the browser or anything between it and the server.
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Opened on its own, the response runs nothing and cannot be framed elsewhere.
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox; frame-ancestors 'none'");
  res.setHeader('Access-Control-Expose-Headers', 'X-Portal-Pages, X-Portal-Total, X-Portal-Expires');
  res.setHeader('X-Portal-Pages', prepared.pages.length > 200 ? `${prepared.pages.length}` : prepared.pages.join(','));
  res.setHeader('X-Portal-Total', String(prepared.total));
  res.setHeader('X-Portal-Expires', new Date(expiresAt || request.expiresAt).toISOString());
  res.end(prepared.bytes);
});

// ── The Records Unit's desk ─────────────────────────────────────────────────

const desk = wrap(async (req, res) => {
  res.json(await portal.desk(principalOf(req), req.query));
});

const decide = wrap(async (req, res) => {
  const request = await portal.decide(req.params.id, principalOf(req), req.body);
  await audited(req, 'portal-decision', `Document Portal: request ${request.status}`, request.id, {
    serialNo: request.serialNo,
    for: request.requesterName,
    designation: request.designation,
    status: request.status,
    grantedMinutes: request.grantedMinutes,
    pages: request.pages?.all === false ? request.pages.spec : request.pages ? 'all' : null,
    note: request.decisionNote,
  });
  res.json({ request });
});

const revoke = wrap(async (req, res) => {
  const request = await portal.revoke(req.params.id, principalOf(req), req.body || {});
  await audited(req, 'portal-revoke', 'Document Portal: access withdrawn', request.id, { serialNo: request.serialNo, for: request.requesterName, note: request.decisionNote });
  res.json({ request });
});

/** The room's settings (weekend closure, watermark): read by deciders, set by the Developer only. */
const roomSettings = wrap(async (req, res) => {
  res.json(await portalSettings.read());
});
const saveRoomSettings = wrap(async (req, res) => {
  const saved = await portalSettings.save(principalOf(req), req.body || {});
  await audited(req, 'portal-settings', 'Document Portal: room settings changed', 'portal-settings', { closedOnWeekends: saved.closedOnWeekends, watermark: saved.watermark });
  res.json(saved);
});

/** Change an approved seat's access — time left, pages, download. The Developer only. */
const adjustAccess = wrap(async (req, res) => {
  const request = await portal.adjustAccess(req.params.id, principalOf(req), req.body || {});
  const last = request.adjustments?.[request.adjustments.length - 1];
  await audited(req, 'portal-adjust', 'Document Portal: approved access changed', request.id, {
    serialNo: request.serialNo,
    requesterName: request.requesterName,
    ...(last?.changes || {}),
    note: last?.note || null,
  });
  res.json({ request });
});

/** Records Unit only, checked before the share is touched. */
const deciderOnly = wrap(async (req, res, next) => {
  req.portalRequest = await portal.get(req.params.id, principalOf(req));
  next();
});

/** How many pages the document has — for the Records Unit choosing which to approve. */
const pageCount = wrap(async (req, res) => {
  const read = await readFile(req, res, req.portalRequest);
  if (!read) return undefined;
  try {
    return res.json({ pages: await countPages(read.buffer, read.file.contentType), contentType: read.file.contentType });
  } catch (err) {
    return refusePrepared(res, err);
  }
});

// ── The conversation (services/portalChat) ──────────────────────────────────

const myChat = wrap(async (req, res) => {
  res.json(await chat.forRequester(ticketOf(req)));
});
const postMyChat = wrap(async (req, res) => {
  res.status(201).json(await chat.postFromRequester(ticketOf(req), req.body.text));
});
const requestChat = wrap(async (req, res) => {
  res.json(await chat.forStaff(req.params.id, principalOf(req)));
});
const postRequestChat = wrap(async (req, res) => {
  const result = await chat.postFromStaff(req.params.id, principalOf(req), req.body.text);
  await audited(req, 'portal-chat', 'Document Portal: message to a requester', req.params.id, { chars: String(req.body.text || '').length });
  res.status(201).json(result);
});
const chatSummary = wrap(async (req, res) => {
  res.json({ chats: await chat.summaryForStaff(principalOf(req)) });
});

module.exports = { myChat, postMyChat, requestChat, postRequestChat, chatSummary, terms, search, room, create, leave, approvedOwn, document, desk, decide, revoke, deciderOnly, pageCount, adjustAccess, roomSettings, saveRoomSettings };
