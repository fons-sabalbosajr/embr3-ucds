import { useState, useEffect } from "react";
import axios from "axios";
import { Input, Row, Col, Typography, ConfigProvider } from "antd";
import TextArea from "antd/es/input/TextArea";
import "./geninfo.css";
import IndustryClass from "../../../components/Autocomplete/IndustryClass";
import Provinces from "../../../components/Autocomplete/Province";
import Municipalities from "../../../components/Autocomplete/Municipalities";
import Barangays from "../../../components/Autocomplete/Barangay";

const { Paragraph } = Typography;

const GenInfo = ({
  editedRecord,
  setEditedRecord,
  handleChange,
  isEditing,
  theme,
}) => {
  const [projectData, setProjectData] = useState({});

  useEffect(() => {
    const fetchProjectData = async () => {
      if (!editedRecord?.industry_class) {
        // If industry_class is blank, clear the related fields and set default values
        setProjectData({
          psic_code: "N/A",
          industry_type: "N/A",
          industry_subtype: "N/A",
        });
        handleChange("psic_code", "N/A");
        handleChange("industry_type", "N/A");
        handleChange("industry_subtype", "N/A");
        return;
      }

      // Fetch project data when industry_class is not blank
      try {
        const response = await axios.get(
          `http://localhost:8081/api/project_type?industry_class=${editedRecord.industry_class}`
        );
        if (response.data) {
          const { psic_code, project_type, project_subtype } = response.data;
          // If no valid data from the API, fallback to "N/A"
          setProjectData({
            psic_code: psic_code || "N/A",
            industry_type: project_type || "N/A",
            industry_subtype: project_subtype || "N/A",
          });

          // Update fields with fetched data, fallback to "N/A" if data is missing
          handleChange("psic_code", psic_code || "N/A");
          handleChange("industry_type", project_type || "N/A");
          handleChange("industry_subtype", project_subtype || "N/A");
        }
      } catch (error) {
        console.error("Error fetching project data:", error);
        setProjectData({
          psic_code: "N/A",
          industry_type: "N/A",
          industry_subtype: "N/A",
        });
        handleChange("psic_code", "N/A");
        handleChange("industry_type", "N/A");
        handleChange("industry_subtype", "N/A");
      }
    };

    fetchProjectData();
  }, [editedRecord?.industry_class]);

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={24} md={12} lg={12}>
          <Paragraph>
            <strong>Project Title</strong>
            <TextArea
              value={editedRecord?.title || ""}
              onChange={(e) => handleChange("title", e.target.value)}
              readOnly={!isEditing}
              placeholder="No data"
              style={{
                cursor: isEditing ? "text" : "not-allowed",
                color: isEditing ? "" : "#aaa",
              }}
            />
          </Paragraph>
          <Paragraph>
            <strong>Proponent Name</strong>
            <TextArea
              value={editedRecord?.name || ""}
              onChange={(e) => handleChange("name", e.target.value)}
              readOnly={!isEditing}
              placeholder="No data"
              style={{
                cursor: isEditing ? "text" : "not-allowed",
                color: isEditing ? "" : "#aaa",
              }}
            />
          </Paragraph>


          <Row gutter={[16, 16]}>
            <Col xs={24} sm={24} md={12} lg={12}>
              <Paragraph>
                <strong>Industry Classification</strong>
                <IndustryClass
                  value={editedRecord?.industry_class || ""}
                  onChange={(value) => {
                    handleChange("industry_class", value);
                    if (!value) {
                      handleChange("industry_type", "N/A");
                      handleChange("industry_subtype", "N/A");
                      handleChange("psic_code", "N/A");
                    }
                  }}
                  placeholder="No data"
                  style={{
                    cursor: isEditing ? "text" : "not-allowed",
                    color: isEditing ? "" : "#aaa",
                  }}
                  theme={theme}
                />
              </Paragraph>
            </Col>
            <Col xs={24} sm={24} md={12} lg={12}>
              <Paragraph>
                <strong>PSIC Code</strong>
                <Input
                  value={
                    projectData
                      ? projectData.psic_code
                      : editedRecord?.psic_code || ""
                  }
                  onChange={(e) => handleChange("psic_code", e.target.value)}
                  readOnly
                  placeholder="No data"
                  style={{
                    cursor: isEditing ? "text" : "not-allowed",
                    color: isEditing ? "" : "#aaa",
                  }}
                />
              </Paragraph>
            </Col>
          </Row>


          <Paragraph>
            <strong>Industry Type</strong>
            <Input
              value={
                projectData
                  ? projectData.industry_type
                  : editedRecord.industry_type || ""
              }
              onChange={(e) => handleChange("industry_type", e.target.value)}
              readOnly
              placeholder="No data"
              style={{
                cursor: isEditing ? "text" : "not-allowed",
                color: isEditing ? "" : "#aaa",
              }}
            />
          </Paragraph>
          
          <Paragraph className="label-industry-subtype">
            <strong>Industry Sub-Type</strong>
            <Input
              value={
                projectData
                  ? projectData.industry_subtype
                  : editedRecord?.industry_subtype || ""
              }
              onChange={(e) => handleChange("industry_subtype", e.target.value)}
              readOnly
              placeholder="No data"
              style={{
                cursor: isEditing ? "text" : "not-allowed",
                color: isEditing ? "" : "#aaa",
              }}
            />
          </Paragraph>

          <Row gutter={[16, 16]} className="row-auto">
            <Col xs={24} sm={24} md={12} lg={12}>
              <Paragraph className="label-industry-type">
                <strong>Latitude</strong>
                <Input
                  value={editedRecord?.lat || ""}
                  onChange={(e) => handleChange("lat", e.target.value)}
                  readOnly={!isEditing}
                  placeholder="No data"
                  style={{
                    cursor: isEditing ? "text" : "not-allowed",
                    color: isEditing ? "" : "#aaa",
                  }}
                />
              </Paragraph>
            </Col>
            <Col xs={24} sm={24} md={12} lg={12}>
              <Paragraph className="label-industry-type">
                <strong>Longitude</strong>
                <Input
                  value={editedRecord?.long || ""}
                  onChange={(e) => handleChange("long", e.target.value)}
                  readOnly={!isEditing}
                  placeholder="No data"
                  style={{
                    cursor: isEditing ? "text" : "not-allowed",
                    color: isEditing ? "" : "#aaa",
                  }}
                />
              </Paragraph>
            </Col>
          </Row>
        </Col>

        <Col xs={24} sm={24} md={12} lg={12}>
          <Paragraph>
            <strong>Address</strong>
            <TextArea
              value={editedRecord?.address || ""}
              onChange={(e) => handleChange("address", e.target.value)}
              readOnly={!isEditing}
              placeholder="No data"
              style={{
                cursor: isEditing ? "text" : "not-allowed",
                color: isEditing ? "" : "#aaa",
              }}
            />
          </Paragraph>
          <Paragraph>
            <strong>Street</strong>
            <TextArea
              value={editedRecord?.street || ""}
              onChange={(e) => handleChange("street", e.target.value)}
              readOnly={!isEditing}
              placeholder="No data"
              style={{
                cursor: isEditing ? "text" : "not-allowed",
                color: isEditing ? "" : "#aaa",
              }}
            />
          </Paragraph>
          <Paragraph>
            <strong>Barangay</strong>
            <Barangays
              value={editedRecord?.brgy || ""}
              onChange={(value) => handleChange("brgy", value)}
              readOnly={!isEditing}
              placeholder="No data"
              style={{
                cursor: isEditing ? "text" : "not-allowed",
                color: isEditing ? "" : "#aaa",
                
              }}
              selectedProvince={editedRecord?.province || ""}
              selectedMunicipality={editedRecord?.city || ""}
            />
          </Paragraph>
          <Paragraph className="margin-top">
            <strong>City/Municipality</strong>
            <Municipalities
              value={editedRecord?.city || ""}
              onChange={(value) => handleChange("city", value)}
              readOnly={!isEditing}
              placeholder="No data"
              style={{
                cursor: isEditing ? "text" : "not-allowed",
                color: isEditing ? "" : "#aaa",
              }}
              selectedProvince={editedRecord?.province || ""}
            />
          </Paragraph>
          <Paragraph className="margin-top">
            <strong>Province</strong>
            <Provinces
              value={editedRecord?.province || ""}
              onChange={(value) => handleChange("province", value)}
              readOnly={!isEditing}
              placeholder="No data"
              style={{
                cursor: isEditing ? "text" : "not-allowed",
                color: isEditing ? "" : "#aaa",
              }}
            />
          </Paragraph>

          <Row gutter={[16, 16]} className="row-auto">
            <Col xs={24} sm={24} md={12} lg={12}>
              <Paragraph className="paragraph-margin congress">
                <strong>Congressional District</strong>
                <Input
                  value={editedRecord?.cong_district || ""}
                  onChange={(e) =>
                    handleChange("cong_district", e.target.value)
                  }
                  readOnly={!isEditing}
                  placeholder="No data"
                  style={{
                    cursor: isEditing ? "text" : "not-allowed",
                    color: isEditing ? "" : "#aaa",
                  }}
                />
              </Paragraph>
            </Col>
          </Row>
        </Col>
      </Row>
    </div>
  );
};

export default GenInfo;
