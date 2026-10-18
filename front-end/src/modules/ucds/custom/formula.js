// ---------------------------------------------------------------------------
// The formulas of a Planning Unit table (CustomTable.jsx): spreadsheet-style,
// worked out for each row from the row's other columns.
//
//   =[Target] - [Done]
//   =ROUND([Done] / [Target] * 100, 1)
//   =IF([Status] = "Done", 1, 0)
//   =DAYS([Date issued], TODAY())
//   =[Province] & " – " & [City]
//
// A column is named in square brackets; text in double quotes. Operators:
// + - * / ^ %, & (joins text), = <> < > <= >=. Functions: see FUNCTIONS.
//
// Parsed here, never handed to eval or Function: a formula can only read the
// row's own values and call the functions below.
// ---------------------------------------------------------------------------

export class FormulaError extends Error {}
/** Another column's error, carried through unchanged. */
class Passed extends Error {
  constructor(value) {
    super(value);
    this.value = value;
  }
}

const isBlank = (v) => v === null || v === undefined || v === "";
const num = (v) => {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (isBlank(v)) return 0;
  const n = Number(String(v).replace(/,/g, "").trim());
  if (Number.isNaN(n)) throw new FormulaError(`"${v}" is not a number`);
  return n;
};
const text = (v) => (isBlank(v) ? "" : v instanceof Date ? v.toLocaleDateString() : String(v));
const truthy = (v) => (typeof v === "string" ? v !== "" && !/^(false|no|0)$/i.test(v) : Boolean(v));
/** A date from a value: a Date, m/d/yyyy, yyyy-mm-dd, or anything Date reads. */
const toDate = (v) => {
  if (v instanceof Date) return v;
  if (isBlank(v)) throw new FormulaError("a date is empty");
  const s = String(v).trim();
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  const d = m ? new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2])) : new Date(s);
  if (Number.isNaN(d.getTime())) throw new FormulaError(`"${v}" is not a date`);
  return d;
};
const DAY = 86400000;
const flat = (args) => args.flat(Infinity);

export const FUNCTIONS = {
  SUM: { help: "SUM(a, b, …) — adds the values", fn: (...a) => flat(a).reduce((s, v) => s + num(v), 0) },
  AVERAGE: { help: "AVERAGE(a, b, …) — the average of the non-empty values", fn: (...a) => { const v = flat(a).filter((x) => !isBlank(x)); return v.length ? v.reduce((s, x) => s + num(x), 0) / v.length : 0; } },
  MIN: { help: "MIN(a, b, …) — the smallest", fn: (...a) => Math.min(...flat(a).filter((x) => !isBlank(x)).map(num)) },
  MAX: { help: "MAX(a, b, …) — the largest", fn: (...a) => Math.max(...flat(a).filter((x) => !isBlank(x)).map(num)) },
  COUNT: { help: "COUNT(a, b, …) — how many are not empty", fn: (...a) => flat(a).filter((x) => !isBlank(x)).length },
  ROUND: { help: "ROUND(x, digits) — rounded", fn: (x, d = 0) => { const p = 10 ** num(d); return Math.round(num(x) * p) / p; } },
  ABS: { help: "ABS(x) — without its sign", fn: (x) => Math.abs(num(x)) },
  PERCENT: { help: "PERCENT(part, whole) — part of whole, in %, 1 decimal", fn: (a, b) => (num(b) ? Math.round((num(a) / num(b)) * 1000) / 10 : 0) },
  IF: { help: "IF(condition, then, else)", fn: (c, a, b = "") => (truthy(c) ? a : b) },
  AND: { help: "AND(a, b, …) — all true", fn: (...a) => flat(a).every(truthy) },
  OR: { help: "OR(a, b, …) — any true", fn: (...a) => flat(a).some(truthy) },
  NOT: { help: "NOT(a)", fn: (a) => !truthy(a) },
  ISBLANK: { help: "ISBLANK(x) — true when empty", fn: (x) => isBlank(x) },
  CONCAT: { help: "CONCAT(a, b, …) — joins text", fn: (...a) => flat(a).map(text).join("") },
  UPPER: { help: "UPPER(text)", fn: (s) => text(s).toUpperCase() },
  LOWER: { help: "LOWER(text)", fn: (s) => text(s).toLowerCase() },
  LEN: { help: "LEN(text) — how many characters", fn: (s) => text(s).length },
  TODAY: { help: "TODAY() — today's date", fn: () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; } },
  DAYS: { help: "DAYS(end, start) — days from start to end", fn: (e, s) => Math.round((toDate(e) - toDate(s)) / DAY) },
  YEAR: { help: "YEAR(date)", fn: (d) => toDate(d).getFullYear() },
  MONTH: { help: "MONTH(date) — 1 to 12", fn: (d) => toDate(d).getMonth() + 1 },
};

