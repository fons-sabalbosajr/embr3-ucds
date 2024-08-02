import React, { useEffect } from "react";
import { Form, Input, Row, Col, Typography, Checkbox } from "antd";
import TextArea from "antd/es/input/TextArea";
import IndustryClass from "../../../components/IndustryClass"; // Adjust the import path as needed
import IndustryType from "../../../components/IndustryType"; // Adjust the import path as needed
import IndustrySubType from "../../../components/IndustrySubType"; // Adjust the import path as needed
import "./geninfo.css"; // Ensure this CSS file exists

const { Paragraph } = Typography;

const GenInfo = ({ record, isEditing, onUpdate }) => {
  const [form] = Form.useForm();

  // Convert "✔" to boolean true/false
  const convertRecordValues = (data) => {
    return {
      ...data,
      survey_eia: data.survey_eia === "✔",
      survey_air: data.survey_air === "✔",
      survey_water: data.survey_water === "✔",
      survey_haz: data.survey_haz === "✔",
      survey_chem: data.survey_chem === "✔",
    };
  };

  // Convert boolean true/false back to "✔" or empty string
  const revertRecordValues = (data) => {
    return {
      ...data,
      survey_eia: data.survey_eia ? "✔" : "",
      survey_air: data.survey_air ? "✔" : "",
      survey_water: data.survey_water ? "✔" : "",
      survey_haz: data.survey_haz ? "✔" : "",
      survey_chem: data.survey_chem ? "✔" : "",
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
        <Col xs={24} sm={24} md={24} lg={24} className="modalcol">
          <Paragraph>
            <strong>Applicable Laws:</strong>
            <div className="applicable-laws-container">
              <Form.Item name="survey_eia" valuePropName="checked" noStyle>
                <Checkbox disabled={!isEditing}>
                  <strong>EIA Project Survey</strong>
                </Checkbox>
              </Form.Item>
              <Form.Item name="survey_air" valuePropName="checked" noStyle>
                <Checkbox disabled={!isEditing}>
                  <strong>AIR</strong>
                </Checkbox>
              </Form.Item>
              <Form.Item name="survey_water" valuePropName="checked" noStyle>
                <Checkbox disabled={!isEditing}>
                  <strong>WATER</strong>
                </Checkbox>
              </Form.Item>
              <Form.Item name="survey_haz" valuePropName="checked" noStyle>
                <Checkbox disabled={!isEditing}>
                  <strong>HAZ</strong>
                </Checkbox>
              </Form.Item>
              <Form.Item name="survey_chem" valuePropName="checked" noStyle>
                <Checkbox disabled={!isEditing}>
                  <strong>CHEMICAL</strong>
                </Checkbox>
              </Form.Item>
            </div>
          </Paragraph>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
          <Paragraph>
            <strong>Project Title</strong>
            <Form.Item name="project_title" noStyle>
              <TextArea disabled={!isEditing} placeholder="No data" rows={1} />
            </Form.Item>
          </Paragraph>

          <Paragraph>
            <strong>Project Type</strong>
            <Form.Item name="project_type" noStyle>
              <IndustryType disabled={!isEditing} placeholder="No data" />
            </Form.Item>
          </Paragraph>

          <Paragraph>
            <strong>Project Sub-Type</strong>
            <Form.Item name="project_subtype" noStyle>
              <IndustrySubType disabled={!isEditing} placeholder="No data" />
            </Form.Item>
          </Paragraph>

          <Paragraph>
            <strong>Industry Classification</strong>
            <Form.Item name="industry_class" noStyle>
              <IndustryClass disabled={!isEditing} placeholder="No data" />
            </Form.Item>
          </Paragraph>

          <Paragraph>
            <strong>Other Project Type</strong>
            <Form.Item name="other_project_type" noStyle>
              <Input disabled={!isEditing} placeholder="No data" />
            </Form.Item>
          </Paragraph>

          <Paragraph>
            <strong>PSIC Code</strong>
            <Form.Item name="pisc_code" noStyle>
              <Input disabled={!isEditing} placeholder="No data" />
            </Form.Item>
          </Paragraph>
        </Col>

        <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
          <Paragraph>
            <strong>Complete Address</strong>
            <Form.Item name="address" noStyle>
              <TextArea disabled={!isEditing} placeholder="No data" rows={1} />
            </Form.Item>
          </Paragraph>

          <Paragraph>
            <strong>Street</strong>
            <Form.Item name="street" noStyle>
              <Input disabled={!isEditing} placeholder="No data" />
            </Form.Item>
          </Paragraph>

          <Paragraph>
            <strong>Barangay</strong>
            <Form.Item name="brgy" noStyle>
              <Input disabled={!isEditing} placeholder="No data" />
            </Form.Item>
          </Paragraph>

          <Paragraph>
            <strong>City</strong>
            <Form.Item name="city" noStyle>
              <Input disabled={!isEditing} placeholder="No data" />
            </Form.Item>
          </Paragraph>

          <Paragraph>
            <strong>Province</strong>
            <Form.Item name="province" noStyle>
              <Input disabled={!isEditing} placeholder="No data" />
            </Form.Item>
          </Paragraph>
        </Col>
      </Row>
    </Form>
  );
};

export default GenInfo;
