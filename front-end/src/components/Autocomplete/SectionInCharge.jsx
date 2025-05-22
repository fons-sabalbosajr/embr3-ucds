import React from "react";
import { ConfigProvider, AutoComplete, Input } from "antd";
import "./sectionincharge.css";

// Define the list of predefined industry types for autocomplete
const UnitOptions = [
  { value: "AWECMES" },
  { value: "CPD" },
  { value: "MBU" },
  { value: "PEMU-AURORA" },
  { value: "PEMU-BATAAN" },
  { value: "PEMU-BULACAN" },
  { value: "PEMU-NUEVA ECIJA" },
  { value: "PEMU-PAMPANGA" },
  { value: "PEMU-TARLAC" },
  { value: "PEMU-ZAMBALES" },
  { value: "TCHWMS" },
];

const SectionInCharged = ({ value, readOnly, onChange, style, theme }) => {
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

        options={readOnly ? [] : UnitOptions}
       
        value={value}
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
            cursor: readOnly ? "not-allowed" : "text",
            color: readOnly ? "#aaa" : "inherit",
          }}
          readOnly={readOnly}
          placeholder="select section/unit"
          placeholderStyle={{
            fontSize: "9px",
          }}
        />
      </AutoComplete>
    </ConfigProvider>
  );
};

export default SectionInCharged;
