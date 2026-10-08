const { principalOf: sessionPrincipal } = require('../../../middleware/auth');
const { ermsUnitsOf, ermsUnitOf, isErmsEndUser, canAccessAllYears, ERMS_UNIT_LABELS, DOMAINS } = require('../../../services/authorization');
const { freshPrincipal } = require('../../../services/storageAccess');

// The unit on an account is the Developer's to change and must apply on the
// person's next request, so every check here reads it from the account,
// not from the session snapshot taken at sign-in.
const principalOf = (req) => freshPrincipal(sessionPrincipal(req));
const audit = require('../../../shared/services/audit');
const nas = require('../../../services/nasStorage');
const { recordFileEvent } = require('../../../services/nasAudit');
const signInHistory = require('../../../services/signInHistory');
const { getDb, connectToMongo } = require('../../../config/db');
const config = require('../services/configService');
const lookups = require('../services/lookupService');
const units = require('../services/unitDocumentService');
const messages = require('../services/messageService');
const filing = require('../services/filingService');
const settings = require('../services/unitSettingsService');
const dockets = require('../services/docketService');
const tally = require('../services/uploadTallyService');
const { streamInline } = require('../services/streamFile');
const { PDFDocument } = require('pdf-lib');

// ---------------------------------------------------------------------------
// The ERMS units — Legal Services and Laboratory documents, the upload, and
// the configuration behind all three units (Admin Settings > ERMS Config).
// ---------------------------------------------------------------------------

/**
 * What this person sees when they open ERMS: their unit (or all three), each
 * with its document types and forms. The screens are built from this.
 */
async function myUnits(req, res, next) {
  try {
    const user = await principalOf(req);
    const cfg = await config.read();
    const mine = ermsUnitsOf(user);
    res.json({
      units: mine.map((key) => ({
        key,
        label: cfg.units[key]?.label || ERMS_UNIT_LABELS[key],
        container: cfg.units[key]?.container,
        docTypes: cfg.units[key]?.docTypes || [],
        // Which form fields feed the filing folder and year, so the upload
        // form's folder picker can follow them (see FolderPicker).
        folder: cfg.units[key]?.folder
          ? { folderField: cfg.units[key].folder.folderField, yearField: cfg.units[key].folder.yearField }
          : null,
        canFile: canAccessAllYears(user) || (isErmsEndUser(user) && ermsUnitOf(user) === key),
        // Legal: the case-number format and the document types that open a case.
        docket: cfg.units[key]?.docket || null,
      })),
      home: ermsUnitOf(user) || mine[0] || null,
      upload: cfg.upload,
    });
  } catch (error) {
    next(error);
  }
}

async function unitDashboard(req, res, next) {
  try {
    res.json(await units.dashboard(await principalOf(req), req.params.unit));
  } catch (error) {
    next(error);
  }
}

async function listDocuments(req, res, next) {
  try {
    res.json(await units.list(await principalOf(req), req.params.unit, req.query));
  } catch (error) {
    next(error);
  }
}

/** Values already on file in the unit, for the upload form. */
async function suggest(req, res, next) {
  try {
    res.json({ items: await units.suggest(await principalOf(req), req.params.unit, req.query.field, req.query.q) });
  } catch (error) {
    next(error);
  }
}

async function getDocument(req, res, next) {
  try {
    res.json(await units.get(await principalOf(req), req.params.unit, req.params.serialNo));
  } catch (error) {
    next(error);
  }
}

// --- the folder picker ------------------------------------------------------------
//
// The desktop system had the clerk choose or make the project folder on the
// share by hand. These list the folders at that level for a province and
// date, make a new one, and remove one that is empty — so a scan can be
// filed beside the documents already there. Filing rights only: the unit's
// own staff and the Developer, the same rule as the upload.

const canFileIn = (user, unit) => canAccessAllYears(user) || (isErmsEndUser(user) && ermsUnitOf(user) === unit);

/** The unit config and the parent directory for the request, or a response already sent. */
async function folderLevel(req, res) {
  const user = await principalOf(req);
  const unit = req.params.unit;
  if (!canFileIn(user, unit)) {
    res.status(403).json({ code: 'UNIT_WRITE_FORBIDDEN', message: "Only the unit's own staff file its documents." });
    return null;
  }
  const unitCfg = await config.unit(unit);
  if (!unitCfg) {
    res.status(404).json({ code: 'UNIT_UNKNOWN', message: 'Unknown unit.' });
    return null;
  }
  const values = { province: req.query.province || req.body?.province, date: req.query.date || req.body?.date };
  let parent = filing.parentDirectoryFor(unitCfg, values);
  if (!parent) {
    res.json({ applicable: false, unit, folders: [] });
    return null;
  }
  // Inside a project folder: its subfolders.
  const within = nas.safeName(req.query.folder || req.body?.folder, 120);
  if (within) parent = parent + '\\' + within;
  return { user, unit, unitCfg, parent, values, within: within || null };
}

