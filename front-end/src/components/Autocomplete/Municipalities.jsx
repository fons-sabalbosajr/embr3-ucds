import React, { useState, useEffect } from "react";
import { AutoComplete, Input } from "antd";
import Papa from "papaparse";
import "./municipality.css";

const Municipality = ({
  value,
  disabled,
  onChange,
  onDistrictChange,
  style,
  selectedProvince,
  readOnly,
}) => {
  const [municipalityOptions, setMunicipalityOptions] = useState([]);
  const [provinceId, setProvinceId] = useState(null);
  const [districtData, setDistrictData] = useState([]);
  const [searchText, setSearchText] = useState("");

  // Watch for value change from parent
  useEffect(() => {
    if (value) setSearchText(value);
  }, [value]);

  // Load province ID
  useEffect(() => {
    if (selectedProvince) {
      Papa.parse("../../../data/province.csv", {
        header: true,
        download: true,
        complete: (results) => {
          const province = results.data.find(
            (row) => row.Province === selectedProvince
          );
          setProvinceId(province ? province.Prov_ID : null);
        },
      });
    } else {
      setProvinceId(null);
      setMunicipalityOptions([]);
    }
  }, [selectedProvince]);

  // Load municipalities by province ID
  useEffect(() => {
    if (provinceId) {
      Papa.parse("../../../data/city.csv", {
        header: true,
        download: true,
        complete: (results) => {
          const municipalities = results.data
            .filter(
              (row) =>
                row.Prov_ID === provinceId && row.City && row.City.trim() !== ""
            )
            .map((row) => ({ value: row.City.trim() }));
          setMunicipalityOptions(municipalities);
        },
      });
    }
  }, [provinceId]);

  // Load district data once
  useEffect(() => {
    Papa.parse("../../../data/district.csv", {
      header: true,
      download: true,
      complete: (results) => {
        setDistrictData(results.data);
      },
    });
  }, []);

  const handleSearch = (text) => {
    setSearchText(text);
  };

  const handleSelect = (municipality) => {
    setSearchText(municipality);
    if (onChange) onChange(municipality);

    const found = districtData.find(
      (row) =>
        row.City &&
        row.City.trim().toLowerCase() === municipality.trim().toLowerCase()
    );
    if (onDistrictChange) {
      onDistrictChange(found ? found.District : "");
    }
  };

  return (
    <AutoComplete
      style={{ width: "100%", fontSize: "11px", ...style }}
      options={municipalityOptions}
      value={searchText}
      onSearch={handleSearch}
      onSelect={handleSelect}
      disabled={disabled}
      allowClear
      filterOption={(inputValue, option) =>
        option?.value?.toUpperCase().includes(inputValue?.toUpperCase())
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
        placeholder="Select municipality"
        disabled={disabled}
      />
    </AutoComplete>
  );
};

export default Municipality;
