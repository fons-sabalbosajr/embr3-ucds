const { connectToMongo, getDb } = require('../../../config/db');
const { ERMS_UNIT_VALUES } = require('../../../services/authorization');

// ---------------------------------------------------------------------------
// A unit's working settings — what its own staff decide about their
// documents, as opposed to the configuration the Developer sets in Admin
// Settings › ERMS Config (units, forms, filing layout).
//
// One document, app-config/erms-unit-settings, one block per unit. Each
// setting here is read somewhere that enforces it:
//
//   dataQuality   the record form (required fields) and the register's
//                 "needs review" list
//   duplicates    the record form warns, and createRecord refuses, a permit
//                 number or file name already filed
//   privacy       the classification an upload gets by default, the list
//                 offered, and the watermark on the viewer
//   pdfViewing    how much of a document people see: the first N pages,
//                 the rest withheld and shown blurred — for everyone but
//                 the Developer, administrators and anyone given the whole
//                 document (the unit's own staff too, unless exempted)
//   auditing      which activities are written to the trail
//   logHistory    how far back the Log history tab reads
// ---------------------------------------------------------------------------

const COLLECTION = 'app-config';
const DOC_ID = 'erms-unit-settings';

const CLASSIFICATIONS = ['Public', 'Internal', 'Confidential', 'Restricted'];

const DEFAULT_UNIT = Object.freeze({
  dataQuality: { requirePermitNumber: false, requireDateApproved: false, requireProjectType: false },
  duplicates: { warnOnPermitNumber: true, warnOnFileName: true, blockOnPermitNumber: false },
  privacy: {
    defaultClassification: 'Public',
    classifications: [...CLASSIFICATIONS],
    watermarkViewer: true,
    hideProponentFromRequesters: false,
  },
  pdfViewing: {
    // 0 means every page. With a limit, it applies to the people who use
    // the documents — the unit's own staff and anyone viewing by approval —
    // not to the Developer or administrators, and not to someone granted
    // the whole document. (It used to exempt the unit's own staff unless
    // "applyToUnit" was set, so the limit reached almost nobody: a Legal
    // document is only ever opened by Legal staff.)
    previewPageLimit: 0,
    blurWithheldPages: true,
    // Let the unit's own staff see every page all the same.
    exemptUnit: false,
    applyToUnit: false, // superseded by exemptUnit; kept so stored settings still read
    hideToolbar: true,
  },
  auditing: { logViews: true, logSearches: false, logShares: true },
  logHistory: { retentionDays: 365, showDesktopLog: true },
});

const collection = () => getDb().collection(COLLECTION);

const bool = (v, d) => (typeof v === 'boolean' ? v : d);
const int = (v, d, min, max) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return d;
  return Math.min(max, Math.max(min, Math.round(n)));
};

/** A unit's block, every field present, unknown ones dropped. */
function normalizeUnit(input = {}) {
  const d = DEFAULT_UNIT;
  const classifications = Array.isArray(input.privacy?.classifications)
    ? [...new Set(input.privacy.classifications.map((c) => String(c).trim().slice(0, 40)).filter(Boolean))]
    : [...d.privacy.classifications];
  const list = classifications.length ? classifications : [...d.privacy.classifications];
  const defaultClassification = list.includes(String(input.privacy?.defaultClassification)) ? String(input.privacy.defaultClassification) : list[0];
  return {
    dataQuality: {
      requirePermitNumber: bool(input.dataQuality?.requirePermitNumber, d.dataQuality.requirePermitNumber),
      requireDateApproved: bool(input.dataQuality?.requireDateApproved, d.dataQuality.requireDateApproved),
      requireProjectType: bool(input.dataQuality?.requireProjectType, d.dataQuality.requireProjectType),
    },
    duplicates: {
      warnOnPermitNumber: bool(input.duplicates?.warnOnPermitNumber, d.duplicates.warnOnPermitNumber),
      warnOnFileName: bool(input.duplicates?.warnOnFileName, d.duplicates.warnOnFileName),
      blockOnPermitNumber: bool(input.duplicates?.blockOnPermitNumber, d.duplicates.blockOnPermitNumber),
    },
    privacy: {
      defaultClassification,
      classifications: list,
      watermarkViewer: bool(input.privacy?.watermarkViewer, d.privacy.watermarkViewer),
      hideProponentFromRequesters: bool(input.privacy?.hideProponentFromRequesters, d.privacy.hideProponentFromRequesters),
    },
    pdfViewing: {
      previewPageLimit: int(input.pdfViewing?.previewPageLimit, d.pdfViewing.previewPageLimit, 0, 500),
      blurWithheldPages: bool(input.pdfViewing?.blurWithheldPages, d.pdfViewing.blurWithheldPages),
      exemptUnit: bool(input.pdfViewing?.exemptUnit, d.pdfViewing.exemptUnit),
      applyToUnit: bool(input.pdfViewing?.applyToUnit, d.pdfViewing.applyToUnit),
      hideToolbar: bool(input.pdfViewing?.hideToolbar, d.pdfViewing.hideToolbar),
    },
    auditing: {
      logViews: bool(input.auditing?.logViews, d.auditing.logViews),
      logSearches: bool(input.auditing?.logSearches, d.auditing.logSearches),
      logShares: bool(input.auditing?.logShares, d.auditing.logShares),
    },
    logHistory: {
      retentionDays: int(input.logHistory?.retentionDays, d.logHistory.retentionDays, 7, 3650),
      showDesktopLog: bool(input.logHistory?.showDesktopLog, d.logHistory.showDesktopLog),
    },
  };
}

let cache = null;

async function readAll() {
  if (cache) return cache;
  await connectToMongo();
  const stored = (await collection().findOne({ _id: DOC_ID })) || {};
  const units = {};
  for (const key of ERMS_UNIT_VALUES) units[key] = normalizeUnit(stored.units?.[key]);
  cache = { units, updatedAt: stored.updatedAt || null, updatedBy: stored.updatedBy || null };
  return cache;
}

/** One unit's settings, defaults filled in. */
async function forUnit(unit) {
  const all = await readAll();
  return all.units[unit] || normalizeUnit();
}

async function save(unit, input, actor) {
  if (!ERMS_UNIT_VALUES.includes(unit)) throw new Error('Unknown unit.');
  await connectToMongo();
  const all = await readAll();
  // A save names what it changes; everything it leaves out keeps its stored
  // value. Normalizing the input alone filled every omitted section with its
  // default, so saving one tab of the settings page reset all the others.
  const current = all.units[unit] || {};
  const merged = { ...current };
  for (const [section, value] of Object.entries(input || {})) {
    merged[section] = value && typeof value === 'object' && !Array.isArray(value) ? { ...(current[section] || {}), ...value } : value;
  }
  const units = { ...all.units, [unit]: normalizeUnit(merged) };
  const now = new Date();
  await collection().replaceOne(
    { _id: DOC_ID },
    { _id: DOC_ID, units, updatedAt: now, updatedBy: actor?.username || null },
    { upsert: true }
  );
  cache = null;
  return units[unit];
}

async function reset(unit) {
  await connectToMongo();
  const all = await readAll();
  const units = { ...all.units, [unit]: normalizeUnit() };
  await collection().replaceOne({ _id: DOC_ID }, { _id: DOC_ID, units, updatedAt: new Date() }, { upsert: true });
  cache = null;
  return units[unit];
}

const invalidate = () => {
  cache = null;
};

module.exports = { COLLECTION, DOC_ID, CLASSIFICATIONS, DEFAULT_UNIT, normalizeUnit, readAll, forUnit, save, reset, invalidate };
