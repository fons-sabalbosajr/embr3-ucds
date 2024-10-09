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

const LegalOfficers = ({ value, disabled, onChange }) => {
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
        options={LegalOfficersOptions}
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
            height: "27px",
            padding: "4px 8px",
            marginTop: "7px"
          }}
          placeholder="Select Legal Officer"
          placeholderStyle={{
            fontSize: "9px",
          }}
        />
      </AutoComplete>
    </ConfigProvider>
  );
};

export default LegalOfficers;
