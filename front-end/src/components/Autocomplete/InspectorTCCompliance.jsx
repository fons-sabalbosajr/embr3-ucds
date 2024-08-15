import React from 'react'
import { AutoComplete } from 'antd';

const InspectorTC = [
    { value: 'COMPLIED' },
    { value: 'NOT YET COMPLIED' },
  ];

const InspectorTCCompliance = ({ value, disabled, onChange }) => {
  return (
    <AutoComplete
    options={InspectorTC} // Use predefined suggestions
    value={value}
    disabled={disabled} // Control if it should be editable
    onChange={onChange} // Event handler for when value changes
    placeholder="Select or type inspection type"
    style={{width: '100%', color: '#aaa'}}
    //filterOption={(inputValue, option) => option.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1}
    allowClear={true} />
  )
}

export default InspectorTCCompliance;