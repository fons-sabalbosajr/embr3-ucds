import React from "react";
import { AutoComplete, ConfigProvider, Input } from "antd"; // Added Input

const PermitSourceOptions = [
  { value: "ECC Manual" },
  { value: "ECC Online" },
  { value: "CNC Manual" },
  { value: "CNC Online" },
];

const PermitSource = ({ value, disabled, onChange, theme = "light" }) => { // Added theme prop
  return (
    <ConfigProvider
      theme={{
        components: {
          AutoComplete: {
            optionFontSize: 11, // Smaller option font size
            // fontSize for AutoComplete component itself, direct Input styling will be more specific for the field
            boxShadow: "none",
          },
        },
      }}
    >
      <AutoComplete
        style={{ width: "100%" }} // Style for the AutoComplete wrapper
        options={PermitSourceOptions}
        value={value}
        disabled={disabled}
        onChange={onChange}
        allowClear={true}
        filterOption={(inputValue, option) =>
          option.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
        }
      >
        <Input
          style={{
            fontSize: "11px",    // Directly set the font size for the input field
            height: "29px",     // Maintain consistent height
            padding: "4px 8px", // Maintain consistent padding
          }}
          placeholder="Select or type permit source"
          disabled={disabled}
        />
      </AutoComplete>
    </ConfigProvider>
  );
};

export default PermitSource;