const NAS_FAILURES = {
  'not-configured': [503, 'NAS_NOT_CONFIGURED', "This unit's file storage is not set up yet. Please tell the system administrator."],
  disabled: [503, 'NAS_DISABLED', 'Opening and filing scanned documents is turned off at the moment.'],
  denied: [502, 'NAS_DENIED', 'The system is not allowed to change this folder. Please tell the system administrator.'],
  unreachable: [502, 'NAS_UNREACHABLE', 'The office file storage could not be reached — it may be a power interruption or the office internet. Please try again in a few minutes.'],
  'invalid-path': [422, 'BAD_FOLDER', 'That folder name cannot be used. Try a simpler name.'],
  'not-empty': [409, 'FOLDER_NOT_EMPTY', 'That folder has documents in it, so it cannot be removed.'],
  missing: [404, 'FOLDER_MISSING', 'That folder is no longer there. It may have been moved or renamed.'],
};
const nasFailure = (res, result) => {
  const [status, code, message] = NAS_FAILURES[result.reason] || [502, 'NAS_ERROR', 'The share could not be changed.'];
  return res.status(status).json({ code, message });
};

/** The folders at the filing level for a province and date, and where they are. */
async function listFolders(req, res, next) {
  try {
    const level = await folderLevel(req, res);
    if (!level) return undefined;
    const listing = await nas.listDirectory(level.parent, level.unitCfg.container);
    // A level nobody has filed under yet is simply empty, not an error.
    const folders = listing.ok ? listing.entries.filter((e) => e.type === 'directory').map((e) => e.name) : [];
    if (!listing.ok && listing.reason !== 'missing') return nasFailure(res, listing);
    return res.json({
      applicable: true,
      unit: level.unit,
      container: level.unitCfg.container,
      parent: level.parent,
      within: level.within,
      folders,
      // What the form's own values would file under, so the picker can offer it.
      suggested: nas.safeName(req.query.hint, 120) || null,
    });
  } catch (error) {
    return next(error);
  }
}

async function createFolder(req, res, next) {
  try {
    const level = await folderLevel(req, res);
    if (!level) return undefined;
    const name = nas.safeName(req.body?.name, 120);
    if (!name) return res.status(400).json({ code: 'BAD_NAME', message: 'Give the folder a name.' });
    const made = await nas.createDirectory(level.unitCfg.container, `${level.parent}\\${name}`);
    if (!made.ok) return nasFailure(res, made);
    await recordFileEvent(req, { operation: 'folder-create', containerKey: level.unitCfg.container, fileName: made.sharePath, success: true });
    return res.status(made.existed ? 200 : 201).json({ folder: name, path: made.sharePath, existed: made.existed === true });
  } catch (error) {
    return next(error);
  }
}

async function deleteFolder(req, res, next) {
  try {
    const level = await folderLevel(req, res);
    if (!level) return undefined;
    const name = nas.safeName(req.body?.name, 120);
    if (!name) return res.status(400).json({ code: 'BAD_NAME', message: 'Name the folder to remove.' });
    const removed = await nas.removeDirectory(level.unitCfg.container, `${level.parent}\\${name}`);
    if (!removed.ok) return nasFailure(res, removed);
    await recordFileEvent(req, { operation: 'folder-delete', containerKey: level.unitCfg.container, fileName: removed.sharePath, success: true });
    return res.json({ folder: name, path: removed.sharePath });
  } catch (error) {
    return next(error);
  }
}

// --- the unit's own settings (Settings › ERMS) ----------------------------------------
//
// Read by anyone who may see the unit; changed by its own staff and the
// Developer. See services/unitSettingsService.js for what each setting does.

const canSeeUnit = (user, unit) => ermsUnitsOf(user).includes(unit);

async function getSettings(req, res, next) {
  try {
    const user = await principalOf(req);
    const unit = req.params.unit;
    if (!canSeeUnit(user, unit)) return res.status(403).json({ code: 'UNIT_FORBIDDEN', message: "This unit is not part of your account." });
    const all = await settings.readAll();
    res.json({
      unit,
      settings: all.units[unit],
      canEdit: canFileIn(user, unit),
      classifications: settings.CLASSIFICATIONS,
      updatedAt: all.updatedAt,
      updatedBy: all.updatedBy,
    });
  } catch (error) {
    next(error);
  }
}

