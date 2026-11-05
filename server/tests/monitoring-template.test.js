import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import { TEMPLATE_FIELDS, TEMPLATE_HEALTHCARE_FIELDS, TEMPLATE_WORKING_SET } from '../../front-end/src/modules/ucds/province/spreadsheet/templateFields.js';

const require = createRequire(import.meta.url);
const fs = require('fs');
const os = require('os');
const path = require('path');
const XLSX = require('xlsx');
const importer = require('../scripts/migrate-ucds/import-year-register');
const { connectToMongo } = require('../config/db');
const { templateColumns } = require('../modules/ucds/services/monitoringTemplate');
const { fieldsOf } = require('../modules/ucds/services/rawWorkbook');
const reports = require('../modules/ucds/services/ucdsReports');

// ---------------------------------------------------------------------------
// The Planning Unit's Monitoring Plan template (5 Nov 2026), from 2027: the same
// columns in the importer, the export and the spreadsheet.
// ---------------------------------------------------------------------------

const scopedOver = (docs) => ({
  find: () => ({ sort: () => ({ toArray: async () => docs }) }),
});
const sheetRows = (buffer, index = 0) => {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  return { wb, rows: XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[index]], { header: 1, defval: '' }) };
};

describe('the Monitoring Plan template', () => {
  it('has the sheet\'s 61 columns, the new ones among them, each read back by the importer', () => {
    const columns = templateColumns();
    expect(columns).toHaveLength(61);
    expect(columns.map((c) => c.key)).toEqual(expect.arrayContaining(['latest_status', 'iis_no_2027', 'standby_genset']));
    expect(fieldsOf(columns.map((c) => c.header))).toEqual(columns.map((c) => c.key));
  });

  it('heads the 2027 columns as the 2027 plan', () => {
    expect(templateColumns().find((c) => c.key === 'iis_no_2027').group).toBe('2027 MONITORING PLAN');
  });

  it('a load takes Latest Status from the year before\'s remarks, or from the template\'s own column', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'latest-status-'));
    const write = (name, header, row) => {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, row]), 'AURORA');
      const file = path.join(dir, name);
      XLSX.writeFile(wb, file);
      return file;
    };
    try {
      const old = write('old.xlsx', ['Serial_No', 'Project_Title', 'Remarks/Recommendations'], ['AU-1', 'Mill', 'FFM']);
      const [{ rows: [before] }] = importer.readWorkbook(old);
      expect(before.latest_status).toBe('FFM');
      expect(before.recommendations).toBeUndefined(); // the new year's own column stays blank

      const own = write('new.xlsx', ['Serial_No', 'Project_Title', 'Latest Status/Recommendations', 'Remarks/Recommendations'], ['AU-1', 'Mill', '', 'For Issuance of NOV']);
      const [{ rows: [after] }] = importer.readWorkbook(own);
      expect(after.latest_status).toBeUndefined(); // that year's remarks are not last year's status
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('gives the healthcare list the same columns without the standby gensets', () => {
    const keys = templateColumns({ genset: false }).map((c) => c.key);
    expect(keys).toHaveLength(60);
    expect(keys).not.toContain('standby_genset');
  });

  it('is what the spreadsheet shows, in the same order', () => {
    expect(TEMPLATE_FIELDS.map((f) => f.key)).toEqual(templateColumns().map((c) => c.key));
    expect(TEMPLATE_HEALTHCARE_FIELDS.map((f) => f.key)).toEqual(templateColumns({ genset: false }).map((c) => c.key));
    const known = new Set(TEMPLATE_FIELDS.map((f) => f.key));
    expect(TEMPLATE_WORKING_SET.filter((k) => !known.has(k))).toEqual([]);
  });
});

describe('the Monitoring Plan export', () => {
  beforeAll(async () => {
    await connectToMongo(); // the ERMS index reads the test database
  });

  const firm = {
    _id: 'x', id_no: 1, year: 2027, sort_key: 'PA-00001', name: 'Alpha Corp', title: 'Alpha Mill', province: 'Pampanga', barangay: 'Sto. Nino',
    iis_no_2027: 'R3-2027-000001', latest_status: 'FFM', standby_genset: 2, updated_by: 'someone',
  };

  it('a year with its own register: the template\'s bands, headers and order, then the ERMS anchor', async () => {
    const { buffer, count } = await reports.monitoringPlanWorkbook(scopedOver([firm]), { province: 'Pampanga', ownRegister: true });
    expect(count).toBe(1);
    const { rows, wb } = sheetRows(buffer);
    const columns = templateColumns();
    expect(rows[0][0]).toBe('GENERAL INFORMATION');
    expect(rows[1][columns.findIndex((c) => c.key === 'iis_no_2024')]).toBe('MONITORING REFERENCE');
    expect(rows[2].slice(0, 61)).toEqual(columns.map((c) => c.header));
    expect(rows[2].slice(61)).toEqual(['In ERMS', 'ERMS FSN']);
    const at = (key) => rows[3][columns.findIndex((c) => c.key === key)];
    expect(at('sort_key')).toBe('PA-00001');
    expect(at('iis_no_2027')).toBe('R3-2027-000001');
    expect(at('latest_status')).toBe('FFM');
    expect(at('standby_genset')).toBe(2);
    expect(at('brgy')).toBe('Sto. Nino'); // an older spelling of the field
    expect(wb.SheetNames).toHaveLength(1); // nothing outside the template, bookkeeping aside
  });

  it('keeps what a firm holds outside the template on a second sheet, by serial', async () => {
    const held = { ...firm, docket_no: 'D-1', chemical_permit: 'CCO-9' };
    const { buffer } = await reports.monitoringPlanWorkbook(scopedOver([firm, held]), { province: 'Pampanga', ownRegister: true });
    const { rows, wb } = sheetRows(buffer, 1);
    expect(wb.SheetNames[1]).toBe('Other register fields');
    expect(rows).toHaveLength(2); // the header and the one firm that holds any
    const row = Object.fromEntries(rows[0].map((h, i) => [h, rows[1][i]]));
    expect(row).toMatchObject({ Serial_No: 'PA-00001', Project_Title: 'Alpha Mill', 'Docket no': 'D-1' });
  });

  it('the healthcare list: no standby gensets', async () => {
    const { buffer } = await reports.monitoringPlanWorkbook(scopedOver([{ ...firm, sort_key: 'HC-PA-00001' }]), { province: 'Healthcare Industries', ownRegister: true });
    const { rows } = sheetRows(buffer);
    expect(rows[2].slice(0, 60)).toEqual(templateColumns({ genset: false }).map((c) => c.header));
  });

  it('up to 2026 the export is as it was: a header row of every field carried', async () => {
    const { buffer } = await reports.monitoringPlanWorkbook(scopedOver([{ sort_key: 'PA-1', name: 'Alpha', title: 'Mill', docket_no: 'D-1' }]), { province: 'Pampanga', ownRegister: false });
    const { rows, wb } = sheetRows(buffer);
    expect(wb.SheetNames).toHaveLength(1);
    expect(rows[0]).toEqual(expect.arrayContaining(['Sort key', 'Name', 'Title', 'In ERMS']));
    expect(rows[0]).not.toContain('Serial_No');
  });
});
