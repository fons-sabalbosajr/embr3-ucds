// ---------------------------------------------------------------------------
// VERA's articles on the Planning Unit's own tables — a `table` item added to
// a year's menu (front-end modules/ucds/custom/CustomTable.jsx, server
// services/customTables.js). Part of the Universe Central DB knowledge
// (knowledge.js UCDS_KB), so Planning staff get them.
// ---------------------------------------------------------------------------

const TABLE_KB = Object.freeze([
  {
    id: 'ucds-table-create',
    category: 'Planning Unit tables',
    question: 'How do I add my own table to a year container?',
    answer: `In the sidebar, under **Universe Central DB › [year]**, use the **+** beside the year, the **Monitoring Plan** folder, or a folder you made, and choose **Table**. Give it a name; it appears in the menu at once, in that year only.

Open it and press **Design the columns** (or **Columns** later) to name its columns and choose what each holds. Adding and changing tables needs an account that may **manage the data**; everyone in the year can read and export them.`,
    keywords: ['add table', 'new table', 'create table', 'own table', 'custom table', 'my table', 'make a table', 'table in year', 'add folder', 'menu item'],
  },
  {
    id: 'ucds-table-columns',
    category: 'Planning Unit tables',
    question: 'How do I add, rename or reorder the columns of my table?',
    answer: `Open the table and press **Columns**. Each column has a **name** and a **kind**:
- **Text**, **Number**, **Date** (picked from a calendar), **Choice** (a dropdown — type its choices), **Yes / no** (a tick box)
- **Formula** — worked out for each row from its other columns (see "How do I write a formula").

Use **Add a column** / **Add a formula column**, the arrows to move a column, the bin to remove one, and **Total** to show a sum, average, count, minimum or maximum under it. Press **Save columns**. Renaming keeps the values; a removed column's values are not shown again. A name cannot hold [ or ].`,
    keywords: ['column', 'columns', 'add column', 'rename column', 'delete column', 'remove column', 'reorder', 'move column', 'column type', 'dropdown', 'choice', 'checkbox', 'date column', 'number column', 'design'],
  },
  {
    id: 'ucds-table-formula',
    category: 'Planning Unit tables',
    question: 'How do I write a formula in my table?',
    answer: `Make a **Formula** column (**Columns › Add a formula column**) and write it as in Excel, starting with **=**, naming the row's columns in **square brackets** and text in **double quotes**:
- \`=[Target] - [Done]\` — what is left
- \`=PERCENT([Done], [Target])\` — the share done, in %
- \`=ROUND([Amount] * 1.12, 2)\` — rounded to 2 decimals
- \`=IF([Status] = "Done", 1, 0)\` — a 1 for every finished row (give the column a **Sum** total to count them)
- \`=DAYS([Expiry], TODAY())\` — days until a date
- \`=[City] & ", " & [Province]\` — joins text

Operators: + − * / ^ %, & (join), = <> < > <= >=. Functions: SUM, AVERAGE, MIN, MAX, COUNT, ROUND, ABS, PERCENT, IF, AND, OR, NOT, ISBLANK, CONCAT, UPPER, LOWER, LEN, TODAY, DAYS, YEAR, MONTH.

**Insert column** and **Insert function** add them for you, and the designer shows the first row's result — or what is wrong — as you type. A formula may use another formula column, but not itself. A cell showing **#…** says why its formula could not be worked out (an empty date, a division by zero, text where a number is needed).`,
    keywords: ['formula', 'formulas', 'compute', 'calculate', 'calculation', 'computed', 'sum', 'percent', 'percentage', 'if', 'round', 'days', 'today', 'function', 'functions', 'fx', 'error #', '#error', 'divided by zero'],
  },
  {
    id: 'ucds-table-rows',
    category: 'Planning Unit tables',
    question: 'How do I add, change or delete rows, or paste them from Excel?',
    answer: `- **Add row** adds an empty row at the end; **click a cell** to type in it (Enter or clicking away saves it, Esc cancels). Dates open a calendar, choices a dropdown; a tick box saves as you tick it.
- **Paste rows**: copy the cells in Excel (with the heading row, if you like), click in the box, Ctrl+V. With "the first line is the column names" ticked, columns are matched by name; otherwise in order. Formula columns are worked out, not pasted.
- To delete, tick the rows on the left and press **Delete**.

Every change is saved at once. A table holds up to 10,000 rows and 100 columns.`,
    keywords: ['row', 'rows', 'add row', 'new row', 'delete row', 'remove row', 'paste', 'paste rows', 'from excel', 'import rows', 'edit cell', 'type in', 'encode'],
  },
  {
    id: 'ucds-table-filter-export',
    category: 'Planning Unit tables',
    question: 'How do I search, filter, sort, total and export my table?',
    answer: `- **Search the table** finds a word in any column.
- **Add filter** keeps only the rows that match — choose the column, a test (contains, is, is not, >, <, ≥, ≤, is empty, is not empty) and the value; add several, and all must match. **Clear filters** shows everything again.
- Click a **column heading** to sort by it (again to reverse).
- The **Totals** row sums (or averages, counts…) what is shown — set it per column under **Columns › Total**; the **Totals** switch hides it.
- **Export** saves exactly what is shown — filtered, sorted, formulas worked out, with the totals — as **Excel (.xlsx)** (with filters on its heading row) or **CSV**, or copies it to paste into Excel.`,
    keywords: ['search', 'filter', 'filters', 'sort', 'sorting', 'order', 'totals', 'average', 'export', 'excel', 'xlsx', 'csv', 'download', 'copy', 'summary'],
  },
]);

module.exports = { TABLE_KB };
