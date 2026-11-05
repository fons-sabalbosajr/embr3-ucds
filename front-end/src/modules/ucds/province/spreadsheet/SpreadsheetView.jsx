import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Checkbox, Divider, Dropdown, Input, Modal, Popover, Segmented, Select, Space, Switch, Table, Tooltip, Typography } from "antd";
import {
  ClearOutlined, CopyOutlined, DownloadOutlined, EditOutlined, FileExcelOutlined, FilePdfOutlined, FileTextOutlined, FilterOutlined, ColumnWidthOutlined, LockOutlined, SearchOutlined, TableOutlined, UndoOutlined, ZoomInOutlined,
} from "@ant-design/icons";
import Papa from "papaparse";
import { downloadMonitoringPlan, downloadSpreadsheetView } from "../../ucdsService";
import { updateUcdsDataBySortKey } from "../../../../api/provinceService";
import { message } from "../../../../shared/feedback";
import { copyText } from "../../../../shared/copyText";
import { isRawLayout } from "../tabpanes/registerLayout";
import { TEMPLATE_FIELDS, TEMPLATE_GROUPS, TEMPLATE_HEALTHCARE_FIELDS, TEMPLATE_WORKING_SET } from "./templateFields";
import "./spreadsheet.css";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// The register as a spreadsheet: the province's establishments in a grid that
// reads like Excel — row numbers, lettered columns, a name box and formula
// bar for the cell chosen, sheet tabs for sets of columns — with the tools
// the work needs: search, filters by section, municipality and permit,
// sort and filter on each column, columns to show, freeze panes, wrap, zoom,
// and export of exactly what is on the screen (Excel, CSV, PDF, or copied),
// besides the full Monitoring Plan.
//
// Editing, for an account that may change the province: switch Edit on,
// then double-click a cell, press Enter or F2, or just type; Enter or Tab
// saves it (and moves on), Esc cancels, Delete clears. Each cell is saved as
// it is left, through the same update as the record view — so the record's
// History has it — and Undo (Ctrl+Z) puts the last change back. The serial
// is never edited. Thousands of rows stay smooth: only the rows in sight are
// drawn.
// ---------------------------------------------------------------------------

const fmt = (n) => new Intl.NumberFormat().format(n ?? 0);

