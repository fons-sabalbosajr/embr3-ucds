import React, { useState, useEffect } from "react";
import { AutoComplete, ConfigProvider, Input } from "antd";
import Papa from "papaparse";
import "./barangay.css";

const Barangay = ({
  value,
  disabled,
  onChange,
  editedRecord,
  handleChange,
  isEditing,
  selectedProvince,
  selectedMunicipality,
  style
}) => {
  const [barangayOptions, setBarangayOptions] = useState([]);
  const [cityId, setCityId] = useState(null);
  const [provinceId, setProvinceId] = useState(null);

  useEffect(() => {
    if (selectedProvince) {
      Papa.parse("../../../data/province.csv", {
        header: true,
        download: true,
        complete: (results) => {
          const province = results.data.find(
            (row) => row.Province === selectedProvince
          );
          if (province) {
            setProvinceId(province.Prov_ID);
          }
        },
      });
    }
  }, [selectedProvince]);

  useEffect(() => {
    if (selectedMunicipality) {
      Papa.parse("../../../data/city.csv", {
        header: true,
        download: true,
        complete: (results) => {
          const city = results.data.find(
            (row) => row.City === selectedMunicipality
          );
          if (city) {
            setCityId(city.City_ID);
          }
        },
      });
    }
  }, [selectedMunicipality]);

  useEffect(() => {
    if (cityId && provinceId) {
      Papa.parse("../../../data/brgy.csv", {
        header: true,
        download: true,
        complete: (results) => {
          const barangays = results.data
            .filter(
              (row) =>
                row.City_ID === cityId &&
                row.Prov_ID === provinceId &&
                row.Brgy !== "" &&
                row.Brgy !== undefined
            )
            .map((row) => ({
              value: row.Brgy,
            }));
          setBarangayOptions(barangays);
          //console.log("barangayOptions:", barangayOptions);
        },
      });
    }
  }, [cityId, provinceId]);


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
      options={barangayOptions}
      popupClassName="custom-autocomplete-dropdown"
      value={value}
      disabled={disabled}
      onChange={onChange}
      filterOption={(inputValue, option) => {
        //console.log("filterOption:", inputValue, option);
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
          ...style,
        }}
        placeholder="Select barangay"
        placeholderStyle={{
          fontSize: "9px",
        }}
      />
    </AutoComplete>
  );
};

export default Barangay;
