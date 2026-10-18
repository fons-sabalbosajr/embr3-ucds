import { useContext, useMemo } from "react";
import { AutoComplete, Input } from "antd";
import { DataContext } from "../DataContext";

// ---------------------------------------------------------------------------
// A text field of the record window that suggests, while typing, the values
// already encoded for the same field in the province's records — so a name,
// a remark or a permit date is picked rather than typed again a little
// differently. `split`: the field holds several entries (a permit's
// "a, b; c"), suggested one by one. `onEmpty`: suggest before anything is
// typed — off for reference numbers, which belong to one record each.
// `base`: a fixed list always offered too (a permit's process source).
// ---------------------------------------------------------------------------

const MAX_OPTIONS = 12;

function useSuggestions(field, split, base) {
  const { data } = useContext(DataContext) || {};
  return useMemo(() => {
    const seen = new Map();
    for (const v of base || []) seen.set(v.toUpperCase(), v);
    for (const row of data || []) {
      const raw = row?.[field];
      if (raw == null || raw === "") continue;
      for (const part of split ? String(raw).split(/[,;\n]/) : [String(raw)]) {
        const v = part.trim();
        const k = v.toUpperCase();
        if (v && v !== "-" && !seen.has(k)) seen.set(k, v);
      }
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  }, [data, field, split, base]);
}

export default function SuggestInput({ field, value, onChange, placeholder, split = false, onEmpty = true, base, multiline = false, autoSize, style, inputStyle, status, inputMode }) {
  const all = useSuggestions(field, split, base);
  const q = String(value ?? "").trim().toUpperCase();
  const options = useMemo(() => {
    if (!q && !onEmpty) return [];
    return (q ? all.filter((v) => v.toUpperCase().includes(q) && v.toUpperCase() !== q) : all).slice(0, MAX_OPTIONS).map((v) => ({ value: v }));
  }, [all, q, onEmpty]);

  return (
    <AutoComplete value={value ?? ""} options={options} onChange={(v) => onChange(v ?? "")} style={{ width: "100%", ...style }} popupMatchSelectWidth>
      {multiline ? <Input.TextArea placeholder={placeholder} autoSize={autoSize} style={inputStyle} /> : <Input placeholder={placeholder} status={status} inputMode={inputMode} style={inputStyle} />}
    </AutoComplete>
  );
}
