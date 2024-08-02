import React, { useEffect } from "react";
import { Form, Input, Row, Col, Typography, Card, Checkbox } from "antd";
import TextArea from "antd/es/input/TextArea";
import R3MapAutoComplete from "../../../components/R3Map";
import "./mbu.css";

const { Paragraph } = Typography;

const MBU = ({ record, isEditing, onUpdate }) => {
  const [form] = Form.useForm();

  useEffect(() => {
    if (record) {
      form.setFieldsValue(record); // Update form values with new record
    } else {
      form.resetFields(); // Clear fields if no record
    }
  }, [record, form]); // Ensure form is reset when record changes

  const handleChange = (changedValues) => {
    const updatedRecord = { ...form.getFieldsValue(), ...changedValues };
    onUpdate(updatedRecord); // Send updated record to the parent component
  };

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={record}
      onValuesChange={(changedValues) => handleChange(changedValues)}
    >
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
          <Row gutter={[16, 16]}>
            <Col span={23}>
              <R3MapAutoComplete
                latitude={record ? record.lat : ""}
                longitude={record ? record.long : ""}
              />
            </Col>
          </Row>
        </Col>
        <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
          <Col xs={24} sm={24} md={12} lg={12} className="modal-col">
            <Paragraph>
              <strong>Latitude</strong>
              <Form.Item name="lat" noStyle>
                <Input disabled={!isEditing} placeholder="No data" />
              </Form.Item>
            </Paragraph>
            <Paragraph>
              <strong>Longitude</strong>
              <Form.Item name="long" noStyle>
                <Input disabled={!isEditing} placeholder="No data" />
              </Form.Item>
            </Paragraph>
            <Paragraph>
              <strong>Congressional District</strong>
              <Form.Item name="cong_district" noStyle>
                <Input disabled={!isEditing} placeholder="No data" />
              </Form.Item>
            </Paragraph>
            
          </Col>
          <Col xs={24} sm={24} md={24} lg={24} className="modal-col">
            <Paragraph>
              <strong>Complete Address</strong>
              <Form.Item name="address" noStyle>
                <TextArea disabled={!isEditing} placeholder="No data" rows={3} />
              </Form.Item>
            </Paragraph>
          </Col>
          <Col xs={24} sm={24} md={24} lg={24} className="modal-col-waterbody">
            <Paragraph>
              <strong>Receiving Waterbody/River System</strong>
              <Form.Item name="waterbody" noStyle>
                <Input disabled={!isEditing} placeholder="No data" rows={3} />
              </Form.Item>
            </Paragraph>
          </Col>
        </Col>
      </Row>
    </Form>
  );
};

export default MBU;
