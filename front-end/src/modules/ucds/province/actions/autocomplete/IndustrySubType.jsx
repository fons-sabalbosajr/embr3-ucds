import React, { useState, useEffect } from "react";
import { ConfigProvider, Input, Typography } from "antd";
import { parsePSICCode } from "../../../../../../data/utils/parsePSICCode";

const { Paragraph } = Typography;

// `bare`: the field alone, for a form that gives it its own label and size.
// `setIndustrySubType`: told the value worked out from the classification.
const IndustrySubType = ({ selectedIndustryClass, readOnly, bare, setIndustrySubType: report }) => {
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
      report?.(industrySubType);
      //console.log("Industry Sub-Type Set:", industrySubType);
    } else {
      setIndustrySubType("n/a");
      //console.log("Industry Sub-Type Reset");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndustryClass, psicCodeMap]);

  if (bare) return <Input placeholder="Filled in automatically" value={industrySubType} readOnly />;

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
        <strong>Industry Sub-Type</strong>
        <Input placeholder="Filled in automatically"
          value={industrySubType}
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

export default IndustrySubType;
