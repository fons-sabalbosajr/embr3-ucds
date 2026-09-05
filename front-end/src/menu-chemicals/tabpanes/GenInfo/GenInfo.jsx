import { useState, useEffect } from "react";
import { Input, Row, Col, Typography } from "antd";
import TextArea from "antd/es/input/TextArea";
import IndustryClass from "../../../components/Autocomplete/IndustryClass";
import Provinces from "../../../components/Autocomplete/Province";
import Municipalities from "../../../components/Autocomplete/Municipalities";
import Barangays from "../../../components/Autocomplete/Barangay";
import "./geninfo.css";
import { API_BASE_URL } from "../../../config/api";

const { Paragraph } = Typography;

const GenInfo = ({ record, isEditing, handleChange }) => {
  const [projectData, setProjectData] = useState({});

  useEffect(() => {
    const fetchProjectData = async () => {
      if (!record?.industry_class) {
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
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/project_type?industry_class=${record.industry_class}`
        );
        const data = await response.json();
        setProjectData({
          psic_code: data.psic_code || "N/A",
          industry_type: data.project_type || "N/A",
          industry_subtype: data.project_subtype || "N/A",
        });
        handleChange("psic_code", data.psic_code || "N/A");
        handleChange("industry_type", data.project_type || "N/A");
        handleChange("industry_subtype", data.project_subtype || "N/A");
      } catch (error) {
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
    // eslint-disable-next-line
  }, [record?.industry_class]);

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
        <Paragraph>
          <strong>Project Title</strong>
          <TextArea
            value={record?.title || ""}
            onChange={(e) => handleChange("title", e.target.value)}
            readOnly={!isEditing}
            placeholder="No data"
          />
        </Paragraph>
        <Paragraph>
          <strong>Proponent Name</strong>
          <TextArea
            value={record?.name || ""}
            onChange={(e) => handleChange("name", e.target.value)}
            readOnly={!isEditing}
            placeholder="No data"
          />
        </Paragraph>
        <Row gutter={[16, 16]} className="row-auto">
          <Col xs={24} sm={24} md={24} lg={24}>
            <Paragraph>
              <strong>Industry Classification</strong>
              <IndustryClass
                value={record?.industry_class || ""}
                onChange={(value) => handleChange("industry_class", value)}
                readOnly={!isEditing}
                placeholder="No data"
              />
            </Paragraph>
          </Col>
          
        </Row>

        <Row gutter={[16, 16]} className="row-psic">
          <Col xs={24} sm={24} md={12} lg={12}>
            <Paragraph>
              <strong>PSIC Code</strong>
              <Input
                value={projectData.psic_code || ""}
                readOnly
                placeholder="No data"
              />
            </Paragraph>
          </Col>
         <Col xs={24} sm={24} md={12} lg={12} className="modal-col">
          <Paragraph>
          <strong>Industry Type</strong>
          <Input
            value={record?.industry_type || ""}
            onChange={(e) => handleChange("industry_type", e.target.value)}
            readOnly={!isEditing}
            placeholder="No data"
          />
        </Paragraph></Col>
        </Row>
       
        <Paragraph className="industry-subtype">
          <strong>Industry Sub-Type</strong>
          <Input
            value={record?.industry_subtype || ""}
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
                value={record?.lat || ""}
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
                value={record?.long || ""}
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
            value={record?.address || ""}
            onChange={(e) => handleChange("address", e.target.value)}
            readOnly={!isEditing}
            placeholder="No data"
          />
        </Paragraph>
        <Paragraph>
          <strong>Street</strong>
          <TextArea
            value={record?.street || ""}
            onChange={(e) => handleChange("street", e.target.value)}
            readOnly={!isEditing}
            placeholder="No data"
          />
        </Paragraph>
        <Paragraph>
          <strong>Barangay</strong>
          <Barangays
            value={record?.brgy || ""}
            onChange={(value) => handleChange("brgy", value)}
            readOnly={!isEditing}
            placeholder="No data"
            selectedProvince={record?.province || ""}
            selectedMunicipality={record?.city || ""}
          />
        </Paragraph>
        <Paragraph className="modal-paragraph">
          <strong>City/Municipality</strong>
          <Municipalities
            value={record?.city || ""}
            onChange={(value) => handleChange("city", value)}
            readOnly={!isEditing}
            placeholder="No data"
            selectedProvince={record?.province || ""}
          />
        </Paragraph>
        <Paragraph className="modal-paragraph">
          <strong>Province</strong>
          <Provinces
            value={record?.province || ""}
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
                value={record?.cong_district || ""}
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