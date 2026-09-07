import React, { useState } from "react";
import { AutoComplete, Spin, Input, ConfigProvider } from "antd";
import { fetchHealthcareData } from "../../../../../api/healthcareService";
import "./autocompletestyles.css";

const { TextArea } = Input;

const PCO_Name = ({ isEditing }) => {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const handleSearch = async (value) => {
    const lastQuery = value.split(",").pop().trim();
    if (lastQuery) {
      setLoading(true);
      try {
        // Use fetchHealthcareData to get all healthcare data and filter for PCO names
        const data = await fetchHealthcareData();
        const uniqueNames = data
          .filter(
            (item) =>
              typeof item.pco_name === "string" &&
              item.pco_name.toLowerCase().includes(lastQuery.toLowerCase())
          )
          .map((item) => ({
            value: item.pco_name,
            label: (
              <div className="autocomplete-option">
                <span className="autocomplete-keyword">{item.pco_name}</span>
              </div>
            ),
          }));
        // Remove duplicates
        const seen = new Set();
        const filtered = uniqueNames.filter((item) => {
          if (seen.has(item.value)) return false;
          seen.add(item.value);
          return true;
        });
        setOptions(filtered);
      } catch (error) {
        console.error("Error fetching PCO names:", error);
      } finally {
        setLoading(false);
      }
    } else {
      setOptions([]);
    }
  };

  const handleChange = (e) => {
    setInputValue(e.target.value);
    handleSearch(e.target.value);
  };

  const handleSelect = (selectedValue) => {
    let values = inputValue ? inputValue.split(",").map((v) => v.trim()) : [];
    if (!values.includes(selectedValue)) {
      values.push(selectedValue);
    }
    setInputValue(values.join(", ") + ", ");
    setOptions([]);
  };

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
        style={{ width: "100%", fontSize: "11px" }}
        options={options}
        onSearch={handleSearch}
        onSelect={handleSelect}
        notFoundContent={
          loading ? (
            <div className="loading-text">
              <Spin size="small" />
              <i>loading results...</i>
            </div>
          ) : null
        }
        allowClear={true}
        readOnly={!isEditing}
      >
        <TextArea
          autoSize={{ minRows: 1, maxRows: 5 }}
          placeholder="Enter PCO Name"
          value={inputValue}
          onChange={handleChange}
          readOnly={!isEditing}
        />
      </AutoComplete>
    </ConfigProvider>
  );
};

export default PCO_Name;
