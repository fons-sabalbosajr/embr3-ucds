import React, { useState, useEffect } from "react";
import { ConfigProvider, AutoComplete, Input } from "antd";


// Define the list of predefined industry types for autocomplete
const WWTFOptions = [
    { value: "WWTF" },
    { value: "SEPTIC TANK" },
    { value: "DIRECT DISCHARGE" },
  ];


  const WWTFTypeAdd = ({ value, onChange, isEditing }) => {
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
        dropdownStyle={{
          boxShadow: "none",
          backgroundColor: "#f1f1f1",
        }}
        options={WWTFOptions}
        popupClassName="custom-autocomplete-dropdown"
        value={value} // Controlled component
        readOnly={!isEditing}
        onChange={(selectedValue) => {
          //console.log("Selected WWTF Type:", selectedValue); // Debugging log
          onChange(selectedValue); // Update parent state
        }}
        filterOption={(inputValue, option) =>
          option.value.toUpperCase().includes(inputValue.toUpperCase())
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

export default WWTFTypeAdd