async function saveSettings(req, res, next) {
  try {
    const user = await principalOf(req);
    const unit = req.params.unit;
    if (!canFileIn(user, unit)) return res.status(403).json({ code: 'UNIT_WRITE_FORBIDDEN', message: "Only the unit's own staff change its settings." });
    const before = await settings.forUnit(unit);
    const saved = await settings.save(unit, req.body || {}, user);
    await audit.record(req, {
      domain: DOMAINS.ERMS,
      action: 'settings',
      label: `${unit} settings changed`,
      collection: settings.COLLECTION,
      documentId: settings.DOC_ID,
      changes: audit.diff(before, saved),
      includeBody: false,
    });
    res.json({ unit, settings: saved });
  } catch (error) {
    next(error);
  }
}

async function resetSettings(req, res, next) {
  try {
    const user = await principalOf(req);
    const unit = req.params.unit;
    if (!canFileIn(user, unit)) return res.status(403).json({ code: 'UNIT_WRITE_FORBIDDEN', message: "Only the unit's own staff change its settings." });
    const saved = await settings.reset(unit);
    await audit.record(req, { domain: DOMAINS.ERMS, action: 'settings', label: `${unit} settings reset`, collection: settings.COLLECTION, documentId: settings.DOC_ID, includeBody: false });
    res.json({ unit, settings: saved });
  } catch (error) {
    next(error);
  }
}

/**
 * The unit's log history: what happened to its documents, from the audit
 * trail (views, uploads, shares, decisions, settings) and — for the Records
 * Unit, when the setting allows — the desktop system's log. Newest first,
 * within the retention the unit chose.
 */
async function unitActivity(req, res, next) {
  try {
    const user = await principalOf(req);
    const unit = req.params.unit;
    if (!canSeeUnit(user, unit)) return res.status(403).json({ code: 'UNIT_FORBIDDEN', message: "This unit is not part of your account." });
    const cfg = await settings.forUnit(unit);
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const since = new Date(Date.now() - cfg.logHistory.retentionDays * 86400000);
    const q = String(req.query.q || '').trim();
    await connectToMongo();

    // NAS events name the container; application events name the ERMS domain.
    const filter = {
      timestamp: { $gte: since },
      $or: [{ domain: 'nas', container: unit }, { domain: 'erms' }],
    };
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$and = [{ $or: [{ username: rx }, { serialNo: rx }, { documentId: rx }, { fileName: rx }, { actionLabel: rx }, { operation: rx }] }];
    }
    // The unit's own staff, whose sign-ins and sign-outs belong in its log
    // as they did in each desktop subsystem's employee history.
    const staff = (await getDb().collection('users').find({ permission: 'records' }, { projection: { username: 1, permission: 1, ermsUnit: 1 } }).toArray())
      .filter((u) => ermsUnitOf(u) === unit)
      .map((u) => u.username);

    const [rows, signIns] = await Promise.all([
      getDb()
        .collection('app-logs')
        .find(filter, { projection: { requestData: 0, userAgent: 0 } })
        .sort({ timestamp: -1 })
        .limit(limit)
        .toArray(),
      signInHistory.list({ usernames: staff, since, q, limit }),
    ]);

    const events = [
      ...rows.map((r) => ({
        id: String(r._id),
        at: r.timestamp,
        who: r.username || null,
        source: r.domain === 'nas' ? 'document' : 'application',
        action: r.operation || r.actionType || null,
        label: r.actionLabel || r.operation || r.actionType || null,
        serialNo: r.serialNo || r.documentId || null,
        fileName: r.fileName || null,
        success: r.success !== false,
        detail: r.detail || null,
        changes: r.changes || null,
        ip: r.ip || null,
      })),
      ...signIns.map((s, i) => ({
        id: `sign-${s.at.getTime()}-${i}`,
        at: s.at,
        who: s.username,
        source: 'sign-in',
        action: s.event,
        label: s.event === 'sign-in' ? 'Signed in' : 'Signed out',
        serialNo: null,
        fileName: null,
        success: true,
        detail: null,
        changes: null,
        ip: s.ip || null,
      })),
    ]
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, limit);

    res.json({ unit, since, events });
  } catch (error) {
    next(error);
  }
}

/** File names filed more than once in the unit (Settings › Duplicates). */
async function unitDuplicateGroups(req, res, next) {
  try {
    res.json({ groups: await units.duplicateGroups(await principalOf(req), req.params.unit) });
  } catch (error) {
    next(error);
  }
}

