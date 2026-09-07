const { connectToMongo, getDb } = require('../../../config/db');
const { badRequest } = require('../../../shared/middleware/errorHandler');

// ---------------------------------------------------------------------------
// ERMS reports.
//
// Each report is a definition rather than a bespoke endpoint, so a new one is
// a row here instead of another route. All of them respect the caller's
// province scope, and all of them can be exported as CSV.
// ---------------------------------------------------------------------------

const RECORDS = 'erms-records';
const records = () => getDb().collection(RECORDS);

const REPORTS = {
  inventory: {
    label: 'Records inventory',
    description: 'Every record in scope, with its permit, location and register link.',
    columns: [
      ['serialNo', 'Serial'],
      ['proponentName', 'Proponent'],
      ['projectTitle', 'Project'],
      ['permit.label', 'Permit type'],
      ['permit.number', 'Permit number'],
      ['permit.dateApproved', 'Approved'],
      ['location.provinceLabel', 'Province'],
      ['location.city', 'City'],
      ['ucdsRef.sortKey', 'Register key'],
      ['archive.boxCode', 'Box'],
      ['document.fileName', 'File'],
    ],
    filter: () => ({}),
  },

  unlinked: {
    label: 'Records with no register entry',
    description:
      'Records whose permit number matches no establishment. Usually means the register does not cover the record.',
    columns: [
      ['serialNo', 'Serial'],
      ['permit.label', 'Permit type'],
      ['permit.number', 'Permit number'],
      ['proponentName', 'Proponent'],
      ['projectTitle', 'Project'],
      ['location.provinceLabel', 'Province'],
    ],
    filter: () => ({ ucdsRef: null }),
  },

  'needs-review': {
    label: 'Records needing review',
    description: 'Values that could not be interpreted during migration. Originals preserved.',
    columns: [
      ['serialNo', 'Serial'],
      ['proponentName', 'Proponent'],
      ['permit.dateApprovedRaw', 'Approved (as recorded)'],
      ['permit.dateAmendedRaw', 'Amended (as recorded)'],
      ['location.provinceLabel', 'Province'],
      ['sourceRow', 'Row in the source file'],
    ],
    filter: () => ({ 'dataQuality.clean': false }),
  },

  unfiled: {
    label: 'Records not yet filed in a box',
    description: 'Records with no archive box assigned.',
    columns: [
      ['serialNo', 'Serial'],
      ['proponentName', 'Proponent'],
      ['permit.label', 'Permit type'],
      ['location.provinceLabel', 'Province'],
      ['document.uploadedAt', 'Uploaded'],
    ],
    filter: () => ({ $or: [{ archive: null }, { archive: { $exists: false } }] }),
  },
};

const REPORT_KEYS = Object.keys(REPORTS);

const dig = (obj, path) =>
  path.split('.').reduce((acc, k) => (acc === null || acc === undefined ? acc : acc[k]), obj);

const cell = (v) => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
};

async function run(key, { limit = 5000 } = {}, allowedProvinces) {
  await connectToMongo();
  const report = REPORTS[key];
  if (!report) throw badRequest(`Unknown report "${key}".`, 'UNKNOWN_REPORT');

  const filter = { ...report.filter() };
  if (Array.isArray(allowedProvinces)) filter['location.province'] = { $in: allowedProvinces };

  const projection = report.columns.reduce((acc, [field]) => ({ ...acc, [field]: 1 }), {});
  const rows = await records()
    .find(filter, { projection })
    .sort({ serialNo: 1 })
    .limit(limit)
    .toArray();

  return {
    key,
    label: report.label,
    description: report.description,
    columns: report.columns.map(([field, header]) => ({ field, header })),
    rows: rows.map((r) => report.columns.reduce((acc, [f]) => ({ ...acc, [f]: dig(r, f) }), {})),
    total: await records().countDocuments(filter),
    limited: rows.length >= limit,
  };
}

function toCsv(result) {
  const escape = (v) => `"${cell(v).replace(/"/g, '""')}"`;
  const header = result.columns.map((c) => escape(c.header)).join(',');
  const body = result.rows.map((row) => result.columns.map((c) => escape(row[c.field])).join(','));
  return [header, ...body].join('\n');
}

module.exports = { REPORTS, REPORT_KEYS, run, toCsv };
