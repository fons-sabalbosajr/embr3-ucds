import React from "react";
import { ConfigProvider, AutoComplete, Input } from "antd";
import "./reporttype.css";

const ReportTypeOptions = [
  { value: "MONITORING/ INSPECTION REPORT (ICIR)" },
  { value: "NECP (ICIR)" },
  { value: "SURVEY REPORT" },
  { value: "SITE VALIDATION REPORT" },
  { value: "INVESTIGATION REPORT (IR)" },
];

const ReportType = ({ value, disabled, onChange }) => {
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
        options={ReportTypeOptions}
        dropdownClassName="custom-autocomplete-dropdown"
        value={value}
        disabled={disabled}
        onChange={onChange}
        placeholder="Select Report Type"
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

export default ReportType;
