import React from "react";
import "./projectstatus.css";
import { ConfigProvider, AutoComplete, Input } from "antd";

const UnitOptions = [{ value: "OPERATIONAL" }, { value: "NON-OPERATIONAL" }];

const ProjectStatus = ({ value, readOnly, disabled, onChange }) => {
  return (
    <ConfigProvider
      theme={{
        components: {
          AutoComplete: {
            optionFontSize: 10,
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
        options={UnitOptions}
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
            cursor: readOnly ? "not-allowed" : "text",
            color: readOnly ? "#aaa" : "inherit",
          }}
          placeholder="select project status"
          placeholderStyle={{
            fontSize: "9px",
          }}
        />
      </AutoComplete>
    </ConfigProvider>
  );
};

export default ProjectStatus;
