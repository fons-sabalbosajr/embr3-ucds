// How the Document Portal names a document to people: its reference number
// (the ECC or permit number; a Legal docket or reference number; a
// Laboratory reference number) and its title. The serial number is the library's own key —
// shown small, for staff, never as the name.

/** The ECC reference number of a search result, a request or a desk row, or null. */
export const eccRefOf = (doc) => doc?.permitNumber || doc?.permit?.number || null;

/** "ECC-OL-R03-2017-0370 — Poultry Dressing Plant", for one line of text. */
export const docLabel = (doc) => [eccRefOf(doc) || doc?.serialNo, doc?.projectTitle].filter(Boolean).join(" — ");

/** What the reference number is called for this kind of document. */
export const refLabelOf = (doc) => {
  const source = doc?.source || String(doc?.permitType || doc?.permit?.type || "").split(":")[0];
  if (source === "legal") return "Docket / Ref No";
  if (source === "laboratory") return "Ref No";
  const type = doc?.permitType || doc?.permit?.type || "";
  return /^ecc/.test(type) ? "ECC Ref No" : "Ref No";
};
