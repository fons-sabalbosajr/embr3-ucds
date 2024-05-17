import React from 'react'
import { AutoComplete } from 'antd';

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
    <AutoComplete
    options={UnitOptions} // Use predefined suggestions
    value={value}
    disabled={disabled} // Control if it should be editable
    onChange={onChange} // Event handler for when value changes
    placeholder="Select section/unit"
    style={{width: '100%'}}
    filterOption={(inputValue, option) => option.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1}
    allowClear={true}
  />
  )
}

export default SectionInCharged