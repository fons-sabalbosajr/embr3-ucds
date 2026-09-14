const containers = require('./nasContainers');

// ---------------------------------------------------------------------------
// The records share's connection details.
//
// This used to hold one share's configuration in one document. Shares are
// now containers — see nasContainers.js — and this module is the same API
// pointed at the `records` container, so the single-share routes, screens and
// tests carry on unchanged while everything new goes through containers.
//
// The environment remains the fallback for `records`, deliberately: a
// deployment that has never opened the settings screen keeps working, and if
// CONFIG_ENCRYPTION_KEY is missing the environment is what is left.
// ---------------------------------------------------------------------------

const KEY = containers.RECORDS_KEY;

module.exports = {
  resolve: () => containers.resolve(KEY),
  describe: () => containers.describe(KEY),
  save: (input, actor) => containers.save(KEY, input, actor),
  applyToWindows: containers.applyToWindows,
  history: () => containers.history(KEY),
  recordTest: (outcome) => containers.recordTest(KEY, outcome),
  reset: () => containers.reset(KEY),
  // Where the records container is stored. Tests read and restore it here.
  COLLECTION: containers.COLLECTION,
  DOC_ID: KEY,
};