/** Documents already carrying a file name — the upload form's warning, per the unit's rule. */
async function unitDuplicateCheck(req, res, next) {
  try {
    const cfg = await settings.forUnit(req.params.unit);
    const duplicates = cfg.duplicates.warnOnFileName ? await units.duplicatesByFileName(await principalOf(req), req.params.unit, req.query.fileName) : [];
    res.json({ duplicates, blocks: false });
  } catch (error) {
    next(error);
  }
}

/** Multipart: `file`, plus `docType`, `province`, `parentSerialNo`, `folder` and `fields` (JSON). */
async function createDocument(req, res, next) {
  try {
    const user = await principalOf(req);
    let fields = {};
    try {
      fields = req.body?.fields ? JSON.parse(req.body.fields) : {};
    } catch {
      return res.status(400).json({ code: 'BAD_FIELDS', message: 'The form values could not be read.' });
    }
    const input = { docType: req.body?.docType, province: req.body?.province, parentSerialNo: req.body?.parentSerialNo, folder: req.body?.folder, subfolder: req.body?.subfolder, fields };
    const document = await units.create(user, req.params.unit, input, req.file);
    await recordFileEvent(req, {
      operation: 'document-upload',
      serialNo: document.serialNo,
      containerKey: document.document.container,
      fileName: document.document.fileName,
      success: true,
      bytes: document.document.size,
      detail: `${req.params.unit}/${document.docType}`,
    });
    await audit.record(req, {
      domain: DOMAINS.ERMS,
      action: 'document-upload',
      label: `${document.docTypeLabel} filed`,
      collection: units.COLLECTION,
      documentId: document.serialNo,
      changes: { unit: document.unit, docType: document.docType, province: document.province, fileName: document.document.fileName },
      includeBody: false,
    });
    res.status(201).json({ document });
  } catch (error) {
    if (error.code === 'VALIDATION') return res.status(400).json({ code: error.code, message: error.message, errors: error.errors });
    next(error);
  }
}

async function updateDocument(req, res, next) {
  try {
    const document = await units.update(await principalOf(req), req.params.unit, req.params.serialNo, req.body || {});
    await audit.record(req, {
      domain: DOMAINS.ERMS,
      action: 'document-update',
      label: 'document metadata changed',
      collection: units.COLLECTION,
      documentId: document.serialNo,
    });
    res.json({ document });
  } catch (error) {
    if (error.code === 'VALIDATION') return res.status(400).json({ code: error.code, message: error.message, errors: error.errors });
    next(error);
  }
}

/**
 * Multipart: `file`, plus `replace` ('keep' | 'delete', when the document
 * already has a scan), `folder` and `subfolder`. See unitDocumentService.attachFile.
 */
async function attachDocumentFile(req, res, next) {
  try {
    const result = await units.attachFile(await principalOf(req), req.params.unit, req.params.serialNo, req.file, {
      replace: String(req.body?.replace || ''),
      folder: req.body?.folder || null,
      subfolder: req.body?.subfolder || null,
    });
    const { document, previous, container } = result;
    await recordFileEvent(req, {
      operation: 'document-upload',
      serialNo: document.serialNo,
      containerKey: container,
      fileName: document.document.fileName,
      success: true,
      bytes: document.document.size,
      detail: previous ? `${req.params.unit}/${document.docType} (re-uploaded, replacing ${previous.fileName})` : `${req.params.unit}/${document.docType} (attached)`,
    });
    if (previous && previous.reason !== 'kept') {
      await recordFileEvent(req, {
        operation: 'document-delete',
        serialNo: document.serialNo,
        containerKey: container,
        fileName: previous.fileName,
        success: previous.deleted,
        bytes: previous.size,
        detail: previous.deleted ? 'replaced by re-upload' : `could not delete: ${previous.reason}`,
      });
    }
    await audit.record(req, {
      domain: DOMAINS.ERMS,
      action: 'document-upload',
      label: previous ? 'scan re-uploaded' : 'scan filed against document',
      collection: units.COLLECTION,
      documentId: document.serialNo,
      changes: { fileName: document.document.fileName, sharePath: document.document.sharePath, previous },
      includeBody: false,
    });
    const { size, ...shown } = previous || {};
    res.json({ document, previous: previous ? shown : null });
  } catch (error) {
    next(error);
  }
}

