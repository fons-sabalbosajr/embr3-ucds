import React, { useState } from "react";
import { AutoComplete, Spin, Input, ConfigProvider } from "antd";
import { notification } from "../../../../../shared/feedback";
import "./autocompletestyles.css";
import { API_BASE_URL } from "../../../../../config/api";

const { TextArea } = Input;

const ECC_CNC = ({ isEditing }) => {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [inputValue, setInputValue] = useState("");

  // Check for duplicate in the database
  const checkDuplicateInDatabase = async (value) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/ucds/check-duplicate?query=${encodeURIComponent(value)}`,
        { credentials: "include" }
      );
      const data = await response.json();
      return data.duplicate ? data.details : null;
    } catch (error) {
      console.error("Error checking duplicate:", error);
      return null;
    }
  };

  // Fetch suggestions based on search input
  const handleSearch = async (value) => {
    const lastQuery = value.split(",").pop().trim();
    if (!lastQuery) {
      setOptions([]);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/ucds/search-ecc-cnc?query=${encodeURIComponent(lastQuery)}`,
        { credentials: "include" }
      );
      const data = await response.json();
      const uniqueNames = data
        .filter((item) => item.keyword?.trim())
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
      console.error("Error fetching ECC CNC names:", error);
    } finally {
      setLoading(false);
    }
  };

  // Handle input changes
  const handleChange = (e) => {
    setInputValue(e.target.value);
    handleSearch(e.target.value);
  };

  // Handle selection from autocomplete
  const handleSelect = async (selectedValue) => {
    let values = inputValue ? inputValue.split(",").map((v) => v.trim()) : [];

    // Check for duplicate within the input field
    if (values.includes(selectedValue)) {
      notification.warning({
        message: "Duplicate Entry Detected",
        description: `The value "${selectedValue}" is already entered.`,
        placement: "topRight",
      });
      return;
    }

    // Check for duplicate in the database
    const duplicateData = await checkDuplicateInDatabase(selectedValue);
    if (duplicateData) {
      notification.error({
        message: "Duplicate Found in Database",
        description: (
          <div className="duplicate-details">
            <p>The value "{selectedValue}" already exists in the system.</p>
            <strong>Details:</strong>
            <ul>
              <li><strong>Name:</strong> {duplicateData.name || "N/A"}</li>
              <li><strong>Title:</strong> {duplicateData.title || "N/A"}</li>
              <li><strong>Province:</strong> {duplicateData.province || "N/A"}</li>
              <li><strong>ECC_CNC:</strong> {duplicateData.ecc_cnc || "N/A"}</li>
              <li><strong>Status:</strong> {duplicateData.status || "N/A"}</li>
            </ul>
          </div>
        ),
        placement: "topRight",
        duration: 6,
      });
      return;
    }

    // Append new value if no duplicates are found
    values.push(selectedValue);
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
        allowClear
        readOnly={!isEditing}
      >
        <TextArea
          style={{ fontSize: "11px", height: "29px", padding: "4px 8px" }}
          placeholder="Enter Reference No."
          value={inputValue}
          onChange={handleChange}
          readOnly={!isEditing}
        />
      </AutoComplete>
    </ConfigProvider>
  );
};

export default ECC_CNC;
