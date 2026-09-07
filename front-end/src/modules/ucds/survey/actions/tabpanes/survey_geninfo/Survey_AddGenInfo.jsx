import React, { useEffect, useState } from "react";
import { Row, Col, Typography, Input, ConfigProvider, Checkbox } from "antd";
import ProjectTitle from "../../autocomplete/ProjectTitle";
import IndustryClass from "../../autocomplete/IndustryClass";
import PSICCode from "../../autocomplete/PSICCode";
import IndustryType from "../../autocomplete/IndustryType";
import IndustrySubType from "../../autocomplete/IndustrySubType";
import District from "../../autocomplete/District";
import Waterbody from "../../autocomplete/Waterbody";
import Province from "../../../../../../components/Autocomplete/Province";
import Municipality from "../../../../../../components/Autocomplete/Municipalities";
import Barangay from "../../../../../../components/Autocomplete/Barangay";
import TextArea from "antd/es/input/TextArea";
import "./addgeninfo.css";
import axios from "axios";

const { Paragraph, Text } = Typography;

const Survey_AddGenInfo = ({ isEditing, handleInputChange }) => {
  const [selectedIndustryClass, setSelectedIndustryClass] = useState("");
  const [industryType, setIndustryType] = useState("n/a");
  const [industrySubType, setIndustrySubType] = useState("n/a");
  const [psicCode, setPsicCode] = useState("n/a");
  const [selectedProvince, setSelectedProvince] = useState("");
  const [selectedMunicipality, setSelectedMunicipality] = useState("");
  const [selectedBarangay, setSelectedBarangay] = useState("");
  const [street, setStreet] = useState("");
  const [fullAddress, setFullAddress] = useState("n/a");
  const [longitude, setLongitude] = useState("n/a");
  const [latitude, setLatitude] = useState("n/a");
  const [longitudeError, setLongitudeError] = useState("");
  const [latitudeError, setLatitudeError] = useState("");
  const [withinManilaBayArea, setWithinManilaBayArea] = useState(false);
  const [projectTitle, setProjectTitle] = useState("");

  useEffect(() => {
    if (!selectedIndustryClass || selectedIndustryClass.trim() === "") {
      setIndustryType("n/a");
      setIndustrySubType("n/a");
      setPsicCode("n/a");
    }
  }, [selectedIndustryClass]);

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

  const handleCheckboxChange = (field, e) => {
    const value = e.target.checked ? "✔" : "";
    //handleInputChange(field, value);
  };

  const handleTextChange = (field, e) => {
    if (field === "project_title") {
      setProjectTitle(e.target.value); // Update the projectTitle state
    }
  };
  // Function to validate and update longitude
  const handleLongitudeChange = (e) => {
    const value = e.target.value;
    if (/^[-]?\d*\.?\d*$/.test(value) || value === "") {
      setLongitude(value);
      setLongitudeError(""); // Clear error if valid
    } else {
      setLongitudeError("Only decimal coordinates are allowed.");
    }
  };

  // Function to validate and update latitude
  const handleLatitudeChange = (e) => {
    const value = e.target.value;
    if (/^[-]?\d*\.?\d*$/.test(value) || value === "") {
      setLatitude(value);
      setLatitudeError(""); // Clear error if valid
    } else {
      setLatitudeError("Only decimal coordinates are allowed.");
    }
  };

  const showAddressError = longitudeError || latitudeError;

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={24} md={24} lg={24} className="modalcol">
          <div className="applicable-laws-container">
            <strong className="label">Applicable Laws:</strong>
            <div className="checkboxes">
              <Checkbox
                disabled={!isEditing}
                onChange={(e) => handleCheckboxChange("survey_eia", e)}
              >
                <strong className="label-checkbox">EIA Project Survey</strong>
              </Checkbox>
              <Checkbox
                disabled={!isEditing}
                onChange={(e) => handleCheckboxChange("survey_air", e)}
              >
                <strong className="label-checkbox">AIR</strong>
              </Checkbox>
              <Checkbox
                disabled={!isEditing}
                onChange={(e) => handleCheckboxChange("survey_water", e)}
              >
                <strong className="label-checkbox">WATER</strong>
              </Checkbox>
              <Checkbox
                disabled={!isEditing}
                onChange={(e) => handleCheckboxChange("survey_haz", e)}
              >
                <strong className="label-checkbox">HAZ</strong>
              </Checkbox>
              <Checkbox
                disabled={!isEditing}
                onChange={(e) => handleCheckboxChange("survey_chem", e)}
              >
                <strong className="label-checkbox">CHEMICAL</strong>
              </Checkbox>
            </div>
          </div>
        </Col>
      </Row>

      <Row gutter={[16, 16]} className="gen-info-row">
        <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
          <Paragraph>
            <strong>Project Title</strong>
            <Input
              value={projectTitle} // Bind the value to the projectTitle state
              readOnly={!isEditing}
              placeholder="Enter Project Name"
              rows={2}
              className="textbox-label"
              onChange={(e) => handleTextChange("project_title", e)} // Call handleTextChange to update the state
            />
          </Paragraph>

          <Row gutter={[16, 16]}>
            <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
              <Paragraph>
                <strong>Industry Classification</strong>
                <IndustryClass
                  onChange={setSelectedIndustryClass}
                  readOnly={!isEditing}
                />
              </Paragraph>
            </Col>
            <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
              <Paragraph>
                <PSICCode
                  selectedIndustryClass={selectedIndustryClass}
                  setPsicCode={setPsicCode}
                />
              </Paragraph>
            </Col>
          </Row>
          <Paragraph>
            <IndustryType
              selectedIndustryClass={selectedIndustryClass}
              setIndustryType={setIndustryType}
            />
          </Paragraph>
          <Paragraph>
            <IndustrySubType
              selectedIndustryClass={selectedIndustryClass}
              setIndustrySubType={setIndustrySubType}
            />
          </Paragraph>

          <Row gutter={[16, 16]}>
            <Col xs={24} sm={24} md={8} lg={8} className="modalcol">
              <Paragraph>
                <strong>Province</strong>
                <Province
                  value={selectedProvince}
                  onChange={setSelectedProvince}
                  readOnly={!isEditing}
                />
              </Paragraph>
            </Col>
            <Col xs={24} sm={24} md={8} lg={8} className="modalcol">
              <Paragraph>
                <strong>City/Municipality</strong>
                <Municipality
                  value={selectedMunicipality}
                  onChange={setSelectedMunicipality}
                  selectedProvince={selectedProvince}
                  readOnly={!selectedProvince}
                />
                {showAddressError && !selectedMunicipality && (
                  <Text type="danger" style={{ fontSize: "11px" }}>
                    This field is required.
                  </Text>
                )}
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
                  readOnly={!selectedMunicipality}
                />
                {showAddressError && !selectedBarangay && (
                  <Text type="danger" style={{ fontSize: "11px" }}>
                    This field is required.
                  </Text>
                )}
              </Paragraph>
            </Col>
          </Row>

          <Row gutter={[16, 16]}>
            <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
              <Paragraph className="paragraph-street">
                <strong>Street</strong>
                <ConfigProvider>
                  <Input
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                    placeholder="Enter street"
                    style={{
                      fontSize: "11px",
                      height: "29px",
                      padding: "4px 8px",
                    }}
                    readOnly={!isEditing}
                  />
                </ConfigProvider>
                {showAddressError && !street && (
                  <Text type="danger" style={{ fontSize: "11px" }}>
                    This field is required.
                  </Text>
                )}
              </Paragraph>
            </Col>

            <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
              <Paragraph style={{ marginTop: "15px" }}>
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
        </Col>

        <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
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
                rows={4}
                style={{
                  fontSize: "11px",
                  padding: "4px 8px",
                  
                  color: "#a9a9a9", // Gray text color
                  cursor: "not-allowed", // Change cursor to indicate disabled
                }}
              />
            </ConfigProvider>
          </Paragraph>

          <Paragraph style={{ marginTop: "15px" }}>
            <District
              selectedMunicipality={selectedMunicipality}
              inputHeight="29px"
            />
          </Paragraph>

          <Paragraph style={{ marginTop: "-5px" }}>
            <Waterbody selectedMunicipality={selectedMunicipality} />
          </Paragraph>

          <Row gutter={[16, 16]}>
            {/* Longitude Input */}
            <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
              <Paragraph>
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
                    onChange={handleLongitudeChange}
                    style={{
                      fontSize: "11px",
                      height: "29px",
                      padding: "4px 8px",
                    }}
                    readOnly={!isEditing}
                  />
                </ConfigProvider>
                {longitudeError && (
                  <Typography.Text type="danger" style={{ fontSize: "10px" }}>
                    {longitudeError}
                  </Typography.Text>
                )}
              </Paragraph>
            </Col>

            {/* Latitude Input */}
            <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
              <Paragraph>
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
                    onChange={handleLatitudeChange}
                    style={{
                      fontSize: "11px",
                      height: "29px",
                      padding: "4px 8px",
                    }}
                    readOnly={!isEditing}
                  />
                </ConfigProvider>
                {latitudeError && (
                  <Typography.Text type="danger" style={{ fontSize: "10px" }}>
                    {latitudeError}
                  </Typography.Text>
                )}
              </Paragraph>
            </Col>
          </Row>
        </Col>
      </Row>
    </div>
  );
};

export default Survey_AddGenInfo;
