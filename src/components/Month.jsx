import React, { useState, useEffect } from 'react';
import { AutoComplete } from 'antd';

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
    <AutoComplete
      options={MonthOptions} // Use predefined suggestions
      value={autoCompleteValue}
      disabled={disabled} // Control if it should be editable
      onChange={handleChange} // Event handler for when value changes
      placeholder="Select month and year"
      style={{ width: '100%' }}
    //   filterOption={(inputValue, option) =>
    //     option.value.toUpperCase().includes(inputValue.toUpperCase())
    //   }
      allowClear={true}
    />
  );
};

export default Month;
