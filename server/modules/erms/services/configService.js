const { connectToMongo, getDb } = require('../../../config/db');
const { ERMS_UNITS, ERMS_UNIT_VALUES, ERMS_UNIT_LABELS } = require('../../../services/authorization');

// ---------------------------------------------------------------------------
// ERMS configuration: the three units, what each files, and how.
//
// The desktop ERMS had this in three places — the Records subsystem's
// Settings, the Legal subsystem's Settings, the Laboratory's — and in code.
// Here it is one document, app-config/erms-config, edited from Admin
// Settings > ERMS Config and read by every ERMS screen:
//
//   units.<unit>.docTypes   the document kinds a unit files, each with the
//                           form fields the upload asks for, the serial
//                           format it is numbered in, and the folder the
//                           file is filed under on that unit's share
//   units.<unit>.folder     how the share is laid out — the legacy layout,
//                           so files uploaded here land beside the ones the
//                           desktop system filed for twenty years
//   upload                  size and type limits
//
// The defaults below ARE the legacy layout, read from the three databases
// (see docs/ERMS-LEGACY-DATA.md). Saving from the screen overrides them
// field by field; a reset puts them back.
//
// Records is special: its documents are erms-records, with the register
// link, tracking and archive boxes built around them. Its docTypes here
// are the permit types (for the folder and the file prefix) and its form
// is the existing record form; only the file upload is new. Legal and
// Laboratory documents are erms-documents, whose forms are rendered from
// the field definitions here.
// ---------------------------------------------------------------------------

const COLLECTION = 'app-config';
const DOC_ID = 'erms-config';

const CACHE_MS = process.env.VITEST ? 0 : 30 * 1000;
let cache = { at: 0, value: null };

const collection = () => getDb().collection(COLLECTION);

// Field types the upload forms know how to render and the server how to check.
const FIELD_TYPES = ['text', 'textarea', 'date', 'number', 'select', 'lookup', 'checkbox'];

// The tokens a folder pattern may use.
//   {province}   the province label (Bataan)
//   {yearRange}  the five-year bucket the desktop system used (2021-2025)
//   {year}       the document's year, from `yearField` or the upload date
//   {folder}     the project/company/station folder, from `folderField`
//   {typeFolder} the document type's own folder (NOV, ECC Folder, …)
const FOLDER_TOKENS = ['{province}', '{yearRange}', '{year}', '{folder}', '{typeFolder}'];

const f = (key, label, type = 'text', extra = {}) => ({ key, label, type, required: false, ...extra });

// The laws a legal case may cite; each is a free remark in the legacy data —
// often a sentence or two, so a text area of its own, one law to a row.
const LAW_FIELDS = [
  f('pd1586', 'PD 1586 (EIS)', 'textarea', { placeholder: 'The violation of PD 1586 — e.g. operating without an ECC. Leave blank if not cited.' }),
  f('ra8749', 'RA 8749 (Clean Air)', 'textarea', { placeholder: 'The violation of RA 8749 — e.g. no Permit to Operate air pollution source. Leave blank if not cited.' }),
  f('ra9275', 'RA 9275 (Clean Water)', 'textarea', { placeholder: 'The violation of RA 9275 — e.g. discharging without a Discharge Permit. Leave blank if not cited.' }),
  f('ra6969', 'RA 6969 (Toxic & Hazardous)', 'textarea', { placeholder: 'The violation of RA 6969 — e.g. no Hazardous Waste Generator ID. Leave blank if not cited.' }),
];
const CASE_FIELDS = [
  f('docketNo', 'Docket number', 'text', { required: true, placeholder: 'EMBR3-2026-PA-001' }),
  f('pabCaseNo', 'DENR-PAB case number', 'text', { placeholder: 'e.g. 03-00007-26-A' }),
  f('companyName', 'Company / project', 'text', { required: true, placeholder: 'Name of the company or project' }),
  f('companyAddress', 'Address', 'textarea', { placeholder: 'Street, barangay, city or municipality, province' }),
];

