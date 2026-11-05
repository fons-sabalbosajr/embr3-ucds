import { getActiveYear } from "../../../../context/YearContext";

// ---------------------------------------------------------------------------
// Which fields a record's register holds. From 2027 the register is loaded
// from the Planning Unit's RAW universe workbooks (server
// scripts/migrate-ucds/import-year-register.js), whose columns differ from the
// legacy register's: no number of employees nor type of WWTF (the BOD is a
// column of its own), a "for issuance of NOV recommendation" per law instead
// of free remarks, the protected area, the IIS no. of the NOV and the survey
// report, "reported to CO", and Manila Bay as ✔/✘ in `mbu_area`.
// ---------------------------------------------------------------------------

export const RAW_LAYOUT_FROM = 2027;

/** True when the record belongs to a register loaded from the RAW workbooks. */
export const isRawLayout = (record) => Number(record?.year || getActiveYear() || 0) >= RAW_LAYOUT_FROM;

/** The values of the RAW workbooks' "for issuance of NOV recommendation" columns. */
export const NOV_RECOMMENDATION = ["Compliant", "Non-Compliant", "Compliant (Survey)", "Non-Compliant (Survey)"];

// The dropdowns of the Planning Unit's Monitoring Plan template (5 Nov 2026), spelled as it does.
export const INSPECTION_TYPES = ["Actual Monitoring", "Table Monitoring", "Actual Monitoring (Complaint)", "Actual Monitoring (Directives from CO)", "Internal Agreement"].map((value) => ({ value }));
export const PROJECT_STATUSES = ["OPERATIONAL", "TEMPORARY NOT OPERATIONAL", "NOT OPERATIONAL"].map((value) => ({ value }));
export const SECTIONS = ["CPD", "CPD_EIAS", "CPD_AWPS", "CPD_CHWPS", "WAQMS", "TCHWMS", "PEMU_Aurora", "PEMU_Bataan", "PEMU_Bulacan", "PEMU_Nueva_Ecija", "PEMU_Pampanga", "PEMU_Tarlac", "PEMU_Zambales"].map((value) => ({ value }));
export const PISMU_STAFF = ["Marshalle Julluice V. Catua", "Wendelle John L. Lozano", "Alyanna Y. Patdu"];
export const RECOMMENDATIONS = ["For Issuance of NOV", "For Issuance of ORDER/RESO", "FFM", "For Delisting", "For Appropriate Action of Legal Unit"];
export const REPORTED_TO_CO = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
export const PERMIT_PROCESSES = ["ECC Manual", "ECC Online", "ECC (EMB CO)", "ECC (EIS)", "ECC (IEE)", "CNC Manual", "CNC Online"];

/** A list's serial ("HC-BU-12", "TSD-PA-3"), not a province's own ("BU-12"): the template gives the lists no standby gensets. */
export const isListSerial = (serial) => /^[A-Za-z_]+-[A-Za-z_]+-/.test(String(serial ?? ""));

/** "YES", "✔", "true"… → true; the register's checkmarks and the RAW workbooks' YES/NO alike. */
export const isYes = (v) => /^(yes|y|true|1|✔|✓)$/i.test(String(v ?? "").trim());

/** IIS numbers in a field: one or more, separated by commas, semicolons, spaces or lines. */
export const iisNumbersOf = (v) =>
  String(v ?? "")
    .split(/[\s,;]+/)
    .map((x) => x.trim())
    .filter((x) => x && !/^(n\/?a|none|-)$/i.test(x));

/** An IIS transaction number's page in the EMB IIS document tracker. */
export const iisTrackerUrl = (no) => `https://iis.emb.gov.ph/embis/dms/documents/tracker/?trn_no=${encodeURIComponent(no)}`;
