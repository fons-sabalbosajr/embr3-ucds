import React from "react";
import { Input, Select, Tabs, Row, Col, Checkbox, Typography } from "antd";
import TextArea from "antd/es/input/TextArea";
import styled from "styled-components";
import "./mbu.css";
import R3MapAutoComplete from "../../../components/R3Map";

const { Option } = Select;
const { TabPane } = Tabs;
const { Paragraph } = Typography;
const BoldTab = styled.span`
  font-weight: 600;
  font-size: 16px;
`;

const MBUnit = ({ editedRecord, handleChange, isEditing }) => {
  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
          <Row gutter={[16, 16]}>
            <Col span={23}>
              {/* Embed Google Maps with the fetched coordinates */}
              <R3MapAutoComplete
                latitude={editedRecord ? editedRecord.lat : ""}
                longitude={editedRecord ? editedRecord.long : ""}
              />
            </Col>
          </Row>
        </Col>
        <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
          <Col xs={24} sm={24} md={12} lg={12} className="modal-col">
            <Paragraph>
              <strong>Latitude</strong>
              <Input
                value={editedRecord ? editedRecord.lat : ""}
                onChange={(e) => handleChange("lat", e.target.value)}
                readOnly={!isEditing}
                placeholder="no data"
                style={{
                  cursor: isEditing ? "text" : "not-allowed",
                  color: isEditing ? "" : "#aaa",
                }}
                rows={2}
              />
            </Paragraph>
          </Col>
          <Col xs={24} sm={24} md={12} lg={12} className="modal-col">
            <Paragraph>
              <strong>Longitude</strong>
              <Input
                value={editedRecord ? editedRecord.long : ""}
                onChange={(e) => handleChange("long", e.target.value)}
                readOnly={!isEditing}
                placeholder="no data"
                style={{
                  cursor: isEditing ? "text" : "not-allowed",
                  color: isEditing ? "" : "#aaa",
                }}
                rows={2}
              />
            </Paragraph>
          </Col>
          <Col xs={24} sm={24} md={24} lg={24} className="modal-col">
            <Paragraph>
              <strong>Complete Address</strong>
              <TextArea
                value={editedRecord ? editedRecord.address : ""}
                onChange={(e) => handleChange("address", e.target.value)}
                readOnly={!isEditing}
                placeholder="no data"
                style={{
                  cursor: isEditing ? "text" : "not-allowed",
                  color: isEditing ? "" : "#aaa",
                }}
                rows={2}
              />
            </Paragraph>
          </Col>
          <Col xs={24} sm={24} md={24} lg={24} className="modal-col">
            <Paragraph>
              <strong>Receiving Waterbody/River System</strong>
              <Input
                value={editedRecord ? editedRecord.waterbody : ""}
                onChange={(e) => handleChange("waterbody", e.target.value)}
                readOnly={!isEditing}
                placeholder="no data"
                style={{
                  cursor: isEditing ? "text" : "not-allowed",
                  color: isEditing ? "" : "#aaa",
                }}
                rows={2}
              />
            </Paragraph>
          </Col>
          <Col xs={24} sm={24} md={24} lg={24} className="modal-col">
            <Paragraph>
              <Checkbox
                checked={editedRecord?.mbu_area === "✔"}
                disabled={!isEditing}
                onChange={(e) =>
                  handleChange("mbu_area", e.target.checked ? "✔" : "")
                }
                style={{ fontSize: "15px" }}
              >
                {editedRecord?.mbu_area === "✔" ? "" : ""}
              </Checkbox>
              <strong>Within Manila Bay Area</strong> <br />
            </Paragraph>
          </Col>
          <Col xs={24} sm={24} md={24} lg={24} className="modal-col">
            <Paragraph>
              <Checkbox
                checked={editedRecord?.mbu_priority === "✔"}
                disabled={!isEditing}
                onChange={(e) =>
                  handleChange("mbu_priority", e.target.checked ? "✔" : "")
                }
                style={{ fontSize: "15px" }}
              >
                {editedRecord?.mbu_priority === "✔" ? "" : ""}
              </Checkbox>
              <strong>For Request: Priority Industry</strong>
            </Paragraph>
          </Col>
          <Col xs={24} sm={24} md={24} lg={24} className="modal-col">
            <Paragraph>
              <Checkbox
                checked={editedRecord?.mbu_survey === "✔"}
                disabled={!isEditing}
                onChange={(e) =>
                  handleChange("mbu_survey", e.target.checked ? "✔" : "")
                }
                style={{ fontSize: "15px" }}
              >
                {editedRecord?.mbu_survey === "✔" ? "" : ""}
              </Checkbox>
              <strong>MBU Survey</strong>
            </Paragraph>
          </Col>
          <Col xs={24} sm={24} md={24} lg={24} className="modal-col">
            <Paragraph>
              <Checkbox
                checked={editedRecord?.mbu_survey_request === "✔"}
                disabled={!isEditing}
                onChange={(e) =>
                  handleChange(
                    "mbu_survey_request",
                    e.target.checked ? "✔" : ""
                  )
                }
                style={{ fontSize: "15px" }}
              >
                {editedRecord?.mbu_survey_request === "✔" ? "" : ""}
              </Checkbox>
              <strong>For Request: Survey</strong>
            </Paragraph>
          </Col>
          <Col xs={24} sm={24} md={24} lg={24} className="modal-col">
            <Paragraph>
              <Checkbox
                checked={editedRecord?.dp_universe === "✔"}
                disabled={!isEditing}
                onChange={(e) =>
                  handleChange("dp_universe", e.target.checked ? "✔" : "")
                }
                style={{ fontSize: "15px" }}
              >
                {editedRecord?.dp_universe === "✔" ? "" : ""}
              </Checkbox>
              <strong>For DP Universe</strong>
            </Paragraph>
          </Col>
        </Col>
      </Row>
    </div>
  );
};

export default MBUnit;
