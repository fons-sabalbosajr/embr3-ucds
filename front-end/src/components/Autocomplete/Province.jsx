import React, { useState, useEffect } from "react";
import { AutoComplete, ConfigProvider, Input } from "antd";
import Papa from "papaparse";
import "./province.css";

const Province = ({
  value,
  disabled,
  onChange,
  style,
  editedRecord,
  readOnly,
}) => {
  const [provinceOptions, setProvinceOptions] = useState([]);

  useEffect(() => {
    Papa.parse("../../../data/province.csv", {
      header: true,
      download: true,
      complete: (results) => {
        const provinces = results.data
          .filter((row) => row.Province !== "" && row.Province !== undefined)
          .map((row) => ({
            value: row.Province,
          }));
        setProvinceOptions(provinces);
      },
    });
  }, []);

  return (
    <AutoComplete
      style={{
        width: "100%",
        fontSize: "11px",
      }}
      options={provinceOptions}
      value={value}
      readOnly={disabled}
      onChange={onChange}
      filterOption={(inputValue, option) => {
        //console.log('filterOption:', inputValue, option);
        return (
          option &&
          inputValue &&
          option.value !== undefined &&
          option.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
        );
      }}
      allowClear={true}
    >
      <Input
        style={{
          fontSize: "11px",
          height: "29px",
          padding: "4px 8px",
          cursor: readOnly ? "not-allowed" : "text",
          color: readOnly ? "#aaa" : "inherit",
          ...style,
        }}
        placeholder="Select province"
        placeholderStyle={{
          fontSize: "9px",
        }}
      />
    </AutoComplete>
  );
};

export default Province;
