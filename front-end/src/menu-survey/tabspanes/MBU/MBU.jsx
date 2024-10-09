import React, { useEffect, useState } from "react";
import { Form, Input, Row, Col, Typography, Card, Checkbox } from "antd";
import TextArea from "antd/es/input/TextArea";
import R3MapAutoComplete from "../../../components/R3Map";
import "./mbu.css";

const { Paragraph } = Typography;

const MBU = ({ editedRecord, handleChange, isEditing }) => {
  const [localRecord, setLocalRecord] = useState(editedRecord || {});

  useEffect(() => {
    setLocalRecord(editedRecord);
  }, [editedRecord]);

  const handleInputChange = (field, value) => {
    const updatedRecord = { ...localRecord, [field]: value };
    setLocalRecord(updatedRecord);
    handleChange(field, value);
  };

  return (
    <Form
      layout="vertical"
      initialValues={localRecord}
      onValuesChange={(changedValues) => {
        const field = Object.keys(changedValues)[0];
        const value = Object.values(changedValues)[0];
        handleInputChange(field, value);
      }}
    >
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
          <Row gutter={[16, 16]}>
            <Col span={23}>
              <R3MapAutoComplete
                latitude={localRecord ? localRecord.lat : ""}
                longitude={localRecord ? localRecord.long : ""}
              />
            </Col>
          </Row>
        </Col>
        <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
          <Col xs={24} sm={24} md={12} lg={12} className="modal-col">
            <Paragraph>
              <strong>Latitude:</strong>

              <Input
                value={localRecord.lat || ""}
                disabled={!isEditing}
                placeholder="No data"
                className="textbox-label disabled-input"
                onChange={(e) => handleInputChange("lat", e.target.value)}
              />
            </Paragraph>
            <Paragraph>
              <strong>Longitude:</strong>

              <Input
                value={localRecord.long || ""}
                disabled={!isEditing}
                placeholder="No data"
                className="textbox-label disabled-input"
                onChange={(e) => handleInputChange("long", e.target.value)}
              />
            </Paragraph>
            <Paragraph>
              <strong>Congressional District</strong>

              <Input
                value={localRecord.cong_district || ""}
                disabled={!isEditing}
                placeholder="No data"
                className="textbox-label disabled-input"
                onChange={(e) =>
                  handleInputChange("cong_district", e.target.value)
                }
              />
            </Paragraph>
          </Col>
          <Col xs={24} sm={24} md={24} lg={24} className="modal-col">
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
          </Col>
          <Col xs={24} sm={24} md={24} lg={24} className="modal-col-waterbody">
            <Paragraph>
              <strong>Receiving Waterbody/River System</strong>
              <Input
                value={localRecord.waterbody || ""}
                disabled={!isEditing}
                placeholder="No data"
                className="textbox-label disabled-input"
                onChange={(e) => handleInputChange("waterbody", e.target.value)}
              />
            </Paragraph>
          </Col>
        </Col>
      </Row>
    </Form>
  );
};

export default MBU;
