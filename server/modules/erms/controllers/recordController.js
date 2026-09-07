const recordService = require('../services/recordService');
const { principalOf } = require('../../../middleware/auth');
const { canAccessAllYears } = require('../../../services/authorization');
const { userProvinceKeys } = require('../../../services/provinces');
const { notFoundError } = require('../../../shared/middleware/errorHandler');

/**
 * Province scope for the acting user, or null when unrestricted.
 *
 * Records are not year-scoped, so `resolveYearContext` does not run on these
 * routes and `req.provinceKeys` is never set. The scope is therefore derived
 * from the account directly, using the same helpers the UCDS side uses — a
 * Records clerk assigned to Bataan sees Bataan records.
 */
function scopeOf(req) {
  const user = principalOf(req);
  if (!user || canAccessAllYears(user)) return null;
  return userProvinceKeys(user);
}

async function listRecords(req, res, next) {
  try {
    res.json(await recordService.listRecords(req.query, scopeOf(req)));
  } catch (error) {
    next(error);
  }
}

async function getRecord(req, res, next) {
  try {
    const record = await recordService.getRecord(req.params.serialNo, scopeOf(req));
    if (!record) throw notFoundError('Record not found.', 'RECORD_NOT_FOUND');

    const attachments = record.isAttachment
      ? []
      : await recordService.listAttachments(record.serialNo);

    res.json({ record, attachments });
  } catch (error) {
    next(error);
  }
}

async function dashboard(req, res, next) {
  try {
    res.json(await recordService.dashboardStats(scopeOf(req)));
  } catch (error) {
    next(error);
  }
}

async function filterOptions(req, res, next) {
  try {
    res.json(await recordService.filterOptions(scopeOf(req)));
  } catch (error) {
    next(error);
  }
}

module.exports = { listRecords, getRecord, dashboard, filterOptions };
