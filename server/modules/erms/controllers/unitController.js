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
const { getDb, connectToMongo } = require('../../../config/db');
const config = require('../services/configService');
const lookups = require('../services/lookupService');
const units = require('../services/unitDocumentService');
const filing = require('../services/filingService');
const settings = require('../services/unitSettingsService');
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
  'not-configured': [503, 'NAS_NOT_CONFIGURED', 'The storage container is not configured on this server.'],
  disabled: [503, 'NAS_DISABLED', 'Document access is turned off.'],
  denied: [502, 'NAS_DENIED', 'The server is not permitted to change this folder on the share.'],
  unreachable: [502, 'NAS_UNREACHABLE', 'The share could not be reached.'],
  'invalid-path': [422, 'BAD_FOLDER', 'That folder cannot be resolved inside the share.'],
  'not-empty': [409, 'FOLDER_NOT_EMPTY', 'That folder has documents in it and cannot be removed from here.'],
  missing: [404, 'FOLDER_MISSING', 'That folder is not on the share.'],
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
    const rows = await getDb()
      .collection('app-logs')
      .find(filter, { projection: { requestData: 0, userAgent: 0 } })
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();

    res.json({
      unit,
      since,
      events: rows.map((r) => ({
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
    });
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
  const limited = cfg.pdfViewing.previewPageLimit > 0 && cfg.pdfViewing.applyToUnit;
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
    const items = (Array.isArray(req.body?.items) ? req.body.items : [])
      .map((it) => {
        if (typeof it === 'string') return { code: null, label: it.trim().slice(0, 200) };
        return {
          ...Object.fromEntries(Object.entries(it || {}).filter(([k]) => /^[a-zA-Z][a-zA-Z0-9]{0,30}$/.test(k)).map(([k, v]) => [k, typeof v === 'string' ? v.trim().slice(0, 500) : v])),
          label: String(it?.label || '').trim().slice(0, 200),
        };
      })
      .filter((it) => it.label)
      .slice(0, 5000);
    await connectToMongo();
    const col = getDb().collection(lookups.COLLECTION);
    const existing = await col.findOne({ _id: kind });
    await col.updateOne(
      { _id: kind },
      {
        $set: { kind, items, count: items.length, updatedAt: new Date(), updatedBy: sessionPrincipal(req)?.username || 'unknown', description: req.body?.description ? String(req.body.description).slice(0, 300) : existing?.description || '', unit: existing?.unit || req.body?.unit || null },
        $setOnInsert: { source: 'Admin Settings', importedAt: new Date() },
      },
      { upsert: true }
    );
    lookups.invalidate();
    await audit.record(req, { domain: DOMAINS.ERMS, action: 'lookup-save', label: `lookup list ${kind} saved (${items.length} items)`, collection: lookups.COLLECTION, documentId: kind, includeBody: false });
    return res.json({ kind, items, count: items.length });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  myUnits,
  unitDashboard,
  listDocuments,
  getDocument,
  createDocument,
  updateDocument,
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
  getConfig,
  saveConfig,
  resetConfig,
  getLookup,
  saveLookup,
};

