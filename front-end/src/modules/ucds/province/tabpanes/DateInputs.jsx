import { useEffect, useState } from "react";
import { Button, DatePicker, Input, Select } from "antd";
import { DeleteOutlined, LinkOutlined, PlusOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { iisNumbersOf, iisTrackerUrl } from "./registerLayout";

dayjs.extend(customParseFormat);

// ---------------------------------------------------------------------------
// The record view's date and month fields, and its IIS numbers. Each keeps
// the register's own spelling, so what is saved reads as before everywhere:
//
//   FullDate    a day: saved m/d/yyyy ("3/25/2025"), as the register and the
//               RAW workbooks write it
//   MonthOnly   a month: saved as its name ("MAY") — the schedule of monitoring
//   MonthRange  a month or a span of months: "MAY", or "JAN-MAR" — the
//               Planning Unit's count month
//
// A value the picker cannot read ("N/A", "2025-2028") is not lost: it shows
// in the empty box until a date is chosen or the box is cleared.
// ---------------------------------------------------------------------------

const DAY_FORMATS = ["M/D/YYYY", "MM/DD/YYYY", "M/D/YY", "YYYY-MM-DD", "YYYY/MM/DD", "MMM D, YYYY", "MMM. D, YYYY", "MMMM D, YYYY", "D MMMM YYYY", "D MMM YYYY"];
const SAVE_DAY = "M/D/YYYY";

/** A register date as a dayjs, or null when it is no date. */
function parseDay(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return dayjs(new Date(Math.round((v - 25569) * 86400 * 1000))); // an Excel serial
  const s = String(v).trim();
  for (const f of DAY_FORMATS) {
    const d = dayjs(s, f, true);
    if (d.isValid()) return d;
  }
  return null;
}

export function FullDate({ value, onChange, size, style }) {
  const day = parseDay(value);
  const unread = !day && String(value ?? "").trim();
  return (
    <DatePicker
      size={size}
      value={day}
      onChange={(d) => onChange(d ? d.format(SAVE_DAY) : "")}
      format="MM/DD/YYYY"
      placeholder={unread ? String(value).trim() : "mm/dd/yyyy"}
      allowClear
      style={{ width: "100%", ...style }}
    />
  );
}

const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
/** "MAY", "May", "MAY 2026", "JAN" → that month (of this year: the year is not kept). */
function parseMonth(v) {
  const s = String(v ?? "").trim().toUpperCase();
  if (!s) return null;
  const i = MONTHS.findIndex((m) => s.startsWith(m.slice(0, 3)));
  return i < 0 ? null : dayjs().month(i).startOf("month");
}

export function MonthOnly({ value, onChange, style }) {
  const m = parseMonth(value);
  return (
    <DatePicker
      picker="month"
      value={m}
      onChange={(d) => onChange(d ? MONTHS[d.month()] : "")}
      format="MMMM"
      placeholder={!m && value ? String(value) : "Month"}
      allowClear
      style={{ width: "100%", ...style }}
    />
  );
}

export function MonthRange({ value, onChange, style }) {
  const [from, to] = String(value ?? "").split(/\s*[-–]\s*|\s+to\s+/i);
  const a = parseMonth(from);
  const b = parseMonth(to) || a;
  return (
    <DatePicker.RangePicker
      picker="month"
      value={a ? [a, b] : null}
      allowEmpty={[false, true]}
      onChange={(r) => {
        const [s, e] = r || [];
        if (!s) return onChange("");
        // One month: its name; a span: "JAN-MAR", as the Planning Unit writes it.
        onChange(!e || e.month() === s.month() ? MONTHS[s.month()] : `${MONTHS[s.month()].slice(0, 3)}-${MONTHS[e.month()].slice(0, 3)}`);
      }}
      format="MMM"
      placeholder={a ? ["From", "To"] : [value ? String(value) : "From month", "To (optional)"]}
      allowClear
      style={{ width: "100%", ...style }}
    />
  );
}

// ── All the years' IIS numbers in one box ────────────────────────────────────
// The register keeps them a field per year (iis_no_2024, iis_no_2025, …), which
// the reports and the monitoring calendar read. The box shows them together,
// one entry per line, and on each change files every entry under the year
// written in its number (R3-2026-031735 → iis_no_2026). An entry keeps its
// words ("ICIR: R3-2024-…", "R3-2025-… (*Complaint)"); one with no year goes
// to the latest year.

const IIS_NO = /\b[A-Z]{1,3}\d?-(20\d\d)-\d{2,}\b/i;
const IIS_NO_ALL = /\b[A-Z]{1,3}\d?-20\d\d-\d{2,}\b/gi;
const BASE_YEARS = [2024, 2025, 2026];

/** The register's IIS year fields on this record (2024–2026 always), oldest first. */
const iisYearsOf = (record) =>
  [...new Set([...BASE_YEARS, ...Object.keys(record || {}).map((k) => /^iis_no_(20\d\d)$/.exec(k)?.[1]).filter(Boolean).map(Number)])].sort();

/** A field's text as entries: split at lines, commas, semicolons, slashes, and between two bare numbers. */
const entriesOf = (v) =>
  String(v ?? "")
    // "N/A" is no entry — taken out before the slash splits it in two.
    .replace(/\bn\/a\b/gi, "")
    .split(/[\n,;/]+/)
    .flatMap((piece) => piece.split(/(?<=\b[A-Z]{1,3}\d?-\d{4}-\d{2,})\s+(?=[A-Z])/i))
    .map((s) => s.trim())
    .filter((s) => s && !/^(n\/?a|none|-)$/i.test(s));

const yearOfEntry = (entry, fallback) => Number(IIS_NO.exec(entry)?.[1] || /\b(20\d\d)\b/.exec(entry)?.[1] || fallback);

/** An entry with each IIS number in it as a link to the IIS tracker. */
function EntryLinks({ entry }) {
  const parts = [];
  let last = 0;
  for (const m of entry.matchAll(IIS_NO_ALL)) {
    if (m.index > last) parts.push(entry.slice(last, m.index));
    parts.push(
      <a key={m.index} href={iisTrackerUrl(m[0])} target="_blank" rel="noopener noreferrer" title="Open in the IIS document tracker">
        <LinkOutlined /> {m[0]}
      </a>
    );
    last = m.index + m[0].length;
  }
  if (last < entry.length) parts.push(entry.slice(last));
  return <>{parts}</>;
}

/** Every year's IIS entries, newest year first: [{ year, entry }]. */
const allEntriesOf = (record) =>
  iisYearsOf(record)
    .reverse()
    .flatMap((y) => entriesOf(record?.[`iis_no_${y}`]).map((entry) => ({ year: y, entry })));

/** View: one list, each entry tagged with its year, its number a link. */
export function IisAllYearsList({ record }) {
  const list = allEntriesOf(record);
  if (!list.length) return <div className="rf-value"><span className="rf-empty">Not encoded</span></div>;
  return (
    <ul className="rf-iis-list">
      {list.map(({ year, entry }, i) => (
        <li key={`${year}-${i}`}>
          <span className="rf-iis-year">{year}</span>
          <EntryLinks entry={entry} />
        </li>
      ))}
    </ul>
  );
}

/**
 * Editing: the IIS numbers as entries of two fields — the reference number
 * and the year it is filed under — added one at a time for any year (2027,
 * 2028 and on). `onChange` gets the year fields to save, e.g.
 * { iis_no_2025: "R3-2025-…", iis_no_2027: "R3-2027-…" }.
 *
 * A new entry's year follows the year written in its number until a year is
 * picked; a number pasted with several in it becomes as many entries.
 */
let entrySeq = 0;
const newId = () => `iis${(entrySeq += 1)}`;

export function IisEntries({ record, onChange }) {
  const now = new Date().getFullYear();
  const baseYears = iisYearsOf(record);
  const defaultYear = Number(record?.year) || Math.max(now, ...baseYears);
  // Every year from 2020 to two years ahead, and any already on the record.
  const yearOptions = [...new Set([...Array.from({ length: now + 3 - 2020 }, (_, i) => 2020 + i), ...baseYears])]
    .sort((a, b) => b - a)
    .map((y) => ({ value: y, label: String(y) }));

  const fromRecord = (r) => allEntriesOf(r).map((x) => ({ id: newId(), ref: x.entry, year: x.year, picked: true }));
  const [rows, setRows] = useState(() => fromRecord(record));
  // Another record: its entries. (Cancel ends editing, and this with it.)
  useEffect(() => {
    setRows(fromRecord(record));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.sort_key]);

  const save = (next) => {
    setRows(next);
    const years = new Set([...baseYears, ...next.map((r) => r.year)]);
    const patch = {};
    for (const y of years) {
      const value = next.filter((r) => r.year === y && r.ref.trim()).map((r) => r.ref.trim()).join("\n");
      if (String(record?.[`iis_no_${y}`] ?? "") !== value) patch[`iis_no_${y}`] = value;
    }
    if (Object.keys(patch).length) onChange(patch);
  };
  const setRef = (row, value) => {
    // Several numbers pasted at once: one entry each.
    const parts = /[\n,;]/.test(value) ? entriesOf(value) : null;
    if (parts && parts.length > 1) {
      const made = parts.map((ref, i) => ({ id: i ? newId() : row.id, ref, year: row.picked && i === 0 ? row.year : yearOfEntry(ref, row.year), picked: row.picked && i === 0 }));
      return save(rows.flatMap((r) => (r.id === row.id ? made : [r])));
    }
    const y = IIS_NO.exec(value)?.[1];
    return save(rows.map((r) => (r.id === row.id ? { ...r, ref: value, year: !r.picked && y ? Number(y) : r.year } : r)));
  };

  return (
    <div className="rf-iis-entries">
      {rows.length > 0 && (
        <div className="rf-iis-entry rf-iis-entry--head" aria-hidden="true">
          <span>IIS reference no.</span>
          <span>Year</span>
          <span />
        </div>
      )}
      {rows.map((row) => {
        const written = IIS_NO.exec(row.ref)?.[1];
        const mismatch = written && Number(written) !== row.year;
        return (
          <div key={row.id} className="rf-iis-entry">
            <Input
              value={row.ref}
              onChange={(e) => setRef(row, e.target.value)}
              placeholder="R3-2027-000000"
              spellCheck={false}
              status={mismatch ? "warning" : undefined}
              suffix={
                IIS_NO.test(row.ref) ? (
                  <a href={iisTrackerUrl(IIS_NO.exec(row.ref)[0])} target="_blank" rel="noopener noreferrer" title="Open in the IIS document tracker" onMouseDown={(e) => e.preventDefault()}>
                    <LinkOutlined />
                  </a>
                ) : (
                  <span />
                )
              }
            />
            <Select value={row.year} options={yearOptions} onChange={(year) => save(rows.map((r) => (r.id === row.id ? { ...r, year, picked: true } : r)))} />
            <Button type="text" danger icon={<DeleteOutlined />} aria-label="Remove this IIS no." onClick={() => save(rows.filter((r) => r.id !== row.id))} />
            {mismatch && <span className="rf-iis-warn">The number says {written}; it will be filed under {row.year}.</span>}
          </div>
        );
      })}
      <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => setRows((r) => [...r, { id: newId(), ref: "", year: defaultYear, picked: false }])} style={{ alignSelf: "flex-start" }}>
        Add IIS no.
      </Button>
    </div>
  );
}

/**
 * IIS reference numbers: one box, one number per line (or separated by
 * commas). Saved comma-separated, as the register keeps them; each number
 * below the box opens in the IIS document tracker.
 */
export function IisInput({ value, onChange, placeholder = "One IIS no. per line" }) {
  const toLines = (v) => iisNumbersOf(v).join("\n");
  const [text, setText] = useState(toLines(value));
  // Another record, or the value put back (Cancel): the box follows it.
  useEffect(() => {
    if (iisNumbersOf(text).join(", ") !== iisNumbersOf(value).join(", ")) setText(toLines(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const nos = iisNumbersOf(text);
  return (
    <div className="rf-iis-input">
      <Input.TextArea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(iisNumbersOf(e.target.value).join(", "));
        }}
        placeholder={placeholder}
        autoSize={{ minRows: 2, maxRows: 6 }}
        spellCheck={false}
      />
      {nos.length > 0 && (
        <div className="rf-iis-chips">
          {nos.map((no) => (
            <a key={no} href={iisTrackerUrl(no)} target="_blank" rel="noopener noreferrer" title="Open in the IIS document tracker">
              <LinkOutlined /> {no}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
