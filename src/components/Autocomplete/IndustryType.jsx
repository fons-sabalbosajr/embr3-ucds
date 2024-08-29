import React from 'react';
import { ConfigProvider, AutoComplete, Input } from 'antd';
import './industrytype.css';

// Define the list of predefined industry types for autocomplete
const industryTypeOptions = [
  { value: 'Infrastructure Projects' },
  { value: 'Resource Extractive Industries' },
  { value: 'Heavy and other processing/manufacturing industries' },
  { value: 'Golf Course and other Tourism Projects' },
];

const IndustryTypeAutoComplete = ({ value, disabled, onChange }) => {
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
        options={industryTypeOptions}
        dropdownClassName="custom-autocomplete-dropdown"
        value={value}
        disabled={disabled}
        onChange={onChange}
        
        filterOption={(inputValue, option) =>
          option.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
        }
        allowClear={true}
      >
       <Input
          style={{
            fontSize: "11px",
            height: "30px",
            padding: "4px 8px",
          }}
          placeholder="Select industry type"
          placeholderStyle={{
            fontSize: "9px",
          }}
        />
      </AutoComplete>
    </ConfigProvider>
  );
};

export default IndustryTypeAutoComplete;
