import React, { useState, useEffect } from "react";
import { ConfigProvider, Input, Typography } from "antd";
import { parsePSICCode } from "../../../../../../data/utils/parsePSICCode";

const { Paragraph } = Typography;

const IndustryType = ({ selectedIndustryClass, readOnly }) => {
  const [psicCodeMap, setPsicCodeMap] = useState({});
  const [industryType, setIndustryType] = useState("n/a");

  useEffect(() => {
    const loadPsicCodeMap = async () => {
      const map = await parsePSICCode("/data/psiccode.csv");
      setPsicCodeMap(map);
      //console.log("PSIC Code Map Loaded:", map);
    };

    loadPsicCodeMap();
  }, []);

  useEffect(() => {
    if (selectedIndustryClass && psicCodeMap[selectedIndustryClass]) {
      const { industryType } = psicCodeMap[selectedIndustryClass];
      setIndustryType(industryType);
      //console.log("Industry Type Set:", industryType);
    } else {
      setIndustryType("");
      // console.log("Industry Type Reset");
    }
  }, [selectedIndustryClass, psicCodeMap]);

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
        <strong>Industry Type</strong>
        <Input
          value={industryType}
          readOnly
          style={{
            cursor: readOnly ? "not-allowed" : "text",
            color: readOnly ? "#aaa" : "inherit",
          }}
          placeholder="n/a"
        />
      </Paragraph>
    </ConfigProvider>
  );
};

export default IndustryType;
