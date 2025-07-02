import { useState, useEffect } from "react";
import axios from "axios";
import { Input, Row, Col, Typography } from "antd";
import TextArea from "antd/es/input/TextArea";
import IndustryClass from "../../../components/Autocomplete/IndustryClass";
import Provinces from "../../../components/Autocomplete/Province";
import Municipalities from "../../../components/Autocomplete/Municipalities";
import Barangays from "../../../components/Autocomplete/Barangay";
import "./geninfo.css"; // Assuming styles are in this file

const { Paragraph } = Typography;

const GenInfo = ({ record, isEditing, handleChange }) => {
  const [projectData, setProjectData] = useState({});

  useEffect(() => {
    const fetchProjectData = async () => {
      if (!record?.industry_class) {
        // If industry_class is blank, set default values
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

      // Fetch project data based on the selected industry_class
      try {
        const response = await axios.get(
          `http://10.14.77.107:8081/api/project_type?industry_class=${record.industry_class}`
        );
        if (response.data) {
          const { psic_code, project_type, project_subtype } = response.data;
          // If data from the API is valid, update the fields
          setProjectData({
            psic_code: psic_code || "N/A",
            industry_type: project_type || "N/A",
            industry_subtype: project_subtype || "N/A",
          });

          // Update form fields with the fetched data
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
  }, [record?.industry_class, handleChange]);

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
        <Paragraph>
          <strong>Project Title</strong>
          <TextArea
            value={record ? record.title : ""}
            onChange={(e) => handleChange("title", e.target.value)}
            readOnly={!isEditing}
            placeholder="No data"

          />
        </Paragraph>
        <Paragraph>
          <strong>Proponent Name</strong>
          <TextArea
            value={record ? record.name : ""}
            onChange={(e) => handleChange("name", e.target.value)}
            readOnly={!isEditing}
            placeholder="No data"
            
          />
        </Paragraph>

        <Row gutter={[16, 16]} className="row-auto">
          <Col xs={24} sm={24} md={12} lg={12}>
            <Paragraph>
              <strong>Industry Classification</strong>
              <IndustryClass
                value={record ? record.industry_class : ""}
                onChange={(value) => handleChange("industry_class", value)}
                readOnly={!isEditing}
                placeholder="No data"
              />
            </Paragraph>
          </Col>
          <Col xs={24} sm={24} md={12} lg={12} className="modal-col">
            <Paragraph>
              <strong>PSIC Code</strong>
              <Input
                value={record ? record.psic_code : ""}
                onChange={(e) => handleChange("psic_code", e.target.value)}
                readOnly={!isEditing}
                placeholder="No data"
              />
            </Paragraph>
          </Col>
        </Row>

        <Paragraph>
          <strong>Industry Type</strong>
          <Input
            value={record ? record.industry_type : ""}
            onChange={(e) => handleChange("industry_type", e.target.value)}
            readOnly={!isEditing}
            placeholder="No data"
           
          />
        </Paragraph>

        <Paragraph>
          <strong>Industry Sub-Type</strong>
          <Input
            value={record ? record.industry_subtype : ""}
            onChange={(e) => handleChange("industry_subtype", e.target.value)}
            readOnly={!isEditing}
            placeholder="No data"
           
          />
        </Paragraph>

        <Row gutter={[16, 16]} className="row-auto">
          <Col xs={24} sm={24} md={12} lg={12}>
            <Paragraph>
              <strong>Latitude</strong>
              <Input
                value={record ? record.lat : ""}
                onChange={(e) => handleChange("lat", e.target.value)}
                readOnly={!isEditing}
                placeholder="No data"
                
              />
            </Paragraph>
          </Col>
          <Col xs={24} sm={24} md={12} lg={12} className="modal-col">
            <Paragraph>
              <strong>Longitude</strong>
              <Input
                value={record ? record.long : ""}
                onChange={(e) => handleChange("long", e.target.value)}
                readOnly={!isEditing}
                placeholder="No data"
               
              />
            </Paragraph>
          </Col>
        </Row>
      </Col>

      <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
        <Paragraph>
          <strong>Address</strong>
          <TextArea
            value={record ? record.address : ""}
            onChange={(e) => handleChange("address", e.target.value)}
            readOnly={!isEditing}
            placeholder="No data"
           
          />
        </Paragraph>
        <Paragraph>
          <strong>Street</strong>
          <TextArea
            value={record ? record.street : ""}
            onChange={(e) => handleChange("street", e.target.value)}
            readOnly={!isEditing}
            placeholder="No data"
            
          />
        </Paragraph>
        <Paragraph>
          <strong>Barangay</strong>
          <Barangays
            value={record ? record.brgy : ""}
            onChange={(value) => handleChange("brgy", value)}
            readOnly={!isEditing}
            placeholder="No data"
            selectedProvince={record ? record.province : ""}
            selectedMunicipality={record ? record.city : ""}
          />
        </Paragraph>

        <Paragraph className="modal-paragraph">
          <strong>City/Municipality</strong>
          <Municipalities
            value={record ? record.city : ""}
            onChange={(value) => handleChange("city", value)}
            readOnly={!isEditing}
            placeholder="No data"
            selectedProvince={record ? record.province : ""}
          />
        </Paragraph>

        <Paragraph className="modal-paragraph">
          <strong>Province</strong>
          <Provinces
            value={record ? record.province : ""}
            onChange={(value) => handleChange("province", value)}
            readOnly={!isEditing}
            placeholder="No data"
          />
        </Paragraph>

        <Row gutter={[16, 16]} className="row-auto">
          <Col xs={24} sm={24} md={12} lg={12} className="modal-col">
            <Paragraph className="modal-paragraph">
              <strong>Congressional District</strong>
              <Input
                value={record ? record.cong_district : ""}
                onChange={(e) => handleChange("cong_district", e.target.value)}
                readOnly={!isEditing}
                placeholder="No data"
                
              />
            </Paragraph>
          </Col>
        </Row>
      </Col>
    </Row>
  );
};

export default GenInfo;
