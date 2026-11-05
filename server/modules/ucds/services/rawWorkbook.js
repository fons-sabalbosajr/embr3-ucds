// ---------------------------------------------------------------------------
// The Planning Unit's RAW universe workbooks: how their columns map to the
// register's fields, how a serial is written, how a cell is read. Shared by
// the year importer (scripts/migrate-ucds/import-year-register.js) and the
// progress tracker (services/progressTracker), so a file means the same to
// both.
// ---------------------------------------------------------------------------

// Header (lower-case, spaces and line breaks squeezed, compared by prefix) →
// register field. Order matters where one prefix starts another.
const COLUMNS = [
  ['serial_no', 'sort_key'],
  ['chemical_permit_categ', 'chemical_permit_type'],
  ['proponent_name', 'name'],
  ['project_title', 'title'],
  ['industry_category_project', 'industry_type'],
  ['industry_category_sub', 'industry_subtype'],
  ['industry_classification', 'industry_class'],
  ['psic_code', 'psic_code'],
  ['within_manila_bay', 'mbu_area'],
  ['receiving_waterbody', 'waterbody'],
  ['bod', 'bod'],
  ['longitude', 'long'],
  ['latitude', 'lat'],
  ['congressional_district', 'cong_district'],
  ['complete_address', 'address'],
  ['street', 'street'],
  ['barangay', 'brgy'],
  ['city', 'city'],
  ['province', 'province'],
  ['protected area', 'protected_area'],
  ['2024_monitoring', 'iis_no_2024'],
  ['2025_monitoring', 'iis_no_2025'],
  ['2026_monitoring', 'iis_no_2026'],
  ['latest status', 'latest_status'],
  ['2027_monitoring', 'iis_no_2027'],
  ['iis no. of notice', 'iis_no_nov'],
  ['section/unit', 'section_incharged'],
  ['inspector/handler', 'handler'],
  ['schedule_of_monitoring', 'monitoring_sched'],
  ['type_of_inspection', 'insp_type'],
  ['date_monitored', 'date_monitored'],
  ['date_routed', 'date_routed'],
  ['date_report_signed', 'date_signed'],
  ['tracking_of_reports', 'pismu_tracking'],
  ['project_status', 'title_status'],
  ['remarks/recommendations', 'recommendations'],
  ['with_previously_issued_nov', 'with_nov'],
  ['iis transaction of survey', 'iis_survey'],
  ['accomplishment count', 'pismu_count_month'],
  ['ecc/cnc permit_reference', 'ecc_cnc'],
  ['permit_process_type', 'permit_process'],
  ['date_amended', 'date_amended'],
  ['date_approved', 'date_approved'],
  ['pd 1586 for issuance', 'pd1586'],
  ['pto_code', 'pto_code'],
  ['pto_date_issued', 'pto_issued'],
  ['pto_date_of_expiration', 'pto_expiration'],
  ['ra 8749 for issuance', 'ra8749'],
  ['no. of standby genset', 'standby_genset'],
  ['wwdp_code', 'wwdp_code'],
  ['wwdp_date_issued', 'wwdp_issued'],
  ['wwdp_date_of_expiration', 'wwdp_expiration'],
  ['ra 9275 for issuance', 'ra9275'],
  ['hazwaste_id_date', 'haz_issued'],
  ['hazwaste_id', 'haz_id'],
  ['ra 6969 for issuance', 'ra6969'],
  ['pco_accreditation', 'pco_no'],
  ['pco_name', 'pco_name'],
  ['pco_validity', 'pco_validity'],
  ['docket_number', 'docket_no'],
  ['denr-pab', 'denr_pab_case_no'],
  ['data_received_by_legal', 'legal_received'],
  ['date_nov_issued', 'nov_issued'],
  ['violation pd_1586', 'v_pd1586'],
  ['violation ra_9275', 'v_ra9275'],
  ['violation ra_8749', 'v_ra8749'],
  ['violation ra 6969', 'v_ra6969_haz'],
  ['violation ra_6969', 'v_ra6969_tchem'],
  ['no. of compliance', 'tc_compliance_link'],
  ['date_of_technical_conference', 'tc_date_actual'],
  ['t.c._commitments', 'tc_commitment'],
  ['assigned_legal_officer', 'legal_officer'],
  ['date_of_issued_resolution', 'resolution_issued'],
  ['date_of_issued_order', 'order_issued'],
  ['order_status', 'order_status'],
  ['remarks', 'remarks'],
  ['position_paper', 'pos_paper'],
  ['date_of_payment', 'penalty_date'],
  ['amount', 'amount'],
  ['or_number', 'or_number'],
  // The chemical, importer, TSD and TRC universes carry their own permit.
  ['type_of_report_submitted', 'report_type'],
  ['reported to co', 'reported_to_co'],
  ['endorsement to emb', 'co_endorsement'],
  ['chemical_permit_reference', 'chemical_permit'],
  ['chemical_permit_date_issued', 'chem_permit_issued'],
  ['chemical_permit_date_exp', 'chem_permit_exp'],
  ['importer_clearance_reference', 'importer_clearance'],
  ['importer_clearance_date_issued', 'importer_clearance_issued'],
  ['importer_clearance_date_exp', 'importer_clearance_exp'],
  ['tsd_reference_no', 'tsd_ref_no'],
  ['tsd_date_issued', 'tsd_issued'],
  ['tsd_date_expiration', 'tsd_expiration'],
  ['trc_reference_no', 'tp_trc_ref_no'],
  ['trc_date_issued', 'tp_trc_issued'],
  ['trc_date_expiration', 'tp_trc_expiration'],
];
// The day counts are all headed TOTAL_NUMBER_OF_DAYS; they are told apart by
// which date pair precedes them.
const DAYS_AFTER = { date_signed: 'days_dmds', days_dmds: 'days_drds', nov_issued: 'days_nov', order_issued: 'days_order' };

