// ---------------------------------------------------------------------------
// Export: the Document Library as an Excel workbook.
//
// What the list shows — the same filters and search — with every field the
// record or document carries, not just the columns on screen: the permit and
// its other ECC Ref Nos, the project, the full address and coordinates, the
// register link, the scan, the archive box, who filed and edited it, and what
// needs review. For Legal and Laboratory, every field of every kind of
// document the unit keeps, labelled as the forms label them.
//
// The path of a scan on the share is the Developer's only, as on screen.
// ---------------------------------------------------------------------------

const XLSX = require('xlsx');
const { connectToMongo, getDb } = require('../../../config/db');
const recordService = require('./recordService');
const units = require('./unitDocumentService');
const config = require('./configService');
const { PROVINCES } = require('../../../services/provinces');

const MAX_ROWS = 60000;
const PROVINCE_LABEL = Object.fromEntries(PROVINCES.map((p) => [p.key, p.label]));

const day = (v) => {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 10);
};
// One formatter, shared, as toLocaleString builds a new one per cell of an export.
const STAMP_FORMAT = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
const stamp = (v) => {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : STAMP_FORMAT.format(d);
};
const text = (v) => (v === null || v === undefined ? '' : Array.isArray(v) ? v.map(text).filter(Boolean).join('; ') : typeof v === 'object' ? (v instanceof Date ? day(v) : JSON.stringify(v)) : String(v));

/** A sheet with column widths fitted to the content (capped), the header row frozen. */
function sheetOf(rows, headers) {
  const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
  ws['!cols'] = headers.map((h) => ({ wch: Math.min(60, Math.max(h.length, ...rows.slice(0, 500).map((r) => String(r[h] ?? '').length)) + 2) }));
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: headers.length - 1 } }) };
  return ws;
}

function workbook(sheets) {
  const wb = XLSX.utils.book_new();
  for (const [name, ws] of sheets) XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true });
}

/** The Records Document Library. */
async function recordsWorkbook(query, allowedProvinces, { developer = false } = {}) {
  await connectToMongo();
  const filter = recordService.buildFilter(query, allowedProvinces);
  const docs = await getDb()
    .collection(recordService.RECORDS)
    .find(filter, { projection: { searchText: 0 } })
    .sort({ [query.sortBy || 'document.uploadedAt']: Number(query.sortDir) === 1 ? 1 : -1 })
    .limit(MAX_ROWS)
    .toArray();
  const rows = docs.map((r) => ({
    FSN: r.serialNo,
    'Attachment of': r.parentSerialNo || '',
    'Permit type': r.permit?.label || r.permit?.type || '',
    'ECC / Permit Ref No': r.permit?.number || '',
    'Date approved': day(r.permit?.dateApproved) || r.permit?.dateApprovedRaw || '',
    'Date amended': day(r.permit?.dateAmended) || r.permit?.dateAmendedRaw || '',
    'Other Ref Nos': (r.permit?.refs || []).map((x) => [x.number, x.label ? `(${x.label})` : '', x.dateApproved ? `approved ${day(x.dateApproved)}` : ''].filter(Boolean).join(' ')).join('; '),
    Process: r.permit?.processSource || '',
    Proponent: r.proponentName || '',
    'Project title': r.projectTitle || '',
    'Project type': r.project?.type || '',
    'Specific project type': r.project?.otherType || '',
    Province: PROVINCE_LABEL[r.location?.province] || r.location?.provinceLabel || r.location?.province || '',
    'City / Municipality': r.location?.city || '',
    Barangay: r.location?.barangay || '',
    Street: r.location?.street || '',
    'Mailing address': r.location?.mailingAddress || '',
    Latitude: r.location?.lat ?? '',
    Longitude: r.location?.long ?? '',
    'Register entry': r.ucdsRef?.sortKey || '',
    'Register name': r.ucdsRef?.nameSnapshot || '',
    'Scan file name': r.document?.fileName || '',
    ...(developer ? { 'Location on the share': r.document?.sharePath || r.document?.filePath || '' } : {}),
    Classification: r.document?.fileClass || '',
    'Uploaded at': stamp(r.document?.uploadedAt),
    'Uploaded by': r.document?.uploadedBy || '',
    'Archive box': r.archive?.boxCode || '',
    Remarks: r.remarks || '',
    'Needs review': r.dataQuality?.clean === false ? (r.dataQuality.issues || []).map((i) => i.field || i.message || text(i)).join('; ') || 'yes' : '',
    'Created at': stamp(r.createdAt),
    'Created by': r.createdBy || '',
    'Updated at': stamp(r.updatedAt),
    'Updated by': r.updatedBy || '',
    Source: r.legacySource || '',
  }));
  const headers = rows.length ? Object.keys(rows[0]) : ['FSN'];
  return { buffer: workbook([['Records', sheetOf(rows, headers)]]), count: rows.length, truncated: docs.length >= MAX_ROWS };
}

