import React, { useState, useEffect } from "react";
import { ConfigProvider, Input, Typography } from "antd";
import { parsePSICCode } from "../../../../../../data/utils/parsePSICCode";
import "./autocompletestyles.css";

const { Paragraph } = Typography;

const IndustryType = ({ selectedIndustryClass }) => {
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
    //console.log("Selected Industry Class:", selectedIndustryClass);
    //console.log("PSIC Code Map:", psicCodeMap);
    if (selectedIndustryClass && psicCodeMap[selectedIndustryClass]) {
      const { industryType } = psicCodeMap[selectedIndustryClass];
      setIndustryType(industryType);
      //console.log("Industry Type Set:", industryType);
    } else {
      setIndustryType("n/a");
     // console.log("Industry Type Reset");
    }
  }, [selectedIndustryClass, psicCodeMap]);

  return (
    <ConfigProvider
      theme={{
        components: {
          Input: {
            fontSize: "11px",
            height: "29px",
            padding: "4px 8px",
            backgroundColor: "#f5f5f5", // Light gray background
            color: "#a9a9a9", // Gray text color
            cursor: "not-allowed", // Change cursor to indicate disabled
          },
        },
      }}
    >
      <Paragraph className="autocomplete-margin">
        <strong>Industry Type</strong>
        <Input
          value={industryType}
          readOnly
          style={{
            fontSize: "11px",
            height: "29px",
            padding: "4px 8px",
            color: "#a9a9a9", // Gray text color
            cursor: "not-allowed", // Change cursor to indicate disabled
          }}
        />
      </Paragraph>
    </ConfigProvider>
  );
};

export default IndustryType;