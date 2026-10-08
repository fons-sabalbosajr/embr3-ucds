// Where an ERMS unit's settings live. Each unit has its own page, under its
// own section of the app; each tab of the page is a section path under it.
//
//   Records     /universe/erms/settings/:section?
//   Legal       /universe/erms/legal/settings/:section?
//   Laboratory  /universe/erms/laboratory/settings/:section?
//
// Records has no unit segment because its other pages have none either
// (/universe/erms/records is its library), and erms/records/:serialNo would
// take "settings" for a serial.

export const SETTINGS_SECTIONS = [
  ["data", "Data Quality"],
  ["duplicates", "Duplicates"],
  ["privacy", "Data Privacy"],
  ["pdf", "PDF Viewing"],
  ["audit", "Tracing & Auditing"],
  ["log", "Log History"],
  ["menus", "Menus"],
];

export const settingsPath = (unit, section) =>
  `/universe/erms/${unit === "records" ? "" : `${unit}/`}settings${section ? `/${section}` : ""}`;