/** The unit document's file, resolved on the share — or a response already sent. */
async function resolveUnitFile(req, res) {
  const doc = await units.forFile(await principalOf(req), req.params.unit, req.params.serialNo);
  const stored = doc.document?.sharePath || doc.document?.filePath;
  if (!stored) {
    res.status(404).json({ code: 'NO_DOCUMENT', message: 'This entry has no file.' });
    return null;
  }
  const containerKey = String(doc.document?.container || req.params.unit).toLowerCase();
  const file = await nas.statFile(stored, containerKey);
  if (!file.ok) {
    const responses = {
      'not-configured': [503, 'NAS_NOT_CONFIGURED', 'This unit\'s storage container is not configured on the server.'],
      disabled: [503, 'NAS_DISABLED', 'Document access is turned off.'],
      'invalid-path': [422, 'BAD_STORED_PATH', 'The stored file path cannot be resolved.'],
      missing: [404, 'FILE_MISSING', 'The document is recorded but is not on the share.'],
      'not-a-file': [404, 'FILE_MISSING', 'The document is recorded but is not on the share.'],
      denied: [502, 'NAS_DENIED', 'The server is not permitted to read this document.'],
      unreachable: [502, 'NAS_UNREACHABLE', 'The share could not be reached.'],
    };
    const [status, code, message] = responses[file.reason] || [502, 'NAS_ERROR', 'The document could not be read.'];
    await recordFileEvent(req, { operation: 'document-read', serialNo: doc.serialNo, containerKey, fileName: doc.document?.fileName, success: false, detail: file.reason });
    res.status(status).json({ code, message });
    return null;
  }
  return { doc, file, containerKey };
}

// ---------------------------------------------------------------------------
// Asking for the whole of a document the viewer shows only in part.
//
// The unit's own staff are limited too (Settings › PDF viewing), and there
// is no inbox for a member of staff asking about their own unit's document.
// So the request goes to the administrators — the Developer and
// Administrator accounts, who see every page and can change the setting —
// as an ERMS message, purpose "Request". (Someone outside the Records Unit
// viewing by approval asks the Records Unit instead, through its inbox.)
// Once a day per document per person, so the button cannot flood an inbox.
// ---------------------------------------------------------------------------

const fullRequestSubject = (serialNo) => `Full access request: ${serialNo}`;

/** When this person last asked for the whole of this document (within a day), or null. */
async function fullRequestAt(user, serialNo) {
  if (!user?.username) return null;
  const last = await getDb()
    .collection(messages.COLLECTION)
    .findOne({ 'from.username': user.username, subject: fullRequestSubject(serialNo), sentAt: { $gte: new Date(Date.now() - 86400000) } }, { sort: { sentAt: -1 }, projection: { sentAt: 1 } });
  return last?.sentAt || null;
}

/** The Developer and Administrator accounts that work in ERMS: who a full-access request goes to. */
async function administrators(exceptUsername) {
  const rows = await getDb()
    .collection('users')
    .find({ username: { $ne: exceptUsername }, permission: { $in: ['developer', 'admin'] } }, { projection: { username: 1, permission: 1, domains: 1, ermsUnit: 1 } })
    .toArray();
  return rows.filter((u) => canAccessAllYears(u) && (u.domains || []).includes(DOMAINS.ERMS));
}

/** Send the request; responds for the route. */
async function askAdministrators(req, res, { user, serialNo, title, fileName, unitLabel }) {
  const already = await fullRequestAt(user, serialNo);
  if (already) return res.json({ sent: 0, already: true, at: already });
  const admins = await administrators(user.username);
  if (!admins.length) {
    return res.status(409).json({ code: 'NO_RECIPIENT', message: 'There is no administrator to send the request to. Please tell the system developer.' });
  }
  const reason = String(req.body?.reason || '').trim().slice(0, 500);
  const details = [
    `${user.name || user.username} (${unitLabel}) asks to see every page of ${serialNo}${title ? ` (${title})` : ''}${fileName ? `, file ${fileName}` : ''}.`,
    "The viewer shows them only the first pages under the unit's PDF viewing setting.",
    reason ? `Their reason: ${reason}` : '',
    "To grant it: Settings › PDF viewing for the unit (raise the limit, or let the unit's own staff see every page), or open the document with them.",
  ].filter(Boolean).join('\n\n');
  let sent = 0;
  for (const to of admins.slice(0, 15)) {
    try {
      await messages.send(user, { to: to.username, purpose: 'Request', subject: fullRequestSubject(serialNo), details });
      sent += 1;
    } catch {
      /* one recipient failing does not stop the others */
    }
  }
  await audit.record(req, { domain: DOMAINS.ERMS, action: 'access-request', label: `full access to ${serialNo} requested from the administrators`, includeBody: false }).catch(() => {});
  return res.json({ sent, to: 'the administrators', at: new Date() });
}

