import { Select } from "antd";
import { asOptions, provinceNames } from "./places";

const PROVINCES = provinceNames();

/** The province, chosen from Region III's (places.js). */
const Province = ({ value, disabled, onChange, style, readOnly }) => (
  <Select
    showSearch
    allowClear
    optionFilterProp="label"
    placeholder="Select the province"
    options={asOptions(PROVINCES, value)}
    value={value || undefined}
    onChange={(v) => onChange?.(v ?? "")}
    disabled={disabled || readOnly}
    style={{ width: "100%", ...style }}
  />
);

export default Province;
