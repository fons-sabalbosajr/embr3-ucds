const express = require('express');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { authenticateSession, requireDomain } = require('../../middleware/auth');
const { DOMAINS } = require('../../services/authorization');
const { validate, z, objectId } = require('../../shared/middleware/validate');
const { requireNasActive } = require('../../services/nasActivation');
const ctrl = require('./controllers/portalController');
const { MIN_MINUTES, MAX_MINUTES } = require('./services/portalService');
const { TYPE_VALUES } = require('./services/portalTerms');

// ---------------------------------------------------------------------------
// The E-Universe Document Portal (services/portalService.js).
//
// /api/portal/*        the public page. No session: the portal is for people
//                      without an E-Universe account. Declared public in
//                      shared/routeInventory.js, one by one. What protects it:
//                        - per-address limits, below, on every route;
//                        - a browser's own request is reached only with the
//                          ticket cookie it was given (httpOnly, hashed here);
//                        - changes (ask, leave) need the X-Portal-Request
//                          header, which a page on another site cannot send
//                          without CORS letting it — so no other site can
//                          make a visitor's browser ask or leave;
//                        - search returns what identifies a document, never
//                          where its file is.
//
// /api/erms/portal/*   the Records Unit's desk, inside E-Universe: a session
//                      with the ERMS domain, and the Records Unit check in
//                      the service.
// ---------------------------------------------------------------------------

const router = express.Router();

const perAddress = (windowMs, max, message) =>
  rateLimit({
    windowMs,
    max,
    keyGenerator: (req, res) => ipKeyGenerator(req, res),
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
    handler: (req, res) => res.status(429).json({ code: 'RATE_LIMITED', message }),
  });
const roomLimit = perAddress(60 * 1000, 120, 'Too many requests. Please wait a moment.');
const searchLimit = perAddress(60 * 1000, 40, 'Searching is limited. Please wait a moment and try again.');
const askLimit = perAddress(60 * 60 * 1000, 10, 'Too many Document Portal requests from this computer in the last hour. Please try again later.');
const leaveLimit = perAddress(60 * 1000, 20, 'Too many requests. Please wait a moment.');
const openLimit = perAddress(60 * 1000, 10, 'The document was opened too many times in a minute. Please wait a moment.');

/** The public page's changes must come from a page allowed to send this header. */
function requirePortalHeader(req, res, next) {
  if (req.get('X-Portal-Request') !== '1') {
    return res.status(403).json({ code: 'PORTAL_HEADER_REQUIRED', message: 'This request must come from the Document Portal page.' });
  }
  return next();
}

// ── The public page ─────────────────────────────────────────────────────────

router.get('/api/portal/room', roomLimit, ctrl.room);
// Who may ask and the terms they accept (services/portalTerms): read by the page, recorded with each request.
router.get('/api/portal/terms', roomLimit, ctrl.terms);
router.get('/api/portal/search', searchLimit, validate(z.object({ q: z.string().trim().max(120).default('') }), 'query'), ctrl.search);
router.post(
  '/api/portal/requests',
  askLimit,
  requirePortalHeader,
  validate(
    z.object({
      // Where the document is kept: the Records library (default), Legal Services or the Laboratory.
      source: z.enum(['records', 'legal', 'laboratory']).optional(),
      serialNo: z.string().trim().min(3).max(80),
      requesterName: z.string().trim().min(2).max(120),
      requesterType: z.enum(TYPE_VALUES),
      // Free text: an employee's section or unit (suggested from HRPMS), or a
      // visitor's agency, school or occupation.
      designation: z.string().trim().min(2).max(120),
      // A member of the public (EO 2): how to reach them, and the ID they will show.
      contact: z.string().trim().max(120).optional().nullable(),
      idType: z.string().trim().max(80).optional().nullable(),
      purpose: z.string().trim().min(5).max(1000),
      // A quick choice or a custom length, 15 minutes to 30 days.
      desiredMinutes: z.coerce.number().int().min(MIN_MINUTES).max(MAX_MINUTES),
      termsVersion: z.string().trim().max(40),
      acceptFoi: z.boolean().optional(),
      acceptPrivacy: z.boolean(),
    })
  ),
  ctrl.create
);
router.post('/api/portal/leave', leaveLimit, requirePortalHeader, ctrl.leave);
// The conversation with staff about this browser's request — deleted after 12 idle hours (services/portalChat).
const chatLimit = perAddress(60 * 1000, 20, 'Too many messages. Please wait a moment.');
const chatBody = z.object({ text: z.string().trim().min(1).max(1000) });
router.get('/api/portal/chat', roomLimit, ctrl.myChat);
router.post('/api/portal/chat', chatLimit, requirePortalHeader, validate(chatBody), ctrl.postMyChat);
// Whose and whether approved is settled before the share is touched.
router.get('/api/portal/document', openLimit, ctrl.approvedOwn, requireNasActive, ctrl.document);

