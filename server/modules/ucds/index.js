const registryService = require('./services/registryService');

// ---------------------------------------------------------------------------
// The UCDS module's public face.
//
// `read` is what other domains may call. There is no write API: the register
// is owned by UCDS, and a records clerk who finds a firm missing raises it
// with Planning rather than creating it from ERMS.
//
// The routes still live in server/routes/ucdsRoutes.js; only the cross-domain
// surface has been pulled out so far.
// ---------------------------------------------------------------------------

module.exports = {
  routes: require('./routes'),
  read: {
    resolveByPermitNumber: registryService.resolveByPermitNumber,
    findBySortKey: registryService.findBySortKey,
    search: registryService.search,
  },
};
