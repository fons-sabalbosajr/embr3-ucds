import React, { useEffect, useState } from "react";
import { Input, Row, Col, Typography, Checkbox } from "antd";
import TextArea from "antd/es/input/TextArea";
import IndustryClass from "../../../components/Autocomplete/IndustryClass";
import IndustryType from "../../../components/Autocomplete/IndustryType";
import IndustrySubType from "../../../components/Autocomplete/IndustrySubType";
import Provinces from "../../../components/Autocomplete/Province";
import Municipalities from "../../../components/Autocomplete/Municipalities";
import Barangays from "../../../components/Autocomplete/Barangay";
import "./geninfo.css";

const { Paragraph } = Typography;

const GenInfo = ({ editedRecord, handleChange, isEditing }) => {
  const [localRecord, setLocalRecord] = useState(editedRecord || {});

  useEffect(() => {
    setLocalRecord(editedRecord);
  }, [editedRecord]);

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
              disabled={!isEditing}
              placeholder="No data"
              rows={2}
              className="textbox-label disabled-input"
              onChange={(e) =>
                handleInputChange("project_title", e.target.value)
              }
            />
          </Paragraph>

          <Paragraph>
            <strong>Project Type</strong>
            <IndustryType
              value={localRecord.project_type || ""}
              disabled={!isEditing}
              placeholder="No data"
              onChange={(value) => handleInputChange("project_type", value)}
            />
          </Paragraph>

          <Paragraph className="paragraph-margin-top">
            <strong>Project Sub-Type</strong>
            <IndustrySubType
              value={localRecord.project_subtype || ""}
              disabled={!isEditing}
              placeholder="No data"
              onChange={(value) => handleInputChange("project_subtype", value)}
            />
          </Paragraph>

          <Paragraph className="paragraph-margin-top">
            <strong>Industry Classification</strong>
            <IndustryClass
              value={localRecord.industry_class || ""}
              disabled={!isEditing}
              placeholder="No data"
              onChange={(value) => handleInputChange("industry_class", value)}
            />
          </Paragraph>

          <Paragraph className="paragraph-margin-top">
            <strong>Other Project Type</strong>
            <Input
              value={localRecord.other_project_type || ""}
              disabled={!isEditing}
              placeholder="No data"
              className="textbox-label disabled-input"
              onChange={(e) =>
                handleInputChange("other_project_type", e.target.value)
              }
            />
          </Paragraph>

          <Paragraph>
            <strong>PSIC Code</strong>
            <Input
              value={localRecord.pisc_code || ""}
              disabled={!isEditing}
              placeholder="No data"
              className="textbox-label disabled-input"
              onChange={(e) => handleInputChange("pisc_code", e.target.value)}
            />
          </Paragraph>
        </Col>

        <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
          <Paragraph>
            <strong>Complete Address</strong>
            <TextArea
              value={localRecord.address || ""}
              disabled={!isEditing}
              placeholder="No data"
              rows={2}
              className="textbox-label disabled-input"
              onChange={(e) => handleInputChange("address", e.target.value)}
            />
          </Paragraph>

          <Paragraph>
            <strong>Street</strong>
            <Input
              value={localRecord.street || ""}
              disabled={!isEditing}
              placeholder="No data"
              className="textbox-label disabled-input"
              onChange={(e) => handleInputChange("street", e.target.value)}
            />
          </Paragraph>
          <Paragraph>
            <strong>Barangay</strong>
            <Barangays
              value={localRecord.brgy || ""}
              onChange={(value) => handleInputChange("brgy", value)}
              disabled={!isEditing}
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
              disabled={!isEditing}
              placeholder="No data"
              selectedProvince={localRecord.province || ""}
            />
          </Paragraph>

          <Paragraph className="paragraph-margin-top">
            <strong>Province</strong>
            <Provinces
              value={localRecord.province || ""}
              onChange={(value) => handleInputChange("province", value)}
              disabled={!isEditing}
              placeholder="No data"
            />
          </Paragraph>
        </Col>
      </Row>
    </div>
  );
};

export default GenInfo;
