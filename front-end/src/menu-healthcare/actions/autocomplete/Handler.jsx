import React, { useState, useEffect } from "react";
import { AutoComplete, ConfigProvider, Input, Typography } from "antd";
import { parseSectionInCharge } from "../../../../data/utils/parseSectionInCharge";
import "./autocompletestyles.css";

const { Paragraph } = Typography;

const Handler = ({ selectedSection, isEditing }) => {
  const [handlerMap, setHandlerMap] = useState({});
  const [handlerOptions, setHandlerOptions] = useState([]);
  const [handler, setHandler] = useState("n/a");

  useEffect(() => {
    const loadHandlerMap = async () => {
      const map = await parseSectionInCharge("/data/section_incharge.csv");
      const handlerMap = map.reduce((acc, row) => {
        if (!acc[row.Section]) {
          acc[row.Section] = [];
        }
        acc[row.Section].push(row.Incharge);
        return acc;
      }, {});
      setHandlerMap(handlerMap);
    };

    loadHandlerMap();
  }, []);

  useEffect(() => {
    if (selectedSection && handlerMap[selectedSection]) {
      setHandlerOptions(handlerMap[selectedSection].map(incharge => ({ value: incharge })));
      setHandler(""); // Clear handler if a section is selected
    } else {
      setHandlerOptions([]);
      setHandler(""); // Set handler to 'n/a' if no section is selected
    }
  }, [selectedSection, handlerMap]);

  const handleHandlerChange = (value) => {
    setHandler(value);
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
      <Paragraph>
        <strong>Handler</strong>
        <AutoComplete
          style={{
            width: "100%",
          }}
          options={handlerOptions}
          value={handler}
          onChange={handleHandlerChange}
          filterOption={(inputValue, option) =>
            option.value.toLowerCase().includes(inputValue.toLowerCase())
          }
          allowClear={true}
          readOnly={!isEditing}
        >
          <Input
            placeholder="Select Handler"
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

export default Handler;