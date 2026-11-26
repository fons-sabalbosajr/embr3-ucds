const express = require('express');
const { authenticateSession, requireDeveloper, principalOf } = require('../middleware/auth');
const { requireElevation } = require('../services/nasElevation');
const { expensiveLimiter } = require('../config/security');
const { connectToMongo, getDb } = require('../config/db');
const legacySql = require('../services/legacySql');

// ---------------------------------------------------------------------------
// The legacy ERMS SQL Server (services/legacySql.js): its connection
// settings, a test, the list of tables and a preview of each. Developer
// only, after the same email verification as the NAS settings, because the
// login is a credential to another system. Everything is read-only.
// Every call is written to the audit trail (Admin tab).
// ---------------------------------------------------------------------------

const router = express.Router();
const verified = [authenticateSession, requireDeveloper, requireElevation];

async function audit(req, operation, success, detail) {
  try {
    const user = principalOf(req) || {};
    await connectToMongo();
    await getDb().collection('app-logs').insertOne({
      userId: user.userId || null,
      username: user.username || null,
      domain: 'admin',
      method: req.method,
      path: req.originalUrl ? String(req.originalUrl).split('?')[0] : null,
      actionType: operation,
      actionLabel: detail,
      success,
      ip: req.ip || null,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('SQL Server audit write failed:', error.message);
  }
}

const failure = (res, error) => {
  const known = { NOT_CONFIGURED: 409, NO_LOGIN: 409, PASSWORD_UNREADABLE: 409, UNKNOWN_DATABASE: 404, UNKNOWN_TABLE: 404 };
  return res.status(known[error.code] || 502).json({ code: error.code || 'ERROR', message: String(error.message || error).slice(0, 300) });
};

router.get('/api/legacy-sql/config', ...verified, async (req, res, next) => {
  try {
    res.json(await legacySql.describe());
  } catch (error) {
    next(error);
  }
});

router.put('/api/legacy-sql/config', ...verified, async (req, res, next) => {
  try {
    const result = await legacySql.save(req.body || {}, principalOf(req));
    await audit(req, 'legacy-sql-config-save', result.ok === true, result.ok ? `SQL Server settings saved (${result.config.host}, login ${result.config.username})` : result.message);
    if (!result.ok) return res.status(result.status || 400).json(result);
    return res.json(result.config);
  } catch (error) {
    return next(error);
  }
});

router.post('/api/legacy-sql/test', ...verified, expensiveLimiter, async (req, res, next) => {
  try {
    const result = await legacySql.test();
    await audit(req, 'legacy-sql-test', result.ok, result.ok ? `Connected as ${result.login}${result.canWrite ? ' (login can write)' : ''}` : `${result.code}: ${result.message}`);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/api/legacy-sql/tables', ...verified, expensiveLimiter, async (req, res) => {
  try {
    res.json({ tables: await legacySql.listTables(req.query.db) });
  } catch (error) {
    failure(res, error);
  }
});

// ---- E-Universe's own database (services/euSql.js) --------------------------
// Connected, schema version, size, pending migrations. Never the password.
router.get('/api/eu-sql/status', ...verified, async (req, res, next) => {
  try {
    res.json(await require('../services/euSql').status());
  } catch (error) {
    next(error);
  }
});

// ---- The data explorer -----------------------------------------------------
// Opening a table and exporting one are audited; paging and filtering within
// an open table are not (they would bury the trail), and use the general API
// limit rather than the strict one, so browsing is not throttled.

/** A table's columns and types. Audited: this is "opened the table". */
router.get('/api/legacy-sql/table', ...verified, async (req, res) => {
  const { db, schema, table } = req.query;
  try {
    const result = await legacySql.describeTable(db, schema, table);
    await audit(req, 'legacy-sql-open', true, `Opened ${result.db}.${result.schema}.${result.table}`);
    res.json(result);
  } catch (error) {
    failure(res, error);
  }
});

/** One page, with filters, search, sort and the chosen columns. */
router.post('/api/legacy-sql/query', ...verified, async (req, res) => {
  try {
    res.json(await legacySql.queryTable(req.body || {}));
  } catch (error) {
    failure(res, error);
  }
});

/**
 * A file of the filtered table: ?format=csv|json|xlsx&spec=<JSON>. A GET, so
 * the browser downloads it straight to disk however large it is.
 */
router.get('/api/legacy-sql/export', ...verified, expensiveLimiter, async (req, res) => {
  let spec;
  try {
    spec = JSON.parse(String(req.query.spec || '{}'));
  } catch {
    return res.status(400).json({ message: 'The export request could not be read.' });
  }
  const format = String(req.query.format || 'csv');
  try {
    const result = await legacySql.exportTable(spec, format, res);
    const filters = (spec.filters || []).length + (spec.search ? 1 : 0);
    await audit(
      req,
      'legacy-sql-export',
      true,
      `Exported ${result.rows.toLocaleString()} rows of ${result.db}.${result.schema}.${result.table} as ${format.toUpperCase()}` +
        `${filters ? ` (${filters} filter${filters === 1 ? '' : 's'})` : ''}${result.truncated ? ' (limit reached)' : ''}`
    );
    return undefined;
  } catch (error) {
    await audit(req, 'legacy-sql-export', false, `${spec.db}.${spec.schema}.${spec.table} as ${format}: ${error.code || error.message}`);
    if (res.headersSent) return res.end();
    return failure(res, error);
  }
});

module.exports = router;
