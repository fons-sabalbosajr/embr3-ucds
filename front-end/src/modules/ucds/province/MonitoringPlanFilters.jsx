import React, { useMemo } from "react";
import { Button, DatePicker, Select, Tooltip } from "antd";
import { ClearOutlined } from "@ant-design/icons";

const { RangePicker } = DatePicker;

// ---------------------------------------------------------------------------
// Structured filters for the Monitoring Plan register.
//
// These narrow by the columns people actually ask about — industry class and
// type, municipality, which permits a firm holds, whether a NOV was issued,
// whether Planning has received the report, the inspection type and
// monitoring schedule — and combine with each other. Everything is evaluated
// in matchesFilters() against the rows already loaded for the province, so it
// costs no request.
//
// One row, always: the controls share the width and shrink (a multiple
// select collapses its picks into "+N"); Reset keeps its size at the end.
// ---------------------------------------------------------------------------

export const EMPTY_FILTERS = {
  industryClass: [],
  industryType: [],
  city: [],
  permits: [],
  nov: null,
  pismu: null,
  inspType: [],
  monitoringSched: [],
  dateSigned: null,
};

const has = (v) => v != null && String(v).trim() !== "" && String(v).trim() !== "-";

/** Which permit columns exist on the register and how they are named on screen. */
export const PERMIT_FIELDS = [
  { value: "ecc_cnc", label: "ECC / CNC" },
  { value: "pto_code", label: "PTO" },
  { value: "wwdp_code", label: "WWDP" },
  { value: "haz_id", label: "Hazardous waste ID" },
  { value: "chemical_permit", label: "Chemical permit" },
  { value: "pco_no", label: "PCO accreditation" },
];

export const isFilterActive = (f) =>
  Boolean(
    f.industryClass.length ||
      f.industryType.length ||
      f.city.length ||
      f.permits.length ||
      f.nov != null ||
      f.pismu != null ||
      f.inspType.length ||
      f.monitoringSched.length ||
      (f.dateSigned && f.dateSigned[0] && f.dateSigned[1])
  );

/** True when a record passes every set filter. */
export function matchesFilters(record, f) {
  if (f.industryClass.length && !f.industryClass.includes(record.industry_class)) return false;
  if (f.industryType.length && !f.industryType.includes(record.industry_type)) return false;
  if (f.city.length && !f.city.includes(record.city)) return false;
  if (f.permits.length && !f.permits.every((field) => has(record[field]))) return false;
  if (f.nov === "yes" && !has(record.with_nov)) return false;
  if (f.nov === "no" && has(record.with_nov)) return false;
  if (f.pismu === "received" && record.pismu_tracking !== "✔") return false;
  if (f.pismu === "pending" && record.pismu_tracking === "✔") return false;
  if (f.inspType.length && !f.inspType.includes(record.insp_type)) return false;
  if (f.monitoringSched.length && !f.monitoringSched.includes(record.monitoring_sched)) return false;
  if (f.dateSigned && f.dateSigned[0] && f.dateSigned[1]) {
    if (!record.date_signed) return false;
    const d = new Date(record.date_signed);
    if (Number.isNaN(d.getTime()) || d < f.dateSigned[0].startOf("day").toDate() || d > f.dateSigned[1].endOf("day").toDate()) return false;
  }
  return true;
}

const distinct = (rows, field) =>
  [...new Set(rows.map((r) => r[field]).filter(has).map((v) => String(v).trim()))]
    .sort((a, b) => a.localeCompare(b))
    .map((v) => ({ value: v, label: v }));

const MonitoringPlanFilters = ({ rows, value, onChange, showDateRange }) => {
  const options = useMemo(
    () => ({
      industryClass: distinct(rows, "industry_class"),
      industryType: distinct(rows, "industry_type"),
      city: distinct(rows, "city"),
      inspType: distinct(rows, "insp_type"),
      monitoringSched: distinct(rows, "monitoring_sched"),
    }),
    [rows]
  );

  const set = (patch) => onChange({ ...value, ...patch });
  const active = isFilterActive(value);
  // Each control takes an equal share of the row and may shrink to `min`.
  const grow = (min, share = 1) => ({ flex: `${share} 1 0`, minWidth: min });
  const common = { size: "small", allowClear: true, maxTagCount: "responsive", popupMatchSelectWidth: false, style: grow(96) };

  return (
    <div className="mp-filters">
      <Select {...common} mode="multiple" placeholder="Industry class" options={options.industryClass} value={value.industryClass} onChange={(v) => set({ industryClass: v })} />
      <Select {...common} mode="multiple" placeholder="Industry type" options={options.industryType} value={value.industryType} onChange={(v) => set({ industryType: v })} style={grow(110, 1.3)} />
      <Select {...common} mode="multiple" placeholder="City / municipality" options={options.city} value={value.city} onChange={(v) => set({ city: v })} />
      <Select {...common} mode="multiple" placeholder="Holds permit…" options={PERMIT_FIELDS} value={value.permits} onChange={(v) => set({ permits: v })} />
      <Select
        {...common}
        placeholder="NOV"
        value={value.nov}
        onChange={(v) => set({ nov: v ?? null })}
        options={[
          { value: "yes", label: "With NOV" },
          { value: "no", label: "Without NOV" },
        ]}
        style={grow(80, 0.7)}
      />
      <Select
        {...common}
        placeholder="Planning report"
        value={value.pismu}
        onChange={(v) => set({ pismu: v ?? null })}
        options={[
          { value: "received", label: "Received by Planning" },
          { value: "pending", label: "Not yet received" },
        ]}
      />
      {options.inspType.length > 0 && (
        <Select {...common} mode="multiple" placeholder="Inspection type" options={options.inspType} value={value.inspType} onChange={(v) => set({ inspType: v })} />
      )}
      {options.monitoringSched.length > 0 && (
        <Select {...common} mode="multiple" placeholder="Monitoring schedule" options={options.monitoringSched} value={value.monitoringSched} onChange={(v) => set({ monitoringSched: v })} />
      )}
      {showDateRange && (
        <RangePicker
          size="small"
          value={value.dateSigned}
          onChange={(v) => set({ dateSigned: v })}
          format="MM/DD/YYYY"
          placeholder={["Signed from", "to"]}
          allowClear
          style={grow(180, 1.6)}
        />
      )}
      <Tooltip title="Clear every filter">
        <Button size="small" icon={<ClearOutlined />} disabled={!active} onClick={() => onChange({ ...EMPTY_FILTERS })} style={{ flex: "none" }}>
          Reset
        </Button>
      </Tooltip>
    </div>
  );
};

export default MonitoringPlanFilters;
