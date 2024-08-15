import React from 'react';
import { AutoComplete } from 'antd';

// Define the list of predefined industry types for autocomplete
const industrysubTypeOptions = [
  { value: 'Building including Housing, Storage, and other Structures' },
  { value: 'Livestock Animal Industries' },
  { value: 'Fishery Projects - Dikes For/And Fishpond Development Projects' },
  { value: 'Other Processing/Manufacturing Industries' },
  { value: 'Power Plants' },
  { value: 'Dams, Water Supply, Flood Control' },
  { value: 'Iron and Steel Mills' },
  { value: 'Non-Ferrous Metal Industries' },
  { value: 'Other Transport Facilities' },
  { value: 'Mining and Quarrying Projects' },
  { value: 'Golf course projects/complex' },
  { value: 'Other Processing/Manufacturing Industries' },
  { value: 'Chemical Industries' },
  { value: 'Golf course projects/complex' },
  { value: 'Non-Ferrous Metal Industries' },
  { value: 'Chemical Industries' },
  { value: 'Smelting Plants' },
  { value: 'Waste management Projects' },
  { value: 'Agricultural, Food and related Industries' },
  { value: 'Telecommunication Projects' },
  { value: 'Waste management Projects' },
  { value: 'Resort and other tourism/leisure projects' },
  { value: 'Waste management Projects' },
];

const IndustrySubTypeAutoComplete = ({ value, disabled, onChange }) => {
  return (
    <AutoComplete
      options={industrysubTypeOptions} // Use predefined suggestions
      value={value}
      disabled={disabled} // Control if it should be editable
      onChange={onChange} // Event handler for when value changes
      placeholder="Select or type industry subtype"
      style={{width: '100%'}}
      filterOption={(inputValue, option) => option.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1}
      allowClear={true}
    />
  );
};

export default IndustrySubTypeAutoComplete;
