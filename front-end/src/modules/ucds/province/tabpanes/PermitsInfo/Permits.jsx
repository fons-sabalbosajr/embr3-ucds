import { useState, useEffect, useRef } from "react";
import { Table, Button } from "antd";
import SuggestInput from "../SuggestInput";
import { isRawLayout, NOV_RECOMMENDATION } from "../registerLayout";
import { FullDate } from "../DateInputs";
import VeraPermitCheck from "./VeraPermitCheck";
import "./permits.css";
import "../recordform.css";

const ECC_PROCESS_OPTIONS = ["ECC Manual", "ECC Online", "ECC EMB CO", "CNC Manual", "CNC Online"];
const HAZ_PROCESS_OPTIONS = ["MANUAL", "ONLINE"];

// Reference numbers belong to one establishment each: suggested only once
// something is typed, never offered from an empty field.
const CODE_FIELDS = new Set(["ecc_cnc", "pto_code", "wwdp_code", "haz_id", "pco_no", "chemical_permit", "importer_clearance", "tsd_ref_no", "tp_trc_ref_no"]);
const EXPIRY_FIELDS = new Set(["pto_expiration", "wwdp_expiration", "pco_validity", "chem_permit_exp", "importer_clearance_exp", "tsd_expiration", "tp_trc_expiration"]);

function isExpired(dateStr) {
  if (!dateStr) return false;
  // Accepts YYYY-MM-DD, MM/DD/YYYY, or similar
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return d < today;
}

// One cell: the value, or while editing a field that suggests the values
// already encoded for it in the province.
// The permits' dates: a full day each (issued, approved, amended, expiring).
const DATE_FIELDS = new Set([
  "date_approved", "date_amended", "pto_issued", "pto_expiration", "wwdp_issued", "wwdp_expiration", "haz_issued", "pco_validity",
  "chem_permit_issued", "chem_permit_exp", "importer_clearance_issued", "importer_clearance_exp", "tsd_issued", "tsd_expiration", "tp_trc_issued", "tp_trc_expiration",
]);

function renderCell(value, row, field, base) {
  const expired = EXPIRY_FIELDS.has(field) && isExpired(value);
  const style = expired ? { background: "#ffcccc", color: "#a00", fontWeight: "bold" } : undefined;
  if (!row.isEditing) return <span style={style}>{value || "-"}</span>;
  if (DATE_FIELDS.has(field)) return <FullDate value={value} onChange={(v) => row.onCell(field, v, row.key)} style={style} />;
  return (
    <SuggestInput
      field={field}
      split
      base={base}
      onEmpty={!CODE_FIELDS.has(field)}
      value={value}
      onChange={(v) => row.onCell(field, v, row.key)}
      placeholder="-"
      inputStyle={style}
    />
  );
}

// Every card's columns on one grid: each column but the last the same share
// of the width, so the first, second and third columns line up from card to
// card and the last takes what is left.
const COL_WIDTH = "19%";
const columnsOf = (cols) =>
  cols.map(([title, field, base], i) => ({
    // A date column says so: a full date, picked from a calendar while editing.
    title: DATE_FIELDS.has(field) ? (
      <span>
        {title} <span className="rf-col-hint">full date</span>
      </span>
    ) : (
      title
    ),
    dataIndex: field,
    key: field,
    align: "left",
    width: i === cols.length - 1 ? undefined : COL_WIDTH,
    render: (value, row) => renderCell(value, row, field, base),
  }));

