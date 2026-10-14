import { AuditOutlined, ExperimentOutlined, FileProtectOutlined } from "@ant-design/icons";

// ---------------------------------------------------------------------------
// How each unit looks and how its upload form is laid out.
//
// The field definitions come from the server (ERMS Config); this only says
// which of them sit together on the form and under what heading, so a
// Notice of Violation reads as a case file and a test result as a sample
// sheet rather than one long column of inputs. A field not named in any
// group lands in "Details" at the end, so a field added in Admin Settings
// shows up without a code change.
// ---------------------------------------------------------------------------

export const UNIT_THEME = {
  records: {
    label: "Records Unit",
    short: "Records",
    color: "geekblue",
    accent: "#2f54eb",
    icon: <FileProtectOutlined />,
    description: "Permits filed by the Records Unit: ECC, CNC, HW generator registrations and the rest of the register.",
    groups: [],
  },
  legal: {
    label: "Legal Services Unit",
    short: "Legal",
    color: "volcano",
    accent: "#d4380d",
    icon: <AuditOutlined />,
    description: "Cases by docket: notices of violation, technical conferences, orders and resolutions, penalty payments and their attachments.",
    groups: [
      { title: "Basic Info", keys: ["docketNo", "pabCaseNo", "companyName", "companyAddress", "natureOfBusiness", "documentType"] },
      // One tab: the laws the case cites — each a text area on a row of its
      // own — then who handles it and where it stands.
      { title: "Laws Cited & Handling", keys: ["pd1586", "ra8749", "ra9275", "ra6969", "legalOfficer", "caseHandler", "status", "remarks"] },
      { title: "Dates", keys: ["dateOfReport", "novDateIssued", "novDateReleased", "daysProcessed", "tcSchedule", "tcActualDate", "orderDateIssued", "resolutionDateIssued", "dateApproved"] },
    ],
  },
  laboratory: {
    label: "Laboratory Unit",
    short: "Laboratory",
    color: "cyan",
    accent: "#08979c",
    icon: <ExperimentOutlined />,
    description: "Test results, chain-of-custody forms, memos, receipts and calibration certificates, by firm and sampling station.",
    groups: [
      // The sample and its analysis on one tab: a chain-of-custody form is
      // read as one thing, and the analysis was three fields on a tab of its own.
      { title: "Laboratory Info", keys: ["cocNo", "firmName", "address", "dateOfSampling", "parameters", "dateReported", "receivedBy", "dateReceived"] },
      { title: "Document", keys: ["subject", "date", "orNumber", "orDate", "referenceNo", "unitUnderTest", "dateIssued", "dateCalibrated", "dateDue"] },
    ],
  },
};

export const unitTheme = (unit) => UNIT_THEME[unit] || { label: unit, short: unit, color: "default", accent: "#555", icon: null, description: "", groups: [] };

/** The form's sections for a document type: the theme's groups, then whatever is left. */
export function groupFields(unit, fields = []) {
  const theme = unitTheme(unit);
  const placed = new Set();
  const sections = theme.groups
    .map((g) => ({ title: g.title, fields: fields.filter((f) => g.keys.includes(f.key)) }))
    .filter((s) => s.fields.length);
  for (const s of sections) for (const f of s.fields) placed.add(f.key);
  const rest = fields.filter((f) => !placed.has(f.key));
  if (rest.length) sections.push({ title: sections.length ? "Details" : null, fields: rest });
  return sections;
}

export const PROVINCE_OPTIONS = [
  { value: "aurora", label: "Aurora" },
  { value: "bataan", label: "Bataan" },
  { value: "bulacan", label: "Bulacan" },
  { value: "nuevaEcija", label: "Nueva Ecija" },
  { value: "pampanga", label: "Pampanga" },
  { value: "tarlac", label: "Tarlac" },
  { value: "zambales", label: "Zambales" },
];

/** A field value as the screens show it. */
export function formatValue(field, value) {
  if (value === null || value === undefined || value === "") return "—";
  if (field?.type === "date" || /^\d{4}-\d{2}-\d{2}T/.test(String(value))) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
  }
  if (field?.type === "checkbox") return value ? "Yes" : "No";
  return String(value);
}
