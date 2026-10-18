// ---------------------------------------------------------------------------
// The Office Script that colours, in one RAW workbook, the rows of the firms
// holding a newly issued permit the tracker found already encoded (the whole
// row, so the accomplished / updated firms read at a glance; WHOLE_ROW in the
// script switches back to the permit's cell only).
//
// The tracker never writes to the RAW files (their link is "view" only, and
// rewriting a workbook would lose its fills and collide with AutoSave). A
// Planning Unit member runs this in Excel for the web — Automate › New
// Script, paste, Run — under their own account: co-authoring safe, and
// undone, if need be, from the file's Version History.
//
// Fast on a large sheet: each permit column is read once; a permit is found
// at the row the tracker read it at or, the sheet re-sorted since, wherever it
// now is in its column; the fills are queued and written together. A row
// whose permit cell already has another colour is left as it is unless
// OVERWRITE is set.
// ---------------------------------------------------------------------------

/** The fill for "newly issued permit, encoded" — light blue. */
export const ENCODED_FILL = "#9DD9F3";

const KIND = { ecc: "ECC/CNC", pto: "PTO", wwdp: "WWDP", haz: "HWG ID", pco: "PCO", tsd: "TSD", trc: "TP/TRC", chemical: "Chemical", importer: "Importer" };

/** The script's text for a file's targets (optionally one kind of permit only). */
export function buildOfficeScript(file, { kinds = null } = {}) {
  const fill = ENCODED_FILL;
  const targets = (file.targets || []).filter((t) => !kinds || kinds.includes(t.listKind));
  // Grouped by sheet and column: "AS|4|PTO-OL-R3-2024-10|" + the fill the tracker saw.
  const bySheet = {};
  for (const t of targets) {
    const k = `${t.sheet}\u0001${t.col}`;
    (bySheet[k] ||= []).push(`${t.row}|${t.permit}|${t.fill ? `#${String(t.fill).toUpperCase()}` : ""}`);
  }
  // One statement per sheet and column — not a loop over them: Excel's script
  // checker flags any read inside a loop, so each column's one read sits in
  // its own call of colourColumn.
  const calls = Object.entries(bySheet).map(([k, rows]) => {
    const [sheet, col] = k.split("\u0001");
    return `  colourColumn(workbook, ${JSON.stringify(sheet)}, ${JSON.stringify(col)}, ${JSON.stringify(rows)}, tally);`;
  });
  const counts = {};
  for (const t of targets) counts[t.listKind] = (counts[t.listKind] || 0) + 1;
  const what = Object.entries(counts)
    .map(([k, n]) => `${n} ${KIND[k] || k}`)
    .join(", ");
  return `/**
 * E-Universe Progress Tracker — colour the newly issued permits already encoded.
 *
 * Workbook: ${file.name}${file.version ? ` (as the tracker read it: version ${file.version})` : ""}
 * Cells:    ${targets.length} (${what || "none"})
 * Fill:     light blue ${fill}
 * Made:     ${new Date().toLocaleString()}
 *
 * Run it in Excel for the web, in this workbook: Automate › New Script, paste
 * this over the sample, Run. Undo from File › Info › Version History.
 * If the workbook has changed a lot since, get a fresh script from the tracker.
 */
// The fill for a newly issued permit already encoded.
const FILL = "${fill}";
// false: a row whose permit cell already has another colour keeps it (that colour may mean something).
const OVERWRITE = false;
// true: the whole row of the firm is coloured, across the sheet's columns, so
// an accomplished / updated firm reads at a glance; false: only the permit's cell.
const WHOLE_ROW = true;

interface Tally { coloured: number; already: number; kept: number; notFound: number; missingSheets: string[]; done: string[]; }

function main(workbook: ExcelScript.Workbook) {
  const tally: Tally = { coloured: 0, already: 0, kept: 0, notFound: 0, missingSheets: [], done: [] };
  // Each call: [sheet, column, ["row|permit number|fill the tracker saw", …]]
${calls.join("\n")}
  const missing = tally.missingSheets.length ? \` Sheets not found: \${tally.missingSheets.join(", ")}.\` : "";
  console.log(\`Coloured \${tally.coloured} \${WHOLE_ROW ? "row" : "cell"}(s). Already light blue: \${tally.already}. Kept their own colour: \${tally.kept}. Not found (moved or removed): \${tally.notFound}.\${missing}\`);
}

/** A permit number compared loosely, as the tracker compares it. */
function permitKey(v: string): string {
  return v.toUpperCase().split(/[^A-Z0-9]+/).filter((p) => p.length > 0)
    .map((p) => (/^\\d+$/.test(p) ? String(Number(p)) : p.replace(/^R[O0](\\d)$/, "R$1"))).join("-");
}

/** The permit numbers a cell holds (one cell may list several). */
function permitKeysIn(v: string | number | boolean): string[] {
  return String(v ?? "").split(/[\\n;,/]|\\s{2,}|\\band\\b/i).map((x) => x.trim())
    .filter((x) => /\\d{2,}/.test(x) && x.length >= 6).map((x) => permitKey(x));
}

/** One column of one sheet: read once, then each permit coloured where it is. */
function colourColumn(workbook: ExcelScript.Workbook, sheetName: string, col: string, rows: string[], tally: Tally) {
  const ws = workbook.getWorksheet(sheetName);
  if (!ws) { tally.notFound += rows.length; tally.missingSheets.push(sheetName); return; }
  const used = ws.getUsedRange();
  if (!used) { tally.notFound += rows.length; return; }
  const last = used.getRowIndex() + used.getRowCount();
  // The row's width: every column the sheet uses, from column A.
  const width = used.getColumnIndex() + used.getColumnCount();
  const values = ws.getRange(\`\${col}1:\${col}\${last}\`).getValues();
  // Each permit: at its row, or wherever it now is in the column (the sheet re-sorted since).
  const where = new Map<string, number[]>();
  values.forEach((v, i) => {
    permitKeysIn(v[0]).forEach((k) => {
      const at = where.get(k) || [];
      at.push(i + 1);
      where.set(k, at);
    });
  });
  rows.forEach((item) => {
    const [rowText, permit, seen] = item.split("|");
    const row = Number(rowText);
    const at = where.get(permit) || [];
    const r = at.includes(row) ? row : at[0];
    if (!r) { tally.notFound++; return; }
    if (seen === FILL) { tally.already++; return; }
    if (!OVERWRITE && seen && seen !== "#FFFFFF" && r === row) { tally.kept++; return; }
    // A row with two permits (ECC and PTO) is coloured, and counted, once.
    const id = \`\${sheetName}!\${WHOLE_ROW ? "" : col}\${r}\`;
    if (tally.done.includes(id)) { tally.already++; return; }
    tally.done.push(id);
    // A write, not a read: queued by Excel and sent together.
    const target = WHOLE_ROW ? ws.getRangeByIndexes(r - 1, 0, 1, width) : ws.getRange(\`\${col}\${r}\`);
    target.getFormat().getFill().setColor(FILL);
    tally.coloured++;
  });
}
`;
}