const DEFAULTS = {
  units: {
    [ERMS_UNITS.RECORDS]: {
      label: ERMS_UNIT_LABELS[ERMS_UNITS.RECORDS],
      container: 'records',
      folder: {
        root: 'RECORDS\\Database\\Records Database',
        pattern: '{province}\\{yearRange}\\{year}\\{folder}\\{typeFolder}',
        folderField: 'projectTitle',
        yearField: 'permit.dateApproved',
      },
      serial: { prefix: 'FSN-', pad: 7 },
      docTypes: [
        { code: 'ecc-original', label: 'ECC (Original)', folder: 'ECC Folder', filePrefix: 'ECC_Original', fields: [] },
        { code: 'ecc-amended', label: 'ECC (Amended)', folder: 'ECC Folder', filePrefix: 'ECC_Amended', fields: [] },
        { code: 'cnc', label: 'Certificate of Non-Coverage', folder: 'CNC', filePrefix: 'CNC', fields: [] },
        { code: 'hw-generator', label: 'HW Generator Registration', folder: 'HWID Folder', filePrefix: 'HW', fields: [] },
        { code: 'pto', label: 'Permit to Operate', folder: 'PTO Folder', filePrefix: 'PTO', fields: [] },
        { code: 'dp', label: 'Discharge Permit', folder: 'DP Folder', filePrefix: 'DP', fields: [] },
        { code: 'luc', label: 'Land Use Conversion', folder: 'LUC Folder', filePrefix: 'LUC', fields: [] },
        { code: 'coa', label: 'Certificate of Accreditation', folder: 'COA Folder', filePrefix: 'COA', fields: [] },
        { code: 'other', label: 'Other', folder: 'Others', filePrefix: '', fields: [] },
      ],
    },
    [ERMS_UNITS.LEGAL]: {
      label: ERMS_UNIT_LABELS[ERMS_UNITS.LEGAL],
      container: 'legal',
      folder: {
        root: 'LEGAL\\Database\\Legal Database',
        pattern: '{province}\\{year}\\{folder}\\{typeFolder}',
        folderField: 'companyName',
        yearField: 'novDateIssued',
      },
      // Case numbers, as the desktop system issued them from a register per
      // province: EMBR3-2023-PA-111. `issueOn` is the document types that
      // open a case, whose form offers the next number.
      docket: { prefix: 'EMBR3', pad: 3, issueOn: ['nov'] },
      docTypes: [
        {
          code: 'nov',
          label: 'Notice of Violation',
          folder: 'NOV',
          serial: { prefix: 'FSN-NOV', pad: 5 },
          fields: [
            ...CASE_FIELDS,
            f('natureOfBusiness', 'Nature of business', 'lookup', { lookup: 'nature-of-business' }),
            ...LAW_FIELDS,
            f('dateOfReport', 'Date of report', 'date'),
            f('novDateIssued', 'NOV date issued', 'date', { required: true }),
            f('novDateReleased', 'NOV date released', 'date'),
            f('daysProcessed', 'Days processed', 'number'),
            f('tcSchedule', 'Technical conference schedule', 'date'),
            f('legalOfficer', 'Legal officer', 'lookup', { lookup: 'legal-officers' }),
            f('caseHandler', 'Case handler', 'lookup', { lookup: 'case-handlers' }),
            f('status', 'Status', 'lookup', { lookup: 'legal-statuses', required: true }),
          ],
        },
        {
          code: 'tc',
          label: 'Technical Conference',
          folder: 'TC',
          serial: { prefix: 'FSN-TC', pad: 5 },
          fields: [
            ...CASE_FIELDS,
            f('legalOfficer', 'Legal officer', 'lookup', { lookup: 'legal-officers' }),
            f('tcActualDate', 'Actual date of conference', 'date', { required: true }),
          ],
        },
        {
          code: 'ordres',
          label: 'Order / Resolution',
          folder: 'Order-Resolution',
          serial: { prefix: 'FSN-ORD', pad: 5 },
          fields: [
            ...CASE_FIELDS,
            f('status', 'Status', 'lookup', { lookup: 'legal-statuses' }),
            f('orderDateIssued', 'Order date issued', 'date'),
            f('resolutionDateIssued', 'Resolution date issued', 'date'),
          ],
        },
        {
          code: 'payment',
          label: 'Payment',
          folder: 'Payment',
          serial: { prefix: 'FSN-PAY', pad: 4 },
          fields: [...CASE_FIELDS, f('remarks', 'Remarks', 'textarea')],
        },
        {
          code: 'attachment',
          label: 'Attachment',
          folder: 'Attachments',
          serial: { prefix: 'FSN-ATT', pad: 5 },
          fields: [
            f('docketNo', 'Docket number (reference)', 'text', { required: true }),
            f('documentType', 'Kind of attachment', 'text', { required: true, placeholder: 'Complaint letter, survey report, ECC…' }),
            f('companyName', 'Company / project', 'text', { required: true }),
            f('companyAddress', 'Address', 'textarea'),
            f('natureOfBusiness', 'Nature of business', 'lookup', { lookup: 'nature-of-business' }),
            f('dateApproved', 'Date', 'date'),
            f('remarks', 'Remarks', 'textarea'),
          ],
        },
      ],
    },
    [ERMS_UNITS.LABORATORY]: {
      label: ERMS_UNIT_LABELS[ERMS_UNITS.LABORATORY],
      container: 'laboratory',
      folder: {
        root: 'LABORATORY\\Database\\Laboratory Database',
        pattern: '{province}\\{yearRange}\\{year}\\{folder}',
        folderField: 'firmName',
        yearField: 'dateOfSampling',
      },
      docTypes: [
        {
          code: 'ltr',
          label: 'Laboratory Test Result',
          folder: '',
          serial: { prefix: 'FSN-LTR-', pad: 6 },
          fields: [
            f('firmName', 'Name of firm / station', 'text', { required: true }),
            f('address', 'Address', 'textarea'),
            f('dateOfSampling', 'Date of sampling', 'date', { required: true }),
            f('parameters', 'Parameters', 'lookup', { lookup: 'lab-parameters', required: true }),
            f('dateReported', 'Date reported', 'date'),
          ],
        },
        {
          code: 'coc',
          label: 'Chain of Custody Form (COC)',
          folder: '',
          serial: { prefix: 'FSN-COC-', pad: 6 },
          fields: [
            f('cocNo', 'COC number', 'text', { required: true, placeholder: '2026PC-0001' }),
            f('firmName', 'Name of firm / station', 'text', { required: true }),
            f('address', 'Address', 'textarea'),
            f('dateOfSampling', 'Date of sampling', 'date', { required: true }),
            f('parameters', 'Parameters', 'lookup', { lookup: 'lab-parameters' }),
            f('receivedBy', 'Received by'),
            f('dateReceived', 'Date received', 'date'),
          ],
        },
        {
          code: 'draft',
          label: 'Draft Results of Analysis',
          folder: '',
          serial: { prefix: 'FSN-DRA-', pad: 6 },
          fields: [
            f('cocNo', 'COC number'),
            f('firmName', 'Name of firm / station', 'text', { required: true }),
            f('address', 'Address', 'textarea'),
            f('parameters', 'Parameters', 'lookup', { lookup: 'lab-parameters' }),
          ],
        },
        {
          code: 'memo',
          label: 'Laboratory Memo',
          folder: 'Memo',
          serial: { prefix: 'FSN-MEMO-', pad: 6 },
          fields: [f('subject', 'Subject', 'text', { required: true }), f('date', 'Date', 'date', { required: true })],
        },
        {
          code: 'receipt',
          label: 'PR / Receipt',
          folder: 'Receipts',
          serial: { prefix: 'FSN-REC-', pad: 6 },
          fields: [f('orNumber', 'OR / PR number', 'text', { required: true }), f('subject', 'Subject'), f('orDate', 'OR date', 'date')],
        },
        {
          code: 'calibration',
          label: 'Calibration Certificate',
          folder: 'Calibration',
          serial: { prefix: 'FSN-CAL-', pad: 6 },
          fields: [
            f('referenceNo', 'Reference number', 'text', { required: true }),
            f('firmName', 'Name of firm'),
            f('address', 'Address', 'textarea'),
            f('unitUnderTest', 'Unit under test'),
            f('dateIssued', 'Date issued', 'date'),
            f('dateCalibrated', 'Date calibrated', 'date'),
            f('dateDue', 'Date due', 'date'),
          ],
        },
      ],
    },
  },
  upload: {
    maxMb: 100,
    allowedExtensions: ['.pdf', '.jpg', '.jpeg', '.png', '.tif', '.tiff', '.doc', '.docx', '.xls', '.xlsx'],
  },
};

