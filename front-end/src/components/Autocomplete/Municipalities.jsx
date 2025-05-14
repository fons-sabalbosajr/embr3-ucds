import React, { useState, useEffect } from 'react';
import { AutoComplete, ConfigProvider, Input } from "antd";
import Papa from 'papaparse';
import './municipality.css'

const Municipality = ({ value, disabled, onChange, style, editedRecord, handleChange, isEditing, selectedProvince }) => {
  const [municipalityOptions, setMunicipalityOptions] = useState([]);
  const [provinceId, setProvinceId] = useState(null);

  useEffect(() => {
    if (selectedProvince) {
      Papa.parse("../../../data/province.csv", {
        header: true,
        download: true,
        complete: (results) => {
          const province = results.data.find((row) => row.Province === selectedProvince);
          if (province) {
            setProvinceId(province.Prov_ID);
          }
        },
      });
    }
  }, [selectedProvince]);

  useEffect(() => {
    if (provinceId) {
      Papa.parse("../../../data/city.csv", {
        header: true,
        download: true,
        complete: (results) => {
          const municipalities = results.data.filter((row) => row.Prov_ID === provinceId && row.City !== "" && row.City !== undefined).map((row) => ({
            value: row.City,
          }));
          setMunicipalityOptions(municipalities);
        },
      });
    }
  }, [provinceId]);

  return (
    <AutoComplete
      style={{
        width: "100%",
        fontSize: "11px",
      }}
      dropdownStyle={{
        boxShadow: "none",
        backgroundColor: "#f1f1f1",
      }}
      options={municipalityOptions}
      popupClassName="custom-autocomplete-dropdown"
      value={value}
      disabled={disabled}
      onChange={onChange}
      filterOption={(inputValue, option) => {
        //console.log('filterOption:', inputValue, option);
        return option && inputValue && option.value !== undefined && option.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
      }}
      allowClear={true}
    >
      <Input
        style={{
          fontSize: "11px",
          height: "29px",
          padding: "4px 8px",
          ...style,
        }}
        placeholder="Select municipality"
        placeholderStyle={{
          fontSize: "9px",
        }}
      />
    </AutoComplete>
  );
};

export default Municipality;