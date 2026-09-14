import React, { useEffect, useState } from "react";
import { AutoComplete, ConfigProvider, Input, Typography } from "antd";
import { parseSectionInCharge } from "../../../../../../data/utils/parseSectionInCharge";
import "./autocompletestyles.css";

const { Paragraph } = Typography;

const SectionInCharge = ({ value, onChange, isEditing }) => {
  const [sectionOptions, setSectionOptions] = useState([]);
  const [section, setSection] = useState(value || "");

  useEffect(() => {
    const loadSectionOptions = async () => {
      const data = await parseSectionInCharge("/data/section_incharge.csv");
      const sections = [...new Set(data.map(item => item.Section))];
      setSectionOptions(sections.map(section => ({ value: section })));
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
            fontSize: "11px",
            boxShadow: "none",
          },
        },
      }}
    >
      <Paragraph>
        <AutoComplete
          style={{
            width: "100%",
            fontSize: "11px",
          }}
          dropdownStyle={{
            boxShadow: "none",
            backgroundColor: "#f1f1f1",
          }}
          options={sectionOptions}
          popupClassName="custom-autocomplete-dropdown"
          value={section}
          onChange={handleSectionChange}
          filterOption={(inputValue, option) =>
            option.value.toLowerCase().includes(inputValue.toLowerCase())
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
            placeholder="Select Section In Charge"
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