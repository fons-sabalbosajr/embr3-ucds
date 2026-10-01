const recordService = require('./services/recordService');
const trackingService = require('./services/trackingService');
const archiveService = require('./services/archiveService');
const accessRequestService = require('./services/accessRequestService');
const unitDocumentService = require('./services/unitDocumentService');

// ---------------------------------------------------------------------------
// The ERMS module's public face.
//
// `routes` is mounted by app.js when the module is enabled. The read functions
// are what UCDS may call: they are the only supported way into erms-* data
// from outside this module. No cross-domain write API exists, by design.
// ---------------------------------------------------------------------------

const isEnabled = () => process.env.ERMS_MODULE_ENABLED === 'true';

/** Indexes for the collections this module owns. Called once at startup. */
async function ensureIndexes() {
  await trackingService.ensureIndexes();
  await archiveService.ensureIndexes();
  await accessRequestService.ensureIndexes();
  await unitDocumentService.ensureIndexes();
}

module.exports = {
  isEnabled,
  ensureIndexes,
  routes: require('./routes'),
  read: {
    countForFirm: recordService.countForFirm,
    listForFirm: recordService.listForFirm,
  },
};
