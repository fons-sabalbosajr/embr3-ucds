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