// What each field's box says before anything is typed, by field — so every
// unit's forms show an example of what goes there. A field that sets its own
// placeholder above keeps it.
const PLACEHOLDERS = {
  // Legal
  natureOfBusiness: 'Choose or type the nature of business',
  dateOfReport: 'Date of the inspection report',
  novDateIssued: 'Date the NOV was issued',
  novDateReleased: 'Date the NOV was released',
  daysProcessed: 'e.g. 5',
  tcSchedule: 'Date of the technical conference',
  tcActualDate: 'Date the conference was held',
  legalOfficer: 'Choose or type the legal officer',
  caseHandler: 'Choose or type the case handler',
  status: 'Choose or type the case status',
  orderDateIssued: 'Date the order was issued',
  resolutionDateIssued: 'Date the resolution was issued',
  documentType: 'Complaint letter, inspection report, ECC copy…',
  dateApproved: 'Date of the document',
  remarks: 'Anything the next person should know',
  // Laboratory
  firmName: 'e.g. COSMOS BOTTLING CORP',
  address: 'Barangay, city or municipality, province',
  dateOfSampling: 'Date the samples were taken',
  parameters: 'Choose or type: PHY-CHEM, MICROBIOLOGICAL, AIR, METALS',
  dateReported: 'Date the result was reported',
  cocNo: 'e.g. 2026PC-0001',
  receivedBy: 'Name of the person who received the samples',
  dateReceived: 'Date the samples were received',
  subject: 'What the document is about',
  date: 'Date of the document',
  orNumber: 'e.g. OR 1234567',
  orDate: 'Date on the receipt',
  referenceNo: 'Certificate reference number',
  unitUnderTest: 'Instrument or equipment calibrated',
  dateIssued: 'Date the certificate was issued',
  dateCalibrated: 'Date of calibration',
  dateDue: 'Date the next calibration is due',
};
for (const unitCfg of Object.values(DEFAULTS.units)) {
  for (const type of unitCfg.docTypes || []) {
    for (const field of type.fields || []) {
      if (!field.placeholder && PLACEHOLDERS[field.key]) field.placeholder = PLACEHOLDERS[field.key];
    }
  }
}

