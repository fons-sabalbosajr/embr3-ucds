import React, { useEffect, useState } from "react";
import { Input, Row, Col, Typography, Checkbox, ConfigProvider } from "antd";
import TextArea from "antd/es/input/TextArea";
import IndustryClass from "../../../../../components/Autocomplete/IndustryClass";
import IndustryType from "../../../../../components/Autocomplete/IndustryType";
import IndustrySubType from "../../../../../components/Autocomplete/IndustrySubType";
import Provinces from "../../../../../components/Autocomplete/Province";
import Municipalities from "../../../../../components/Autocomplete/Municipalities";
import Barangays from "../../../../../components/Autocomplete/Barangay";
import "./geninfo.css";
import axios from "axios";
import { API_BASE_URL } from "../../../../../config/api";

const { Paragraph } = Typography;

const GenInfo = ({ editedRecord, handleChange, isEditing }) => {
  const [localRecord, setLocalRecord] = useState(editedRecord || {});
  const [projectData, setProjectData] = useState({});
  const [longitude, setLongitude] = useState("");
  const [latitude, setLatitude] = useState("");

  useEffect(() => {
    setLocalRecord(editedRecord);
  }, [editedRecord]);

  useEffect(() => {
    const fetchProjectData = async () => {
      if (!localRecord?.industry_class) {
        // If industry_class is blank, clear the related fields
        setProjectData({});
        handleInputChange("pisc_code", "");
        handleInputChange("project_type", "");
        handleInputChange("project_subtype", "");
        return;
      }

      // Fetch project data when industry_class is not blank
      try {
        const response = await axios.get(
          `${API_BASE_URL}/api/project_type?industry_class=${localRecord.industry_class}`
        );
        if (response.data) {
          const { psic_code, project_type, project_subtype } = response.data;
          setProjectData({
            psic_code: psic_code,
            project_type: project_type,
            project_subtype: project_subtype,
          });

          // Automatically update fields based on project data
          handleInputChange("pisc_code", psic_code || "");
          handleInputChange("project_type", project_type || "");
          handleInputChange("project_subtype", project_subtype || "");
        }
      } catch (error) {
        console.error("Error fetching project data:", error);
      }
    };

    fetchProjectData();
  }, [localRecord?.industry_class]);

  // --- Detect coordinates based on Province, Municipality, Barangay ---
  useEffect(() => {
    const fetchCoordinates = async () => {
      // Only build address if all are present and not "n/a" or empty
      const { province, city, brgy } = localRecord;
      if (
        province &&
        city &&
        brgy &&
        province.toLowerCase() !== "n/a" &&
        city.toLowerCase() !== "n/a" &&
        brgy.toLowerCase() !== "n/a"
      ) {
        const address = [brgy, city, province].join(", ");
        try {
          const response = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
              address
            )}&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`
          );
          const data = await response.json();
          if (data.results && data.results.length > 0) {
            const location = data.results[0].geometry.location;
            setLongitude(location.lng);
            setLatitude(location.lat);
            // Optionally update parent record
            handleInputChange("longitude", location.lng);
            handleInputChange("latitude", location.lat);
          } else {
            setLongitude("");
            setLatitude("");
            handleInputChange("longitude", "");
            handleInputChange("latitude", "");
          }
        } catch (error) {
          setLongitude("");
          setLatitude("");
          handleInputChange("longitude", "");
          handleInputChange("latitude", "");
        }
      } else {
        setLongitude("");
        setLatitude("");
        handleInputChange("longitude", "");
        handleInputChange("latitude", "");
      }
    };
    fetchCoordinates();
    // eslint-disable-next-line
  }, [localRecord.province, localRecord.city, localRecord.brgy]);

  const handleInputChange = (field, value) => {
    const updatedRecord = { ...localRecord, [field]: value };
    setLocalRecord(updatedRecord);
    handleChange(field, value);
  };

  const handleCheckboxChange = (field, e) => {
    const value = e.target.checked ? "✔" : "";
    handleInputChange(field, value);
  };

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={24} md={24} lg={24} className="modalcol">
          <Paragraph>
            <div className="applicable-laws-container">
              <strong className="label">Applicable Laws:</strong>
              <div className="checkboxes">
                <Checkbox
                  disabled={!isEditing}
                  checked={localRecord.survey_eia === "✔"}
                  onChange={(e) => handleCheckboxChange("survey_eia", e)}
                >
                  <strong className="label-checkbox">EIA Project Survey</strong>
                </Checkbox>
                <Checkbox
                  disabled={!isEditing}
                  checked={localRecord.survey_air === "✔"}
                  onChange={(e) => handleCheckboxChange("survey_air", e)}
                >
                  <strong className="label-checkbox">AIR</strong>
                </Checkbox>
                <Checkbox
                  disabled={!isEditing}
                  checked={localRecord.survey_water === "✔"}
                  onChange={(e) => handleCheckboxChange("survey_water", e)}
                >
                  <strong className="label-checkbox">WATER</strong>
                </Checkbox>
                <Checkbox
                  disabled={!isEditing}
                  checked={localRecord.survey_haz === "✔"}
                  onChange={(e) => handleCheckboxChange("survey_haz", e)}
                >
                  <strong className="label-checkbox">HAZ</strong>
                </Checkbox>
                <Checkbox
                  disabled={!isEditing}
                  checked={localRecord.survey_chem === "✔"}
                  onChange={(e) => handleCheckboxChange("survey_chem", e)}
                >
                  <strong className="label-checkbox">CHEMICAL</strong>
                </Checkbox>
              </div>
            </div>
          </Paragraph>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
          <Paragraph>
            <strong>Project Title</strong>
            <TextArea
              value={localRecord.project_title || ""}
              readOnly={!isEditing}
              placeholder="No data"
              rows={2}
              className="textbox-label disable-input"
              onChange={(e) =>
                handleInputChange("project_title", e.target.value)
              }
              style={{
                cursor: isEditing ? "text" : "not-allowed",
                color: isEditing ? "" : "#aaa",
              }}
            />
          </Paragraph>

          <Paragraph>
            <strong>Industry Classification</strong>
            <IndustryClass
              value={localRecord.industry_class || ""}
              readOnly={!isEditing}
              placeholder="No data"
              onChange={(value) => handleInputChange("industry_class", value)}
              isEditing={isEditing}
            />
          </Paragraph>

          <Paragraph className="paragraph-margin-top">
            <strong>Industry Type</strong>
            <Input
              value={
                projectData
                  ? projectData.project_type
                  : localRecord.project_type || ""
              }
              style={{
                cursor: isEditing ? "text" : "not-allowed",
                color: isEditing ? "" : "#aaa",
              }}
              readOnly={!isEditing}
              placeholder="No data"
              className="textbox-label disable-input"
              onChange={(e) =>
                handleInputChange("project_type", e.target.value)
              }
            />
          </Paragraph>

          <Paragraph>
            <strong>Project Sub-Type</strong>
            <Input
              value={
                projectData
                  ? projectData.project_subtype
                  : localRecord.project_subtype || ""
              }
              style={{
                cursor: isEditing ? "text" : "not-allowed",
                color: isEditing ? "" : "#aaa",
              }}
              readOnly={!isEditing}
              placeholder="No data"
              className="textbox-label disable-input"
              onChange={(e) =>
                handleInputChange("project_subtype", e.target.value)
              }
            />
          </Paragraph>

          <Paragraph>
            <strong>PSIC Code</strong>
            <Input
              value={
                projectData
                  ? projectData.psic_code
                  : localRecord.psic_code || ""
              }
              style={{
                cursor: isEditing ? "text" : "not-allowed",
                color: isEditing ? "" : "#aaa",
              }}
              readOnly={!isEditing}
              placeholder="No data"
              className="textbox-label"
              onChange={(e) => handleInputChange("pisc_code", e.target.value)}
            />
          </Paragraph>

          <Paragraph className="paragraph-margin-top">
            <strong>Other Project Type</strong>
            <Input
              value={localRecord.other_project_type || ""}
              readOnly={!isEditing}
              placeholder="No data"
              className="textbox-label disable-input"
              onChange={(e) =>
                handleInputChange("other_project_type", e.target.value)
              }
            />
          </Paragraph>
        </Col>

        <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
          <Paragraph>
            <strong>Complete Address</strong>
            <TextArea
              value={localRecord.address || ""}
              readOnly={!isEditing}
              placeholder="No data"
              rows={2}
              className="textbox-label disable-input"
              style={{
                cursor: isEditing ? "text" : "not-allowed",
                color: isEditing ? "" : "#aaa",
              }}
              onChange={(e) => handleInputChange("address", e.target.value)}
            />
          </Paragraph>

          <Paragraph>
            <strong>Street</strong>
            <Input
              value={localRecord.street || ""}
              readOnly={!isEditing}
              placeholder="No data"
              className="textbox-label disable-input"
              style={{
                cursor: isEditing ? "text" : "not-allowed",
                color: isEditing ? "" : "#aaa",
              }}
              onChange={(e) => handleInputChange("street", e.target.value)}
            />
          </Paragraph>
          <Paragraph>
            <strong>Barangay</strong>
            <Barangays
              value={localRecord.brgy || ""}
              onChange={(value) => handleInputChange("brgy", value)}
              readOnly={!isEditing}
              placeholder="No data"
              selectedProvince={localRecord.province || ""}
              selectedMunicipality={localRecord.city || ""}
            />
          </Paragraph>

          <Paragraph className="paragraph-margin-top">
            <strong>City/Municipality</strong>
            <Municipalities
              value={localRecord.city || ""}
              onChange={(value) => handleInputChange("city", value)}
              readOnly={!isEditing}
              placeholder="No data"
              selectedProvince={localRecord.province || ""}
            />
          </Paragraph>

          <Paragraph className="paragraph-margin-top">
            <strong>Province</strong>
            <Provinces
              value={localRecord.province || ""}
              onChange={(value) => handleInputChange("province", value)}
              readOnly={!isEditing}
              placeholder="No data"
            />
          </Paragraph>

          <Row gutter={[16, 16]}>
            <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
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
                      cursor: isEditing ? "text" : "not-allowed",
                      color: isEditing ? "" : "#aaa",
                    }}
                    readOnly={!isEditing}
                  />
                </ConfigProvider>
              </Paragraph>
            </Col>
            <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
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
                      cursor: isEditing ? "text" : "not-allowed",
                      color: isEditing ? "" : "#aaa",
                    }}
                    readOnly={!isEditing}
                  />
                </ConfigProvider>
              </Paragraph>
            </Col>
          </Row>
        </Col>
      </Row>
    </div>
  );
};

export default GenInfo;
