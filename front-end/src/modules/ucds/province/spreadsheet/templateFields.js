// ---------------------------------------------------------------------------
// The spreadsheet's columns for a year with its own register (from 2027): the
// Planning Unit's Monitoring Plan template, in its order (server
// modules/ucds/services/monitoringTemplate.js has its exact headers, and a test
// keeps the two the same). A sheet tab for each of its three top bands.
// ---------------------------------------------------------------------------

export const TEMPLATE_GROUPS = [
  { key: "all", label: "All columns" },
  { key: "general", label: "General information" },
  { key: "accomplishment", label: "2027 accomplishment" },
  { key: "clearances", label: "Clearances / permits" },
];

const general = (key, label, width, extra = {}) => ({ key, label, group: "general", width, ...extra });
const accomplishment = (key, label, width, extra = {}) => ({ key, label, group: "accomplishment", width, ...extra });
const clearance = (key, label, width, extra = {}) => ({ key, label, group: "clearances", width, ...extra });
const mono = { mono: true };

export const TEMPLATE_FIELDS = [
  // Industry profile
  general("sort_key", "Serial No", 110, mono),
  general("name", "Proponent name", 200),
  general("title", "Project title", 260),
  general("industry_type", "Industry category / project type", 200),
  general("industry_subtype", "Industry category sub-type", 200),
  general("industry_class", "Industry classification", 200),
  general("psic_code", "PSIC code", 90, mono),
  general("mbu_area", "Within Manila Bay area", 110),
  general("waterbody", "Receiving waterbody", 170),
  general("bod", "BOD (kg/day)", 100, mono),
  general("long", "Longitude", 110, mono),
  general("lat", "Latitude", 110, mono),
  general("cong_district", "Congressional district", 100),
  general("address", "Complete address", 300),
  general("street", "Street", 180),
  general("brgy", "Barangay", 150),
  general("city", "City", 150),
  general("province", "Province", 120),
  general("protected_area", "Protected area", 200),
  // Monitoring reference
  general("iis_no_2024", "2024 monitoring IIS no.", 150, mono),
  general("iis_no_2025", "2025 monitoring IIS no.", 150, mono),
  general("iis_no_2026", "2026 monitoring IIS no.", 150, mono),
  general("latest_status", "Latest status / recommendations", 200),
  // Monitoring plan
  accomplishment("iis_no_2027", "2027 monitoring IIS no.", 150, mono),
  accomplishment("iis_no_nov", "IIS no. of Notice of Violation", 150, mono),
  accomplishment("section_incharged", "Section / unit in charge", 160),
  accomplishment("handler", "Inspector / handler", 160),
  accomplishment("monitoring_sched", "Schedule of monitoring", 110),
  // Section / inspector
  accomplishment("insp_type", "Type of inspection", 170),
  accomplishment("date_monitored", "Date monitored", 120, mono),
  accomplishment("date_routed", "Date routed to IIS", 115, mono),
  accomplishment("date_signed", "Date report signed", 115, mono),
  accomplishment("days_dmds", "Days: monitored → submitted", 120),
  accomplishment("days_drds", "Days: submitted → signed", 120),
  // Planning and Information System Management Unit
  accomplishment("pismu_tracking", "Tracking of reports (PISMU staff)", 170),
  accomplishment("title_status", "Project status", 150),
  accomplishment("recommendations", "Remarks / recommendations", 220),
  accomplishment("with_nov", "With previously issued NOV?", 100),
  accomplishment("iis_survey", "IIS transaction of survey report", 150, mono),
  accomplishment("pismu_count_month", "Accomplishment count", 120),
  // Manila Bay Coordinating Unit
  accomplishment("reported_to_co", "Reported to CO (Manila Bay area)", 130),
  // ECC / CNC
  clearance("ecc_cnc", "ECC/CNC permit reference no.", 200, mono),
  clearance("permit_process", "Permit process type", 120),
  clearance("date_amended", "Date amended", 110, mono),
  clearance("date_approved", "Date approved", 110, mono),
  clearance("pd1586", "PD 1586: NOV recommendation", 170),
  // PTO
  clearance("pto_code", "PTO code", 190, mono),
  clearance("pto_issued", "PTO date issued", 110, mono),
  clearance("pto_expiration", "PTO date of expiration", 115, { ...mono, expiry: true }),
  clearance("ra8749", "RA 8749: NOV recommendation", 170),
  clearance("standby_genset", "No. of standby gensets", 110, mono),
  // WWDP
  clearance("wwdp_code", "WWDP code", 170, mono),
  clearance("wwdp_issued", "WWDP date issued", 110, mono),
  clearance("wwdp_expiration", "WWDP date of expiration", 115, { ...mono, expiry: true }),
  clearance("ra9275", "RA 9275: NOV recommendation", 170),
  // Hazardous waste
  clearance("haz_id", "Hazwaste ID", 170, mono),
  clearance("haz_issued", "Hazwaste ID date issued", 110, mono),
  clearance("ra6969", "RA 6969: NOV recommendation", 170),
  // PCO
  clearance("pco_no", "PCO accreditation no.", 180, mono),
  clearance("pco_name", "PCO name", 180),
  clearance("pco_validity", "PCO validity (yyyy-yyyy)", 120, { ...mono, expiry: true }),
];

/** The healthcare list's sheet: the same columns, no standby gensets. */
export const TEMPLATE_HEALTHCARE_FIELDS = TEMPLATE_FIELDS.filter((f) => f.key !== "standby_genset");

/** The columns led by default in the picker's "Working set". */
export const TEMPLATE_WORKING_SET = [
  "sort_key", "name", "title", "industry_class", "city", "iis_no_2026", "latest_status", "iis_no_2027", "section_incharged", "handler", "monitoring_sched", "date_monitored",
  "title_status", "recommendations", "ecc_cnc", "pto_code", "pto_expiration", "wwdp_code", "wwdp_expiration", "haz_id", "pco_no", "pco_validity",
];
