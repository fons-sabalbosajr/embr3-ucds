const recordService = require('./services/recordService');

// ---------------------------------------------------------------------------
// The ERMS module's public face.
//
// `routes` is mounted by app.js when the module is enabled. The read functions
// are what UCDS may call: they are the only supported way into erms-* data
// from outside this module. No cross-domain write API exists, by design.
// ---------------------------------------------------------------------------

const isEnabled = () => process.env.ERMS_MODULE_ENABLED === 'true';

module.exports = {
  isEnabled,
  routes: require('./routes'),
  read: {
    countForFirm: recordService.countForFirm,
    listForFirm: recordService.listForFirm,
  },
};
