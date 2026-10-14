const portalService = require('./services/portalService');
const portalChat = require('./services/portalChat');

// ---------------------------------------------------------------------------
// The E-Universe Document Portal module's public face.
//
// It serves the ERMS Records library's scans, so app.js mounts it with the
// ERMS module and server.js starts its clock (the sweep that ends approvals
// on time and seats the waiting line) once the database is up.
// ---------------------------------------------------------------------------

module.exports = {
  routes: require('./routes'),
  ensureIndexes: async () => {
    await portalService.ensureIndexes();
    await portalChat.ensureIndexes();
  },
  start: portalService.start,
};
