const registryService = require('../services/registryService');
const { principalOf } = require('../../../middleware/auth');
const { hasDomain, canAccessAllYears, DOMAINS } = require('../../../services/authorization');
const { userProvinceKeys } = require('../../../services/provinces');
const { notFoundError } = require('../../../shared/middleware/errorHandler');

// ---------------------------------------------------------------------------
// Cross-domain surface on the UCDS side.
//
// The records panel degrades rather than fails. A user without the ERMS
// domain, or a deployment with the module switched off, gets
// { available: false } and a 200 — a planning screen must not break because
// the records module is unavailable to that person. The decision is made
// server-side; the client only renders what it is told.
// ---------------------------------------------------------------------------

const UNAVAILABLE = { available: false, records: [], total: 0 };

function scopeOf(req) {
  const user = principalOf(req);
  if (!user || canAccessAllYears(user)) return null;
  return userProvinceKeys(user);
}

/** Records filed against an establishment. */
async function establishmentRecords(req, res, next) {
  try {
    const user = principalOf(req);
    const erms = require('../../erms');

    if (!erms.isEnabled() || !hasDomain(user, DOMAINS.ERMS)) {
      return res.json(UNAVAILABLE);
    }

    const { sortKey } = req.params;
    const establishment = await registryService.findBySortKey(sortKey);
    if (!establishment) throw notFoundError('Establishment not found.', 'ESTABLISHMENT_NOT_FOUND');

    const [total, records] = await Promise.all([
      erms.read.countForFirm(sortKey),
      erms.read.listForFirm(sortKey, Number(req.query.limit) || 10),
    ]);

    return res.json({ available: true, sortKey, total, records });
  } catch (error) {
    // A records-module failure must not take a planning screen down with it.
    if (error.status && error.status < 500) return next(error);
    console.error('ERMS panel failed, degrading:', error.message);
    return res.json(UNAVAILABLE);
  }
}

/** Establishment lookup, used by the ERMS record form. */
async function searchRegister(req, res, next) {
  try {
    const results = await registryService.search(
      { query: req.query.q, limit: Number(req.query.limit) || 20 },
      scopeOf(req)
    );
    res.json({
      establishments: results.map((r) => ({
        sortKey: r.sort_key,
        name: r.name || r.title || null,
        province: r.province || null,
        city: r.city || null,
        eccCnc: r.ecc_cnc || null,
        hazId: r.haz_id || null,
      })),
    });
  } catch (error) {
    next(error);
  }
}

/** Resolve a permit number to an establishment, for live feedback in a form. */
async function resolvePermit(req, res, next) {
  try {
    const match = await registryService.resolveByPermitNumber(req.query.number);
    res.json({ match });
  } catch (error) {
    next(error);
  }
}


/**
 * One establishment by its register key.
 *
 * Added for the duplicate-comparison view, which has to show the stored values
 * side by side rather than only the key the records collide on. Province scope
 * applies: an establishment outside the caller's scope answers 404, not 403,
 * so the API does not confirm a record exists to someone who may not see it.
 */
async function getEstablishment(req, res, next) {
  try {
    const establishment = await registryService.findBySortKey(req.params.sortKey, scopeOf(req));
    if (!establishment) throw notFoundError('Establishment not found.', 'ESTABLISHMENT_NOT_FOUND');
    return res.json({ establishment });
  } catch (error) {
    return next(error);
  }
}

module.exports = { establishmentRecords, getEstablishment, searchRegister, resolvePermit };
