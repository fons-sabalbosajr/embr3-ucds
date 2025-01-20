import React, { useState, useEffect } from "react";
import { Row, Col, Typography, Input, ConfigProvider } from "antd";
import ProponentName from "../../autocomplete/ProjectName";
import ProjectTitle from "../../autocomplete/ProjectTitle";
import IndustryClass from "../../autocomplete/IndustryClass";
import PSICCode from "../../autocomplete/PSICCode";
import IndustryType from "../../autocomplete/IndustryType";
import IndustrySubType from "../../autocomplete/IndustrySubType";
import Province from "../../../../components/Autocomplete/Province";
import Municipality from "../../../../components/Autocomplete/Municipalities";
import Barangay from "../../../../components/Autocomplete/Barangay";
import "./geninfoadd.css";

const { Paragraph } = Typography;
const { TextArea } = Input;

const GenInfoAdd = () => {
  const [selectedIndustryClass, setSelectedIndustryClass] = useState("");
  const [industryType, setIndustryType] = useState("n/a");
  const [industrySubType, setIndustrySubType] = useState("n/a");
  const [psicCode, setPsicCode] = useState("n/a");
  const [selectedProvince, setSelectedProvince] = useState("");
  const [selectedMunicipality, setSelectedMunicipality] = useState("");
  const [selectedBarangay, setSelectedBarangay] = useState("");
  const [street, setStreet] = useState("")
  const [fullAddress, setFullAddress] = useState("");

  useEffect(() => {
    if (!selectedIndustryClass) {
      // Reset the values of the other fields when Industry Classification is empty
      setIndustryType("n/a");
      setIndustrySubType("n/a");
      setPsicCode("n/a");
    }
  }, [selectedIndustryClass]);

  useEffect(() => {
    // Update the full address whenever any of the address components change
    const addressComponents = [street, selectedBarangay, selectedMunicipality, selectedProvince];
    const filteredComponents = addressComponents.filter(component => component);
    setFullAddress(filteredComponents.join(", "));
  }, [street, selectedBarangay, selectedMunicipality, selectedProvince]);


  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
        <Paragraph>
          <strong>Proponent Name</strong>
          <ProponentName />
        </Paragraph>
        <Paragraph>
          <strong>Project Title</strong>
          <ProjectTitle />
        </Paragraph>
        <Paragraph>
          <strong>Industry Classification</strong>
          <IndustryClass onChange={setSelectedIndustryClass} />
        </Paragraph>
        <IndustryType
          selectedIndustryClass={selectedIndustryClass}
          setIndustryType={setIndustryType}
        />
        <IndustrySubType
          selectedIndustryClass={selectedIndustryClass}
          setIndustrySubType={setIndustrySubType}
        />
        <PSICCode
          selectedIndustryClass={selectedIndustryClass}
          setPsicCode={setPsicCode}
        />
      </Col>

      <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={24} md={8} lg={8} className="modalcol">
            <Paragraph>
              <strong>Province</strong>
              <Province
                value={selectedProvince}
                onChange={setSelectedProvince}
              />
            </Paragraph>
          </Col>
          <Col xs={24} sm={24} md={8} lg={8} className="modalcol">
            <Paragraph>
              <strong>Municipality</strong>
              <Municipality
                value={selectedMunicipality}
                onChange={setSelectedMunicipality}
                selectedProvince={selectedProvince}
                disabled={!selectedProvince} // Disable if no province is selected
              />
            </Paragraph>
          </Col>
          <Col xs={24} sm={24} md={8} lg={8} className="modalcol">
          <Paragraph>
              <strong>Barangay</strong>
              <Barangay
                value={selectedBarangay}
                onChange={setSelectedBarangay}
                selectedProvince={selectedProvince}
                selectedMunicipality={selectedMunicipality}
                disabled={!selectedMunicipality} // Disable if no municipality is selected
              />
            </Paragraph>
          </Col>
        </Row>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={24} md={24} lg={24} className="modalcol">
          <Paragraph>
              <strong>Street</strong>
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
                <Input
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  placeholder="Enter street"
                  style={{
                    fontSize: "11px",
                    height: "29px",
                    padding: "4px 8px",
                  }}
                />
              </ConfigProvider>
            </Paragraph>
          </Col>
        </Row>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={24} md={24} lg={24} className="modalcol">
            <Paragraph>
              <strong>Full Address</strong>
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
                <TextArea
                  value={fullAddress}
                  readOnly
                  rows={3}
                  style={{
                    fontSize: "11px",
                    padding: "4px 8px",
                    marginTop: "4px",
                    backgroundColor: "#f5f5f5", // Light gray background
                    color: "#a9a9a9", // Gray text color
                    cursor: "not-allowed", // Change cursor to indicate disabled
                  }}
                />
              </ConfigProvider>
            </Paragraph>
          </Col>
        </Row>
      </Col>
    </Row>
  );
};

export default GenInfoAdd;
