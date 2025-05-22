import React, { useState, useEffect } from "react";
import { ConfigProvider, Input, Typography } from "antd";
import { parseDistrict } from "../../../../data/utils/parseDistrict";

const { Paragraph } = Typography;

const Waterbody = ({ selectedMunicipality }) => {
  const [waterbodyMap, setWaterbodyMap] = useState({});
  const [waterbody, setWaterbody] = useState("n/a");

  useEffect(() => {
    const loadWaterbodyMap = async () => {
      const map = await parseDistrict("/data/district.csv");
      const waterbodyMap = map.reduce((acc, row) => {
        acc[row.Municipality] = row.Waterbody;
        return acc;
      }, {});
      setWaterbodyMap(waterbodyMap);
      //console.log("Waterbody Map Loaded:", waterbodyMap);
    };

    loadWaterbodyMap();
  }, []);

  useEffect(() => {
    if (selectedMunicipality && waterbodyMap[selectedMunicipality]) {
      setWaterbody(waterbodyMap[selectedMunicipality]);
    } else {
      setWaterbody("n/a");
    }
  }, [selectedMunicipality, waterbodyMap]);

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
      <Paragraph>
        <strong>Receiving Waterbody (Major River/River System)</strong>
        <Input
          value={waterbody}
          readOnly
          style={{
            fontSize: "11px",
            height: "29px",
            padding: "4px 8px",
            marginTop: "4px",
            color: "#a9a9a9", // Gray text color
            cursor: "not-allowed", // Change cursor to indicate disabled
          }}
        />
      </Paragraph>
    </ConfigProvider>
  );
};

export default Waterbody;