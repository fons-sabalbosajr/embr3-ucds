import React from 'react'
import { AutoComplete } from 'antd';

const PermitSourceOptions = [
    { value: 'ECC Manual' },
    { value: 'ECC Online' },
    { value: 'CNC Manual' },
    { value: 'CNC Online' },
  ];

const PermitSource = ({ value, disabled, onChange }) => {
  return (
    <AutoComplete
    options={PermitSourceOptions} // Use predefined suggestions
    value={value}
    disabled={disabled} // Control if it should be editable
    onChange={onChange} // Event handler for when value changes
    placeholder="Select or type permit process type"
    style={{width: '100%', color: '#aaa'}}
    //filterOption={(inputValue, option) => option.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1}
    allowClear={true}
  />
  )
}

export default PermitSource;