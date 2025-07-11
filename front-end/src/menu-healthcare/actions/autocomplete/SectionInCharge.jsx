import React, { useEffect, useState } from "react";
import { AutoComplete, ConfigProvider, Input, Typography } from "antd";
import { parseSectionInCharge } from "../../../../data/utils/parseSectionInCharge";
import "./autocompletestyles.css";

const { Paragraph } = Typography;

const SectionInCharge = ({ value, onChange, isEditing }) => {
  const [sectionOptions, setSectionOptions] = useState([]);
  const [section, setSection] = useState(value || "");

  useEffect(() => {
    const loadSectionOptions = async () => {
      const data = await parseSectionInCharge("/data/section_incharge.csv");
      // Remove blank/empty section names
      const sections = [
        ...new Set(
          data.map((item) => item.Section).filter((s) => s && s.trim() !== "")
        ),
      ];
      // Sort sections alphabetically before mapping to options
      const sortedSections = sections.sort((a, b) => a.localeCompare(b));
      setSectionOptions(sortedSections.map((section) => ({ value: section })));
    };

    loadSectionOptions();
  }, []);

  const handleSectionChange = (value) => {
    setSection(value);
    if (onChange) {
      onChange(value);
    }
  };

  return (
    <ConfigProvider
      theme={{
        components: {
          AutoComplete: {
            optionFontSize: 10,
            colorTextPlaceholder: "#555",
            boxShadow: "none",
          },
        },
      }}
    >
      <Paragraph>
        <AutoComplete
          style={{
            width: "100%",
          }}
          options={sectionOptions}
          value={section}
          onChange={handleSectionChange}
          filterOption={(inputValue, option) =>
            option.value.toLowerCase().includes(inputValue.toLowerCase())
          }
          allowClear={true}
          readOnly={!isEditing}
        >
          <Input
            placeholder="Select Section/Unit"
            placeholderStyle={{
              fontSize: "9px",
            }}
            readOnly={!isEditing}
          />
        </AutoComplete>
      </Paragraph>
    </ConfigProvider>
  );
};

export default SectionInCharge;
