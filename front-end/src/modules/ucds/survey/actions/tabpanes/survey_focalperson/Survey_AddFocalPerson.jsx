import React, { useState } from "react";
import {
  Form,
  Input,
  Row,
  Col,
  Typography,
  Card,
  Checkbox,
  DatePicker,
} from "antd";
import TextArea from "antd/es/input/TextArea";
import SectionInCharge from "../../../../../../components/Autocomplete/SectionInCharge";
import Inspectors from "../../../../../../components/Autocomplete/Inspectors";
import "./survey_focalperson.css";

const { Paragraph } = Typography;

const Survey_AddFocalPerson = ({ onChange, isEditing = true }) => {
  const [localRecord, setLocalRecord] = useState({
    employee_no: "",
    bod: "",
    resp_unit: "",
    handler: "",
    iis_no: "",
    date_surveyed: null,
    date_routed: null,
    date_signed: null,
    total_days: "",
    track_report_unit: "",
    track_report_planning: "",
    remarks: "",
  });

  const handleInputChange = (field, value) => {
    const updatedRecord = { ...localRecord, [field]: value };
    setLocalRecord(updatedRecord);
    if (onChange) onChange(field, value);
  };

  const handleCheckboxChange = (field, e) => {
    const value = e.target.checked ? "✔" : "";
    handleInputChange(field, value);
  };

  return (
    <Form
      layout="vertical"
      initialValues={localRecord}
      onValuesChange={(changedValues) =>
        handleInputChange(
          Object.keys(changedValues)[0],
          Object.values(changedValues)[0]
        )
      }
    >
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={24} md={8} lg={8} className="modalcol">
          <Paragraph>
            <strong>Total No. of Employees</strong>
            <Input
              value={localRecord.employee_no}
              readOnly={!isEditing}
              placeholder="No data"
              onChange={(e) => handleInputChange("employee_no", e.target.value)}
              className="textbox-label"
            />
          </Paragraph>

          <Paragraph>
            <strong>Bio-Oxygen Demand (kg/day)</strong>
            <Input
              value={localRecord.bod}
              readOnly={!isEditing}
              placeholder="No data"
              onChange={(e) => handleInputChange("bod", e.target.value)}
              className="textbox-label"
            />
          </Paragraph>

          <Paragraph>
            <strong>Responsible Unit</strong>
            <SectionInCharge
              value={localRecord.resp_unit}
              disabled={!isEditing}
              placeholder="No data"
              onChange={(value) => handleInputChange("resp_unit", value)}
            />
          </Paragraph>

          <Paragraph>
            <strong>Handler</strong>
            <Inspectors
              value={localRecord.handler}
              disabled={!isEditing}
              placeholder="No data"
              onChange={(value) => handleInputChange("handler", value)}
            />
          </Paragraph>
        </Col>

        <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
          <Paragraph>
            <strong>IIS Reference No.</strong>
            <Input
              value={localRecord.iis_no}
              onChange={(e) => handleInputChange("iis_no", e.target.value)}
              readOnly={!isEditing}
              placeholder="No data"
              className="textbox-label"
            />
          </Paragraph>

          <Row gutter={[16, 16]}>
            <Col xs={24} sm={24} md={8} lg={8} className="modalcol">
              <Paragraph>
                <strong>Date Surveyed</strong>
                <DatePicker
                  value={localRecord.date_surveyed}
                  onChange={(date) => {
                    const newDate = date ? date.format("MM/DD/YYYY") : null;
                    handleInputChange("date_surveyed", newDate);
                  }}
                  disabled={!isEditing}
                  format="MM/DD/YYYY"
                  placeholder="MM/DD/YYYY"
                  className="custom-date-picker"
                  style={{ width: "100%" }}
                />
              </Paragraph>
            </Col>

            <Col xs={24} sm={24} md={8} lg={8} className="modalcol">
              <Paragraph>
                <strong>Date Routed</strong>
                <DatePicker
                  value={localRecord.date_routed}
                  onChange={(date) => {
                    const newDate = date ? date.format("MM/DD/YYYY") : null;
                    handleInputChange("date_routed", newDate);
                  }}
                  disabled={!isEditing}
                  format="MM/DD/YYYY"
                  placeholder="MM/DD/YYYY"
                  className="custom-date-picker"
                  style={{ width: "100%" }}
                />
              </Paragraph>
            </Col>

            <Col xs={24} sm={24} md={8} lg={8} className="modalcol">
              <Paragraph>
                <strong>Date Monitored</strong>
                <DatePicker
                  value={localRecord.date_signed}
                  onChange={(date) => {
                    const newDate = date ? date.format("MM/DD/YYYY") : null;
                    handleInputChange("date_signed", newDate);
                  }}
                  disabled={!isEditing}
                  format="MM/DD/YYYY"
                  placeholder="MM/DD/YYYY"
                  className="custom-date-picker"
                  style={{ width: "100%" }}
                />
              </Paragraph>
            </Col>
          </Row>

          <Card style={{ width: 600, marginBottom: 50 }} size="small">
            <strong>PLANNING UNIT</strong>

            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
                <Paragraph>
                  <span className="label_container">
                    <strong className="label_title">Total No. of Days:</strong>
                    <p className="label">(Date Monitored vs. Date Submitted)</p>
                  </span>
                  <Input
                    value={localRecord.total_days}
                    onChange={(e) =>
                      handleInputChange("total_days", e.target.value)
                    }
                    readOnly
                    placeholder="No data"
                    className="textbox-label"
                  />
                </Paragraph>
              </Col>
            </Row>

            <Paragraph>
              <Checkbox
                disabled={!isEditing}
                checked={localRecord.track_report_unit === "✔"}
                onChange={(e) => handleCheckboxChange("track_report_unit", e)}
              >
                <strong className="label-title">
                  Tracking of Reports (Routed to Assigned Section/Unit)
                </strong>
              </Checkbox>
            </Paragraph>

            <Paragraph>
              <Checkbox
                disabled={!isEditing}
                checked={localRecord.track_report_planning === "✔"}
                onChange={(e) =>
                  handleCheckboxChange("track_report_planning", e)
                }
              >
                <strong className="label-title">
                  Tracking of Reports (Received by Planning Unit)
                </strong>
              </Checkbox>
            </Paragraph>

            <Paragraph>
              <strong>Remarks/Recommendations</strong>
              <TextArea
                value={localRecord.remarks}
                readOnly={!isEditing}
                placeholder="No data"
                rows={4}
                onChange={(e) =>
                  handleInputChange("remarks", e.target.value)
                }
                className="textbox-label"
              />
            </Paragraph>
          </Card>
        </Col>
      </Row>
    </Form>
  );
};

export default Survey_AddFocalPerson;