/** A Legal or Laboratory Document Library. */
async function unitWorkbook(user, unitKey, query, { developer = false } = {}) {
  const unit = units.assertUnit(unitKey);
  units.assertCanSee(user, unit);
  await connectToMongo();
  const unitCfg = await config.unit(unit);
  // Every field the unit's kinds of document carry, in form order, once.
  const fieldDefs = [];
  const seen = new Set();
  for (const t of unitCfg?.docTypes || []) {
    for (const f of t.fields || []) {
      if (seen.has(f.key)) continue;
      seen.add(f.key);
      fieldDefs.push(f);
    }
  }
  const typeLabel = Object.fromEntries((unitCfg?.docTypes || []).map((t) => [t.code, t.label]));
  const docs = await getDb()
    .collection(units.COLLECTION)
    .find(units.listFilter(unit, query), { projection: { searchText: 0 } })
    .sort({ createdAt: -1, _id: -1 })
    .limit(MAX_ROWS)
    .toArray();
  // Fields a document holds that the forms no longer list still go out, at the end.
  const extra = [...new Set(docs.flatMap((d) => Object.keys(d.fields || {})))].filter((k) => !seen.has(k));
  const label = (f) => (f.label && f.label !== f.key ? f.label : f.key);
  // "novDateIssuedRaw": the date as the desktop system had it typed, kept
  // beside the one read from it.
  const extraLabel = (k) => {
    const base = fieldDefs.find((f) => `${f.key}Raw` === k);
    return base ? `${label(base)} (as written)` : k;
  };
  const rows = docs.map((d) => {
    const row = {
      Serial: d.serialNo,
      'Attachment of': d.parentSerialNo || '',
      'Document type': d.docTypeLabel || typeLabel[d.docType] || d.docType || '',
      Province: d.provinceLabel || PROVINCE_LABEL[d.province] || d.province || '',
      Title: d.title || '',
    };
    for (const f of fieldDefs) {
      const v = d.fields?.[f.key];
      row[label(f)] = f.type === 'date' ? day(v) : text(v);
    }
    for (const k of extra) row[extraLabel(k)] = text(d.fields?.[k]);
    Object.assign(row, {
      'Scan file name': d.document?.fileName || '',
      ...(developer ? { 'Location on the share': d.document?.sharePath || d.document?.filePath || '' } : {}),
      Classification: d.document?.fileClass || '',
      'Uploaded at': stamp(d.document?.uploadedAt),
      'Uploaded by': d.document?.uploadedBy || '',
      'Created at': stamp(d.createdAt),
      'Created by': d.createdBy || '',
      'Updated at': stamp(d.updatedAt),
      'Updated by': d.updatedBy || '',
      Source: d.legacySource || d.source || '',
    });
    return row;
  });
  const headers = rows.length ? Object.keys(rows[0]) : ['Serial'];
  const name = unit === 'legal' ? 'Legal Services' : 'Laboratory';
  return { buffer: workbook([[name, sheetOf(rows, headers)]]), count: rows.length, truncated: docs.length >= MAX_ROWS };
}

module.exports = { recordsWorkbook, unitWorkbook, MAX_ROWS };
