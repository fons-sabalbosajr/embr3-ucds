const { clean, parseDate, parseNumber } = require('./source');
const { PROVINCES } = require('../../../services/provinces');

// ---------------------------------------------------------------------------
// One CSV row -> one erms-records document.
//
// Nothing is guessed. A value that cannot be interpreted is preserved verbatim
// and the record is flagged, so it appears in the reconciliation report rather
// than being silently dropped or silently corrected.
// ---------------------------------------------------------------------------

const PROVINCE_BY_VALUE = new Map(
  PROVINCES.map((p) => [p.value.toLowerCase().replace(/[ _]/g, ''), p])
);

/** Canonical permit types. The extract holds three misspellings of "Amended". */
const PERMIT_TYPES = [
  { code: 'ecc-original', match: /environmental compliance certificate\s*\(\s*original/i, label: 'ECC (Original)' },
  { code: 'ecc-amended', match: /environmental compliance certificate\s*\(\s*amend/i, label: 'ECC (Amended)' },
  { code: 'cnc', match: /certificate of non-?coverage/i, label: 'Certificate of Non-Coverage' },
  { code: 'hw-generator', match: /hazardous waste generator/i, label: 'HW Generator Registration' },
];

function permitTypeOf(raw) {
  if (!raw) return { code: null, label: null };
  const hit = PERMIT_TYPES.find((t) => t.match.test(raw));
  return hit ? { code: hit.code, label: hit.label } : { code: 'other', label: raw };
}

/**
 * Split a Serial_No into its record and attachment parts.
 *
 * 37 rows use "FSN-0000206 Att-00012", which is a second document filed
 * against an existing record rather than a record of its own.
 */
function splitSerial(serial) {
  const m = /^(FSN-\d+)\s+(Att-\d+)$/i.exec(serial || '');
  if (m) return { serialNo: serial, parentSerialNo: m[1], attachmentNo: m[2] };
  return { serialNo: serial, parentSerialNo: null, attachmentNo: null };
}

/**
 * Strip the mapped drive letter from a NAS path.
 *
 * Stored values look like "Z:\RECORDS\Database\Records Database\...". A drive
 * letter is meaningless on the server, which reaches the NAS over SMB, so the
 * share-relative remainder is kept alongside the original.
 *
 * NOTE: which part of this prefix is the share root and which is inside it is
 * not determinable from the extract. See the open question in the plan.
 */
function sharePathOf(filePath) {
  if (!filePath) return null;
  const withoutDrive = filePath.replace(/^[A-Za-z]:[\\/]+/, '');
  if (withoutDrive === filePath && !/^\\\\/.test(filePath)) return null;
  return withoutDrive.replace(/^\\\\[^\\]+\\[^\\]+\\/, '').replace(/\//g, '\\');
}

function transformRow(row, index) {
  const issues = [];
  const flag = (field, problem, value) => issues.push({ field, problem, value });

  const rawSerial = clean(row.Serial_No);
  if (!rawSerial) flag('Serial_No', 'missing', null);
  const { serialNo, parentSerialNo, attachmentNo } = splitSerial(rawSerial);

  // --- permit --------------------------------------------------------------
  const permitTypeRaw = clean(row.Permit_Type);
  const permitType = permitTypeOf(permitTypeRaw);
  if (permitType.code === 'other') flag('Permit_Type', 'unrecognised', permitTypeRaw);

  const approved = parseDate(row.Date_Approved);
  if (!approved.ok) flag('Date_Approved', 'unparseable', approved.raw);
  const amended = parseDate(row.Date_Amended);
  if (!amended.ok) flag('Date_Amended', 'unparseable', amended.raw);

  // --- location ------------------------------------------------------------
  const provinceRaw = clean(row.Province);
  const province = provinceRaw
    ? PROVINCE_BY_VALUE.get(provinceRaw.toLowerCase().replace(/[ _]/g, ''))
    : null;
  if (provinceRaw && !province) flag('Province', 'unmappable', provinceRaw);

  const lat = parseNumber(row.Latitude);
  const long = parseNumber(row.Longitude);

  // --- document ------------------------------------------------------------
  const filePath = clean(row.File_Path);
  const sharePath = sharePathOf(filePath);
  if (filePath && !sharePath) flag('File_Path', 'not drive-qualified or UNC', filePath);

  const uploaded = parseDate(row.Date_Uploaded);
  if (!uploaded.ok) flag('Date_Uploaded', 'unparseable', uploaded.raw);

  return {
    serialNo,
    parentSerialNo,
    attachmentNo,
    isAttachment: Boolean(parentSerialNo),

    proponentName: clean(row.Proponent_Name),
    projectTitle: clean(row.Project_Title),
    remarks: clean(row.Remarks),

    permit: {
      type: permitType.code,
      label: permitType.label,
      typeRaw: permitTypeRaw,
      number: clean(row.Permit_Type_No),
      processSource: clean(row.Permit_Process_Source),
      dateApproved: approved.value,
      dateApprovedRaw: approved.ok ? null : approved.raw,
      dateAmended: amended.value,
      dateAmendedRaw: amended.ok ? null : amended.raw,
    },

    project: {
      type: clean(row.Project_Type),
      otherType: clean(row.Other_Project_Type),
    },

    location: {
      province: province ? province.key : null,
      provinceLabel: province ? province.label : provinceRaw,
      city: clean(row.City),
      barangay: clean(row.Barangay),
      street: clean(row.Street),
      lat,
      long,
    },

    document: {
      fileName: clean(row.Attach_Files),
      filePath,
      sharePath,
      fileClass: clean(row.File_Class) || 'Public',
      uploadedAt: uploaded.value,
      uploadedBy: clean(row.Uploaded_by),
    },

    // Filled by the match step; a snapshot so a later register change degrades
    // to a stale label rather than a broken record.
    ucdsRef: null,

    legacyId: rawSerial,
    legacyLogId: clean(row.LogID),
    legacySource: 'erms-advance',
    sourceRow: index + 2, // +1 for the header, +1 for 1-based line numbering
    migratedAt: new Date(),

    dataQuality: { clean: issues.length === 0, issues },
  };
}

module.exports = { transformRow, permitTypeOf, splitSerial, sharePathOf, PERMIT_TYPES };
