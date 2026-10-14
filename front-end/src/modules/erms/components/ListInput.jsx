import { useState } from "react";
import { AutoComplete } from "antd";

// ---------------------------------------------------------------------------
// A field that offers a list (project types, cities, barangays) and still
// takes free text.
//
// A plain AutoComplete filters its list by what is in the box — so on an
// edit, with "Sanitary Landfill" already there, opening it showed just that
// one entry, and choosing another type meant clearing the field first. Here
// the whole list shows when the field is opened; it narrows only to what is
// typed after that.
// ---------------------------------------------------------------------------

const matches = (search, option) =>
  String(option?.value || "").toLowerCase().includes(String(search || "").toLowerCase());

const ListInput = ({ id, value, onChange, onSelect, options, placeholder, disabled, allowClear = true, style }) => {
  const [search, setSearch] = useState("");
  return (
    <AutoComplete
      id={id}
      value={value}
      onChange={onChange}
      onSelect={onSelect}
      options={options}
      placeholder={placeholder}
      disabled={disabled}
      allowClear={allowClear}
      style={style}
      onFocus={() => setSearch("")}
      onSearch={setSearch}
      filterOption={(_, option) => matches(search, option)}
    />
  );
};

export default ListInput;
