import React, { useState, useEffect } from "react";
import { ConfigProvider, Input, Typography } from "antd";
import { parsePSICCode } from "../../../../../../data/utils/parsePSICCode";

const { Paragraph } = Typography;

const IndustrySubType = ({ selectedIndustryClass, readOnly }) => {
  const [psicCodeMap, setPsicCodeMap] = useState({});
  const [industrySubType, setIndustrySubType] = useState("n/a");

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
      const { industrySubType } = psicCodeMap[selectedIndustryClass];
      setIndustrySubType(industrySubType);
      //console.log("Industry Sub-Type Set:", industrySubType);
    } else {
      setIndustrySubType("");
      //console.log("Industry Sub-Type Reset");
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
        <strong>Industry Sub-Type</strong>
        <Input
          value={industrySubType}
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

export default IndustrySubType;