// --- tokens --------------------------------------------------------------------------

function tokenize(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i += 1; continue; }
    if (c === "[") {
      const j = src.indexOf("]", i);
      if (j < 0) throw new FormulaError("a [column] is not closed");
      out.push({ t: "ref", v: src.slice(i + 1, j).trim() });
      i = j + 1;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let s = "";
      while (j < src.length && src[j] !== '"') s += src[j++];
      if (j >= src.length) throw new FormulaError("a \"text\" is not closed");
      out.push({ t: "str", v: s });
      i = j + 1;
      continue;
    }
    const n = /^\d+(\.\d+)?/.exec(src.slice(i));
    if (n) { out.push({ t: "num", v: Number(n[0]) }); i += n[0].length; continue; }
    const w = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
    if (w) {
      const up = w[0].toUpperCase();
      if (up === "TRUE" || up === "FALSE") out.push({ t: "bool", v: up === "TRUE" });
      else out.push({ t: "name", v: up });
      i += w[0].length;
      continue;
    }
    const op = /^(<>|<=|>=|[-+*/^%&=<>(),])/.exec(src.slice(i));
    if (op) { out.push({ t: "op", v: op[0] }); i += op[0].length; continue; }
    throw new FormulaError(`"${c}" is not understood`);
  }
  return out;
}

// --- parse: precedence climbing --------------------------------------------------------

const BINARY = { "=": 1, "<>": 1, "<": 1, ">": 1, "<=": 1, ">=": 1, "&": 2, "+": 3, "-": 3, "*": 4, "/": 4, "^": 5 };

function parse(tokens) {
  let p = 0;
  const peek = () => tokens[p];
  const take = (v) => {
    const t = tokens[p];
    if (!t || (v && t.v !== v)) throw new FormulaError(v ? `"${v}" expected` : "the formula ends too soon");
    p += 1;
    return t;
  };
  function primary() {
    const t = take();
    if (t.t === "num" || t.t === "str" || t.t === "bool") return { k: "lit", v: t.v };
    if (t.t === "ref") return { k: "ref", v: t.v };
    if (t.t === "op" && t.v === "(") { const e = expr(0); take(")"); return e; }
    if (t.t === "op" && (t.v === "-" || t.v === "+")) return { k: "neg", sign: t.v, e: unaryOperand() };
    if (t.t === "name") {
      if (!FUNCTIONS[t.v]) throw new FormulaError(`${t.v} is not a function here`);
      take("(");
      const args = [];
      if (peek()?.v !== ")") {
        args.push(expr(0));
        while (peek()?.v === ",") { take(","); args.push(expr(0)); }
      }
      take(")");
      return { k: "call", f: t.v, args };
    }
    throw new FormulaError(`"${t.v}" is out of place`);
  }
  function unaryOperand() {
    let e = primary();
    while (peek()?.v === "%") { take("%"); e = { k: "pct", e }; }
    return e;
  }
  function expr(minPrec) {
    let left = unaryOperand();
    for (;;) {
      const t = peek();
      if (!t || t.t !== "op" || !(t.v in BINARY)) break;
      const prec = BINARY[t.v];
      if (prec < minPrec) break;
      take();
      // ^ binds to the right; the rest to the left.
      const right = expr(t.v === "^" ? prec : prec + 1);
      left = { k: "bin", op: t.v, a: left, b: right };
    }
    return left;
  }
  const tree = expr(0);
  if (p < tokens.length) throw new FormulaError(`"${tokens[p].v}" is out of place`);
  return tree;
}

/** A formula, parsed once; null for an empty one. Throws FormulaError when it cannot be read. */
export function compile(formula) {
  const src = String(formula ?? "").trim().replace(/^=/, "");
  if (!src) return null;
  return parse(tokenize(src));
}

/** The [columns] a formula names. */
export function referencesOf(tree, out = new Set()) {
  if (!tree) return out;
  if (tree.k === "ref") out.add(tree.v.toLowerCase());
  for (const x of [tree.e, tree.a, tree.b, ...(tree.args || [])]) if (x) referencesOf(x, out);
  return out;
}

const compare = (a, b) => {
  const bothNum = [a, b].every((x) => typeof x === "number" || (typeof x === "string" && x.trim() !== "" && !Number.isNaN(Number(x))));
  if (bothNum) return num(a) - num(b);
  return text(a).localeCompare(text(b), undefined, { sensitivity: "accent" });
};

