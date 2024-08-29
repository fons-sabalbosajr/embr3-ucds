import React, { useEffect } from "react";
import { Form, Input, Row, Col, Typography, Checkbox, Card } from "antd";
import TextArea from "antd/es/input/TextArea";
import "./legalunit.css";

const { Paragraph } = Typography;

const LegalUnit = ({ record, isEditing, onUpdate }) => {
  const [form] = Form.useForm();

  // Convert "✔" to boolean true/false
  const convertRecordValues = (data) => {
    return {
      ...data,
      tc_compliance: data.tc_compliance === "✔",
      issued_resolution: data.issued_resolution === "✔",
      issued_order: data.issued_order === "✔",
    };
  };

  // Convert boolean true/false back to "✔" or empty string
  const revertRecordValues = (data) => {
    return {
      ...data,
      tc_compliance: data.tc_compliance ? "✔" : "",
      issued_resolution: data.issued_resolution ? "✔" : "",
      issued_order: data.issued_order ? "✔" : "",
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
        <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
          <Card
            style={{
              width: 600,
              marginBottom: 20,
              padding: 5,
            }}
            size="small"
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>Docket No.</strong>
                  <Form.Item name="docket_no" noStyle>
                    <Input
                      disabled={!isEditing}
                      placeholder="No data"
                      rows={1}
                    />
                  </Form.Item>
                </Paragraph>
                <Paragraph>
                  <strong>Date Forwarded to Legal Staff</strong>
                  <Form.Item name="date_forwarded_legal" noStyle>
                    <Input
                      disabled={!isEditing}
                      placeholder="No data"
                      rows={1}
                    />
                  </Form.Item>
                </Paragraph>
                <Paragraph>
                  <strong>Date Approved by Chief Legal</strong>
                  <Form.Item name="date_approved_legal" noStyle>
                    <Input
                      disabled={!isEditing}
                      placeholder="No data"
                      rows={1}
                    />
                  </Form.Item>
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>DENR PAB Case No.</strong>
                  <Form.Item name="pab_case_no" noStyle>
                    <Input disabled={!isEditing} placeholder="No data" />
                  </Form.Item>
                </Paragraph>
                <Paragraph>
                  <span className="label_container">
                    <strong className="label_title">Total No. of Days:</strong>
                    <p className="label">(Date forwarded VS Date Approved)</p>
                  </span>
                  <Form.Item name="days_approved" noStyle>
                    <Input disabled={!isEditing} placeholder="No data" />
                  </Form.Item>
                </Paragraph>
              </Col>
            </Row>

            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>NOV Date Released</strong>
                  <Form.Item name="nov_released_date" noStyle>
                    <Input
                      disabled={!isEditing}
                      placeholder="No data"
                      rows={1}
                    />
                  </Form.Item>
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>Service Mode</strong>
                  <Form.Item name="service_mode" noStyle>
                    <Input
                      disabled={!isEditing}
                      placeholder="No data"
                      rows={1}
                    />
                  </Form.Item>
                </Paragraph>
              </Col>
            </Row>
          </Card>

          <Card
            style={{
              width: 600,
              marginBottom: 20,
              padding: 5,
            }}
            size="small"
            title="VIOLATION/S"
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={24} lg={24}>
                <Paragraph>
                  <strong>PD1586:</strong>
                  <Form.Item name="v_pd1586" noStyle>
                    <TextArea
                      disabled={!isEditing}
                      placeholder="No data"
                      rows={3}
                    />
                  </Form.Item>
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={24} lg={24}>
                <Paragraph>
                  <strong>RA9275:</strong>
                  <Form.Item name="v_ra9275" noStyle>
                    <TextArea
                      disabled={!isEditing}
                      placeholder="No data"
                      rows={3}
                    />
                  </Form.Item>
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={24} lg={24}>
                <Paragraph>
                  <strong>RA8749:</strong>
                  <Form.Item name="v_ra8749" noStyle>
                    <TextArea
                      disabled={!isEditing}
                      placeholder="No data"
                      rows={3}
                    />
                  </Form.Item>
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={24} lg={24}>
                <Paragraph>
                  <strong>HAZWASTE:</strong>
                  <Form.Item name="v_haz" noStyle>
                    <TextArea
                      disabled={!isEditing}
                      placeholder="No data"
                      rows={3}
                    />
                  </Form.Item>
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={24} lg={24}>
                <Paragraph>
                  <strong>TOXIC CHEM:</strong>
                  <Form.Item name="v_toxichem" noStyle>
                    <TextArea
                      disabled={!isEditing}
                      placeholder="No data"
                      rows={3}
                    />
                  </Form.Item>
                </Paragraph>
              </Col>
            </Row>
          </Card>
        </Col>

        <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
          <Card
            style={{
              width: 600,
              marginBottom: 20,
              padding: 5,
            }}
            size="small"
            title="Technical Conference"
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>TC Date Scheduled</strong>
                  <Form.Item name="tc_schedule" noStyle>
                    <Input disabled={!isEditing} placeholder="No data" />
                  </Form.Item>
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>TC Date Actual:</strong>
                  <Form.Item name="tc_actual" noStyle>
                    <Input disabled={!isEditing} placeholder="No data" />
                  </Form.Item>
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>Time</strong>
                  <Form.Item name="tc_time" noStyle>
                    <Input disabled={!isEditing} placeholder="No data" />
                  </Form.Item>
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>Legal Officer</strong>
                  <Form.Item name="tc_legal_officer" noStyle>
                    <Input disabled={!isEditing} placeholder="No data" />
                  </Form.Item>
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={24} lg={24}>
                <Paragraph>
                  <strong>TC Commitment/Deadline of Compliance</strong>
                  <span>
                    <i> &nbsp; (Paste Link Here)</i>
                  </span>
                  <Form.Item name="tc_commitment" noStyle>
                    <TextArea
                      disabled={!isEditing}
                      placeholder="No data"
                      rows={3}
                    />
                  </Form.Item>
                </Paragraph>
              </Col>
            </Row>
          </Card>

          <Card
            style={{
              width: 600,
              marginBottom: 50,
              padding: 5,
            }}
            size="small"
            title="For Order/Resolution"
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={24} lg={24}>
                <Paragraph>
                  <strong>Position Paper:</strong>
                  <Form.Item name="pos_paper" noStyle>
                    <Input disabled={!isEditing} placeholder="No data" />
                  </Form.Item>
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>Date Payment of Penalty:</strong>
                  <Form.Item name="date_payment_penalty" noStyle>
                    <Input disabled={!isEditing} placeholder="No data" />
                  </Form.Item>
                </Paragraph>
              </Col>
            </Row>
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>Amount:</strong>
                  <Form.Item name="penalty_amount" noStyle>
                    <Input disabled={!isEditing} placeholder="No data" />
                  </Form.Item>
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>Official Receipt (OR) Number:</strong>
                  <Form.Item name="penalty_or_number" noStyle>
                    <Input disabled={!isEditing} placeholder="No data" />
                  </Form.Item>
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={24} lg={24}>
                <Paragraph>
                  <Form.Item
                    name="tc_compliance"
                    valuePropName="checked"
                    noStyle
                  >
                    <Checkbox disabled={!isEditing}>
                      <strong>Compliance with TC Commitment/Order</strong>
                    </Checkbox>
                  </Form.Item>
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={24} lg={24}>
                <Paragraph>
                  <strong>Remarks:</strong>
                  <Form.Item name="tc_compliance_remarks" noStyle>
                    <TextArea
                      disabled={!isEditing}
                      placeholder="No data"
                      rows={3}
                    />
                  </Form.Item>
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={24} lg={24}>
                <Paragraph>
                  <Form.Item
                    name="issued_resolution"
                    valuePropName="checked"
                    noStyle
                  >
                    <Checkbox disabled={!isEditing}>
                      <strong>Issued Resolution</strong>
                    </Checkbox>
                  </Form.Item>
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={24} lg={24}>
                <Paragraph>
                  <Form.Item
                    name="issued_order"
                    valuePropName="checked"
                    noStyle
                  >
                    <Checkbox disabled={!isEditing}>
                      <strong>Issued Order</strong>
                    </Checkbox>
                  </Form.Item>
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={24} lg={24}>
                <Paragraph>
                  <strong>Order Status:</strong>
                  <Form.Item name="order_status" noStyle>
                    <TextArea
                      disabled={!isEditing}
                      placeholder="No data"
                      rows={3}
                    />
                  </Form.Item>
                </Paragraph>
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>
    </Form>
  );
};

export default LegalUnit;