// The register's fields, in the Monitoring Plan's order, by group.
const LEGACY_FIELDS = [
  { key: "sort_key", label: "Serial No", group: "profile", width: 110, mono: true },
  { key: "title", label: "Project title", group: "profile", width: 280 },
  { key: "name", label: "Proponent", group: "profile", width: 220 },
  { key: "industry_class", label: "Industry classification", group: "profile", width: 200 },
  { key: "industry_type", label: "Industry type", group: "profile", width: 200 },
  { key: "industry_subtype", label: "Industry sub-type", group: "profile", width: 200 },
  { key: "psic_code", label: "PSIC", group: "profile", width: 90, mono: true },
  { key: "title_status", label: "Project status", group: "profile", width: 140 },
  { key: "street", label: "Street", group: "location", width: 180 },
  { key: "brgy", label: "Barangay", group: "location", width: 150 },
  { key: "city", label: "Municipality", group: "location", width: 150 },
  { key: "province", label: "Province", group: "location", width: 120 },
  { key: "address", label: "Complete address", group: "location", width: 300 },
  { key: "cong_district", label: "District", group: "location", width: 80 },
  { key: "waterbody", label: "Waterbody", group: "location", width: 170 },
  { key: "lat", label: "Latitude", group: "location", width: 110, mono: true },
  { key: "long", label: "Longitude", group: "location", width: 110, mono: true },
  { key: "mbu_area", label: "Manila Bay area", group: "location", width: 110 },
  { key: "ecc_cnc", label: "ECC/CNC", group: "permits", width: 200, mono: true },
  { key: "permit_process", label: "ECC process", group: "permits", width: 120 },
  { key: "date_approved", label: "ECC approved", group: "permits", width: 120, mono: true },
  { key: "pto_code", label: "PTO", group: "permits", width: 190, mono: true },
  { key: "pto_issued", label: "PTO issued", group: "permits", width: 110, mono: true },
  { key: "pto_expiration", label: "PTO expires", group: "permits", width: 115, mono: true, expiry: true },
  { key: "wwdp_code", label: "WWDP", group: "permits", width: 170, mono: true },
  { key: "wwdp_issued", label: "WWDP issued", group: "permits", width: 110, mono: true },
  { key: "wwdp_expiration", label: "WWDP expires", group: "permits", width: 115, mono: true, expiry: true },
  { key: "haz_id", label: "HWG ID", group: "permits", width: 170, mono: true },
  { key: "haz_issued", label: "HWG issued", group: "permits", width: 110, mono: true },
  { key: "pco_no", label: "PCO no.", group: "permits", width: 180, mono: true },
  { key: "pco_name", label: "PCO name", group: "permits", width: 180 },
  { key: "pco_validity", label: "PCO valid until", group: "permits", width: 120, mono: true, expiry: true },
  { key: "section_incharged", label: "Section in charge", group: "monitoring", width: 160 },
  { key: "handler", label: "Handler", group: "monitoring", width: 160 },
  { key: "monitoring_sched", label: "Schedule", group: "monitoring", width: 110 },
  { key: "insp_type", label: "Inspection type", group: "monitoring", width: 140 },
  { key: "report_type", label: "Report type", group: "monitoring", width: 140 },
  { key: "date_monitored", label: "Date monitored", group: "monitoring", width: 120, mono: true },
  { key: "date_routed", label: "Date routed", group: "monitoring", width: 115, mono: true },
  { key: "date_signed", label: "Date signed", group: "monitoring", width: 115, mono: true },
  { key: "iis_no_2024", label: "IIS 2024", group: "monitoring", width: 150, mono: true },
  { key: "iis_no_2025", label: "IIS 2025", group: "monitoring", width: 150, mono: true },
  { key: "iis_no_2026", label: "IIS 2026", group: "monitoring", width: 150, mono: true },
  { key: "pismu_tracking", label: "Received by PISMU", group: "monitoring", width: 170 },
  { key: "with_nov", label: "With NOV", group: "monitoring", width: 90 },
  { key: "remarks", label: "Remarks", group: "monitoring", width: 280 },
];
const LEGACY_GROUPS = [
  { key: "all", label: "All columns" },
  { key: "profile", label: "Profile" },
  { key: "location", label: "Location" },
  { key: "permits", label: "Permits" },
  { key: "monitoring", label: "Monitoring" },
];
// What the "All columns" sheet starts with: the working set, not all 46.
const LEGACY_DEFAULT_ALL = ["sort_key", "title", "name", "industry_class", "city", "ecc_cnc", "pto_code", "pto_expiration", "wwdp_code", "wwdp_expiration", "haz_id", "pco_no", "pco_validity", "section_incharged", "handler", "date_monitored", "iis_no_2025", "iis_no_2026", "title_status", "remarks"];
const LEAD_LEGACY = ["sort_key", "title"];
const LEAD_TEMPLATE = ["sort_key", "name", "title"];
const PERMIT_FILTERS = [
  { value: "ecc", label: "Has an ECC/CNC" },
  { value: "pto", label: "Has a PTO" },
  { value: "wwdp", label: "Has a WWDP" },
  { value: "haz", label: "Has an HWG ID" },
  { value: "pco", label: "Has a PCO" },
  { value: "none", label: "No permit at all" },
  { value: "expired", label: "A permit expired" },
  { value: "soon", label: "A permit expires within a month" },
  { value: "erms", label: "ECC on file in ERMS" },
];

/** Column 0 → "A", 26 → "AA": the spreadsheet's letters. */
const letter = (i) => {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};
const blank = (v) => v === undefined || v === null || String(v).trim() === "" || /^n\/?a$/i.test(String(v).trim());

/** Days to a date written m/d/yyyy or yyyy-mm-dd, or the end of a yyyy-yyyy validity (negative once past), or null. */
const daysTo = (v) => {
  const s = String(v || "").trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  let d = m ? new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2])) : null;
  if (!d) {
    m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  }
  if (!d) {
    m = /\b\d{4}\s*-\s*(\d{4})$/.exec(s);
    d = m ? new Date(Number(m[1]), 11, 31) : null;
  }
  if (!d || Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
};

// Fields that are not edited here: the serial is the record's key.
const LOCKED = new Set(["sort_key"]);
const cellId = (serial, key) => `${serial}\u0001${key}`;

