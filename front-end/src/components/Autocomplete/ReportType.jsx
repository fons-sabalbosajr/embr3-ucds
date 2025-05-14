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

const ReportType = ({ value, disabled, onChange, theme, style, readOnly }) => {
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
          ...style,
        }}
        dropdownStyle={{
          boxShadow: "none",
          backgroundColor: "#f1f1f1",
        }}
        options={readOnly ? [] : ReportTypeOptions} // Use predefined suggestions
        popupClassName={`custom-autocomplete-dropdown ${theme}-theme`}
        value={value}
        disabled={disabled}
        onChange={!readOnly ? onChange : undefined}
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
          placeholder="select report type"
          placeholderStyle={{
            fontSize: "9px",
          }}
        />
      </AutoComplete>
    </ConfigProvider>
  );
};

export default ReportType;