/** A Legal or Laboratory document. */
async function requestFullAccess(req, res, next) {
  try {
    const user = await principalOf(req);
    const { unit, serialNo } = req.params;
    if (!canSeeUnit(user, unit)) return res.status(403).json({ code: 'UNIT_FORBIDDEN', message: 'This unit is not part of your account.' });
    const doc = await getDb().collection(units.COLLECTION).findOne({ unit, serialNo }, { projection: { serialNo: 1, title: 1, 'document.fileName': 1 } });
    if (!doc) return res.status(404).json({ code: 'DOCUMENT_NOT_FOUND', message: 'Document not found.' });
    return askAdministrators(req, res, { user, serialNo, title: doc.title, fileName: doc.document?.fileName, unitLabel: ERMS_UNIT_LABELS[unit] || unit });
  } catch (error) {
    return next(error);
  }
}

/** A Records document, asked by the Records Unit's own staff. */
async function requestRecordFullAccess(req, res, next) {
  try {
    const user = await principalOf(req);
    if (!canSeeUnit(user, 'records')) {
      return res.status(403).json({ code: 'ASK_THE_RECORDS_UNIT', message: 'Ask the Records Unit for the whole document from its viewer.' });
    }
    const serialNo = req.params.serialNo;
    const rec = await getDb().collection('erms-records').findOne({ serialNo }, { projection: { serialNo: 1, projectTitle: 1, 'document.fileName': 1 } });
    if (!rec) return res.status(404).json({ code: 'RECORD_NOT_FOUND', message: 'Record not found.' });
    return askAdministrators(req, res, { user, serialNo, title: rec.projectTitle, fileName: rec.document?.fileName, unitLabel: ERMS_UNIT_LABELS.records || 'Records Unit' });
  } catch (error) {
    return next(error);
  }
}

async function getDocumentFileInfo(req, res, next) {
  try {
    const resolved = await resolveUnitFile(req, res);
    if (!resolved) return undefined;
    const { doc, file } = resolved;
    return res.json({
      serialNo: doc.serialNo,
      fileName: file.fileName,
      size: file.size,
      contentType: file.contentType,
      previewable: file.previewable,
      modifiedAt: file.modifiedAt,
      downloadable: false,
      access: { reason: 'unit', expiresAt: null, fullAccessRequestedAt: await fullRequestAt(await principalOf(req), doc.serialNo) },
      // The unit's viewing rules (Settings › ERMS › PDF viewing / Data
      // privacy): only the unit's own staff see these documents, so a page
      // limit applies only when the unit applied it to itself.
      viewing: await unitViewingRules(req.params.unit, await principalOf(req)),
    });
  } catch (error) {
    return next(error);
  }
}

async function viewDocumentFile(req, res, next) {
  try {
    const resolved = await resolveUnitFile(req, res);
    if (!resolved) return undefined;
    const { doc, file, containerKey } = resolved;
    const viewing = await unitViewingRules(req.params.unit, await principalOf(req));
    const range = /^bytes=(d*)-(d*)$/.exec(req.headers.range || '');
    if (viewing.logViews && (!range || range[1] === '' || range[1] === '0')) {
      await recordFileEvent(req, { operation: 'document-view', serialNo: doc.serialNo, containerKey, fileName: file.fileName, success: true, bytes: file.size });
    }
    if (viewing.pageLimit > 0 && file.contentType === 'application/pdf') {
      return streamPageLimited(res, file, viewing.pageLimit);
    }
    return streamInline(req, res, file);
  } catch (error) {
    return next(error);
  }
}

/** How a unit's own staff see a document, from the unit's settings. */
async function unitViewingRules(unit, user) {
  const cfg = await settings.forUnit(unit);
  // Only the unit's own staff open its documents, so the limit is for them —
  // unless the unit exempted them — and never for the Developer or an
  // administrator.
  const limited = cfg.pdfViewing.previewPageLimit > 0 && !canAccessAllYears(user) && !cfg.pdfViewing.exemptUnit;
  return {
    pageLimit: limited ? cfg.pdfViewing.previewPageLimit : 0,
    blurWithheldPages: cfg.pdfViewing.blurWithheldPages,
    hideToolbar: cfg.pdfViewing.hideToolbar,
    watermark: cfg.privacy.watermarkViewer ? `${user?.name || user?.username || 'viewer'} · ${new Date().toLocaleDateString()}` : null,
    logViews: cfg.auditing.logViews,
  };
}

