import React from "react";
import { Input, Row, Col, Typography } from "antd";
import TextArea from "antd/es/input/TextArea";
import "./geninfo.css";
import IndustryClass from "../../../components/Autocomplete/IndustryClass";
import IndustryType from "../../../components/Autocomplete/IndustryType";
import IndustrySubType from "../../../components/Autocomplete/IndustrySubType";
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
                value={editedRecord ? editedRecord.psic_code : ""}
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
          <IndustryType
            value={editedRecord ? editedRecord.industry_type : ""}
            onChange={(value) => handleChange("industry_type", value)}
            disabled={!isEditing}
            placeholder="No data"
          />
        </Paragraph>
        <Paragraph className="label-industry-type">
          <strong>Industry Sub-Type</strong>
          <IndustrySubType
            value={editedRecord ? editedRecord.industry_subtype : ""}
            onChange={(value) => handleChange("industry_subtype", value)}
            disabled={!isEditing}
            placeholder="No data"
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
            <Paragraph className="paragraph-margin">
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
