import { useState, useEffect } from "react";
import axios from "axios";
import { Input, Row, Col, Typography } from "antd";
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
    <Row gutter={[16, 16]}>
      <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
        <Paragraph>
          <strong>Project Title</strong>
          <TextArea
            value={editedRecord ? editedRecord.title : ""}
            onChange={(e) => handleChange("title", e.target.value)}
            disabled={!isEditing}
            placeholder="No data"
            className="textbox-label disabled-input"
          />
        </Paragraph>
        <Paragraph>
          <strong>Proponent Name</strong>
          <TextArea
            value={editedRecord ? editedRecord.name : ""}
            onChange={(e) => handleChange("name", e.target.value)}
            disabled={!isEditing}
            placeholder="No data"
            className="textbox-label"
          />
        </Paragraph>

        <Row gutter={[16, 16]} className="row-auto">
          <Col xs={24} sm={24} md={12} lg={12}>
            <Paragraph>
              <strong>Industry Classification</strong>
              <IndustryClass
                value={editedRecord ? editedRecord.industry_class : ""}
                onChange={(value) => handleChange("industry_class", value)}
                disabled={!isEditing}
                placeholder="No data"
              />
            </Paragraph>
          </Col>
          <Col xs={24} sm={24} md={12} lg={12} className="modal-col">
            <Paragraph>
              <strong>PSIC Code</strong>
              <Input
                value={
                  projectData
                    ? projectData.psic_code
                    : editedRecord.psic_code || ""
                }
                onChange={(e) => handleChange("psic_code", e.target.value)}
                disabled={!isEditing}
                placeholder="No data"
                className="textbox-label"
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
            disabled={!isEditing}
            placeholder="No data"
            className="textbox-label"
          />
        </Paragraph>
        <Paragraph className="label-industry-type">
          <strong>Industry Sub-Type</strong>
          <Input
            value={
              projectData
                ? projectData.industry_subtype
                : editedRecord.industry_subtype || ""
            }
            onChange={(e) => handleChange("industry_subtype", e.target.value)}
            disabled={!isEditing}
            placeholder="No data"
            className="textbox-label"
          />
        </Paragraph>

        <Row gutter={[16, 16]} className="row-auto">
          <Col xs={24} sm={24} md={12} lg={12}>
            <Paragraph className="label-industry-type">
              <strong>Latitude</strong>
              <Input
                value={editedRecord ? editedRecord.lat : ""}
                onChange={(e) => handleChange("lat", e.target.value)}
                disabled={!isEditing}
                placeholder="No data"
                className="textbox-label"
              />
            </Paragraph>
          </Col>
          <Col xs={24} sm={24} md={12} lg={12} className="modal-col">
            <Paragraph className="label-industry-type">
              <strong>Longitude</strong>
              <Input
                value={editedRecord ? editedRecord.long : ""}
                onChange={(e) => handleChange("long", e.target.value)}
                disabled={!isEditing}
                placeholder="No data"
                className="textbox-label"
              />
            </Paragraph>
          </Col>
        </Row>
      </Col>

      <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
        <Paragraph>
          <strong>Address</strong>
          <TextArea
            value={editedRecord ? editedRecord.address : ""}
            onChange={(e) => handleChange("address", e.target.value)}
            disabled={!isEditing}
            placeholder="No data"
            className="textbox-label"
          />
        </Paragraph>
        <Paragraph>
          <strong>Street</strong>
          <TextArea
            value={editedRecord ? editedRecord.street : ""}
            onChange={(e) => handleChange("street", e.target.value)}
            disabled={!isEditing}
            placeholder="No data"
            className="textbox-label"
          />
        </Paragraph>
        <Paragraph>
          <strong>Barangay</strong>
          <Barangays
            value={editedRecord ? editedRecord.brgy : ""}
            onChange={(value) => handleChange("brgy", value)}
            disabled={!isEditing}
            placeholder="No data"
            selectedProvince={editedRecord ? editedRecord.province : ""}
            selectedMunicipality={editedRecord ? editedRecord.city : ""}
          />
        </Paragraph>
        <Paragraph className="paragraph-margin">
          <strong>City/Municipality</strong>
          <Municipalities
            value={editedRecord ? editedRecord.city : ""}
            onChange={(value) => handleChange("city", value)}
            disabled={!isEditing}
            placeholder="No data"
            selectedProvince={editedRecord ? editedRecord.province : ""}
          />
        </Paragraph>
        <Paragraph className="paragraph-margin">
          <strong>Province</strong>
          <Provinces
            value={editedRecord ? editedRecord.province : ""}
            onChange={(value) => handleChange("province", value)}
            disabled={!isEditing}
            placeholder="No data"
          />
        </Paragraph>

        <Row gutter={[16, 16]} className="row-auto">
          <Col xs={24} sm={24} md={12} lg={12} className="modal-col">
            <Paragraph className="paragraph-margin congress">
              <strong>Congressional District</strong>
              <Input
                value={editedRecord ? editedRecord.cong_district : ""}
                onChange={(e) => handleChange("cong_district", e.target.value)}
                disabled={!isEditing}
                placeholder="No data"
                className="textbox-label"
              />
            </Paragraph>
          </Col>
        </Row>
      </Col>
    </Row>
  );
};

export default GenInfo;
