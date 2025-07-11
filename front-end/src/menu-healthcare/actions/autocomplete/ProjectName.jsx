import React, { useState } from "react";
import { AutoComplete, Spin, Input, ConfigProvider } from "antd";
import { fetchProponentNames } from "./autocompleteService";
import "./autocompletestyles.css";

const ProjectName = ({ isEditing }) => {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (value) => {
    if (value) {
      setLoading(true);
      try {
        const names = await fetchProponentNames(value);
        setOptions(names);
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
        <Input placeholder="Enter Project Name" readOnly={!isEditing} />
      </AutoComplete>
    </ConfigProvider>
  );
};

export default ProjectName;
