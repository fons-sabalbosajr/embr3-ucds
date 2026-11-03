import { useMemo } from "react";
import { Select } from "antd";
import { asOptions, barangaysOf } from "./places";

/** The barangay, from the chosen city or municipality's (places.js). */
const Barangay = ({ value, disabled, onChange, selectedProvince, selectedMunicipality, style, readOnly }) => {
  const barangays = useMemo(() => barangaysOf(selectedProvince, selectedMunicipality), [selectedProvince, selectedMunicipality]);
  return (
    <Select
      showSearch
      allowClear
      optionFilterProp="label"
      placeholder={selectedMunicipality ? "Select the barangay" : "Select the city or municipality first"}
      notFoundContent={selectedMunicipality ? "No barangay by that name" : "Select the city or municipality first"}
      options={asOptions(barangays, value)}
      value={value || undefined}
      onChange={(v) => onChange?.(v ?? "")}
      disabled={disabled || readOnly}
      style={{ width: "100%", ...style }}
    />
  );
};

export default Barangay;
