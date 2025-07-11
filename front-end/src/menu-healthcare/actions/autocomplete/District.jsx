import React, { useState, useEffect } from "react";
import { ConfigProvider, Input, Typography } from "antd";
import { parseDistrict } from "../../../../data/utils/parseDistrict";

const { Paragraph } = Typography;

const District = ({ selectedMunicipality, readOnly }) => {
  const [districtMap, setDistrictMap] = useState({});
  const [zipCode, setZipCode] = useState("n/a");

  useEffect(() => {
    const loadDistrictMap = async () => {
      const map = await parseDistrict("/data/district.csv");
      const districtMap = map.reduce((acc, row) => {
        acc[row.Municipality] = row.ZipCode;
        return acc;
      }, {});
      setDistrictMap(districtMap);
      //console.log("District Map Loaded:", districtMap);
    };

    loadDistrictMap();
  }, []);

  useEffect(() => {
    if (selectedMunicipality && districtMap[selectedMunicipality]) {
      setZipCode(districtMap[selectedMunicipality]);
    } else {
      setZipCode("");
    }
  }, [selectedMunicipality, districtMap]);

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
        <strong>Congressional District</strong>
        <Input
          value={zipCode}
          readOnly
          style={{
            fontSize: "11px",
            padding: "4px 8px",
            marginTop: "2px",
            cursor: readOnly ? "not-allowed" : "text",
            color: readOnly ? "#aaa" : "inherit",
            
          }}
          placeholder="n/a"
        />
      </Paragraph>
    </ConfigProvider>
  );
};

export default District;
