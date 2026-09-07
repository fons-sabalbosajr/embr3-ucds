import React, { useState } from "react";
import { AutoComplete, Spin, Input, ConfigProvider } from "antd";
import { fetchProjectTitles } from "./autocompleteService";
import "./autocompletestyles.css";

const ProjectTitle = ({ isEditing }) => {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (value) => {
    if (value) {
      setLoading(true);
      try {
        const titles = await fetchProjectTitles(value);
        setOptions(titles);
      } catch (error) {
        console.error("Error fetching project titles:", error);
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
            fontSize: "10px",
            boxShadow: "none",
          },
        },
      }}
    >
      <AutoComplete
        style={{
          width: "100%",
        }}
        options={options}
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
          placeholder="Enter Project Title"
          readOnly={!isEditing}
        />
      </AutoComplete>
    </ConfigProvider>
  );
};

export default ProjectTitle;