// ---------------------------------------------------------------------------
// The permits, one card per law. Up to 2026 each has free remarks; from 2027
// the register follows the RAW workbooks (registerLayout.js): a "for issuance
// of NOV recommendation" per law in their place, no PCO telephone nor
// hazardous waste process source (never filled in any year), and the
// chemical, importer, TSD and TRC permits of those universes — shown when the
// record holds one.
// ---------------------------------------------------------------------------
const nov = (field) => ["NOV recommendation", field, NOV_RECOMMENDATION];
const lawsFor = (raw) => [
  {
    key: "ecc", title: "ECC / CNC", law: "PD 1586", tag: "is-ecc",
    cols: [["ECC/CNC Reference No.", "ecc_cnc"], ["Permit Process Source", "permit_process", ECC_PROCESS_OPTIONS], ["Date Approved", "date_approved"], ["Date Amended", "date_amended"], raw ? nov("pd1586") : ["Remarks", "pd1586_remarks"]],
  },
  {
    key: "pto", title: "Permit to Operate", law: "RA 8749", tag: "is-pto",
    cols: [["PTO Code", "pto_code"], ["Date Issued", "pto_issued"], ["Date of Expiration", "pto_expiration"], raw ? nov("ra8749") : ["Remarks", "ra8749_remarks"]],
  },
  {
    key: "wwdp", title: "Wastewater Discharge Permit", law: "RA 9275", tag: "is-wwdp",
    cols: [["WWDP Code", "wwdp_code"], ["Date Issued", "wwdp_issued"], ["Date of Expiration", "wwdp_expiration"], raw ? nov("ra9275") : ["Remarks", "ra9275_remarks"]],
  },
  {
    key: "haz", title: "Hazardous Waste Generator ID", law: "RA 6969", tag: "is-haz",
    cols: raw
      ? [["Hazwaste ID", "haz_id"], ["Date Issued", "haz_issued"], nov("ra6969")]
      : [["Hazwaste ID", "haz_id"], ["Hazwaste Process Source", "haz_process_source", HAZ_PROCESS_OPTIONS], ["Date Issued", "haz_issued"], ["Remarks", "ra6969_remarks"]],
  },
  {
    key: "pco", title: "PCO Accreditation", law: "DAO 2014-02", tag: "is-pco",
    cols: raw
      ? [["PCO No.", "pco_no"], ["Validity", "pco_validity"], ["Name", "pco_name"]]
      : [["PCO No.", "pco_no"], ["Validity", "pco_validity"], ["Name", "pco_name"], ["Tel. No.", "pco_tel_no"], ["Remarks", "pco_remarks"]],
  },
  ...(raw
    ? [
        { key: "chem", title: "Chemical Permit", law: "RA 6969", tag: "is-haz", whenHeld: true, cols: [["Chemical Permit Reference", "chemical_permit"], ["Date Issued", "chem_permit_issued"], ["Date of Expiration", "chem_permit_exp"]] },
        { key: "importer", title: "Importer Clearance", law: "RA 6969", tag: "is-haz", whenHeld: true, cols: [["Importer Clearance Reference", "importer_clearance"], ["Date Issued", "importer_clearance_issued"], ["Date of Expiration", "importer_clearance_exp"]] },
        { key: "tsd", title: "TSD Facility Registration", law: "RA 6969", tag: "is-haz", whenHeld: true, cols: [["TSD Reference No.", "tsd_ref_no"], ["Date Issued", "tsd_issued"], ["Date of Expiration", "tsd_expiration"]] },
        { key: "trc", title: "Transporter Registration (TRC)", law: "RA 6969", tag: "is-haz", whenHeld: true, cols: [["TRC Reference No.", "tp_trc_ref_no"], ["Date Issued", "tp_trc_issued"], ["Date of Expiration", "tp_trc_expiration"]] },
      ]
    : []),
];

