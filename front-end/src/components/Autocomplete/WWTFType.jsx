import React, { useState, useEffect } from "react";
import { ConfigProvider, AutoComplete, Input } from "antd";
import "./wwtftype.css";

// Define the list of predefined industry types for autocomplete
const WWTFOptions = [
  { value: "WWTF" },
  { value: "SEPTIC TANK" },
  { value: "DIRECT DISCHARGE" },
];

const WWTFType = ({ value, disabled, onChange, readOnly, isEditing }) => {
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
        options={WWTFOptions}
        value={value}
        disabled={disabled}
        onChange={onChange}
        filterOption={(inputValue, option) =>
          option.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
        }
      >
        <Input
          style={{
            fontSize: "11px",
            height: "27px",
            padding: "4px 8px",
            cursor: readOnly ? "not-allowed" : "text",
            color: readOnly ? "#aaa" : "inherit",
          }}
          placeholder="Select WWTF Type"
          placeholderStyle={{
            fontSize: "9px",
          }}
          allowClear
        />
      </AutoComplete>
    </ConfigProvider>
  );
};

export default WWTFType;
