// One colour per section/unit for the Section Incharge tags.
//
// Each year container's register spells sections its own way ("PEMU_Nueva
// Ecija", "PEMU_NUEVA_ECIJA", "Pemu_Nueva_Ecija"), and later years bring
// sections earlier ones never had (the 2027 register added WAQMS). So names
// are compared normalised — upper case, spaces and dashes as underscores —
// and a section not listed here still gets a steady colour of its own,
// worked out from its name, instead of every newcomer falling to grey.

const SECTION_COLORS = {
  PEMU_AURORA: "#A4B465",
  PEMU_BATAAN: "#C2B280",
  PEMU_BULACAN: "#7A73D1",
  PEMU_NUEVA_ECIJA: "#DDA853",
  PEMU_PAMPANGA: "#DF9755",
  PEMU_TARLAC: "#39C665",
  PEMU_ZAMBALES: "#4A5A8C",
  MBU: "#FF9B3E",
  MANILA_BAY_UNIT: "#FF9B3E",
  TCHWMS: "#936DDF",
  AWECMES: "#626F47",
  WAQMS: "#2F80ED",
  CPD: "#C0567A",
};

const normalizeSection = (section) =>
  String(section || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

/** A stable mid-tone hex for a name no table lists. */
const colorFromName = (key) => {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  const h = hash % 360;
  const s = 0.45;
  const l = 0.5;
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};

/**
 * The section's colour as a hex, or null when there is no section.
 * A combined section ("TCHWMS/MBU") takes the colour of its first part.
 */
export const sectionColor = (section) => {
  const key = normalizeSection(section);
  if (!key) return null;
  if (SECTION_COLORS[key]) return SECTION_COLORS[key];
  const first = key.split("/").map((part) => part.replace(/^_+|_+$/g, "")).find((part) => SECTION_COLORS[part]);
  return first ? SECTION_COLORS[first] : colorFromName(key);
};

/** The section's name for display: underscores read as spaces. */
export const sectionLabel = (section) => String(section || "").trim().replace(/_/g, " ");

/** The record's sections, one per comma, blanks dropped. */
export const splitSections = (value) =>
  String(value || "")
    .split(",")
    .map((section) => section.trim())
    .filter(Boolean);
