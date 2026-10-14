#!/usr/bin/env node
/* eslint-disable no-console */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '..', '.env') });
const { connectToMongo, getDb } = require('../../../config/db');
const { parseDate, clean, provinceFolderOf } = require('../lib/source');
const { PROVINCES } = require('../../../services/provinces');
const units = require('../../../modules/erms/services/unitDocumentService');

// ---------------------------------------------------------------------------
// The Legal Services and Laboratory documents, from the staged legacy tables
// into erms-documents — the collection the units' screens read.
//
// Run after load.js (which stages the tables). Re-runnable: each document is
// upserted by unit + serial, and one filed through the application (no
// `legacy` block) is never touched.
//
//   Legal        tb_records_NOV / TC / ORDRES / PAYMENT, tb_legaldata_attachments
//   Laboratory   tb_lab_testresults / tb_lab_coc / tb_lab_memo, with
//                tb_labdata for the province
//
// Dates in these tables are free text ("Jan 02 2023", "12 November 1998");
// the migration's own parseDate reads them, and a value it cannot read is
// kept as `<field>Raw` rather than dropped.
// ---------------------------------------------------------------------------

const PROVINCE_LABEL = Object.fromEntries(PROVINCES.map((p) => [p.key, p.label]));
const PROVINCE_BY_LABEL = new Map(PROVINCES.map((p) => [p.label.toLowerCase().replace(/[^a-z]/g, ''), p.key]));
const PROVINCE_BY_DOCKET = { AU: 'aurora', BA: 'bataan', BU: 'bulacan', NE: 'nuevaEcija', PA: 'pampanga', TA: 'tarlac', ZA: 'zambales' };

const staging = (name) => getDb().collection(`legacy-erms-${name}`);

const provinceFrom = (...candidates) => {
  for (const c of candidates) {
    const s = clean(c);
    if (!s) continue;
    const docket = /-(AU|BA|BU|NE|PA|TA|ZA)-/i.exec(s);
    if (docket) return PROVINCE_BY_DOCKET[docket[1].toUpperCase()];
    const key = PROVINCE_BY_LABEL.get(String(provinceFolderOf(s) || s).toLowerCase().replace(/[^a-z]/g, ''));
    if (key) return key;
  }
  return null;
};