// --- normalisation -----------------------------------------------------------

const KEY_RE = /^[a-z][a-zA-Z0-9]{0,39}$/;
const CODE_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const cleanText = (v, max = 120) => String(v ?? '').trim().slice(0, max);
const cleanFolder = (v, max = 120) => cleanText(v, max).replace(/[<>:"|?* -]/g, '').replace(/^[\\/]+|[\\/]+$/g, '');

function normalizeField(input) {
  const key = cleanText(input?.key, 40);
  if (!KEY_RE.test(key)) return null;
  const type = FIELD_TYPES.includes(input?.type) ? input.type : 'text';
  const field = {
    key,
    label: cleanText(input?.label, 80) || key,
    type,
    required: input?.required === true,
  };
  if (input?.placeholder) field.placeholder = cleanText(input.placeholder, 120);
  if (type === 'lookup') field.lookup = cleanText(input?.lookup, 40) || null;
  if (type === 'select') {
    field.options = (Array.isArray(input?.options) ? input.options : []).map((o) => cleanText(o, 120)).filter(Boolean).slice(0, 100);
  }
  return field;
}

function normalizeDocType(input, unit) {
  const code = cleanText(input?.code, 40).toLowerCase();
  if (!CODE_RE.test(code)) return null;
  const out = {
    code,
    label: cleanText(input?.label, 80) || code,
    folder: cleanFolder(input?.folder, 80),
    fields: (Array.isArray(input?.fields) ? input.fields : []).map(normalizeField).filter(Boolean).slice(0, 60),
  };
  // Duplicate keys would make one field overwrite another on save.
  const seen = new Set();
  out.fields = out.fields.filter((x) => (seen.has(x.key) ? false : seen.add(x.key)));
  if (unit !== ERMS_UNITS.RECORDS) {
    const prefix = cleanText(input?.serial?.prefix, 20) || `FSN-${code.toUpperCase()}-`;
    const pad = Math.min(Math.max(Number(input?.serial?.pad) || 5, 3), 10);
    out.serial = { prefix, pad };
  } else {
    out.filePrefix = cleanFolder(input?.filePrefix, 40);
  }
  return out;
}

function normalizeUnit(input, unit) {
  const d = DEFAULTS.units[unit];
  const pattern = cleanText(input?.folder?.pattern, 200) || d.folder.pattern;
  const out = {
    label: cleanText(input?.label, 80) || d.label,
    container: cleanText(input?.container, 40).toLowerCase() || d.container,
    folder: {
      root: cleanFolder(input?.folder?.root, 200) || d.folder.root,
      // Only known tokens and path separators; nothing that could climb out.
      pattern: pattern.split(/[\\/]+/).map((seg) => seg.trim()).filter(Boolean).filter((seg) => seg === '..' ? false : true).join('\\') || d.folder.pattern,
      folderField: cleanText(input?.folder?.folderField, 60) || d.folder.folderField,
      yearField: cleanText(input?.folder?.yearField, 60) || d.folder.yearField,
    },
    docTypes: (Array.isArray(input?.docTypes) ? input.docTypes : d.docTypes).map((t) => normalizeDocType(t, unit)).filter(Boolean).slice(0, 40),
  };
  const seen = new Set();
  out.docTypes = out.docTypes.filter((t) => (seen.has(t.code) ? false : seen.add(t.code)));
  if (!out.docTypes.length) out.docTypes = d.docTypes;
  if (unit === ERMS_UNITS.RECORDS) {
    out.serial = { prefix: cleanText(input?.serial?.prefix, 20) || d.serial.prefix, pad: Math.min(Math.max(Number(input?.serial?.pad) || d.serial.pad, 3), 10) };
  }
  if (d.docket) {
    const codes = new Set(out.docTypes.map((t) => t.code));
    const issueOn = (Array.isArray(input?.docket?.issueOn) ? input.docket.issueOn : d.docket.issueOn)
      .map((c) => cleanText(c, 40).toLowerCase())
      .filter((c) => codes.has(c));
    out.docket = {
      // Letters, digits and dashes only: the number is typed, searched and filed under.
      prefix: cleanText(input?.docket?.prefix, 20).toUpperCase().replace(/[^A-Z0-9-]/g, '') || d.docket.prefix,
      pad: Math.min(Math.max(Number(input?.docket?.pad) || d.docket.pad, 1), 6),
      issueOn,
    };
  }
  return out;
}

function normalize(doc) {
  const units = {};
  for (const unit of ERMS_UNIT_VALUES) units[unit] = normalizeUnit(doc?.units?.[unit], unit);
  const allowed = (Array.isArray(doc?.upload?.allowedExtensions) ? doc.upload.allowedExtensions : DEFAULTS.upload.allowedExtensions)
    .map((e) => String(e).trim().toLowerCase())
    .map((e) => (e.startsWith('.') ? e : `.${e}`))
    .filter((e) => /^\.[a-z0-9]{1,8}$/.test(e));
  return {
    units,
    upload: {
      maxMb: Math.min(Math.max(Number(doc?.upload?.maxMb) || DEFAULTS.upload.maxMb, 1), 1024),
      allowedExtensions: allowed.length ? [...new Set(allowed)] : DEFAULTS.upload.allowedExtensions,
    },
    updatedAt: doc?.updatedAt || null,
    updatedBy: doc?.updatedBy || null,
  };
}

// --- reads and writes ------------------------------------------------------------

async function read() {
  if (cache.value && Date.now() - cache.at < CACHE_MS) return cache.value;
  await connectToMongo();
  const stored = await collection().findOne({ _id: DOC_ID });
  const value = normalize(stored || DEFAULTS);
  cache = { at: Date.now(), value };
  return value;
}

async function unit(key) {
  const cfg = await read();
  return cfg.units[String(key || '').toLowerCase()] || null;
}

async function docType(unitKey, code) {
  const u = await unit(unitKey);
  return u?.docTypes.find((t) => t.code === String(code || '').toLowerCase()) || null;
}

async function save(input, actor) {
  const current = await read();
  const next = normalize({
    units: { ...current.units, ...(input?.units || {}) },
    upload: { ...current.upload, ...(input?.upload || {}) },
  });
  const doc = { ...next, updatedAt: new Date(), updatedBy: actor?.username || 'unknown' };
  await connectToMongo();
  await collection().replaceOne({ _id: DOC_ID }, { _id: DOC_ID, ...doc }, { upsert: true });
  cache = { at: 0, value: null };
  return read();
}

/** Back to the legacy layout. */
async function reset(actor) {
  await connectToMongo();
  await collection().deleteOne({ _id: DOC_ID });
  cache = { at: 0, value: null };
  const cfg = await read();
  return { ...cfg, resetBy: actor?.username || 'unknown' };
}

const invalidate = () => { cache = { at: 0, value: null }; };

module.exports = { DEFAULTS, FIELD_TYPES, FOLDER_TOKENS, read, unit, docType, save, reset, invalidate, COLLECTION, DOC_ID };
