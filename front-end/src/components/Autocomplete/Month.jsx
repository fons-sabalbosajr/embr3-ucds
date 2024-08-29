import React, { useState, useEffect } from 'react';
import { ConfigProvider, AutoComplete, Input } from "antd";
import './month.css';

// Define the list of predefined industry types for autocomplete
const MonthOptions = [
    { value: 'JANUARY' },
    { value: 'FEBRUARY' },
    { value: 'MARCH' },
    { value: 'APRIL' },
    { value: 'MAY' },
    { value: 'JUNE' },
    { value: 'JULY' },
    { value: 'AUGUST' },
    { value: 'SEPTEMBER' },
    { value: 'OCTOBER' },
    { value: 'NOVEMBER' },
    { value: 'DECEMBER' },
  ];
  
  // Get the current year
  const currentYear = new Date().getFullYear();

const Month = ({ value, disabled, onChange }) => {
  const [autoCompleteValue, setAutoCompleteValue] = useState(
    `${MonthOptions[0].value} ${currentYear}` // Default to "JANUARY {currentYear}"
  );

  useEffect(() => {
    if (value) {
      setAutoCompleteValue(value); // If `value` is passed as a prop, update the state
    }
  }, [value]);

  const handleChange = (newValue) => {
    setAutoCompleteValue(newValue);
    if (onChange) {
      onChange(newValue); // Propagate change up if onChange is provided
    }
  };

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
      options={MonthOptions}
      dropdownClassName="custom-autocomplete-dropdown"
      value={autoCompleteValue}
      disabled={disabled}
      onChange={onChange}
      placeholder="Select month and year"
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
  );
};

export default Month;