/** The PDF cut to its first N pages (pdf-lib), page counts in headers; see recordController for the same. */
async function streamPageLimited(res, file, pageLimit) {
  const whole = await new Promise((resolve, reject) => {
    const chunks = [];
    nas.openStream(file.resolved).on('data', (c) => chunks.push(c)).on('end', () => resolve(Buffer.concat(chunks))).on('error', reject);
  });
  let out = whole;
  let total = null;
  try {
    const src = await PDFDocument.load(whole, { ignoreEncryption: true });
    total = src.getPageCount();
    if (total > pageLimit) {
      const cut = await PDFDocument.create();
      const pages = await cut.copyPages(src, Array.from({ length: pageLimit }, (_, i) => i));
      for (const p of pages) cut.addPage(p);
      out = Buffer.from(await cut.save());
    }
  } catch (err) {
    console.warn('PDF page limit not applied:', err.message);
  }
  const safeName = file.fileName.replace(/["\\]/g, '_');
  res.setHeader('Content-Type', file.contentType);
  res.setHeader('Content-Disposition', `inline; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Access-Control-Expose-Headers', 'X-Document-Pages, X-Document-Pages-Shown');
  if (total !== null) {
    res.setHeader('X-Document-Pages', String(total));
    res.setHeader('X-Document-Pages-Shown', String(Math.min(total, pageLimit)));
  }
  res.setHeader('Content-Length', out.length);
  return res.end(out);
}

// --- configuration (Admin Settings > ERMS Config) --------------------------------

async function getConfig(req, res, next) {
  try {
    const cfg = await config.read();
    const lists = await lookups.all();
    res.json({
      ...cfg,
      defaults: config.DEFAULTS,
      fieldTypes: config.FIELD_TYPES,
      folderTokens: config.FOLDER_TOKENS,
      lookups: Object.fromEntries(Object.entries(lists).map(([kind, v]) => [kind, { unit: v.unit, description: v.description, count: v.items.length, importedAt: v.importedAt }])),
    });
  } catch (error) {
    next(error);
  }
}

async function saveConfig(req, res, next) {
  try {
    const cfg = await config.save(req.body || {}, sessionPrincipal(req));
    await audit.record(req, { domain: DOMAINS.ERMS, action: 'config-save', label: 'ERMS configuration saved', collection: config.COLLECTION, documentId: config.DOC_ID, includeBody: false });
    res.json(cfg);
  } catch (error) {
    next(error);
  }
}

async function resetConfig(req, res, next) {
  try {
    const cfg = await config.reset(sessionPrincipal(req));
    await audit.record(req, { domain: DOMAINS.ERMS, action: 'config-reset', label: 'ERMS configuration reset to the legacy layout', collection: config.COLLECTION, documentId: config.DOC_ID });
    res.json(cfg);
  } catch (error) {
    next(error);
  }
}

/** One lookup list in full, for editing. */
async function getLookup(req, res, next) {
  try {
    const lists = await lookups.all();
    const list = lists[req.params.kind];
    if (!list) return res.status(404).json({ code: 'LOOKUP_UNKNOWN', message: 'No such list.' });
    return res.json({ kind: req.params.kind, ...list });
  } catch (error) {
    return next(error);
  }
}

/**
 * Replace a lookup list's items. The whole list comes back from the
 * editor, so a removed entry is simply absent; the loader's provenance
 * fields are kept.
 */
async function saveLookup(req, res, next) {
  try {
    const kind = String(req.params.kind || '').trim();
    if (!/^[a-z][a-z-]{1,40}$/.test(kind)) return res.status(400).json({ code: 'BAD_KIND', message: 'Bad list name.' });
    const saved = await lookups.save(kind, req.body?.items, { actor: sessionPrincipal(req), description: req.body?.description, unit: req.body?.unit });
    await audit.record(req, { domain: DOMAINS.ERMS, action: 'lookup-save', label: `lookup list ${kind} saved (${saved.count} items)`, collection: lookups.COLLECTION, documentId: kind, includeBody: false });
    return res.json(saved);
  } catch (error) {
    return next(error);
  }
}

// --- the unit's own menus (Settings › ERMS › Menus) ------------------------------------
//
// The lists the unit's forms offer and the desktop system let the unit keep
// itself: Legal's officers, case handlers, statuses and nature of business;
// the Laboratory's parameter groups; the Records project types and document
// statuses. Read by anyone in the unit, changed by its staff and the Developer.

async function unitLookups(req, res, next) {
  try {
    const user = await principalOf(req);
    const unit = req.params.unit;
    if (!canSeeUnit(user, unit)) return res.status(403).json({ code: 'UNIT_FORBIDDEN', message: 'This unit is not part of your account.' });
    res.json({ unit, canEdit: canFileIn(user, unit), lists: await lookups.forUnit(unit) });
  } catch (error) {
    next(error);
  }
}

async function saveUnitLookup(req, res, next) {
  try {
    const user = await principalOf(req);
    const { unit, kind } = req.params;
    if (!canFileIn(user, unit)) return res.status(403).json({ code: 'UNIT_WRITE_FORBIDDEN', message: "Only the unit's own staff change its menus." });
    if (!(await lookups.unitMayEdit(unit, kind))) return res.status(404).json({ code: 'LOOKUP_UNKNOWN', message: 'That list is not one of this unit\'s menus.' });
    const saved = await lookups.save(kind, req.body?.items, { actor: user });
    await audit.record(req, { domain: DOMAINS.ERMS, action: 'lookup-save', label: `${unit} menu ${kind} saved (${saved.count} items)`, collection: lookups.COLLECTION, documentId: kind, includeBody: false });
    return res.json(saved);
  } catch (error) {
    return next(error);
  }
}

// --- docket numbers (Legal) -----------------------------------------------------------

const legalOnly = (req, res) => {
  if (req.params.unit === 'legal') return true;
  res.status(404).json({ code: 'NO_DOCKETS', message: 'Only the Legal Services Unit issues docket numbers.' });
  return false;
};

async function nextDocket(req, res, next) {
  try {
    if (!legalOnly(req, res)) return undefined;
    return res.json(await dockets.peek(await principalOf(req), req.query.province, req.query.year || new Date().getFullYear()));
  } catch (error) {
    return next(error);
  }
}

async function claimDocket(req, res, next) {
  try {
    if (!legalOnly(req, res)) return undefined;
    const entry = await dockets.claim(await principalOf(req), { province: req.body?.province, year: req.body?.year || new Date().getFullYear(), note: req.body?.note });
    await audit.record(req, { domain: DOMAINS.ERMS, action: 'docket-issue', label: `docket ${entry.docketNo} issued`, collection: dockets.COLLECTION, documentId: entry.docketNo, changes: { province: entry.province, year: entry.year }, includeBody: false });
    return res.status(201).json({ docket: entry });
  } catch (error) {
    return next(error);
  }
}

async function listDockets(req, res, next) {
  try {
    if (!legalOnly(req, res)) return undefined;
    return res.json({ dockets: await dockets.list(await principalOf(req), req.query) });
  } catch (error) {
    return next(error);
  }
}

// --- the upload tally ------------------------------------------------------------------

async function uploadTally(req, res, next) {
  try {
    const result = await tally.tally(await principalOf(req), req.params.unit, req.query);
    if (req.query.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="erms-${result.unit}-upload-tally-${result.from}-to-${result.to}.csv"`);
      return res.send(tally.toCsv(result));
    }
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

async function checkUploads(req, res, next) {
  try {
    const result = await tally.check(await principalOf(req), req.params.unit, req.body || {});
    if (result.checked.length) {
      await audit.record(req, {
        domain: DOMAINS.ERMS,
        action: 'upload-check',
        label: `${req.params.unit} uploads checked (${result.checked.length} day${result.checked.length === 1 ? '' : 's'})`,
        collection: tally.CHECKS,
        changes: { entries: result.checked.map((c) => ({ date: c.date, uploader: c.uploader, total: c.total })), remarks: req.body?.remarks || null },
        includeBody: false,
      });
    }
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

async function uncheckUploads(req, res, next) {
  try {
    const removed = await tally.uncheck(await principalOf(req), req.params.unit, req.body || {});
    if (!removed) return res.status(404).json({ code: 'NOT_CHECKED', message: 'That day was not checked.' });
    await audit.record(req, {
      domain: DOMAINS.ERMS,
      action: 'upload-check',
      label: `${req.params.unit} upload check withdrawn`,
      collection: tally.CHECKS,
      changes: { date: removed.date, uploader: removed.uploader, checkedBy: removed.checkedBy },
      includeBody: false,
    });
    return res.json({ removed: { date: removed.date, uploader: removed.uploader } });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  myUnits,
  unitDashboard,
  listDocuments,
  suggest,
  getDocument,
  createDocument,
  updateDocument,
  attachDocumentFile,
  listFolders,
  createFolder,
  deleteFolder,
  getSettings,
  saveSettings,
  resetSettings,
  unitActivity,
  unitDuplicateGroups,
  unitDuplicateCheck,
  getDocumentFileInfo,
  viewDocumentFile,
  requestFullAccess,
  requestRecordFullAccess,
  fullRequestAt,
  getConfig,
  saveConfig,
  resetConfig,
  getLookup,
  saveLookup,
  unitLookups,
  saveUnitLookup,
  nextDocket,
  claimDocket,
  listDockets,
  uploadTally,
  checkUploads,
  uncheckUploads,
};

