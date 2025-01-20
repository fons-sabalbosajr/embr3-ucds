import React from 'react';
import "./projectstatus.css";
import { ConfigProvider, AutoComplete, Input } from "antd";

const UnitOptions = [
    { value: 'OPERATIONAL' },
    { value: 'NON-OPERATIONAL' },
  ];

const ProjectStatus = ({ value, disabled, onChange }) => {
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
      options={UnitOptions}
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
            height: "29px",
            padding: "4px 8px",
          }}
          placeholder="select project status"
          placeholderStyle={{
            fontSize: "9px",
          }}
        />
    </AutoComplete>
  </ConfigProvider>
  )
}

export default ProjectStatus