export default function SpreadsheetView({ open, onClose, rows = [], rawIis = {}, anchors = {}, province = "", onOpenRecord, canEdit = false, currentUser, onSaved }) {
  // The year's own columns: from 2027 the Monitoring Plan template's, in its
  // order and every one on the screen from the start; up to 2026 the working set.
  const raw = isRawLayout(rows[0]);
  const FIELDS = raw ? (/^health/i.test(province) ? TEMPLATE_HEALTHCARE_FIELDS : TEMPLATE_FIELDS) : LEGACY_FIELDS;
  const GROUPS = raw ? TEMPLATE_GROUPS : LEGACY_GROUPS;
  const WORKING_SET = raw ? TEMPLATE_WORKING_SET : LEGACY_DEFAULT_ALL;
  const DEFAULT_ALL = raw ? FIELDS.map((f) => f.key) : LEGACY_DEFAULT_ALL;
  // What leads each sheet and is frozen: the template has the proponent before the title.
  const lead = raw ? LEAD_TEMPLATE : LEAD_LEGACY;
  const [sheet, setSheet] = useState("all");
  const [chosen, setChosen] = useState(DEFAULT_ALL); // the "All columns" sheet's columns
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [colFilters, setColFilters] = useState({});
  const [sections, setSections] = useState([]);
  const [cities, setCities] = useState([]);
  const [permits, setPermits] = useState([]);
  const [sort, setSort] = useState({ key: null, order: null });
  const [freeze, setFreeze] = useState("title"); // none | serial | title
  const [wrap, setWrap] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [sel, setSel] = useState(null); // { r, c }
  const [height, setHeight] = useState(560);
  // Editing.
  const [editMode, setEditMode] = useState(false);
  const [editing, setEditing] = useState(null); // { r, c, value }
  const [overrides, setOverrides] = useState({}); // serial -> { key: value } saved this session
  const [cellState, setCellState] = useState({}); // cellId -> "saving" | "saved" | "error"
  const [undo, setUndo] = useState([]); // [{ serial, key, before, after }]
  const [fx, setFx] = useState(""); // the formula bar while editing there
  const gridRef = useRef(null);
  const tableRef = useRef(null);
  const boxRef = useRef(null);

  // A pause in typing, then the search.
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim().toLowerCase()), 250);
    return () => clearTimeout(t);
  }, [search]);

  // The grid fills the window.
  useEffect(() => {
    if (!open) return undefined;
    const fit = () => setHeight(Math.max(260, Math.round(window.innerHeight * 0.94) - 290));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [open]);

  // A row's value for a column: the register's, the RAW data's 2026 IIS when the register has none.
  const valueOf = useCallback((r, key) => {
    const o = overrides[r.sort_key];
    if (o && Object.prototype.hasOwnProperty.call(o, key)) return o[key] ?? "";
    let v = r[key];
    if (blank(v) && key === "brgy") v = r.barangay;
    if (blank(v) && key === "iis_no_2026") v = rawIis[r.sort_key];
    return blank(v) ? "" : String(v);
  }, [rawIis, overrides]);

  const columnsOn = useMemo(() => {
    const keys = sheet === "all" ? chosen : FIELDS.filter((f) => f.group === sheet).map((f) => f.key);
    const set = new Set(keys);
    // The serial and title always lead (they are what is frozen).
    const leading = lead.filter((k) => set.has(k) || sheet !== "all");
    return [...leading, ...FIELDS.map((f) => f.key).filter((k) => set.has(k) && !leading.includes(k))].map((k) => FIELDS.find((f) => f.key === k)).filter(Boolean);
  }, [sheet, chosen, FIELDS, lead]);

  const sectionOptions = useMemo(() => {
    const set = new Set();
    for (const r of rows) for (const s of String(r.section_incharged || "").split(",")) if (s.trim()) set.add(s.trim());
    return [...set].sort().map((s) => ({ value: s, label: s.replace(/_/g, " ") }));
  }, [rows]);
  const cityOptions = useMemo(() => [...new Set(rows.map((r) => String(r.city || "").trim()).filter(Boolean))].sort().map((c) => ({ value: c, label: c.replace(/_/g, " ") })), [rows]);

  // The rows on the screen: every filter, then the sort.
  const view = useMemo(() => {
    const expiries = ["pto_expiration", "wwdp_expiration", "pco_validity"];
    let out = rows.filter((r) => {
      if (q && !columnsOn.some((c) => valueOf(r, c.key).toLowerCase().includes(q))) return false;
      for (const [k, t] of Object.entries(colFilters)) if (t && !valueOf(r, k).toLowerCase().includes(t.toLowerCase())) return false;
      if (sections.length && !String(r.section_incharged || "").split(",").some((s) => sections.includes(s.trim()))) return false;
      if (cities.length && !cities.includes(String(r.city || "").trim())) return false;
      for (const p of permits) {
        if (p === "ecc" && blank(r.ecc_cnc)) return false;
        if (p === "pto" && blank(r.pto_code)) return false;
        if (p === "wwdp" && blank(r.wwdp_code)) return false;
        if (p === "haz" && blank(r.haz_id)) return false;
        if (p === "pco" && blank(r.pco_no)) return false;
        if (p === "none" && !["ecc_cnc", "pto_code", "wwdp_code", "haz_id", "pco_no"].every((k) => blank(r[k]))) return false;
        if (p === "expired" && !expiries.some((k) => (daysTo(r[k]) ?? 1) < 0)) return false;
        if (p === "soon" && !expiries.some((k) => {
          const d = daysTo(r[k]);
          return d !== null && d >= 0 && d <= 30;
        })) return false;
        if (p === "erms" && anchors[r.sort_key]?.status !== "found") return false;
      }
      return true;
    });
    if (sort.key && sort.order) {
      const dir = sort.order === "ascend" ? 1 : -1;
      out = [...out].sort((a, b) => valueOf(a, sort.key).localeCompare(valueOf(b, sort.key), undefined, { numeric: true, sensitivity: "base" }) * dir);
    }
    return out;
  }, [rows, q, colFilters, sections, cities, permits, sort, columnsOn, valueOf, anchors]);

  const filtered = Boolean(q || sections.length || cities.length || permits.length || Object.values(colFilters).some(Boolean));
  const clearAll = () => {
    setSearch("");
    setQ("");
    setColFilters({});
    setSections([]);
    setCities([]);
    setPermits([]);
    setSort({ key: null, order: null });
  };

  // The selected cell.
  const selCol = sel ? columnsOn[sel.c] : null;
  const selRow = sel ? view[sel.r] : null;
  const selValue = selRow && selCol ? valueOf(selRow, selCol.key) : "";
  const selName = sel && selCol ? `${letter(sel.c)}${sel.r + 1}` : "";
  useEffect(() => {
    setSel(null);
    setEditing(null);
  }, [sheet, q, colFilters, sections, cities, permits, sort]);
  useEffect(() => setFx(selValue), [selValue]);
  useEffect(() => {
    if (!editMode) setEditing(null);
  }, [editMode]);

  /** Save one cell through the register's update (as the record view does). */
  const saveCell = async (row, key, next, { isUndo = false } = {}) => {
    const before = valueOf(row, key);
    const after = String(next ?? "");
    if (before === after) return true;
    const id = cellId(row.sort_key, key);
    setOverrides((o) => ({ ...o, [row.sort_key]: { ...(o[row.sort_key] || {}), [key]: after } }));
    setCellState((st) => ({ ...st, [id]: "saving" }));
    try {
      await updateUcdsDataBySortKey(row.sort_key, {
        updates: [{ id_no: row.id_no, sort_key: row.sort_key, changes: { [key]: after, updated_by: currentUser?.username || "Unknown User" } }],
      });
      setCellState((st) => ({ ...st, [id]: "saved" }));
      setTimeout(() => setCellState((st) => (st[id] === "saved" ? { ...st, [id]: undefined } : st)), 1600);
      if (!isUndo) setUndo((u) => [...u.slice(-49), { serial: row.sort_key, key, before, after }]);
      onSaved?.(row.sort_key, { [key]: after });
      return true;
    } catch (e) {
      // Put the old value back; say why.
      setOverrides((o) => ({ ...o, [row.sort_key]: { ...(o[row.sort_key] || {}), [key]: before } }));
      setCellState((st) => ({ ...st, [id]: "error" }));
      message.error(e?.response?.data?.error || `The change to ${row.sort_key} could not be saved.`);
      return false;
    }
  };
  const undoLast = async () => {
    const last = undo[undo.length - 1];
    if (!last) return;
    const row = rows.find((r) => r.sort_key === last.serial);
    if (!row) return;
    if (await saveCell(row, last.key, last.before, { isUndo: true })) {
      setUndo((u) => u.slice(0, -1));
      message.success(`Undone: ${last.serial} ${FIELDS.find((f) => f.key === last.key)?.label || last.key}.`);
    }
  };
  const editable = (c) => canEdit && editMode && c && !LOCKED.has(c.key);
  const startEdit = (r, c, value) => {
    const col = columnsOn[c];
    if (!editable(col) || !view[r]) return;
    setSel({ r, c });
    setEditing({ r, c, value: value ?? valueOf(view[r], col.key) });
  };
  const commitEdit = async (move) => {
    if (!editing) return;
    const { r, c, value } = editing;
    setEditing(null);
    const row = view[r];
    const col = columnsOn[c];
    if (row && col) await saveCell(row, col.key, value);
    if (move) moveTo(r + move[0], c + move[1]);
    requestAnimationFrame(() => boxRef.current?.focus());
  };

  const moveTo = (r, c) => {
    const nr = Math.max(0, Math.min(view.length - 1, r));
    const nc = Math.max(0, Math.min(columnsOn.length - 1, c));
    setSel({ r: nr, c: nc });
    tableRef.current?.scrollTo?.({ index: nr });
  };
  const onKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && editMode && !e.target.closest("input, textarea")) {
      e.preventDefault();
      undoLast();
      return;
    }
    if (!sel || e.target.closest("input, textarea, .ant-select")) return;
    const col = columnsOn[sel.c];
    if (editable(col)) {
      if (e.key === "Enter" || e.key === "F2") {
        e.preventDefault();
        startEdit(sel.r, sel.c);
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        saveCell(view[sel.r], col.key, "");
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        startEdit(sel.r, sel.c, e.key); // typing replaces the cell, as in Excel
        return;
      }
    }
    const moves = { ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowRight: [0, 1], ArrowLeft: [0, -1], Enter: [1, 0], Tab: [0, e.shiftKey ? -1 : 1] };
    if (moves[e.key]) {
      e.preventDefault();
      moveTo(sel.r + moves[e.key][0], sel.c + moves[e.key][1]);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
      e.preventDefault();
      copyText(selValue).then((ok) => (ok ? message.success(`${selName} copied.`) : message.info("The browser would not copy it — select the value in the formula bar.")));
    }
  };

  // --- exports: exactly what is on the screen -------------------------------------
  const sheetName = `${province || "Monitoring Plan"}${sheet !== "all" ? ` ${GROUPS.find((g) => g.key === sheet)?.label}` : ""}`.slice(0, 31);
  const table2d = () => [columnsOn.map((c) => c.label), ...view.map((r) => columnsOn.map((c) => valueOf(r, c.key)))];
  const download = (blob, name) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };
  const fileBase = `${sheetName.replace(/[^A-Za-z0-9 _-]/g, "").trim().replace(/\s+/g, "-") || "Monitoring-Plan"}-${new Date().toISOString().slice(0, 10)}`;
  const [exporting, setExporting] = useState(false);
  const exportAs = async (kind) => {
    if (!view.length && kind !== "plan") return message.info("No rows to export.");
    setExporting(true);
    try {
      if (kind === "xlsx") {
        const n = await downloadSpreadsheetView({ serials: view.map((r) => r.sort_key), columns: columnsOn.map((c) => ({ key: c.key, label: c.label })), sheet: sheetName });
        message.success(`Exported ${fmt(n)} rows to Excel.`);
      } else if (kind === "csv") {
        // A byte-order mark so Excel reads the names' accents right.
        download(new Blob(["﻿" + Papa.unparse(table2d())], { type: "text/csv;charset=utf-8" }), `${fileBase}.csv`);
        message.success(`Exported ${fmt(view.length)} rows to CSV.`);
      } else if (kind === "pdf") {
        const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
        const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: columnsOn.length > 12 ? "a3" : "a4" });
        doc.setFontSize(12);
        doc.text(`${sheetName} — ${fmt(view.length)} establishments`, 30, 30);
        const [head, ...body] = table2d();
        autoTable(doc, { head: [head], body, startY: 42, styles: { fontSize: columnsOn.length > 16 ? 5.5 : 7, cellPadding: 2, overflow: "linebreak" }, headStyles: { fillColor: [33, 115, 70] }, margin: { left: 20, right: 20 } });
        doc.save(`${fileBase}.pdf`);
        message.success(`Exported ${fmt(view.length)} rows to PDF.`);
      } else if (kind === "copy") {
        if (await copyText(table2d().map((r) => r.map((v) => String(v).replace(/[\t\n]/g, " ")).join("\t")).join("\n"))) message.success(`Copied ${fmt(view.length)} rows — paste them into Excel.`);
        else message.error("The browser would not copy it — use Excel or CSV instead.");
      } else if (kind === "plan") {
        const n = await downloadMonitoringPlan(province || undefined);
        message.success(`Exported the Monitoring Plan: ${fmt(n)} establishments.`);
      }
    } catch {
      message.error("The export could not be made.");
    } finally {
      setExporting(false);
    }
  };

  // --- the grid's columns ----------------------------------------------------------
  const frozen = (k) => (freeze === "serial" && k === "sort_key") || (freeze === "title" && lead.includes(k));
  const columns = [
    {
      title: <span className="ss-corner" />,
      key: "__row",
      width: 54,
      fixed: "left",
      align: "right",
      className: "ss-rownum",
      render: (_, __, i) => i + 1,
    },
    ...columnsOn.map((c, ci) => ({
      key: c.key,
      dataIndex: c.key,
      width: c.width,
      fixed: frozen(c.key) ? "left" : undefined,
      ellipsis: !wrap,
      title: (
        <div className="ss-head">
          <span className="ss-letter">{letter(ci)}</span>
          <span className="ss-label">{c.label}</span>
        </div>
      ),
      sorter: true,
      sortOrder: sort.key === c.key ? sort.order : null,
      filteredValue: colFilters[c.key] ? [colFilters[c.key]] : null,
      filterIcon: (on) => <FilterOutlined style={{ color: on ? "#217346" : undefined }} />,
      filterDropdown: ({ close }) => (
        <div className="ss-filter" onKeyDown={(e) => e.stopPropagation()}>
          <Input
            autoFocus
            allowClear
            size="small"
            placeholder={`${c.label} contains…`}
            value={colFilters[c.key] || ""}
            onChange={(e) => setColFilters((f) => ({ ...f, [c.key]: e.target.value }))}
            onPressEnter={close}
          />
          <Space style={{ marginTop: 6 }}>
            <Button size="small" type="primary" onClick={close}>
              Done
            </Button>
            <Button size="small" onClick={() => setColFilters((f) => ({ ...f, [c.key]: "" }))}>
              Clear
            </Button>
          </Space>
        </div>
      ),
      onCell: (r, ri) => {
        const st = cellState[cellId(r.sort_key, c.key)];
        return {
          onClick: () => {
            if (editing && (editing.r !== ri || editing.c !== ci)) commitEdit();
            setSel({ r: ri, c: ci });
          },
          onDoubleClick: (e) => {
            if (!editable(c)) return;
            e.stopPropagation();
            startEdit(ri, ci);
          },
          className: [
            "ss-cell",
            sel && sel.r === ri && sel.c === ci ? "ss-sel" : sel && sel.c === ci ? "ss-colsel" : "",
            editable(c) ? "ss-editable" : "",
            st === "saving" ? "ss-saving" : st === "saved" ? "ss-saved" : st === "error" ? "ss-error" : "",
          ]
            .filter(Boolean)
            .join(" "),
        };
      },
      render: (_, r, ri) => {
        if (editing && editing.r === ri && editing.c === ci) {
          return (
            <Input
              autoFocus
              size="small"
              className="ss-editor"
              value={editing.value}
              onChange={(e) => setEditing((ed) => ({ ...ed, value: e.target.value }))}
              onBlur={() => commitEdit()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitEdit([1, 0]);
                } else if (e.key === "Tab") {
                  e.preventDefault();
                  commitEdit([0, e.shiftKey ? -1 : 1]);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  setEditing(null);
                  requestAnimationFrame(() => boxRef.current?.focus());
                }
              }}
            />
          );
        }
        const v = valueOf(r, c.key);
        if (!v) return <span className="ss-empty" />;
        let cls = c.mono ? "ss-mono" : "";
        if (c.expiry) {
          const d = daysTo(v);
          if (d !== null) cls += d < 0 ? " ss-expired" : d <= 30 ? " ss-soon" : "";
        }
        if (c.key === "ecc_cnc" && anchors[r.sort_key]?.status === "found") cls += " ss-erms";
        if (c.key === "iis_no_2026" && blank(r.iis_no_2026)) cls += " ss-raw";
        return <span className={cls}>{v}</span>;
      },
    })),
  ];
  const scrollX = columns.reduce((a, c) => a + (c.width || 120), 0);

  const columnPicker = (
    <div className="ss-columns-pick">
      {GROUPS.filter((g) => g.key !== "all").map((g) => (
        <div key={g.key}>
          <Text strong style={{ fontSize: 12 }}>{g.label}</Text>
          <Checkbox.Group
            value={chosen}
            onChange={(vals) => {
              const others = chosen.filter((k) => FIELDS.find((f) => f.key === k)?.group !== g.key);
              setChosen([...others, ...vals]);
            }}
            options={FIELDS.filter((f) => f.group === g.key).map((f) => ({ value: f.key, label: f.label }))}
          />
        </div>
      ))}
      <Space>
        <Button size="small" onClick={() => setChosen(FIELDS.map((f) => f.key))}>Show all</Button>
        <Button size="small" onClick={() => setChosen(WORKING_SET)}>Working set</Button>
      </Space>
    </div>
  );

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width="98vw"
      style={{ top: 12, paddingBottom: 0 }}
      className="ss-modal"
      title={
        <Space size={10}>
          <span className="ss-logo">
            <TableOutlined />
          </span>
          <span>{province ? `${province.replace(/_/g, " ")} — Monitoring Plan` : "Monitoring Plan"}</span>
          <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
            spreadsheet view · {canEdit ? (editMode ? "editing" : "edit off") : "read only"}
          </Text>
        </Space>
      }
      destroyOnHidden
    >
      <div className={`ss${editMode ? " is-editing" : ""}`} ref={boxRef} tabIndex={-1} onKeyDown={onKeyDown} style={{ "--ss-zoom": zoom / 100 }}>
        {/* The ribbon: search, filters, view, export. */}
        <div className="ss-ribbon">
          <div className="ss-group">
            <Input allowClear prefix={<SearchOutlined />} placeholder="Search the sheet" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 220 }} />
            <span className="ss-group-label">Find</span>
          </div>
          <div className="ss-group">
            <Space size={6} wrap>
              <Select mode="multiple" allowClear maxTagCount="responsive" placeholder="Section" options={sectionOptions} value={sections} onChange={setSections} style={{ width: 190 }} />
              <Select mode="multiple" allowClear maxTagCount="responsive" placeholder="Municipality" options={cityOptions} value={cities} onChange={setCities} style={{ width: 190 }} showSearch />
              <Select mode="multiple" allowClear maxTagCount="responsive" placeholder="Permits" options={PERMIT_FILTERS} value={permits} onChange={setPermits} style={{ width: 210 }} />
              <Tooltip title="Clear every filter, search and sort">
                <Button icon={<ClearOutlined />} onClick={clearAll} disabled={!filtered && !sort.key} />
              </Tooltip>
            </Space>
            <span className="ss-group-label">Filter</span>
          </div>
          <div className="ss-group">
            <Space size={6} wrap>
              <Popover content={columnPicker} trigger="click" placement="bottom" title="Columns on the All columns sheet">
                <Button icon={<ColumnWidthOutlined />} disabled={sheet !== "all"}>
                  Columns
                </Button>
              </Popover>
              <Select
                value={freeze}
                onChange={setFreeze}
                style={{ width: 160 }}
                options={[
                  { value: "none", label: "No frozen columns" },
                  { value: "serial", label: "Freeze Serial No" },
                  { value: "title", label: raw ? "Freeze to the title" : "Freeze Serial + title" },
                ]}
              />
              <Tooltip title="Wrap long text in the cells">
                <span className="ss-switch">
                  <Switch size="small" checked={wrap} onChange={setWrap} /> Wrap
                </span>
              </Tooltip>
              <Select value={zoom} onChange={setZoom} style={{ width: 90 }} suffixIcon={<ZoomInOutlined />} options={[80, 90, 100, 110, 125].map((z) => ({ value: z, label: `${z}%` }))} />
            </Space>
            <span className="ss-group-label">View</span>
          </div>
          <div className="ss-group">
            {canEdit ? (
              <Space size={6} wrap>
                <Tooltip title="Switch on to change cells: double-click, Enter, F2 or just type">
                  <span className="ss-switch">
                    <Switch size="small" checked={editMode} onChange={setEditMode} /> <EditOutlined /> Edit
                  </span>
                </Tooltip>
                <Tooltip title={undo.length ? `Undo the last change (Ctrl+Z)` : "Nothing to undo"}>
                  <Button icon={<UndoOutlined />} onClick={undoLast} disabled={!editMode || !undo.length}>
                    Undo
                  </Button>
                </Tooltip>
              </Space>
            ) : (
              <Tooltip title="Your account may view this province but not change it.">
                <span className="ss-switch">
                  <LockOutlined /> Read only
                </span>
              </Tooltip>
            )}
            <span className="ss-group-label">{canEdit ? `Edit${undo.length ? ` · ${undo.length} change${undo.length === 1 ? "" : "s"}` : ""}` : "Edit"}</span>
          </div>
          <div className="ss-group">
            <Space size={6} wrap>
              <Button icon={<FileExcelOutlined />} type="primary" className="ss-excel" loading={exporting} onClick={() => exportAs("xlsx")}>
                Excel
              </Button>
              <Dropdown
                menu={{
                  items: [
                    { key: "csv", icon: <FileTextOutlined />, label: "CSV — this view", onClick: () => exportAs("csv") },
                    { key: "pdf", icon: <FilePdfOutlined />, label: "PDF — this view", onClick: () => exportAs("pdf") },
                    { key: "copy", icon: <CopyOutlined />, label: "Copy this view (paste into Excel)", onClick: () => exportAs("copy") },
                    { type: "divider" },
                    { key: "plan", icon: <DownloadOutlined />, label: raw ? "Full Monitoring Plan (.xlsx, in the template's layout)" : "Full Monitoring Plan (.xlsx, every field)", onClick: () => exportAs("plan") },
                  ],
                }}
              >
                <Button icon={<DownloadOutlined />}>More</Button>
              </Dropdown>
            </Space>
            <span className="ss-group-label">Export ({fmt(view.length)} rows)</span>
          </div>
        </div>

        {/* The name box and the formula bar: the cell chosen and its whole value. */}
        <div className="ss-formula">
          <span className="ss-namebox">{selName || "—"}</span>
          <span className="ss-fx">fx</span>
          <Input
            readOnly={!editable(selCol)}
            value={editable(selCol) ? fx : selValue}
            placeholder={sel ? "(empty)" : "Click a cell to read it here"}
            className="ss-fx-value"
            onChange={(e) => setFx(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && editable(selCol) && selRow) {
                e.preventDefault();
                saveCell(selRow, selCol.key, fx).then(() => boxRef.current?.focus());
              } else if (e.key === "Escape") {
                setFx(selValue);
                boxRef.current?.focus();
              }
            }}
            onBlur={() => editable(selCol) && selRow && fx !== selValue && saveCell(selRow, selCol.key, fx)}
          />
          {selRow && onOpenRecord && (
            <Button size="small" onClick={() => onOpenRecord(selRow)}>
              Open record
            </Button>
          )}
        </div>

        <div className="ss-grid" ref={gridRef}>
          <Table
            ref={tableRef}
            className={`ss-table${wrap ? " is-wrap" : ""}`}
            virtual
            bordered
            size="small"
            rowKey="sort_key"
            columns={columns}
            dataSource={view}
            pagination={false}
            scroll={{ x: scrollX, y: height }}
            onChange={(_, __, sorter) => setSort(sorter?.order ? { key: sorter.columnKey, order: sorter.order } : { key: null, order: null })}
            onRow={(r) => ({ onDoubleClick: () => onOpenRecord?.(r) })}
            locale={{ emptyText: filtered ? "No row matches the filters." : "No establishments." }}
          />
        </div>

        {/* The sheet tabs (sets of columns) and the status bar. */}
        <div className="ss-foot">
          <Segmented size="small" className="ss-sheets" value={sheet} onChange={setSheet} options={GROUPS.map((g) => ({ value: g.key, label: g.label }))} />
          <Divider type="vertical" />
          <span className="ss-status">
            {filtered ? (
              <>
                <b>{fmt(view.length)}</b> of {fmt(rows.length)} rows (filtered)
              </>
            ) : (
              <>
                <b>{fmt(rows.length)}</b> rows
              </>
            )}{" "}
            · {columnsOn.length} columns{sort.key ? ` · sorted by ${FIELDS.find((f) => f.key === sort.key)?.label} (${sort.order === "ascend" ? "A→Z" : "Z→A"})` : ""}
          </span>
          <span className="ss-legend">
            <i className="ss-erms" /> ECC on file in ERMS <i className="ss-expired" /> expired <i className="ss-soon" /> expires within a month <i className="ss-raw" /> IIS 2026 from the RAW data
          </span>
          <span className="ss-hint">
            {editMode
              ? "Double-click, Enter, F2 or type to edit · Enter / Tab saves · Esc cancels · Delete clears · Ctrl+Z undoes"
              : "Arrows move · Ctrl+C copies the cell · double-click a row to open it"}
          </span>
        </div>
      </div>
    </Modal>
  );
}
