import React from "react";
import { ConfigProvider, AutoComplete, Input } from "antd";
import "./sectionincharge.css";

// Define the list of predefined industry types for autocomplete
const UnitOptions = [
  { value: "AWECMES" },
  { value: "CPD_AWPS" },
  { value: "CPD_CHWPS" },
  { value: "CPD_EIAS" },
  { value: "MBU" },
  { value: "PEMU-Aurora" },
  { value: "PEMU-Bataan" },
  { value: "PEMU-Bulacan" },
  { value: "PEMU-Nueva_Ecija" },
  { value: "PEMU-Pampanga" },
  { value: "PEMU-Tarlac" },
  { value: "PEMU-Zambales" },
  { value: "TCHWMS" },
];

const SectionInCharged = ({
  value,
  readOnly,
  onChange,
  style,
  theme,
  isEditing,
}) => {
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
            cursor: isEditing ? "text" : "not-allowed",
            color: isEditing ? "" : "#aaa",
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