/** The value of a parsed formula, `get(name)` giving a column's value in the row. */
export function evaluate(tree, get) {
  if (!tree) return "";
  switch (tree.k) {
    case "lit": return tree.v;
    case "ref": return get(tree.v);
    case "neg": return tree.sign === "-" ? -num(evaluate(tree.e, get)) : num(evaluate(tree.e, get));
    case "pct": return num(evaluate(tree.e, get)) / 100;
    case "call": {
      // IF evaluates only the branch it takes.
      if (tree.f === "IF") return truthy(evaluate(tree.args[0], get)) ? evaluate(tree.args[1], get) : tree.args[2] ? evaluate(tree.args[2], get) : "";
      return FUNCTIONS[tree.f].fn(...tree.args.map((a) => evaluate(a, get)));
    }
    case "bin": {
      const a = evaluate(tree.a, get);
      const b = evaluate(tree.b, get);
      switch (tree.op) {
        case "+": return num(a) + num(b);
        case "-": return num(a) - num(b);
        case "*": return num(a) * num(b);
        case "/": if (num(b) === 0) throw new FormulaError("divided by zero"); return num(a) / num(b);
        case "^": return num(a) ** num(b);
        case "&": return text(a) + text(b);
        case "=": return compare(a, b) === 0;
        case "<>": return compare(a, b) !== 0;
        case "<": return compare(a, b) < 0;
        case ">": return compare(a, b) > 0;
        case "<=": return compare(a, b) <= 0;
        case ">=": return compare(a, b) >= 0;
        default: throw new FormulaError(`${tree.op} is not understood`);
      }
    }
    default: throw new FormulaError("the formula cannot be read");
  }
}

/** A value as it reads in a cell. */
export function display(v) {
  if (v === true) return "TRUE";
  if (v === false) return "FALSE";
  if (v instanceof Date) return `${v.getMonth() + 1}/${v.getDate()}/${v.getFullYear()}`;
  if (typeof v === "number") return Number.isFinite(v) ? String(Math.round(v * 1e6) / 1e6) : "#NUM";
  return v ?? "";
}

/**
 * Every row's values, its formula columns worked out — a formula may use
 * another formula column; a loop between them is reported, not followed.
 * @returns {{ rows: object[], errors: Map<string,string> }} errors by column key: why its formula cannot be read
 */
export function computeRows(columns, rows) {
  const byName = new Map(columns.map((c) => [c.name.trim().toLowerCase(), c]));
  const compiled = new Map();
  const errors = new Map();
  for (const c of columns.filter((x) => x.type === "formula")) {
    try {
      const tree = compile(c.formula);
      for (const r of referencesOf(tree)) if (!byName.has(r)) throw new FormulaError(`there is no column [${r}]`);
      compiled.set(c.key, tree);
    } catch (e) {
      errors.set(c.key, e instanceof FormulaError ? e.message : "the formula cannot be read");
    }
  }
  const out = rows.map((row) => {
    const values = { ...(row.values || {}) };
    const done = new Map();
    const visiting = new Set();
    const valueOf = (col) => {
      if (col.type !== "formula") return values[col.key] ?? "";
      if (done.has(col.key)) return done.get(col.key);
      if (errors.has(col.key)) return `#ERROR`;
      if (visiting.has(col.key)) throw new FormulaError(`[${col.name}] uses itself`);
      visiting.add(col.key);
      let v;
      try {
        v = evaluate(compiled.get(col.key), (name) => {
          const got = valueOf(byName.get(name.trim().toLowerCase()));
          // A column in error passes its error on as it is.
          if (typeof got === "string" && got.startsWith("#")) throw new Passed(got);
          return got;
        });
      } catch (e) {
        v = e instanceof Passed ? e.value : `#${e instanceof FormulaError ? e.message : "error"}`;
      }
      visiting.delete(col.key);
      done.set(col.key, v);
      return v;
    };
    for (const c of columns) if (c.type === "formula") values[c.key] = valueOf(c);
    return { ...row, values };
  });
  return { rows: out, errors };
}

/** The totals row's figure for a column: sum, average, count, min or max of its values. */
export function aggregate(kind, values) {
  const filled = values.filter((v) => !isBlank(v) && !(typeof v === "string" && v.startsWith("#")));
  if (kind === "count") return filled.length;
  const nums = filled.map((v) => (typeof v === "number" ? v : typeof v === "boolean" ? (v ? 1 : 0) : Number(String(v).replace(/,/g, "")))).filter((n) => Number.isFinite(n));
  if (!nums.length) return "";
  if (kind === "sum") return Math.round(nums.reduce((a, b) => a + b, 0) * 1e6) / 1e6;
  if (kind === "avg") return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
  if (kind === "min") return Math.min(...nums);
  if (kind === "max") return Math.max(...nums);
  return "";
}
