import React, { useState, useEffect } from "react";
import { ConfigProvider, AutoComplete, Input } from "antd";
import './wwtftype.css';

// Define the list of predefined industry types for autocomplete
const WWTFOptions = [
    { value: "WWTF" },
    { value: "SEPTIC TANK" },
    { value: "DIRECT DISCHARGE" },
  ];

const WWTFType = ({ value, disabled, onChange }) => {
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
      options={WWTFOptions}
      dropdownClassName="custom-autocomplete-dropdown"
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
          height: "30px",
          padding: "4px 8px",
        }}
        placeholder="Select WWTF Type"
        placeholderStyle={{
          fontSize: "9px",
        }}
        allowClear
      />
    </AutoComplete>
  </ConfigProvider>
  )
}

export default WWTFType