import React from 'react'
import { ConfigProvider, AutoComplete, Input } from "antd";
import './sectionincharge.css';


// Define the list of predefined industry types for autocomplete
const UnitOptions = [
    { value: 'AWECMES' },
    { value: 'CPD' },
    { value: 'MBU' },
    { value: 'PEMU-AURORA' },
    { value: 'PEMU-BATAAN' },
    { value: 'PEMU-BULACAN' },
    { value: 'PEMU-NUEVA ECIJA' },
    { value: 'PEMU-PAMPANGA' },
    { value: 'PEMU-TARLAC' },
    { value: 'PEMU-ZAMBALES' },
    { value: 'TCHWMS' },
  ];
  
const SectionInCharged = ({ value, disabled, onChange }) => {
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
      options={UnitOptions}
      dropdownClassName="custom-autocomplete-dropdown"
      value={value}
      disabled={disabled}
      onChange={onChange}
      placeholder="Select section/unit"
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
  )
}

export default SectionInCharged