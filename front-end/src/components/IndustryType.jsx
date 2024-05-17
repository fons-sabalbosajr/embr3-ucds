import React from 'react';
import { AutoComplete } from 'antd';

// Define the list of predefined industry types for autocomplete
const industryTypeOptions = [
  { value: 'Infrastructure Projects' },
  { value: 'Resource Extractive Industries' },
  { value: 'Heavy and other processing/manufacturing industries' },
  { value: 'Golf Course and other Tourism Projects' },
];

const IndustryTypeAutoComplete = ({ value, disabled, onChange }) => {
  return (
    <AutoComplete
      options={industryTypeOptions} // Use predefined suggestions
      value={value}
      disabled={disabled} // Control if it should be editable
      onChange={onChange} // Event handler for when value changes
      placeholder="Select or type industry type"
      style={{width: '100%', color: '#aaa'}}
      filterOption={(inputValue, option) => option.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1}
      allowClear={true}
    />
  );
};

export default IndustryTypeAutoComplete;
