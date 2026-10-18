import React, { useState, useEffect } from "react";
import { ConfigProvider, Input, Typography } from "antd";
import { parsePSICCode } from "../../../../../../data/utils/parsePSICCode";

const { Paragraph } = Typography;

// `bare`: the field alone, for a form that gives it its own label and size.
// `setIndustryType`: told the value worked out from the classification.
const IndustryType = ({ selectedIndustryClass, readOnly, bare, setIndustryType: report }) => {
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
      report?.(industryType);
      //console.log("Industry Type Set:", industryType);
    } else {
      setIndustryType("n/a");
      // console.log("Industry Type Reset");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndustryClass, psicCodeMap]);

  if (bare) return <Input placeholder="Filled in automatically" value={industryType} readOnly />;

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
        <strong>Industry Type</strong>
        <Input placeholder="Filled in automatically"
          value={industryType}
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

export default IndustryType;
