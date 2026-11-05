// ---------------------------------------------------------------------------
// The Monitoring Plan template of a year with its own register (from 2027): the
// MONITORING (PER PROVINCE) sheet of the Planning Unit's
// template_monitoring_plan.xlsx (5 Nov 2026), its columns in order under its
// two rows of bands, each header exactly as the sheet writes it, so an export
// reads as the template and goes back through rawWorkbook.fieldsOf.
//
// Its HEALTHCARE sheet is the same without the standby gensets. The spreadsheet
// view keeps the same columns (front-end province/spreadsheet/templateFields.js).
// ---------------------------------------------------------------------------

const TEMPLATE = [
  {
    band: 'GENERAL INFORMATION',
    groups: [
      {
        group: 'INDUSTRY PROFILE',
        columns: [
          ['sort_key', 'Serial_No'],
          ['name', 'Proponent_Name'],
          ['title', 'Project_Title'],
          ['industry_type', 'Industry_Category_Project_Type'],
          ['industry_subtype', 'Industry_Category_Sub-Type'],
          ['industry_class', 'Industry_Classification'],
          ['psic_code', 'PSIC_Code'],
          ['mbu_area', 'Within_Manila_Bay_Area'],
          ['waterbody', 'Receiving_Waterbody_(Major_River_&_River_System)'],
          ['bod', 'BOD\n(kg/day)'],
          ['long', 'Longitude'],
          ['lat', 'Latitude'],
          ['cong_district', 'Congressional_District'],
          ['address', 'Complete_Address'],
          ['street', 'Street'],
          ['brgy', 'Barangay'],
          ['city', 'City'],
          ['province', 'Province'],
          ['protected_area', 'Protected Area'],
        ],
      },
      {
        group: 'MONITORING REFERENCE',
        columns: [
          ['iis_no_2024', '2024_Monitoring\nIIS_No.'],
          ['iis_no_2025', '2025_Monitoring\nIIS_No.'],
          ['iis_no_2026', '2026_Monitoring\nIIS_No.'],
          ['latest_status', 'Latest Status/Recommendations'],
        ],
      },
    ],
  },
  {
    band: '2027 ACCOMPLISHMENT',
    groups: [
      {
        // "2026 MONITORING PLAN" on the sheet; 2027 at the Planning side's word (5 Nov 2026).
        group: '2027 MONITORING PLAN',
        columns: [
          ['iis_no_2027', '2027_Monitoring\nIIS_No.'],
          ['iis_no_nov', 'IIS No. of \nNotice of Violation \n(if applicable)'],
          ['section_incharged', 'SECTION/UNIT_IN_CHARGED'],
          ['handler', 'INSPECTOR/HANDLER'],
          ['monitoring_sched', 'SCHEDULE_OF_MONITORING'],
        ],
      },
      {
        group: 'SECTION/INSPECTOR',
        columns: [
          ['insp_type', 'TYPE_OF_INSPECTION'],
          ['date_monitored', 'Date_Monitored\n(mm/dd/yyyy)'],
          ['date_routed', 'Date_Routed_to_IIS\n(mm/dd/yyyy)'],
          ['date_signed', 'Date_Report_Signed\n(Date_forwarded_to_Focal_person)\n(mm/dd/yyyy)'],
          ['days_dmds', 'TOTAL_NUMBER_OF_DAYS\n(Date_monitored_VS_Date_submitted)'],
          ['days_drds', 'TOTAL_NUMBER_OF_DAYS\n(Date_submitted_VS_Date_report_signed)'],
        ],
      },
      {
        group: 'PLANNING AND INFORMATION SYSTEM MANAGEMENT UNIT',
        columns: [
          ['pismu_tracking', 'Tracking_of_Reports\n(Name of PISMU staff receiving) '],
          ['title_status', 'Project_Status'],
          ['recommendations', 'Remarks/Recommendations'],
          ['with_nov', 'With_previously_issued_NOV?'],
          ['iis_survey', 'IIS Transaction of Survey Report\n(if  any)'],
          ['pismu_count_month', 'ACCOMPLISHMENT COUNT\n(based on the date received by PISMU)'],
        ],
      },
      {
        group: 'MANILA BAY COORDINATING UNIT',
        columns: [['reported_to_co', 'REPORTED TO CO (MANILA BAY AREA)']],
      },
    ],
  },
  {
    band: 'CLEARANCES/PERMITS/CERTIFICATES',
    groups: [
      {
        group: 'ECC/CNC\nPermit_Reference_No.',
        columns: [
          ['ecc_cnc', 'ECC/CNC\nPermit_Reference_No.'],
          ['permit_process', 'Permit_Process_Type'],
          ['date_amended', 'Date_Amended\n(mm/dd/yyyy)'],
          ['date_approved', 'Date_Approved\n(mm/dd/yyyy)'],
          ['pd1586', 'PD 1586\nFOR ISSUANCE OF NOV RECOMMENDATION\n(to be filled by Inspector/Focal)'],
        ],
      },
      {
        group: 'PTO',
        columns: [
          ['pto_code', 'PTO_CODE'],
          ['pto_issued', 'PTO_DATE_ISSUED\n(mm/dd/yyyy)'],
          ['pto_expiration', 'PTO_DATE_OF_EXPIRATION\n(mm/dd/yyyy)'],
          ['ra8749', 'RA 8749\nFOR ISSUANCE OF NOV RECOMMENDATION\n(to be filled by Inspector/Focal)'],
          ['standby_genset', 'No. of Standby GenSet (If applicable)'],
        ],
      },
      {
        group: 'WWDP',
        columns: [
          ['wwdp_code', 'WWDP_CODE'],
          ['wwdp_issued', 'WWDP_DATE_ISSUED\n(mm/dd/yyyy)'],
          ['wwdp_expiration', 'WWDP_DATE_OF_EXPIRATION\n(mm/dd/yyyy)'],
          ['ra9275', 'RA 9275\nFOR ISSUANCE OF NOV RECOMMENDATION\n(to be filled by Inspector/Focal)'],
        ],
      },
      {
        group: 'HAZ',
        columns: [
          ['haz_id', 'HAZWASTE_ID'],
          ['haz_issued', 'HAZWASTE_ID_DATE_ISSUED\n(mm/dd/yyyy)'],
          ['ra6969', 'RA 6969\nFOR ISSUANCE OF NOV RECOMMENDATION\n(to be filled by Inspector/Focal)'],
        ],
      },
      {
        group: 'PCO',
        columns: [
          ['pco_no', 'PCO_Accreditation_No.'],
          ['pco_name', 'PCO_Name'],
          ['pco_validity', 'PCO_Validity\n(yyyy-yyyy)'],
        ],
      },
    ],
  },
];

/** The template's columns in order: { key, header, band, group }. */
const templateColumns = ({ genset = true } = {}) =>
  TEMPLATE.flatMap(({ band, groups }) =>
    groups.flatMap(({ group, columns }) =>
      columns.filter(([key]) => genset || key !== 'standby_genset').map(([key, header]) => ({ key, header, band, group }))
    )
  );

module.exports = { templateColumns };
