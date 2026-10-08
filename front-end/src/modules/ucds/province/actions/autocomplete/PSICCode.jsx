import React, { useState, useEffect } from "react";
import { ConfigProvider, Input, Typography } from "antd";
import { parsePSICCode } from "../../../../../../data/utils/parsePSICCode";

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
      setPsicCode("n/a");
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
          Input: {
            fontSize: "11px",
            height: "29px",
            padding: "4px 8px",
          },
        },
      }}
    >
      <Paragraph>
        <strong>PSIC Code</strong>
        <Input placeholder="Filled in automatically"
          value={psicCode}
          readOnly
          style={{
            fontSize: "11px",
            height: "29px",
            padding: "4px 8px",
            marginTop: "4px",
            cursor: readOnly ? "not-allowed" : "text",
            color: readOnly ? "#aaa" : "inherit",
          }}
        />
      </Paragraph>
    </ConfigProvider>
  );
};

export default PSICCode;
