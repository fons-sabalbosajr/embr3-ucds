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
            colorTextPlaceholder: "#555",
            fontSize: "11px",
            boxShadow: "none",
          },
        },
      }}
    >
      <AutoComplete
        options={WWTFOptions}
        value={value} // Controlled component
        readOnly={!isEditing}
        onChange={(selectedValue) => {
          //console.log("Selected WWTF Type:", selectedValue); // Debugging log
          onChange(selectedValue); // Update parent state
        }}
        filterOption={(inputValue, option) =>
          option.value.toUpperCase().includes(inputValue.toUpperCase())
        }
        style={{
          width: "220px", // Increased width for better visibility
        }}
      >
        <Input
          style={{
            fontSize: "11px",
            width: "220px", // Match the AutoComplete width
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