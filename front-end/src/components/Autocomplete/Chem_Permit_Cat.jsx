import React from "react";
import { ConfigProvider, AutoComplete, Input } from "antd";
import "./chempermitcat.css";

const ChemicalPermitOptions = [
  { value: "CCO" },
  { value: "SQI" },
  { value: "PCL" },
  { value: "PMPIN" },
];

const Chem_Permit_Cat = ({ value, disabled, onChange, theme, style, readOnly }) => {
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
              ...style,
            }}
            dropdownStyle={{
              boxShadow: "none",
              backgroundColor: "#f1f1f1",
            }}
            options={readOnly ? [] : ChemicalPermitOptions} // Use predefined suggestions
            popupClassName={`custom-autocomplete-dropdown ${theme}-theme`}
            value={value}
            disabled={disabled}
            onChange={!readOnly ? onChange : undefined}
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
              placeholder="select report type"
              placeholderStyle={{
                fontSize: "9px",
              }}
            />
          </AutoComplete>
        </ConfigProvider>
  )
}

export default Chem_Permit_Cat