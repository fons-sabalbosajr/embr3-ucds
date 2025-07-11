import React, { useState } from "react";
import { AutoComplete, Spin, Input, ConfigProvider } from "antd";
import { fetchHealthcareData } from "../../../api/healthcareService";
import "./autocompletestyles.css";

const { TextArea } = Input;

const HAZ = ({ isEditing }) => {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const handleSearch = async (value) => {
    const lastQuery = value.split(",").pop().trim(); // Get last typed value
    if (lastQuery) {
      setLoading(true);
      try {
        // Use fetchHealthcareData to get all healthcare data and filter for HAZ IDs
        const data = await fetchHealthcareData();
        const uniqueNames = data
          .filter(
            (item) =>
              typeof item.haz_id === "string" &&
              item.haz_id.toLowerCase().includes(lastQuery.toLowerCase())
          )
          .map((item) => ({
            value: item.haz_id,
            label: (
              <div className="autocomplete-option">
                <span className="autocomplete-keyword" style={{ whiteSpace: "normal", fontSize: "10px" }}>{item.haz_id}</span>
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
        console.error("Error fetching HAZ IDs:", error);
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
    let values = inputValue ? inputValue.split(",").map((v) => v.trim()) : []; // Keep existing values
    if (!values.includes(selectedValue)) {
      values.push(selectedValue);
    }
    setInputValue(values.join(", ") + ", "); // Append and keep the format
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
          placeholder="Enter HWG ID"
          value={inputValue}
          onChange={handleChange}
          readOnly={!isEditing}
          autoSize={{ minRows: 1, maxRows: 5 }}
        />
      </AutoComplete>
    </ConfigProvider>
  );
};

export default HAZ;