const sharePathOf = (filePath) => {
  const s = clean(filePath);
  if (!s) return null;
  return s.replace(/^[A-Za-z]:[\\/]+/, '').replace(/\//g, '\\');
};

function date(fields, key, raw) {
  const parsed = parseDate(raw);
  fields[key] = parsed.value;
  if (!parsed.ok && parsed.raw) fields[`${key}Raw`] = parsed.raw;
}

function document(row, { file, path, uploadedAt, uploadedBy, container }) {
  const uploaded = parseDate(row[uploadedAt]);
  return {
    fileName: clean(row[file]),
    filePath: clean(row[path]),
    sharePath: sharePathOf(row[path]),
    container,
    size: null,
    contentType: null,
    uploadedAt: uploaded.value,
    uploadedAtRaw: uploaded.ok ? null : uploaded.raw,
    uploadedBy: clean(row[uploadedBy]),
  };
}

function base(unit, docType, docTypeLabel, row, table, serialNo, province, fields, doc) {
  const title = units.titleOf(fields, serialNo);
  const out = {
    unit,
    docType,
    docTypeLabel,
    serialNo,
    parentSerialNo: null,
    province,
    provinceLabel: province ? PROVINCE_LABEL[province] : null,
    title,
    fields,
    document: doc,
    legacy: { table, systemId: row.System_LogID ?? row.System_ID ?? null, importedAt: new Date() },
    createdAt: doc.uploadedAt || new Date(0),
    createdBy: doc.uploadedBy || 'legacy',
    updatedAt: null,
    updatedBy: null,
  };
  out.searchText = units.searchTextOf(out);
  return out;
}

// --- Legal ---------------------------------------------------------------------------

async function legal() {
  const unit = 'legal';
  const out = [];
  const caseFields = (r) => ({
    docketNo: clean(r.Docket_No),
    pabCaseNo: clean(r.DENR_PAB_Case_No),
    companyName: clean(r.Company_Name),
    companyAddress: clean(r.Company_Address),
  });

  for await (const r of staging('legal-records-nov').find({})) {
    const serial = clean(r.Serial_No);
    if (!serial) continue;
    const f = {
      ...caseFields(r),
      natureOfBusiness: clean(r.Nature_of_Business),
      pd1586: clean(r.PD1586),
      ra8749: clean(r.RA8749),
      ra9275: clean(r.RA9275),
      ra6969: clean(r.RA6969),
      daysProcessed: Number(clean(r.NOV_Days_Processed)) || null,
      legalOfficer: clean(r.Legal_Officer),
      caseHandler: clean(r.Case_Handler),
      status: clean(r.Status),
    };
    date(f, 'dateOfReport', r.Date_of_Report);
    date(f, 'novDateIssued', r.NOV_Date_Issued);
    date(f, 'novDateReleased', r.NOV_Date_Released);
    date(f, 'tcSchedule', r.Tech_Conference_Schedule);
    const doc = document(r, { file: 'Attach_File', path: 'File_Path', uploadedAt: 'File_Date_Uploaded', uploadedBy: 'Uploaded_by', container: unit });
    out.push(base(unit, 'nov', 'Notice of Violation', r, 'tb_records_NOV', serial, provinceFrom(r.Docket_No, r.File_Path), f, doc));
  }

  for await (const r of staging('legal-records-tc').find({})) {
    const serial = clean(r.Serial_No);
    if (!serial) continue;
    const f = { ...caseFields(r), legalOfficer: clean(r.Legal_Officer) };
    date(f, 'tcActualDate', r.TC_Actual_Date);
    const doc = document(r, { file: 'TC_Attach_File', path: 'TC_File_Path', uploadedAt: 'File_Date_Uploaded', uploadedBy: 'Uploaded_by', container: unit });
    out.push(base(unit, 'tc', 'Technical Conference', r, 'tb_records_TC', serial, provinceFrom(r.Docket_No, r.TC_File_Path), f, doc));
  }

  for await (const r of staging('legal-records-ordres').find({})) {
    const serial = clean(r.Serial_No);
    if (!serial) continue;
    const f = { ...caseFields(r), status: clean(r.Status) };
    date(f, 'orderDateIssued', r.Order_Date_Issued);
    date(f, 'resolutionDateIssued', r.Resolution_Date_Issued);
    const doc = document(r, { file: 'Attach_File', path: 'File_Path', uploadedAt: 'File_Date_Uploaded', uploadedBy: 'Uploaded_by', container: unit });
    out.push(base(unit, 'ordres', 'Order / Resolution', r, 'tb_records_ORDRES', serial, provinceFrom(r.Docket_No, r.File_Path), f, doc));
  }

  for await (const r of staging('legal-records-payment').find({})) {
    const serial = clean(r.Serial_No);
    if (!serial) continue;
    const f = { ...caseFields(r), remarks: clean(r.Remarks) };
    const doc = document(r, { file: 'Attach_File', path: 'File_Path', uploadedAt: 'File_Date_Uploaded', uploadedBy: 'Uploaded_by', container: unit });
    out.push(base(unit, 'payment', 'Payment', r, 'tb_records_PAYMENT', serial, provinceFrom(r.Docket_No, r.File_Path), f, doc));
  }

  for await (const r of staging('legal-legaldata-attachments').find({})) {
    const serial = clean(r.Serial_No);
    if (!serial) continue;
    const fileName = clean(r.Attach_File) || '';
    // "Complaint Letter - Formosa …", "Survey Report - Trilan …": the kind
    // of attachment is the head of the file name, before the dash.
    const kind = /^(.{3,60}?)\s[-–]\s/.exec(fileName)?.[1] || null;
    const f = {
      docketNo: clean(r.Reference_Code),
      documentType: kind,
      companyName: clean(r.Company_Name),
      companyAddress: clean(r.Company_Address),
      natureOfBusiness: clean(r.Nature_of_Business),
      remarks: clean(r.Remarks),
    };
    date(f, 'dateApproved', r.Date_Approved);
    const doc = document(r, { file: 'Attach_File', path: 'File_Path', uploadedAt: 'Date_Uploaded', uploadedBy: 'Uploaded_by', container: unit });
    const item = base(unit, 'attachment', 'Attachment', r, 'tb_legaldata_attachments', serial, provinceFrom(r.Reference_Code, r.File_Path), f, doc);
    item.parentSerialNo = /^(FSN-\S+)\s+Att-/i.exec(serial)?.[1] || null;
    out.push(item);
  }
  return out;
}

// --- Laboratory ------------------------------------------------------------------------

async function laboratory() {
  const unit = 'laboratory';
  const out = [];
  // The file index carries the province; the typed tables do not.
  const index = new Map();
  for await (const r of staging('laboratory-labdata').find({})) {
    const serial = clean(r.Serial_No);
    if (serial) index.set(serial, r);
  }
  const provinceOf = (serial, path) => {
    const idx = index.get(serial);
    return provinceFrom(idx?.Province, path, idx?.File_Path);
  };

  for await (const r of staging('laboratory-lab-testresults').find({})) {
    const serial = clean(r.Serial_No);
    if (!serial) continue;
    const f = { firmName: clean(r.Name_of_Firm), address: clean(r.Address), parameters: clean(r.Parameters) };
    date(f, 'dateOfSampling', r.Date_of_Sampling);
    date(f, 'dateReported', r.Date_Reported);
    const doc = document(r, { file: 'Attach_File', path: 'File_Path', uploadedAt: 'File_Date_Uploaded', uploadedBy: 'Uploaded_by', container: unit });
    out.push(base(unit, 'ltr', 'Laboratory Test Result', r, 'tb_lab_testresults', serial, provinceOf(serial, r.File_Path), f, doc));
  }

  for await (const r of staging('laboratory-lab-coc').find({})) {
    const serial = clean(r.Serial_No);
    if (!serial) continue;
    const f = { cocNo: clean(r.COC_No), firmName: clean(r.Name_of_Firm), address: clean(r.Address), parameters: clean(r.Parameters), receivedBy: clean(r.Received_by) };
    date(f, 'dateOfSampling', r.Date_of_Sampling);
    date(f, 'dateReceived', r.Date_Received);
    const doc = document(r, { file: 'Attach_File', path: 'File_Path', uploadedAt: 'File_Date_Uploaded', uploadedBy: 'Uploaded_by', container: unit });
    out.push(base(unit, 'coc', 'Chain of Custody Form (COC)', r, 'tb_lab_coc', serial, provinceOf(serial, r.File_Path), f, doc));
  }

  for await (const r of staging('laboratory-lab-memo').find({})) {
    const serial = clean(r.Serial_No);
    if (!serial) continue;
    const f = { subject: clean(r.Memo_Subject) };
    date(f, 'date', r.Date);
    const doc = document(r, { file: 'Attach_File', path: 'File_Path', uploadedAt: 'File_Date_Uploaded', uploadedBy: 'Uploaded_by', container: unit });
    out.push(base(unit, 'memo', 'Laboratory Memo', r, 'tb_lab_memo', serial, provinceOf(serial, r.File_Path), f, doc));
  }
  return out;
}

// --- main ---------------------------------------------------------------------------------

(async () => {
  const { client } = await connectToMongo();
  await units.ensureIndexes();
  const col = getDb().collection(units.COLLECTION);

  const all = [...(await legal()), ...(await laboratory())];
  // Documents filed through the application are never touched.
  const filedHere = new Set((await col.find({ legacy: null }, { projection: { serialNo: 1 } }).toArray()).map((d) => d.serialNo));
  let inserted = 0;
  let updated = 0;
  let kept = 0;
  const seen = new Set();
  let batch = [];
  const flush = async () => {
    if (!batch.length) return;
    const r = await col.bulkWrite(batch, { ordered: false });
    inserted += r.upsertedCount;
    updated += r.matchedCount;
    batch = [];
  };
  for (const doc of all) {
    const key = `${doc.unit}|${doc.serialNo}`;
    if (seen.has(key)) {
      console.warn(`duplicate serial in the legacy data, skipped: ${doc.serialNo} (${doc.legacy.table})`);
      continue;
    }
    seen.add(key);
    if (filedHere.has(doc.serialNo)) {
      kept += 1;
      continue;
    }
    batch.push({ replaceOne: { filter: { unit: doc.unit, serialNo: doc.serialNo }, replacement: doc, upsert: true } });
    if (batch.length >= 500) await flush();
  }
  await flush();

  const summary = await col.aggregate([{ $group: { _id: { unit: '$unit', docType: '$docType' }, n: { $sum: 1 }, noProvince: { $sum: { $cond: [{ $eq: ['$province', null] }, 1, 0] } } } }, { $sort: { '_id.unit': 1, '_id.docType': 1 } }]).toArray();
  console.log(`erms-documents: ${inserted} inserted, ${updated} refreshed, ${kept} application-filed kept.`);
  for (const s of summary) console.log(`  ${s._id.unit.padEnd(11)} ${s._id.docType.padEnd(11)} ${String(s.n).padStart(5)}${s.noProvince ? `  (${s.noProvince} without province)` : ''}`);
  await client.close();
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