function splitMultiValue(str = "") {
  // Split by comma, semicolon, or newline, trim, and filter out empty
  return String(str ?? "")
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** A law's entries: a field holding "a, b" is two entries, read across its fields by position. */
function expandRowsFromRecord(record, keys) {
  const splitFields = keys.map((k) => splitMultiValue(record?.[k]));
  const maxLen = Math.max(...splitFields.map((arr) => arr.length), 1);
  return Array.from({ length: maxLen }).map((_, idx) => {
    const row = { key: (idx + 1).toString() };
    keys.forEach((k, i) => {
      row[k] = splitFields[i][idx] || "";
    });
    return row;
  });
}

const Permits = ({ editedRecord, handleChange, isEditing, onRa8749Change }) => {
  const raw = isRawLayout(editedRecord);
  const laws = lawsFor(raw);
  const [rows, setRows] = useState({}); // law key -> entries
  const rowsRef = useRef({});
  const commit = (next) => {
    rowsRef.current = next;
    setRows(next);
  };

  // The entries are read from the record when it opens and when editing
  // starts or ends — not on every keystroke, which re-read them from the
  // record and lost an entry being added.
  useEffect(() => {
    if (!editedRecord) return;
    commit(Object.fromEntries(laws.map((l) => [l.key, expandRowsFromRecord(editedRecord, l.cols.map((c) => c[1]))])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editedRecord?.sort_key, isEditing, raw]);

  // A cell changed: the record keeps every entry of that field, comma separated.
  const onCell = (lawKey, field, value, rowKey) => {
    const list = (rowsRef.current[lawKey] || []).map((r) => (r.key === rowKey ? { ...r, [field]: value } : r));
    commit({ ...rowsRef.current, [lawKey]: list });
    handleChange(
      field,
      list
        .map((r) => String(r[field] ?? "").trim())
        .filter(Boolean)
        .join(", ")
    );
  };
  const addRow = (law) => {
    const list = rowsRef.current[law.key] || [];
    commit({ ...rowsRef.current, [law.key]: [...list, { key: String(list.length + 1), ...Object.fromEntries(law.cols.map((c) => [c[1], ""])) }] });
  };
  const removeRow = (law) => {
    const list = rowsRef.current[law.key] || [];
    if (list.length < 2) return;
    const kept = list.slice(0, -1);
    commit({ ...rowsRef.current, [law.key]: kept });
    for (const [, field] of law.cols) handleChange(field, kept.map((r) => String(r[field] ?? "").trim()).filter(Boolean).join(", "));
  };

  useEffect(() => {
    if (typeof onRa8749Change === "function") onRa8749Change(rows.pto || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.pto]);

  const held = (law) => law.cols.some(([, field]) => String(editedRecord?.[field] ?? "").trim());

  // One card per law, each a full line; the columns share one grid (see
  // columnsOf), and Add / Remove sit under the table while editing.
  const permitCard = (law) => {
    const data = (rows[law.key] || []).map((r) => ({ ...r, isEditing, onCell: (f, v, k) => onCell(law.key, f, v, k) }));
    const empty = data.length <= 1 && !law.cols.some(([, f]) => String(data[0]?.[f] ?? "").trim());
    return (
      <section key={law.key} className="rf-section rf-span-6">
        <header className="rf-section-head">
          <span className="rf-permit-head">
            {law.title}
            <span className={`rf-permit-law ${law.tag}`}>{law.law}</span>
          </span>
          <span className="rf-hint">{empty ? "none encoded" : `${data.length} ${data.length === 1 ? "entry" : "entries"}`}</span>
        </header>
        <Table columns={columnsOf(law.cols)} dataSource={data} size="small" pagination={false} bordered tableLayout="fixed" rowKey="key" />
        {isEditing && (
          <div className="rf-permit-actions">
            <Button size="small" type="primary" ghost onClick={() => addRow(law)}>
              Add entry
            </Button>
            <Button size="small" danger onClick={() => removeRow(law)} disabled={data.length < 2}>
              Remove last
            </Button>
          </div>
        )}
      </section>
    );
  };

  return (
    <div className={`rf ${isEditing ? "is-editing" : "is-viewing"}`}>
      <VeraPermitCheck record={editedRecord} />
      <div className="rf-permits">{laws.filter((l) => !l.whenHeld || held(l)).map(permitCard)}</div>
    </div>
  );
};

export default Permits;
