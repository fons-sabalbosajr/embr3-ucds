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
const filing = require('../services/filingService');
const settings = require('../services/unitSettingsService');
const dockets = require('../services/docketService');
const tally = require('../services/uploadTallyService');
const { streamInline } = require('../services/streamFile');
// The Document Portal's audit entries name this collection (modules/portal).
const PORTAL_COLLECTION = 'portal-requests';

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

/** A document's history — the Legal and Laboratory counterpart of a record's Tracking panel. */
// A Legal or Laboratory unit's archive boxes — where its paper files sit — as
// the Records Unit's (services/archiveService, boxes marked with the unit).
const archive = require('../services/archiveService');
const boxGuard = async (req) => {
  const user = await principalOf(req);
  units.assertCanSee(user, units.assertUnit(req.params.unit));
  return user;
};
async function unitBoxes(req, res, next) {
  try {
    await boxGuard(req);
    res.json({ boxes: await archive.listBoxes({ ...req.query, unit: req.params.unit }, null) });
  } catch (error) {
    next(error);
  }
}
async function createUnitBox(req, res, next) {
  try {
    const user = await boxGuard(req);
    const box = await archive.createBox({ ...req.body, unit: req.params.unit }, { username: user?.username || 'unknown' });
    await audit.record(req, { domain: DOMAINS.ERMS, action: 'Create Archive Box', collection: archive.BOXES, documentId: box.code, label: `Created ${req.params.unit} box ${box.code}` });
    res.status(201).json({ box });
  } catch (error) {
    next(error);
  }
}
async function updateUnitBox(req, res, next) {
  try {
    const user = await boxGuard(req);
    // Only this unit's own boxes, whatever code is sent.
    if (!(await getDb().collection(archive.BOXES).findOne({ code: req.params.code.toUpperCase(), unit: req.params.unit }))) {
      return res.status(404).json({ code: 'BOX_NOT_FOUND', message: 'That box is not one of this unit\'s.' });
    }
    const { before, after } = await archive.updateBox(req.params.code.toUpperCase(), req.body, { username: user?.username || 'unknown' });
    await audit.record(req, { domain: DOMAINS.ERMS, action: after.status === 'disposed' ? 'Record Box Disposal' : 'Update Archive Box', collection: archive.BOXES, documentId: after.code, label: `Updated ${req.params.unit} box ${after.code}`, changes: audit.diff(before, req.body) });
    res.json({ box: after });
  } catch (error) {
    next(error);
  }
}
async function unitBoxContents(req, res, next) {
  try {
    await boxGuard(req);
    res.json({ contents: await archive.boxContents(req.params.code, null, { unit: req.params.unit }) });
  } catch (error) {
    next(error);
  }
}
async function assignUnitBox(req, res, next) {
  try {
    const user = await boxGuard(req);
    const result = await archive.assignRecord(req.params.serialNo, req.body.boxCode, { username: user?.username || 'unknown' }, { unit: req.params.unit });
    await audit.record(req, { domain: DOMAINS.ERMS, action: 'File in Box', collection: units.COLLECTION, documentId: req.params.serialNo, label: result.archive ? `Filed ${req.params.serialNo} in box ${result.archive.boxCode}` : `Took ${req.params.serialNo} out of its box` });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// A Legal or Laboratory document's custody trail — who holds the paper file
// — as the Records Unit keeps one for each record.
async function unitTracking(req, res, next) {
  try {
    await units.get(await principalOf(req), req.params.unit, req.params.serialNo);
    const tracking = require('../services/trackingService');
    res.json({
      tracking: await tracking.listForUnitDocument(req.params.serialNo),
      custody: await tracking.currentCustody(req.params.serialNo),
      actions: tracking.ACTIONS,
    });
  } catch (error) {
    next(error);
  }
}

async function addUnitTracking(req, res, next) {
  try {
    const user = await principalOf(req);
    await units.get(user, req.params.unit, req.params.serialNo);
    const tracking = require('../services/trackingService');
    const entry = await tracking.addEntry(req.params.serialNo, req.body, { username: user?.username || 'unknown' }, { unit: req.params.unit });
    await audit.record(req, { domain: DOMAINS.ERMS, action: 'Track Record', collection: tracking.TRACKING, documentId: req.params.serialNo, label: `${entry.actionLabel} — ${req.params.serialNo}` });
    res.status(201).json({ entry });
  } catch (error) {
    next(error);
  }
}

async function documentHistory(req, res, next) {
  try {
    res.json(await units.history(await principalOf(req), req.params.unit, req.params.serialNo));
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

// ---------------------------------------------------------------------------
// The folder browser on the upload forms — the desktop ERMS's own step: the
// clerk opens folders on their unit's share (Records, Legal or Laboratory,
// by the account), makes one where they need it, and files the scan there.
// Paths are relative to the unit's root; nothing above the root is
// reachable, and only the unit's own staff may look.
// ---------------------------------------------------------------------------

async function browseLevel(req, res) {
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
  const rawPath = req.query.path ?? req.body?.path ?? '';
  const path = rawPath ? nas.safeRelativePath(rawPath) : '';
  const dir = filing.underRoot(unitCfg, path);
  if (path === null || !dir) {
    res.status(400).json({ code: 'BAD_FOLDER', message: 'That folder cannot be opened.' });
    return null;
  }
  return { user, unit, unitCfg, path, dir };
}

/** The folders inside one folder of the unit's share, and where the layout would file. */
async function browseFolders(req, res, next) {
  try {
    const level = await browseLevel(req, res);
    if (!level) return undefined;
    const listing = await nas.listDirectory(level.dir, level.unitCfg.container);
    if (!listing.ok && listing.reason !== 'missing') return nasFailure(res, listing);
    const folders = listing.ok
      ? listing.entries.filter((e) => e.type === 'directory').map((e) => e.name).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      : [];
    const rootName = String(level.unitCfg.folder.root || '').split(/[\\/]+/).filter(Boolean).pop() || level.unitCfg.label;
    return res.json({
      unit: level.unit,
      rootName,
      path: level.path,
      exists: listing.ok,
      folders,
      // Where the form's values would file it, so the browser can open there.
      standard: req.query.province ? filing.standardLevel(level.unitCfg, { province: req.query.province, date: req.query.date }) : null,
    });
  } catch (error) {
    return next(error);
  }
}

/** Make a folder inside one folder of the unit's share. */
async function makeBrowseFolder(req, res, next) {
  try {
    const level = await browseLevel(req, res);
    if (!level) return undefined;
    const name = nas.safeName(req.body?.name, 120);
    if (!name || /^[. ]/.test(name)) return res.status(400).json({ code: 'BAD_NAME', message: 'Give the folder a name (letters, numbers, spaces).' });
    const made = await nas.createDirectory(level.unitCfg.container, `${level.dir}\\${name}`);
    if (!made.ok) return nasFailure(res, made);
    await recordFileEvent(req, { operation: 'folder-create', containerKey: level.unitCfg.container, fileName: made.sharePath, success: true });
    return res.status(made.existed ? 200 : 201).json({ folder: name, path: level.path ? `${level.path}\\${name}` : name, existed: made.existed === true });
  } catch (error) {
    return next(error);
  }
}

/**
 * Remove a folder from the unit's share — one made by mistake on the upload
 * form. Empty folders only: the share refuses one with anything in it
 * (FOLDER_NOT_EMPTY), so no scan can be lost this way. Never the unit's
 * root.
 */
async function deleteBrowseFolder(req, res, next) {
  try {
    const level = await browseLevel(req, res);
    if (!level) return undefined;
    if (!level.path) return res.status(400).json({ code: 'BAD_FOLDER', message: "The unit's own top folder cannot be removed." });
    const removed = await nas.removeDirectory(level.unitCfg.container, level.dir);
    if (!removed.ok) return nasFailure(res, removed);
    await recordFileEvent(req, { operation: 'folder-delete', containerKey: level.unitCfg.container, fileName: removed.sharePath, success: true });
    const parts = level.path.split('\\');
    return res.json({ folder: parts[parts.length - 1], path: level.path, parent: parts.slice(0, -1).join('\\') });
  } catch (error) {
    return next(error);
  }
}

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
    // The Document Portal serves the Records Unit's scans, so its requests,
    // decisions and views are in the Records Unit's log and no other unit's.
    // Each subsystem's log is its own: an application event belongs to the
    // unit whose screens made it (its request path). Legal's log used to
    // carry every ERMS event — the Records Unit's uploads and edits among them.
    const otherUnits = /^\/api\/erms\/units\/(legal|laboratory)(\/|$)/;
    const filter = {
      timestamp: { $gte: since },
      $or: [
        { domain: 'nas', container: unit },
        unit === 'records'
          ? { domain: 'erms', path: { $not: otherUnits } }
          : { domain: 'erms', targetCollection: { $ne: PORTAL_COLLECTION }, path: new RegExp(`^/api/erms/units/${unit}(/|$)`) },
      ],
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
        // A Document Portal requester has no account: the name they gave.
        who:
          r.username ||
          (r.targetCollection === PORTAL_COLLECTION && r.changes?.requesterName ? `${r.changes.requesterName} (Document Portal)` : null) ||
          (String(r.operation || '').startsWith('portal-') ? 'Document Portal visitor' : null),
        source: r.domain === 'nas' ? 'document' : 'application',
        action: r.operation || r.actionType || null,
        label: r.actionLabel || r.operation || r.actionType || null,
        serialNo: r.serialNo || r.changes?.serialNo || r.documentId || null,
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
    const input = { docType: req.body?.docType, province: req.body?.province, parentSerialNo: req.body?.parentSerialNo, folder: req.body?.folder, subfolder: req.body?.subfolder, targetPath: req.body?.targetPath, fields };
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
    // On the case's own History too: an attachment filed against it.
    if (document.parentSerialNo) {
      await audit.record(req, {
        domain: DOMAINS.ERMS,
        action: 'attachment-filed',
        label: `attachment ${document.serialNo} filed`,
        collection: units.COLLECTION,
        documentId: document.parentSerialNo,
        changes: { attachment: document.serialNo, fileName: document.document.fileName },
        includeBody: false,
      });
    }
    res.status(201).json({ document });
  } catch (error) {
    if (error.code === 'VALIDATION') return res.status(400).json({ code: error.code, message: error.message, errors: error.errors });
    next(error);
  }
}

async function updateDocument(req, res, next) {
  try {
    const { document, changes } = await units.update(await principalOf(req), req.params.unit, req.params.serialNo, req.body || {});
    await audit.record(req, {
      domain: DOMAINS.ERMS,
      action: 'document-update',
      label: 'document metadata changed',
      collection: units.COLLECTION,
      documentId: document.serialNo,
      changes,
      includeBody: false,
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
      targetPath: req.body?.targetPath || null,
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
      access: { reason: 'unit', expiresAt: null },
      // The unit's viewing rules (Settings › ERMS › PDF viewing / Data
      // privacy): only the unit's own staff see these documents, so a page
      // limit applies only when the unit applied it to itself.
      viewing: await unitViewingRules(req.params.unit, await principalOf(req)),
    });
  } catch (error) {
    return next(error);
  }
}

/** A unit's Document Library as an Excel workbook: the list's filters, every field. */
async function exportDocuments(req, res, next) {
  try {
    const user = await principalOf(req);
    const { isDeveloper } = require('../../../services/authorization');
    const { buffer, count, truncated } = await require('../services/exportService').unitWorkbook(user, req.params.unit, req.query, { developer: isDeveloper(user) });
    await audit.record(req, { domain: DOMAINS.ERMS, action: 'export', label: `${req.params.unit} Document Library exported (${count} documents)`, collection: units.COLLECTION, changes: { filters: req.query, count }, includeBody: false });
    const name = `ERMS-${req.params.unit === 'legal' ? 'Legal' : 'Laboratory'}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.setHeader('X-Export-Rows', String(count));
    res.setHeader('X-Export-Truncated', truncated ? '1' : '0');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, X-Export-Rows, X-Export-Truncated');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.end(buffer);
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
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
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
    watermark: cfg.privacy.watermarkViewer ? require('../services/watermark').watermarkText() : null,
    logViews: cfg.auditing.logViews,
  };
}

/** The PDF cut to its first N pages (pdf-lib), page counts in headers; see recordController for the same. */
async function streamPageLimited(res, file, pageLimit) {
  const { out, total } = await require('../services/streamFile').pageLimitedPdf(file, pageLimit);
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
  unitBoxes,
  createUnitBox,
  updateUnitBox,
  unitBoxContents,
  assignUnitBox,
  unitTracking,
  addUnitTracking,
  exportDocuments,
  myUnits,
  unitDashboard,
  listDocuments,
  suggest,
  getDocument,
  documentHistory,
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
  browseFolders,
  makeBrowseFolder,
  deleteBrowseFolder,
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

