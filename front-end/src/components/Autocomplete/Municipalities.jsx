import { useMemo } from "react";
import { Select } from "antd";
import { asOptions, citiesOf } from "./places";

/** The city or municipality, from the chosen province's (places.js). */
const Municipality = ({ value, disabled, onChange, style, selectedProvince, readOnly }) => {
  const cities = useMemo(() => citiesOf(selectedProvince), [selectedProvince]);
  return (
    <Select
      showSearch
      allowClear
      optionFilterProp="label"
      placeholder={selectedProvince ? "Select the city or municipality" : "Select the province first"}
      notFoundContent={selectedProvince ? "No city or municipality by that name" : "Select the province first"}
      options={asOptions(cities, value)}
      value={value || undefined}
      onChange={(v) => onChange?.(v ?? "")}
      disabled={disabled || readOnly}
      style={{ width: "100%", ...style }}
    />
  );
};

export default Municipality;
