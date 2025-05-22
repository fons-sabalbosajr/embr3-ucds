import React, { useState, useEffect } from "react";
import { AutoComplete, Input } from "antd";
import Papa from "papaparse";
import "./barangay.css";

const Barangay = ({
  value,
  disabled,
  onChange,
  selectedProvince,
  selectedMunicipality,
  style,
  readOnly,
}) => {
  const [barangayOptions, setBarangayOptions] = useState([]);
  const [cityId, setCityId] = useState(null);
  const [provinceId, setProvinceId] = useState(null);
  const [searchText, setSearchText] = useState("");

  // Sync searchText with value from parent
  useEffect(() => {
    setSearchText(value || "");
  }, [value]);

  // Get provinceId
  useEffect(() => {
    if (selectedProvince) {
      Papa.parse("../../../data/province.csv", {
        header: true,
        download: true,
        complete: (results) => {
          const province = results.data.find(
            (row) => row.Province?.trim() === selectedProvince?.trim()
          );
          setProvinceId(province ? String(province.Prov_ID).trim() : null);
        },
      });
    } else {
      setProvinceId(null);
    }
  }, [selectedProvince]);

  // Get cityId
  useEffect(() => {
    if (selectedMunicipality) {
      Papa.parse("../../../data/city.csv", {
        header: true,
        download: true,
        complete: (results) => {
          const city = results.data.find(
            (row) => row.City?.trim() === selectedMunicipality?.trim()
          );
          setCityId(city ? String(city.City_ID).trim() : null);
        },
      });
    } else {
      setCityId(null);
    }
  }, [selectedMunicipality]);

  // Get barangays for cityId and provinceId
  useEffect(() => {
    if (cityId && provinceId) {
      Papa.parse("../../../data/brgy.csv", {
        header: true,
        download: true,
        complete: (results) => {
          // Debug: log a sample row and the IDs
          // console.log("cityId", cityId, "provinceId", provinceId, "sample", results.data[0]);
          const barangays = results.data
            .filter(
              (row) =>
                String(row.City_ID).trim() === cityId &&
                String(row.Prov_ID).trim() === provinceId &&
                row.Brgy &&
                row.Brgy.trim() !== ""
            )
            .map((row) => ({
              value: row.Brgy.trim(),
            }));
          setBarangayOptions(barangays);
        },
      });
    } else {
      setBarangayOptions([]);
    }
  }, [cityId, provinceId]);

  const handleSearch = (text) => {
    setSearchText(text);
  };

  const handleSelect = (barangay) => {
    setSearchText(barangay);
    if (onChange) onChange(barangay);
  };

  return (
    <AutoComplete
      style={{
        width: "100%",
        fontSize: "11px",
        ...style,
      }}
      options={barangayOptions}
      value={searchText}
      onSearch={handleSearch}
      onSelect={handleSelect}
      onChange={handleSearch}
      disabled={disabled}
      allowClear
      filterOption={(inputValue, option) =>
        !inputValue ||
        (option.value &&
          option.value.toLowerCase().indexOf(inputValue.toLowerCase()) !== -1)
      }
    >
      <Input
        style={{
          fontSize: "11px",
          height: "29px",
          padding: "4px 8px",
          cursor: readOnly ? "not-allowed" : "text",
          color: readOnly ? "#aaa" : "inherit",
        }}
        placeholder="Select barangay"
        disabled={disabled}
      />
    </AutoComplete>
  );
};

export default Barangay;
