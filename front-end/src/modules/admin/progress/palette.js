// ---------------------------------------------------------------------------
// The Progress Tracker's colours and small helpers, shared by its parts.
//
// SOURCES are identities — the baseline firms and the two sources of the
// additions — so each keeps one hue on every card, table and chart. The hues
// are the dataviz reference palette's (charts.jsx), validated for colour-
// vision deficiency in both modes; green and blue also match the fills the
// Planning Unit marks ERMS and ECC Online additions with in the workbooks.
// Green's contrast on the light surface is under 3:1, so every bar that uses
// it carries its number in text beside it. progress.css holds the same values.
//
// FAMILY is not a chart palette: it is the workbook's own fill colours, merged
// into families (light and dark greens are one "green"), each shown with the
// actual shades under it, so the screen matches what is seen in Excel.
// ---------------------------------------------------------------------------

// Short labels for cards, tables and legends; the hint says it in full.
export const SOURCES = [
  { key: "base", label: "Baseline", hint: "Already on the main sheet before this updating", light: "#4a3aa7", dark: "#9085e9" },
  { key: "erms", label: "ERMS", hint: "Added from the ERMS export (CSV tb_main_data)", light: "#1baf7a", dark: "#199e70" },
  { key: "ecconline", label: "ECC Online", hint: "Added from ECC Online, Oct 2025 – Sep 2026", light: "#2a78d6", dark: "#3987e5" },
];
export const OTHER_SOURCE = { key: "other", label: "Other", hint: "Added from another source", light: "#eda100", dark: "#c98500" };
export const sourceColour = (key, dark) => {
  const s = SOURCES.find((x) => x.key === key) || OTHER_SOURCE;
  return dark ? s.dark : s.light;
};
export const DOT_CLASS = { base: "is-base", erms: "is-erms", ecconline: "is-ecc", other: "is-other" };

export const FAMILY = {
  red: { label: "Red", hex: "#f5222d" },
  orange: { label: "Orange / peach", hex: "#fa8c16" },
  yellow: { label: "Yellow", hex: "#fadb14" },
  green: { label: "Green", hex: "#73d13d" },
  blue: { label: "Blue / sky blue", hex: "#4096ff" },
  purple: { label: "Purple", hex: "#9254de" },
  pink: { label: "Pink", hex: "#f759ab" },
  gray: { label: "Gray", hex: "#bfbfbf" },
};

/** "Light", "Dark" or "" for a shade, from its lightness — to name the shades of a family. */
export const shadeName = (rgb) => {
  const m = /^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(rgb || ""));
  if (!m) return "";
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16) / 255);
  const l = (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
  return l >= 0.82 ? "Light" : l <= 0.45 ? "Dark" : "Medium";
};

// The newly issued lists' colours, as the workshop sets them (Workshop No.
// 1-3, "Input newly issued permits"): the masterlist holder looks each permit
// up in the RAW data and colours its row by what they found. The swatches
// are the workshop sheet's; the server sends the same meanings
// (masterlistLegend) and judges each permit by them.
export const MASTERLIST = [
  { family: "green", label: "Permit found", hex: "#b3f5d6", text: "#1f8a55", hint: "The firm is in the universe and its permit is already in the records — cross-checked." },
  { family: "pink", label: "Renewed permit", hex: "#ff66cc", text: "#c41d7f", hint: "The firm is in the universe and was issued a renewed permit — its permit data updated in the RAW data." },
  { family: "yellow", label: "New permit", hex: "#ffff33", text: "#ad8b00", hint: "The firm is in the universe with no permit encoded — the newly issued permit added to the RAW data." },
  { family: "red", label: "Firm not in the universe", hex: "#c00000", text: "#c00000", hint: "The firm is not yet in the universe — for verification with the facilitator, then endorsed." },
];
export const MASTERLIST_FAMILY = Object.fromEntries(MASTERLIST.map((m) => [m.family, m]));
// A healthcare / TSD / TRC firm on a newly issued list: Yes in the list's
// "Healthcare / TSD / TRC Firm" column (blank: not). A mark beside the
// colour, not a colour — the row is coloured by the workshop's legend like any other.
export const HEALTHCARE = { label: "Healthcare / TSD / TRC firms", hint: "Yes in the list's “Healthcare / TSD / TRC Firm” column. Their rows are coloured by the same legend as every other permit, and counted in the colours above." };
/**
 * A colour on a newly issued list: as the workshop names it; else as the
 * Developer named it (`names`, the season's masterlistNames); else the
 * colour's own name, marked as outside the legend.
 */
export const masterlistLabel = (family, names = {}) => MASTERLIST_FAMILY[family]?.label || names?.[family] || `${FAMILY[family]?.label || family} (not in the workshop's legend)`;
/** A colour the workshop's legend does not use: one the Developer may name. */
export const isOtherColour = (family) => !MASTERLIST_FAMILY[family];
/** The swatch of a colour on a newly issued list: the workshop's, or the colour family's. */
export const masterlistHex = (family) => MASTERLIST_FAMILY[family]?.hex || FAMILY[family]?.hex || "#bfbfbf";

