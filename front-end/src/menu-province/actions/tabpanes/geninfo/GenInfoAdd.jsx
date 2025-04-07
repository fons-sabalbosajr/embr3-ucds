import React, { useState, useEffect } from "react";
import { Row, Col, Typography, Input, ConfigProvider, Checkbox } from "antd";
import ProponentName from "../../autocomplete/ProjectName";
import ProjectTitle from "../../autocomplete/ProjectTitle";
import IndustryClass from "../../autocomplete/IndustryClass";
import PSICCode from "../../autocomplete/PSICCode";
import IndustryType from "../../autocomplete/IndustryType";
import IndustrySubType from "../../autocomplete/IndustrySubType";
import Province from "../../../../components/Autocomplete/Province";
import Municipality from "../../../../components/Autocomplete/Municipalities";
import Barangay from "../../../../components/Autocomplete/Barangay";
import District from "../../autocomplete/District";
import Waterbody from "../../autocomplete/Waterbody";
import "./geninfoadd.css";

const { Paragraph } = Typography;
const { TextArea } = Input;

const GenInfoAdd = ({
  isEditing,
  selectedProvince,
  setSelectedProvince,
  extractedData,
  setGeneralInfo, generalInfo
}) => {
  const [selectedIndustryClass, setSelectedIndustryClass] = useState("n/a");
  const [industryType, setIndustryType] = useState("n/a");
  const [industrySubType, setIndustrySubType] = useState("n/a");
  const [psicCode, setPsicCode] = useState("n/a");
  const [selectedMunicipality, setSelectedMunicipality] = useState("");
  const [selectedBarangay, setSelectedBarangay] = useState("");
  const [street, setStreet] = useState("");
  const [fullAddress, setFullAddress] = useState("n/a");
  const [longitude, setLongitude] = useState("n/a");
  const [latitude, setLatitude] = useState("n/a");
  const [withinManilaBayArea, setWithinManilaBayArea] = useState(false);
  const [autoFilledFields, setAutoFilledFields] = useState({});
  const [proponentName, setProponentName] = useState("n/a");
  const [projectTitle, setProjectTitle] = useState("n/a");

  useEffect(() => {
    if (extractedData && Object.keys(extractedData).length > 0) {
      setProponentName(extractedData.proponent_name || "");
      setProjectTitle(extractedData.project_title || "");
      setSelectedIndustryClass(extractedData.industry_class || "");
      setPsicCode(extractedData.psic_code || "");
      setSelectedBarangay(extractedData.barangay || "n/a");
      setSelectedMunicipality(extractedData.city || "n/a");
      setSelectedProvince(extractedData.province || "n/a");
      setStreet(extractedData.street || "n/a");
    }
  }, [extractedData]);

  useEffect(() => {
    if (!selectedIndustryClass) {
      // Reset the values of the other fields when Industry Classification is empty
      setIndustryType("n/a");
      setIndustrySubType("n/a");
      setPsicCode("n/a");
    }
  }, [selectedIndustryClass]);

  useEffect(() => {
    if (!setSelectedProvince) {
      // Reset the values of the other fields when Industry Classification is empty
      setSelectedMunicipality("");
      setSelectedBarangay("");
      setStreet("");
      setFullAddress("n/a")
    }

    if (!selectedMunicipality) {
      // Reset the values of the other fields when Industry Classification is empty
      setSelectedBarangay("");
      setStreet("");
    }
  }, [setSelectedProvince, selectedMunicipality]);

  useEffect(() => {
    // Update the full address whenever any of the address components change
    const addressComponents = [
      street,
      selectedBarangay,
      selectedMunicipality,
      selectedProvince,
    ];
    const filteredComponents = addressComponents.filter(
      (component) => component
    );
    setFullAddress(filteredComponents.join(", "));
  }, [street, selectedBarangay, selectedMunicipality, selectedProvince]);

  useEffect(() => {
    const addressComponents = [
      street,
      selectedBarangay,
      selectedMunicipality,
      selectedProvince,
    ];
    const filteredComponents = addressComponents.filter(
      (component) => component
    );
    setFullAddress(filteredComponents.join(", "));
  }, [street, selectedBarangay, selectedMunicipality, selectedProvince]);

  useEffect(() => {
    const fetchCoordinates = async () => {
      if (fullAddress) {
        //console.log("Fetching coordinates for address:", fullAddress);
        try {
          const response = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
              fullAddress
            )}&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`
          );
          const data = await response.json();
          //console.log("Geocoding API response:", data);
          if (data.results && data.results.length > 0) {
            const location = data.results[0].geometry.location;
            setLongitude(location.lng);
            setLatitude(location.lat);
          } else {
            //console.log("No results found for the address due to blank textboxes.");
            setLongitude("n/a");
            setLatitude("n/a");
          }
        } catch (error) {
          console.error("Error fetching coordinates:", error);
          setLongitude("n/a");
          setLatitude("n/a");
        }
      } else {
        setLongitude("n/a");
        setLatitude("n/a");
      }
    };

    fetchCoordinates();
  }, [fullAddress]);

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
        <Paragraph>
          <strong>Proponent Name</strong>
          <ProponentName isEditing={isEditing} value={proponentName} />
        </Paragraph>
        <Paragraph>
          <strong>Project Title</strong>
          <ProjectTitle isEditing={isEditing} value={projectTitle} />
        </Paragraph>
        <Paragraph>
          <strong>Industry Classification</strong>
          <IndustryClass
            onChange={(value) => setSelectedIndustryClass(value)}
            value={selectedIndustryClass}
          />
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
          value={psicCode} // Ensure it gets the correct value
          onChange={(value) => {
            setPsicCode(value);
          }}
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
                disabled={!isEditing}
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
          <Col xs={24} sm={24} md={15} lg={15} className="modalcol">
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
                  disabled={!isEditing}
                />
              </ConfigProvider>
            </Paragraph>
          </Col>
          <Col xs={24} sm={24} md={9} lg={9} className="modalcol">
            <Paragraph style={{ marginTop: "22px" }}>
              <ConfigProvider
                theme={{
                  components: {
                    Checkbox: {
                      fontSize: "11px",
                    },
                  },
                }}
              >
                <Checkbox
                  checked={withinManilaBayArea}
                  onChange={(e) => setWithinManilaBayArea(e.target.checked)}
                  disabled={!isEditing}
                >
                  <strong>Within Manila Bay Area</strong>
                </Checkbox>
              </ConfigProvider>
            </Paragraph>
          </Col>
        </Row>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={24} md={24} lg={24} className="modalcol">
            <Paragraph>
              <strong>Complete Address</strong>
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
                  rows={5}
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
          <Col xs={24} sm={24} md={9} lg={9} className="modalcol-zipcode">
            <Paragraph style={{ marginTop: "-20px" }}>
              <District
                selectedMunicipality={selectedMunicipality}
                inputHeight="29px"
              />
            </Paragraph>
          </Col>
          <Col xs={24} sm={24} md={15} lg={15} className="modalcol-zipcode">
            <Paragraph style={{ marginTop: "-20px" }}>
              <Waterbody selectedMunicipality={selectedMunicipality} />
            </Paragraph>
          </Col>
          <Col xs={24} sm={24} md={24} lg={24} className="modalcol-zipcode">
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={12} lg={12} className="modalcol-zipcode">
                <Paragraph style={{ marginTop: "-10px" }}>
                  <strong>Longitude</strong>
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
                      value={longitude}
                      onChange={(e) => isEditing && setLongitude(e.target.value)}
                      style={{
                        fontSize: "11px",
                        height: "29px",
                        padding: "4px 8px",
                      }}
                      disabled={!isEditing}
                    />
                  </ConfigProvider>
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12} className="modalcol-zipcode">
                <Paragraph style={{ marginTop: "-10px" }}>
                  <strong>Latitude</strong>
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
                      value={latitude}
                      onChange={(e) => isEditing && setLatitude(e.target.value)}
                      style={{
                        fontSize: "11px",
                        height: "29px",
                        padding: "4px 8px",
                      }}
                      disabled={!isEditing}
                    />
                  </ConfigProvider>
                </Paragraph>
              </Col>
            </Row>
          </Col>
        </Row>
      </Col>
    </Row>
  );
};

export default GenInfoAdd;
