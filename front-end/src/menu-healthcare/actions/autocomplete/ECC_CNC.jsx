import React, { useState } from "react";
import { AutoComplete, Spin, Input, ConfigProvider, notification } from "antd";
import { fetchHealthcareData } from "../../../api/healthcareService"; // <-- import the service
import "./autocompletestyles.css";

const { TextArea } = Input;

const ECC_CNC = ({ isEditing }) => {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [inputValue, setInputValue] = useState("");

  // Check for duplicate in the database
  const checkDuplicateInDatabase = async (value) => {
    try {
      // You can use fetchHealthcareData here if you want to check against all healthcare data
      const data = await fetchHealthcareData();
      // Example: check if any record has ECC_CNC matching the value
      const found = data.find(
        (item) => (item.ecc_cnc || "").toLowerCase() === value.toLowerCase()
      );
      return found
        ? {
            name: found.name,
            title: found.title,
            province: found.province,
            ecc_cnc: found.ecc_cnc,
            status: found.status,
          }
        : null;
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
      // Use fetchHealthcareData to get all healthcare records and filter for ECC_CNC suggestions
      const data = await fetchHealthcareData();
      const uniqueNames = data
        .filter(
          (item) =>
            item.ecc_cnc &&
            item.ecc_cnc.toLowerCase().includes(lastQuery.toLowerCase())
        )
        .map((item) => ({
          value: item.ecc_cnc,
          label: (
            <div className="autocomplete-option">
              <span className="autocomplete-keyword" style={{ whiteSpace: "normal", fontSize: "10px"}}>{item.ecc_cnc}</span>
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
              <li>
                <strong>Name:</strong> {duplicateData.name || "N/A"}
              </li>
              <li>
                <strong>Title:</strong> {duplicateData.title || "N/A"}
              </li>
              <li>
                <strong>Province:</strong> {duplicateData.province || "N/A"}
              </li>
              <li>
                <strong>ECC_CNC:</strong> {duplicateData.ecc_cnc || "N/A"}
              </li>
              <li>
                <strong>Status:</strong> {duplicateData.status || "N/A"}
              </li>
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
        allowClear
        readOnly={!isEditing}
      >
        <TextArea
          style={{ fontSize: "11px",padding: "4px 8px" }}
          placeholder="Enter Reference No."
          value={inputValue}
          onChange={handleChange}
          readOnly={!isEditing}
          autoSize={{ minRows: 1, maxRows: 5 }}
        />
      </AutoComplete>
    </ConfigProvider>
  );
};

export default ECC_CNC;