// ── The Records Unit's desk ─────────────────────────────────────────────────

const desk = [authenticateSession, requireDomain(DOMAINS.ERMS)];
const idParam = z.object({ id: objectId });
const note = z.string().trim().max(500).optional().nullable();

router.get(
  '/api/erms/portal/desk',
  desk,
  validate(
    z.object({
      limit: z.coerce.number().int().min(1).max(500).optional(),
      q: z.string().trim().max(120).optional(),
      requesterType: z.string().trim().max(40).optional(),
      permitTypes: z.string().trim().max(200).optional(),
      source: z.enum(['records', 'legal', 'laboratory']).optional(),
      outcome: z.string().trim().max(20).optional(),
      from: z.string().trim().max(40).optional(),
      to: z.string().trim().max(40).optional(),
    }),
    'query'
  ),
  ctrl.desk
);
router.patch(
  '/api/erms/portal/requests/:id',
  desk,
  validate(idParam, 'params'),
  validate(
    z.object({
      decision: z.enum(['approved', 'declined']),
      minutes: z.coerce.number().int().min(MIN_MINUTES).max(MAX_MINUTES).optional(),
      allPages: z.boolean().optional(),
      pages: z.string().trim().max(400).optional().nullable(),
      note,
    })
  ),
  ctrl.decide
);
router.post('/api/erms/portal/requests/:id/revoke', desk, validate(idParam, 'params'), validate(z.object({ note })), ctrl.revoke);
// Conversations with requesters: the desk's unread counts, and one request's messages.
router.get('/api/erms/portal/chats', desk, ctrl.chatSummary);
router.get('/api/erms/portal/requests/:id/chat', desk, validate(idParam, 'params'), ctrl.requestChat);
router.post('/api/erms/portal/requests/:id/chat', desk, validate(idParam, 'params'), validate(z.object({ text: z.string().trim().min(1).max(1000) })), ctrl.postRequestChat);
// The room's settings — weekend closure, watermark — set by the Developer only (checked in the service).
router.get('/api/erms/portal/settings', desk, ctrl.roomSettings);
router.put('/api/erms/portal/settings', desk, validate(z.object({ closedOnWeekends: z.boolean().optional(), watermark: z.boolean().optional() })), ctrl.saveRoomSettings);
// An approved seat's access — time left, pages, download — changed by the Developer only (checked in the service).
router.patch(
  '/api/erms/portal/requests/:id/access',
  desk,
  validate(idParam, 'params'),
  validate(
    z.object({
      minutes: z.coerce.number().int().min(MIN_MINUTES).max(MAX_MINUTES).optional(),
      allPages: z.boolean().optional(),
      pages: z.string().trim().max(400).optional().nullable(),
      downloadAllowed: z.boolean().optional(),
      note,
    })
  ),
  ctrl.adjustAccess
);
router.get('/api/erms/portal/requests/:id/pages', desk, validate(idParam, 'params'), ctrl.deciderOnly, requireNasActive, ctrl.pageCount);

module.exports = router;
