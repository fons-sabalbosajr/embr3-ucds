import React, { useEffect } from "react";
import { Form, Input, Row, Col, Typography, Card, Checkbox } from "antd";
import TextArea from "antd/es/input/TextArea";
import SectionInCharge from "../../../components/Autocomplete/SectionInCharge";
import Inspectors from "../../../components/Autocomplete/Inspectors";
import moment from "moment";
import dayjs from "dayjs";
import "./focalperson.css";

const { Paragraph } = Typography;
const FocalPerson = ({ record, isEditing, onUpdate }) => {
  const [form] = Form.useForm();

// Convert "✔" to boolean true/false
const convertRecordValues = (data) => {
  return {
    ...data,
    track_report_unit: data.track_report_unit === "✔",
    track_report_planning: data.track_report_planning === "✔",
  };
};

// Convert boolean true/false back to "✔" or empty string
const revertRecordValues = (data) => {
  return {
    ...data,
    track_report_unit: data.track_report_unit ? "✔" : "",
    track_report_planning: data.track_report_planning ? "✔" : "",
  };
};


useEffect(() => {
  if (record) {
    const convertedRecord = convertRecordValues(record);
    form.setFieldsValue(convertedRecord); // Update form values with new record
  } else {
    form.resetFields(); // Clear fields if no record
  }
}, [record, form]); // Ensure form is reset when record changes

const handleChange = (changedValues) => {
  const updatedRecord = { ...form.getFieldsValue(), ...changedValues };
  onUpdate(revertRecordValues(updatedRecord));
};

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={record}
      onValuesChange={(changedValues) => handleChange(changedValues)}
    >
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={24} md={8} lg={8} className="modalcol">
          <Paragraph>
            <strong>Total No. of Employees</strong>
            <Form.Item name="employee_no" noStyle>
              <Input disabled={!isEditing} placeholder="No data" />
            </Form.Item>
          </Paragraph>
          <Paragraph>
            <strong>Bio-Oxygen Demand (kg/day)</strong>
            <Form.Item name="bod" noStyle>
              <Input disabled={!isEditing} placeholder="No data" />
            </Form.Item>
          </Paragraph>
          <Paragraph>
            <strong>Responsible Unit</strong>
            <Form.Item name="resp_unit" noStyle>
              <SectionInCharge disabled={!isEditing} placeholder="No data" />
            </Form.Item>
          </Paragraph>
          <Paragraph>
            <strong>Handler</strong>
            <Form.Item name="handler" noStyle>
              <Inspectors disabled={!isEditing} placeholder="No data" />
            </Form.Item>
          </Paragraph>
        </Col>
        <Col xs={24} sm={24} md={2} lg={2} className="modalcol"></Col>

        <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={24} md={8} lg={8} className="modalcol">
              <Paragraph>
                <strong>Date Surveyed</strong>
                <Form.Item name="date_surveyed" noStyle>
                  <Input disabled={!isEditing} placeholder="No data" />
                </Form.Item>
              </Paragraph>
            </Col>

            <Col xs={24} sm={24} md={8} lg={8} className="modalcol">
              <Paragraph>
                <strong>Date Routed</strong>
                <Form.Item name="date_routed" noStyle>
                  <Input disabled={!isEditing} placeholder="No data" />
                </Form.Item>
              </Paragraph>
            </Col>

            <Col xs={24} sm={24} md={8} lg={8} className="modalcol">
              <Paragraph>
                <strong>Date Monitored</strong>
                <Form.Item name="date_signed" noStyle>
                  <Input disabled={!isEditing} placeholder="No data" />
                </Form.Item>
              </Paragraph>
            </Col>
          </Row>

          <Card
            style={{
              width: 600,
              marginBottom: 50,
            }}
            size="small"
          >
            <strong>PLANNING UNIT</strong>

            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
                <Paragraph>
                  <span className="label_container">
                    <strong className="label_title">Total No. of Days:</strong>
                    <p className="label">(Date surveyed VS Date submitted)</p>
                  </span>
                  <Form.Item name="total_days" noStyle>
                    <Input disabled={!isEditing} placeholder="No data" />
                  </Form.Item>
                </Paragraph>
              </Col>
            </Row>

            <Paragraph>
              <div className="planning-unit-container">
                <Form.Item
                  name="track_report_unit"
                  valuePropName="checked"
                  noStyle
                >
                  <Checkbox disabled={!isEditing}>
                    <strong>
                      Tracking of Reports (Routed to Assigned Section/Unit)
                    </strong>
                  </Checkbox>
                </Form.Item>
              </div>
            </Paragraph>
            <Paragraph>
              <div className="planning-unit-container">
                <Form.Item
                  name="track_report_planning"
                  valuePropName="checked"
                  noStyle
                >
                  <Checkbox disabled={!isEditing}>
                    <strong>
                      Tracking of Reports (Received by Planning Unit)
                    </strong>
                  </Checkbox>
                </Form.Item>
              </div>
            </Paragraph>

            <Paragraph>
              <strong>Remarks/Recommendations</strong>
              <Form.Item name="remarks" noStyle>
                <TextArea
                  disabled={!isEditing}
                  placeholder="No data"
                  rows={4}
                />
              </Form.Item>
            </Paragraph>
          </Card>
        </Col>
      </Row>
    </Form>
  );
};

export default FocalPerson;
