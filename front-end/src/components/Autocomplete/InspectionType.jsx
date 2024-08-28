import React from "react";
import { ConfigProvider, AutoComplete, Input } from "antd";
import './inspectiontype.css'

const InspectionTypeOptions = [
  { value: "TABLE MONITORING" },
  { value: "ACTUAL MONITORING" },
];

const InspectionType = ({ value, disabled, onChange }) => {
  return (
    <ConfigProvider
      theme={{
        components: {
          AutoComplete: {
            optionFontSize: 10,
            colorTextPlaceholder: "#555",
            fontSize: "11px",
            boxShadow: "none",
          },
        },
      }}
    >
      <AutoComplete
        style={{
          width: "100%",
          fontSize: "11px",
        }}
        dropdownStyle={{
          boxShadow: "none",
        }}
        options={InspectionTypeOptions} // Use predefined suggestions
        dropdownClassName="custom-autocomplete-dropdown"
        value={value}
        disabled={disabled}
        onChange={onChange}
        placeholder="Select or type industry type"
        filterOption={(inputValue, option) =>
          option.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
        }
        allowClear={true}
      >
        <Input
          style={{
            fontSize: "11px", // Set the font size for input field
            height: "30px",
            padding: "4px 8px",
          }}
        />
      </AutoComplete>
    </ConfigProvider>
  );
};

export default InspectionType;
