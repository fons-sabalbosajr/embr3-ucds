import React, { useState } from "react";
import { AutoComplete, Spin, Input, ConfigProvider } from "antd";
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
        const response = await fetch(
          `http://10.14.77.100:8081/api/ucds/search-haz-id?query=${lastQuery}`
        );
        const data = await response.json();
        const uniqueNames = data
          .filter((item) => item.keyword && item.keyword.trim() !== "")
          .map((item) => ({
            value: item.keyword,
            count: item.count,
            label: (
              <div className="autocomplete-option">
                <span className="autocomplete-keyword">{item.keyword}</span>
                <span className="autocomplete-count">({item.count} results)</span>
              </div>
            ),
          }))
          .sort((a, b) => b.count - a.count);
        setOptions(uniqueNames);
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
        dropdownStyle={{ boxShadow: "none", backgroundColor: "#f1f1f1" }}
        options={options}
        popupClassName="custom-autocomplete-dropdown"
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
          style={{ fontSize: "11px", height: "29px", padding: "4px 8px" }}
          placeholder="Enter HAZ ID"
          value={inputValue}
          onChange={handleChange}
          readOnly={!isEditing}
        />
      </AutoComplete>
    </ConfigProvider>
  );
};

export default HAZ;