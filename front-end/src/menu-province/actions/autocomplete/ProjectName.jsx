import React, { useState } from "react";
import { AutoComplete, Spin, Input, ConfigProvider } from "antd";
import "./autocompletestyles.css";

const ProjectName = ({ isEditing }) => {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (value) => {
    if (value) {
      setLoading(true);
      try {
        const response = await fetch(
          `http://localhost:8081/api/ucds/search-name?query=${value}`
        );
        const data = await response.json();
        const uniqueNames = data
          .filter((item) => item.keyword && item.keyword.trim() !== "") // Filter out blank values
          .map((item) => ({
            value: item.keyword,
            count: item.count,
            label: (
              <div className="autocomplete-option">
                <span className="autocomplete-keyword">{item.keyword}</span>
                <span className="autocomplete-count">
                  ({item.count} results)
                </span>
              </div>
            ),
          }))
          .sort((a, b) => b.count - a.count); // Sort by count in descending order
        setOptions(uniqueNames);
      } catch (error) {
        console.error("Error fetching project names:", error);
      } finally {
        setLoading(false);
      }
    } else {
      setOptions([]);
    }
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
        style={{
          width: "100%",
          fontSize: "11px",
        }}
        dropdownStyle={{
          boxShadow: "none",
          backgroundColor: "#f1f1f1",
        }}
        options={options}
        popupClassName="custom-autocomplete-dropdown"
        onSearch={handleSearch}
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
        <Input
          style={{
            fontSize: "11px",
            height: "29px",
            padding: "4px 8px",
          }}
          placeholder="Enter Project Name"
          readOnly={!isEditing}
        />
      </AutoComplete>
    </ConfigProvider>
  );
};

export default ProjectName;
