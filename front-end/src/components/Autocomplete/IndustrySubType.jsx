import React from "react";
import { ConfigProvider, AutoComplete, Input } from "antd";
import "./industrysubtype.css";

// Define the list of predefined industry types for autocomplete
const industrysubTypeOptions = [
  { value: "Building including Housing, Storage, and other Structures" },
  { value: "Livestock Animal Industries" },
  { value: "Fishery Projects - Dikes For/And Fishpond Development Projects" },
  { value: "Other Processing/Manufacturing Industries" },
  { value: "Power Plants" },
  { value: "Dams, Water Supply, Flood Control" },
  { value: "Iron and Steel Mills" },
  { value: "Non-Ferrous Metal Industries" },
  { value: "Other Transport Facilities" },
  { value: "Mining and Quarrying Projects" },
  { value: "Golf course projects/complex" },
  { value: "Other Processing/Manufacturing Industries" },
  { value: "Chemical Industries" },
  { value: "Golf course projects/complex" },
  { value: "Non-Ferrous Metal Industries" },
  { value: "Chemical Industries" },
  { value: "Smelting Plants" },
  { value: "Waste management Projects" },
  { value: "Agricultural, Food and related Industries" },
  { value: "Telecommunication Projects" },
  { value: "Waste management Projects" },
  { value: "Resort and other tourism/leisure projects" },
  { value: "Waste management Projects" },
];

const IndustrySubTypeAutoComplete = ({ value, disabled, onChange }) => {
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
          fontSize: "11px",
        }}
        options={industrysubTypeOptions}
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
            height: "30px",
            padding: "4px 8px",
          }}
          placeholder="Select industry sub-type"
          placeholderStyle={{
            fontSize: "9px",
          }}
        />
      </AutoComplete>
    </ConfigProvider>
  );
};

export default IndustrySubTypeAutoComplete;
