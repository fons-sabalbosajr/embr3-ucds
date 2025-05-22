import { React, useState, useEffect } from "react";
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
  const [lat, setLat] = useState(editedRecord?.lat || "");
  const [long, setLong] = useState(editedRecord?.long || "");

  useEffect(() => {
    const fetchCoordinates = async () => {
      const { province, city, brgy } = editedRecord || {};
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
            setLong(location.lng);
            setLat(location.lat);
            handleChange("long", location.lng);
            handleChange("lat", location.lat);
          }
        } catch (error) {
          // If error, do not update
        }
      }
    };
    fetchCoordinates();
    // Only run when address fields change
    // eslint-disable-next-line
  }, [editedRecord?.province, editedRecord?.city, editedRecord?.brgy]);

  // Keep local state in sync with editedRecord changes (manual edit)
  useEffect(() => {
    setLat(editedRecord?.lat || "");
    setLong(editedRecord?.long || "");
  }, [editedRecord?.lat, editedRecord?.long]);

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
          <Row gutter={[16, 16]}>
            <Col span={23}>
              {/* Embed Google Maps with the fetched coordinates */}
              <R3MapAutoComplete latitude={lat} longitude={long} />
            </Col>
          </Row>
        </Col>
        <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
          <Col xs={24} sm={24} md={12} lg={12} className="modal-col">
            <Paragraph>
              <strong>Latitude</strong>
              <Input
                value={lat}
                onChange={(e) => {
                  setLat(e.target.value);
                  handleChange("lat", e.target.value);
                }}
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
                value={long}
                onChange={(e) => {
                  setLong(e.target.value);
                  handleChange("long", e.target.value);
                }}
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
