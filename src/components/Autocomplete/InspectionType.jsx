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
          backgroundColor: "#f1f1f1",
        }}
        options={InspectionTypeOptions} // Use predefined suggestions
        dropdownClassName="custom-autocomplete-dropdown"
        value={value}
        disabled={disabled}
        onChange={onChange}
        filterOption={(inputValue, option) =>
          option.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
        }
        allowClear={true}
      >
        <Input
          style={{
            fontSize: "11px",
            height: "29px",
            padding: "4px 8px",
          }}
          placeholder="select inspection type"
          placeholderStyle={{
            fontSize: "9px",
          }}
        />
      </AutoComplete>
    </ConfigProvider>
  );
};

export default InspectionType;
