import React, { useState, useEffect } from 'react';
import { ConfigProvider, AutoComplete, Input } from "antd";
import './month.css';

// Get the current year
const currentYear = new Date().getFullYear();

const MonthOptions = [
  { value: `JANUARY ${currentYear}` },
  { value: `FEBRUARY ${currentYear}` },
  { value: `MARCH ${currentYear}` },
  { value: `APRIL ${currentYear}` },
  { value: `MAY ${currentYear}` },
  { value: `JUNE ${currentYear}` },
  { value: `JULY ${currentYear}` },
  { value: `AUGUST ${currentYear}` },
  { value: `SEPTEMBER ${currentYear}` },
  { value: `OCTOBER ${currentYear}` },
  { value: `NOVEMBER ${currentYear}` },
  { value: `DECEMBER ${currentYear}` },
];

const Month = ({ value, disabled, onChange }) => {
  const [autoCompleteValue, setAutoCompleteValue] = useState(
    `${MonthOptions[0].value}`
  );

  useEffect(() => {
    if (value) {
      setAutoCompleteValue(value); // If `value` is passed as a prop, update the state
    }
  }, [value]);

  const handleChange = (newValue) => {
    const [month, year] = newValue.split(' '); // Split the input value into month and year
    if (year === undefined) { // If year is not provided, use the current year
      setAutoCompleteValue(`${month} ${currentYear}`);
    } else {
      setAutoCompleteValue(newValue);
    }
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
          backgroundColor: "#f1f1f1",
        }}
        options={MonthOptions}
        dropdownClassName="custom-autocomplete-dropdown"
        value={autoCompleteValue}
        disabled={disabled}
        onChange={handleChange}
        filterOption={(inputValue, option) =>
          option.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
        }
      >
        <Input
          style={{
            fontSize: "11px",
            height: "29px",
            padding: "4px 8px",
          }}
          placeholder="select month"
          placeholderStyle={{
            fontSize: "9px",
          }}
          onChange={(e) => handleChange(e.target.value)}
          allowClear
        />
      </AutoComplete>
    </ConfigProvider>
  );
};

export default Month;