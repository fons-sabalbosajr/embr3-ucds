// ---------------------------------------------------------------------------
// The kinds of document in the Records library, grouped by the law each is
// issued under and coloured as the Planning side colours those laws (the
// register's permit tabs and tags: modules/ucds/province — PD 1586 teal,
// RA 8749 purple, RA 9275 red, RA 6969 green, CNC amber).
//
// Keyed on the ERMS permit type (server modules/erms/services/recordService
// PERMIT_TYPES). Legal Services and Laboratory documents are categories of
// their own, by the unit that keeps them (their type is "legal:nov",
// "laboratory:ltr"…). `color` is the tag's colour and the reference's font colour; `ink`, the
// font colour on a dark page.
// ---------------------------------------------------------------------------

export const DOC_CATEGORIES = [
  { key: "ecc", law: "PD 1586", title: "Environmental Compliance Certificates", short: "ECC", color: "#0b5f74", ink: "#5cc6dd", types: ["ecc-original", "ecc-amended"] },
  { key: "cnc", law: "PD 1586", title: "Certificates of Non-Coverage", short: "CNC", color: "#bc6e00", ink: "#f0a640", types: ["cnc"] },
  { key: "air", law: "RA 8749", title: "Permits to Operate (air)", short: "PTO", color: "#4a2250", ink: "#c58bd0", types: ["pto"] },
  { key: "water", law: "RA 9275", title: "Discharge Permits (water)", short: "DP", color: "#b45248", ink: "#ef8c82", types: ["dp"] },
  { key: "hazwaste", law: "RA 6969", title: "Hazardous Waste Generator Registrations", short: "HW", color: "#415e20", ink: "#95c46a", types: ["hw-generator"] },
  { key: "other", law: "Other", title: "Other office documents", short: "Other", color: "#542c14", ink: "#d39b73", types: [] },
  { key: "legal", law: "Legal", title: "Legal Services documents", short: "Legal", color: "#1d4ed8", ink: "#8fb0ff", types: [], source: "legal" },
  { key: "laboratory", law: "Laboratory", title: "Laboratory documents", short: "Lab", color: "#be185d", ink: "#f47bbd", types: [], source: "laboratory" },
];

const BY_TYPE = new Map(DOC_CATEGORIES.flatMap((c) => c.types.map((t) => [t, c])));
const OTHER = DOC_CATEGORIES.find((c) => c.key === "other");
const BY_SOURCE = new Map(DOC_CATEGORIES.filter((c) => c.source).map((c) => [c.source, c]));

/** Which unit keeps it: records, legal or laboratory. */
export const sourceOf = (doc) => {
  if (doc?.source) return doc.source;
  const type = String(doc?.permit?.type || doc?.permitType || "");
  const prefix = type.includes(":") ? type.split(":")[0] : null;
  return prefix && BY_SOURCE.has(prefix) ? prefix : "records";
};

/** A category's label on a tag: "PD 1586 · ECC", "Legal Services", "Other". */
export const categoryTag = (c) => {
  if (c.source) return c.title.replace(/ documents$/, "");
  return c.law === "Other" ? c.short : `${c.law} · ${c.short}`;
};

/** The category of a search result, a request or a desk row. */
export function categoryOf(doc) {
  const source = sourceOf(doc);
  if (BY_SOURCE.has(source)) return BY_SOURCE.get(source);
  const type = doc?.permit?.type || doc?.permitType || null;
  if (type && BY_TYPE.has(type)) return BY_TYPE.get(type);
  // Requests made before the type was kept: read the label.
  const label = String(doc?.permit?.label || doc?.permitLabel || "").toLowerCase();
  if (/non-coverage|\bcnc\b/.test(label)) return BY_TYPE.get("cnc");
  if (/\becc\b|compliance certificate/.test(label)) return BY_TYPE.get("ecc-original");
  return OTHER;
}

const UNIT_NAMES = { records: "the Records Unit", legal: "Legal Services", laboratory: "the Laboratory" };
/** Who keeps (and decides on) this document, in words: "the Records Unit", "Legal Services". */
export const unitName = (doc) => UNIT_NAMES[sourceOf(doc)] || UNIT_NAMES.records;

/** The category's font colour, readable on the page's light or dark background. */
export const inkOf = (category, dark) => (dark ? category.ink || category.color : category.color);
/** The same, to start a sentence: "The Records Unit", "Legal Services". */
export const UnitName = (doc) => {
  const name = unitName(doc);
  return name.charAt(0).toUpperCase() + name.slice(1);
};
