import React, { useState, useEffect } from "react";
import { ConfigProvider, AutoComplete, Input } from "antd";
import "./legalofficers.css";

// Define the list of predefined industry types for autocomplete
const LegalOfficersOptions = [
  { value: "Regional Director" },
  { value: "Atty. Gloria Diana Dulnuan" },
  { value: "Mr. Arnold Patrick Manalastas" },
  { value: "Mr. Brylle Warren Lacsina" },
  { value: "Ms. Janice Salvador" },
  { value: "Ms. Mary Grace Agravante" },
  { value: "Ms. Manilyn Capuras Benoza" },
  { value: "Ms. Yvette Miranda" },
  { value: "Ms. Erleigh Saliling" },
  { value: "Ms. Shirley Owatan" },
];

const LegalOfficers = ({
  value,
  disabled,
  onChange,
  theme,
  style,
  placeholder, // Ensure placeholder prop is received
  readOnly,
}) => {
  return (
    <ConfigProvider
      theme={{
        components: {
          AutoComplete: {
            optionFontSize: 10,
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
        options={readOnly ? [] : LegalOfficersOptions}
        popupClassName={`custom-autocomplete-dropdown ${theme}-theme`} // Apply theme class
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
          placeholder={placeholder || "Select Legal Officer"} // Use passed placeholder or a default
          // placeholderStyle is not a standard Ant Design Input prop.
          // Placeholder styling is typically handled by ConfigProvider's colorTextPlaceholder token or CSS.
        />
      </AutoComplete>
    </ConfigProvider>
  );
};

export default LegalOfficers;