// Last year's activity: blank for the new year's own monitoring.
// The operation status and recommendations are what last year's inspection
// found; the year's own inspection sets them again.
const YEARLY = new Set(['monitoring_sched', 'insp_type', 'date_monitored', 'date_routed', 'date_signed', 'days_dmds', 'days_drds', 'pismu_tracking', 'pismu_count_month', 'iis_survey', 'title_status', 'recommendations']);

// "PAMPANGA", " Tarlac" → the register's own spelling (services/provinces.js).
const { PROVINCES } = require('../../../services/provinces');
const provinceOf = (v) => {
  const key = String(v ?? '').replace(/[\s_]+/g, '').toLowerCase();
  const p = PROVINCES.find((x) => x.value.replace(/_/g, '').toLowerCase() === key);
  return p ? p.value : v;
};

const squeeze = (h) => String(h ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
const LOOKUP_SHEETS = /^(industry_classification|unitsections|holidays|address|psic_code|projecttype|protected_areas|sheet\d*|count|accomp|ipcr)$/i;
const SET_ASIDE = /duplicate|delisting|deletion/i;

function fieldsOf(header) {
  const out = [];
  let previous = null;
  for (const h of header) {
    const s = squeeze(h);
    let field = null;
    if (s.startsWith('total_number_of_days')) field = DAYS_AFTER[previous] || null;
    else if (s) field = (COLUMNS.find(([p]) => s.startsWith(p)) || [])[1] || null;
    if (field && out.includes(field)) field = null;
    out.push(field);
    if (field) previous = field;
  }
  return out;
}

const pad = (d) => String(d).padStart(2, '0');
function cell(v) {
  if (v == null) return null;
  // Excel dates arrive as UTC midnight of the local day; the register keeps
  // the m/d/yyyy text the legacy spreadsheet showed.
  if (v instanceof Date) {
    const local = new Date(v.getTime() + 12 * 3600 * 1000);
    return `${local.getUTCMonth() + 1}/${local.getUTCDate()}/${local.getUTCFullYear()}`;
  }
  if (typeof v === 'string') {
    const t = v.replace(/\r\n?/g, '\n').trim();
    return t === '' ? null : t;
  }
  return v;
}

/** "AU-2" → { sort_key: "AU-00002", helper_column: "AU", helper_count: 2 }; "HCCP-NE-1" keeps its prefix. */
function serial(raw) {
  const m = /^\s*([A-Za-z_]+(?:-[A-Za-z_]+)*)\s*-\s*0*(\d+)\s*$/.exec(String(raw ?? ''));
  if (!m) return null;
  const prefix = m[1].toUpperCase();
  const n = Number(m[2]);
  return { sort_key: `${prefix}-${pad(n).padStart(5, '0')}`, helper_column: prefix, helper_count: n };
}

// The register's sections, for saying which part of a row changed.
const GROUPS = {
  profile: ['name', 'title', 'industry_type', 'industry_subtype', 'industry_class', 'psic_code', 'mbu_area', 'waterbody', 'bod', 'long', 'lat', 'cong_district', 'address', 'street', 'brgy', 'city', 'province', 'protected_area', 'chemical_permit_type'],
  monitoring: ['iis_no_2024', 'iis_no_2025', 'iis_no_2026', 'latest_status', 'iis_no_2027', 'iis_no_nov', 'section_incharged', 'handler', 'monitoring_sched', 'insp_type', 'date_monitored', 'date_routed', 'date_signed', 'days_dmds', 'days_drds', 'pismu_tracking', 'title_status', 'recommendations', 'with_nov', 'iis_survey', 'pismu_count_month', 'report_type', 'reported_to_co', 'co_endorsement'],
  permits: ['ecc_cnc', 'permit_process', 'date_amended', 'date_approved', 'pd1586', 'pto_code', 'pto_issued', 'pto_expiration', 'ra8749', 'standby_genset', 'wwdp_code', 'wwdp_issued', 'wwdp_expiration', 'ra9275', 'haz_id', 'haz_issued', 'ra6969', 'pco_no', 'pco_name', 'pco_validity', 'chemical_permit', 'chem_permit_issued', 'chem_permit_exp', 'importer_clearance', 'importer_clearance_issued', 'importer_clearance_exp', 'tsd_ref_no', 'tsd_issued', 'tsd_expiration', 'tp_trc_ref_no', 'tp_trc_issued', 'tp_trc_expiration'],
};
const groupOf = (field) => Object.keys(GROUPS).find((g) => GROUPS[g].includes(field)) || 'legal';

// The permit numbers a row can hold, by kind.
const PERMIT_FIELDS = { ecc: 'ecc_cnc', pto: 'pto_code', wwdp: 'wwdp_code', haz: 'haz_id', pco: 'pco_no', chemical: 'chemical_permit', importer: 'importer_clearance', tsd: 'tsd_ref_no', trc: 'tp_trc_ref_no' };

module.exports = { COLUMNS, DAYS_AFTER, YEARLY, LOOKUP_SHEETS, SET_ASIDE, GROUPS, PERMIT_FIELDS, groupOf, squeeze, fieldsOf, cell, serial, provinceOf };