// The universe a newly issued permit belongs to, as its list marks it in the
// "Healthcare / TSD / TRC Firm" column: Healthcare / TSD / TRC (Yes), or the
// province's Monitoring Plan (blank).
export const SCOPES = [
  { key: "all", label: "All permits" },
  { key: "plan", label: "Monitoring Plan", hint: "Permits whose “Healthcare / TSD / TRC Firm” column is blank" },
  { key: "healthcare", label: "Healthcare / TSD / TRC", hint: "Permits with Yes in the list's “Healthcare / TSD / TRC Firm” column" },
];
const EMPTY_SCOPE = { issued: 0, inRaw: 0, colored: 0, coloredInRaw: 0, families: {} };
/** A level's figures (a kind's, a province's) within a universe: its own for "all". */
export const inScope = (x, scope) => (!scope || scope === "all" ? x || EMPTY_SCOPE : x?.scopes?.[scope] || EMPTY_SCOPE);

// Where a newly issued permit stands against the RAW data (server permitStatus).
export const PERMIT_STATUS = {
  todo: { label: "Not yet highlighted", color: "default", hint: "No colour on the list, and not in the RAW data: not worked on yet." },
  unmarked: { label: "In the RAW data, not highlighted", color: "blue", hint: "Already in the RAW data, but its row on the list has no colour yet." },
  ok: { label: "Matches", color: "green", hint: "The colour and the RAW data agree." },
  greenButNew: { label: "Green, but written in this season", color: "gold", hint: "Green means already in the records, yet the permit was not in the RAW data at the baseline: pink or yellow was meant." },
  notEncoded: { label: "Highlighted, not in the RAW data", color: "red", hint: "Green, pink or yellow says it is in the RAW data, but it is not." },
  redInRaw: { label: "Red, but in the RAW data", color: "red", hint: "Red says the firm is not in the universe, but the permit is already in the RAW data." },
  otherColour: { label: "Colour not in the legend", color: "purple", hint: "A colour the workshop does not use." },
};

// "No colour" in the workbooks: the rows nobody has highlighted. Always first.
export const NO_COLOUR = { key: "white", label: "No colour", hint: "Not yet highlighted", hex: "#ffffff", stroke: "#bfbfbf" };

// The two groups the updating follows (the ECP list is left out by the server).
export const GROUPS = [
  { key: "province", label: "Monitoring Plan", hint: "the seven provinces" },
  { key: "healthcare", label: "Healthcare", hint: "Healthcare, Chemical permits, TSD / TRC, Importers" },
];

/** Respect the person's "reduce motion" setting: no chart or bar animation then. */
export const reducedMotion = () => {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};

export const KIND_LABEL = { ecc: "ECC/CNC", pto: "PTO", wwdp: "WWDP", haz: "HWG ID", pco: "PCO", chemical: "Chemical permit", importer: "Importer clearance", tsd: "TSD", trc: "TP/TRC" };
// The permits followed one by one: different things, never added together.
export const MAIN_KINDS = ["ecc", "pto", "wwdp", "haz", "pco"];
export const EXTRA_KINDS = ["tsd", "trc", "chemical", "importer"];
/** The main five, then any other kind that has numbers. */
export const kindsShown = (has) => [...MAIN_KINDS, ...EXTRA_KINDS.filter(has)];

/** One unit's (or a total's) permits of one kind: baseline firms, ERMS additions, ECC Online additions. */
export const permitSplit = (u, k) => {
  const erms = u?.addedPermitsByKind?.erms?.[k] || 0;
  const ecconline = u?.addedPermitsByKind?.ecconline?.[k] || 0;
  const other = u?.addedPermitsByKind?.other?.[k] || 0;
  const total = u?.permits?.[k] || 0;
  return { total, base: Math.max(0, total - erms - ecconline - other), erms, ecconline, other };
};

// The newly issued permits: encoded on a baseline firm, or with an addition,
// or not yet in the RAW data (a neutral remainder, not a source).
export const REMAINING = { label: "To encode", light: "#d9d9d9", dark: "#434343" };

export const n = (v) => (Number(v) || 0).toLocaleString();
export const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
export const signed = (v) => (v > 0 ? `+${n(v)}` : v < 0 ? `−${n(-v)}` : "0");
export const unitLabel = (u) => String(u || "").replace(/_/g, " ");
export const sum = (o) => Object.values(o || {}).reduce((a, v) => a + (Number(v) || 0), 0);
export const addedOf = (u) => sum(u?.added);
/** An addition: "+1,234", or "0" when there is none (never "+0"). */
export const plus = (v) => (Number(v) ? `+${n(v)}` : "0");
