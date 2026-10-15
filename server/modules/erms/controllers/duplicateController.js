const { principalOf } = require('../../../middleware/auth');
const { ermsUnitsOf, canAccessAllYears, DOMAINS } = require('../../../services/authorization');
const { userProvinceKeys } = require('../../../services/provinces');
const audit = require('../../../shared/services/audit');
const duplicates = require('../../../services/vera/duplicateFix');

// ---------------------------------------------------------------------------
// Settings › ERMS › Duplicates — VERA's reading of each group, and the quick
// fix. Anyone who sees the unit sees the reading; the Developer or an
// administrator fixes, marks "not a duplicate" and restores.
// ---------------------------------------------------------------------------

const scopeOf = (req) => String(req.params.unit || '').toLowerCase();
const provinces = (user) => (canAccessAllYears(user) ? null : userProvinceKeys(user));

function guard(req, res, { fixing = false } = {}) {
  const user = principalOf(req);
  const unit = scopeOf(req);
  if (!['records', 'legal', 'laboratory'].includes(unit)) {
    res.status(400).json({ message: 'Unknown unit.' });
    return null;
  }
  if (!canAccessAllYears(user) && !ermsUnitsOf(user).includes(unit)) {
    res.status(403).json({ code: 'UNIT_FORBIDDEN', message: 'This unit is not part of your account.' });
    return null;
  }
  if (fixing && !canAccessAllYears(user)) {
    res.status(403).json({ code: 'FIX_FORBIDDEN', message: 'Only the Developer or an administrator fixes duplicates.' });
    return null;
  }
  return { user, unit };
}

async function review(req, res, next) {
  try {
    const ok = guard(req, res);
    if (!ok) return undefined;
    const [groups, setAside] = await Promise.all([duplicates.review(ok.unit, provinces(ok.user)), duplicates.setAsideList(ok.unit)]);
    return res.json({ groups, setAside, canFix: canAccessAllYears(ok.user) });
  } catch (error) {
    return next(error);
  }
}

async function fix(req, res, next) {
  try {
    const ok = guard(req, res, { fixing: true });
    if (!ok) return undefined;
    const keys = req.body?.all === true ? 'all' : (Array.isArray(req.body?.keys) ? req.body.keys : []).map(String).slice(0, 300);
    if (keys !== 'all' && !keys.length) return res.status(400).json({ message: 'Choose the groups to fix.' });
    const result = await duplicates.fix(ok.unit, keys, ok.user, provinces(ok.user));
    await audit.record(req, { domain: DOMAINS.ERMS, action: 'duplicates-fixed', label: `VERA fixed ${result.groups} duplicate group(s) in ${ok.unit}; ${result.setAside} entr${result.setAside === 1 ? 'y' : 'ies'} set aside`, collection: duplicates.SET_ASIDE, changes: result, includeBody: false });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

async function dismiss(req, res, next) {
  try {
    const ok = guard(req, res, { fixing: true });
    if (!ok) return undefined;
    const result = await duplicates.dismiss(ok.unit, String(req.body?.key || ''), ok.user, provinces(ok.user));
    if (!result.ok) return res.status(result.status).json({ message: result.message });
    await audit.record(req, { domain: DOMAINS.ERMS, action: 'duplicates-dismissed', label: `Marked not a duplicate: ${req.body?.key}`, collection: duplicates.REVIEWS, includeBody: false });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

async function restore(req, res, next) {
  try {
    const ok = guard(req, res, { fixing: true });
    if (!ok) return undefined;
    const result = await duplicates.restore(ok.unit, String(req.body?.serialNo || ''));
    if (!result.ok) return res.status(result.status).json({ message: result.message });
    await audit.record(req, { domain: DOMAINS.ERMS, action: 'duplicates-restored', label: `Restored ${req.body?.serialNo}`, collection: duplicates.SET_ASIDE, documentId: req.body?.serialNo, includeBody: false });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

module.exports = { review, fix, dismiss, restore };
