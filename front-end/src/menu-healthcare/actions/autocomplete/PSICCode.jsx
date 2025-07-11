import React, { useState, useEffect } from "react";
import { ConfigProvider, Input, Typography } from "antd";
import { parsePSICCode } from "../../../../data/utils/parsePSICCode";

const { Paragraph } = Typography;

const PSICCode = ({
  selectedIndustryClass,
  onIndustryTypeChange,
  readOnly,
}) => {
  const [psicCodeMap, setPsicCodeMap] = useState({});
  const [psicCode, setPsicCode] = useState("n/a");

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
    // console.log("PSIC Code Map:", psicCodeMap);
    if (selectedIndustryClass && psicCodeMap[selectedIndustryClass]) {
      const { psicCode, industryType } = psicCodeMap[selectedIndustryClass];
      setPsicCode(psicCode);
      if (onIndustryTypeChange) {
        onIndustryTypeChange(industryType);
      }
      // console.log("PSIC Code Set:", psicCode);
    } else {
      setPsicCode("");
      if (onIndustryTypeChange) {
        onIndustryTypeChange("n/a");
      }
      // console.log("PSIC Code Reset");
    }
  }, [selectedIndustryClass, psicCodeMap, onIndustryTypeChange]);

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
        <strong>PSIC Code</strong>
        <Input
          value={psicCode}
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

export default PSICCode;
