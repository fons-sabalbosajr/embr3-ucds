import React, { useEffect, useState } from "react";
import { Form, Input, Row, Col, Typography, Card } from "antd";
import axios from "axios";
import "./legalunit.css";

const { Paragraph } = Typography;

const LegalUnit = ({ editedRecord, handleChange, isEditing }) => {
  const [localRecord, setLocalRecord] = useState(editedRecord || {});
  const [fetchIntervalId, setFetchIntervalId] = useState(null);

  useEffect(() => {
    let timeoutId = null;
    const fetchUpdatedRecord = async () => {
      try {
        const response = await axios.get(`http://localhost:8081/api/survey/${editedRecord.id_no}`);
        const data = response.data;
        if (data && data.docket_no) {
          setLocalRecord((prevRecord) => ({ ...prevRecord, docket_no: data.docket_no }));
          clearInterval(fetchIntervalId);
        } else {
          setLocalRecord((prevRecord) => ({ ...prevRecord, docket_no: "" }));
          timeoutId = setTimeout(() => {
            clearInterval(fetchIntervalId);
          }, 10000); // 10 sec
        }
      } catch (error) {
        if (error.response && error.response.status === 404) {
          setLocalRecord((prevRecord) => ({ ...prevRecord, docket_no: "Not found" }));
          clearInterval(fetchIntervalId);
        } else {
          console.error("Failed to fetch updated survey record:", error);
        }
      }
    };
  
    fetchUpdatedRecord();
  
    const intervalId = setInterval(fetchUpdatedRecord, 2000);
    setFetchIntervalId(intervalId);
  
    return () => {
      clearInterval(intervalId);
      clearTimeout(timeoutId);
    };
  }, [editedRecord.id_no]);


  const handleInputChange = (field, value) => {
    setLocalRecord((prevRecord) => ({ ...prevRecord, [field]: value }));
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
          <Card
            style={{
              width: 450,
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
                      value={localRecord.docket_no || ""}
                      disabled={!isEditing}
                      placeholder="No data"
                      onChange={(e) => {
                        const newValue = e.target.value;
                        handleInputChange("docket_no", newValue);
                      }}
                      className="textbox-label disabled-input"
                    />
                  </Form.Item>
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>DENR PAB Case No.</strong>
                  <Form.Item name="pab_case_no" noStyle>
                    <Input
                      value={localRecord.pab_case_no || ""}
                      disabled={!isEditing}
                      placeholder="No data"
                      onChange={(e) => {
                        const newValue = e.target.value;
                        handleInputChange("pab_case_no", newValue);
                      }}
                      className="textbox-label disabled-input"
                    />
                  </Form.Item>
                </Paragraph>
              </Col>
            </Row>


            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>Date Forwared to Legal Staff:</strong>
                  <Form.Item name="date_forwarded_legal" noStyle>
                    <Input
                      value={localRecord.date_forwarded_legal || ""}
                      disabled={!isEditing}
                      placeholder="No data"
                      onChange={(e) => {
                        const newValue = e.target.value;
                        handleInputChange("date_forwarded_legal", newValue);
                      }}
                      className="textbox-label disabled-input textbox_legal"
                    />
                  </Form.Item>
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                <span className="label_container">
                    <strong className="label_title_legal">No. of Days</strong>
                    <p className="label">(Monitored vs. Date Submitted)</p>
                  </span>
                  <Form.Item name="days_approved" noStyle>
                    <Input
                      value={localRecord.days_approved || ""}
                      disabled={!isEditing}
                      placeholder="No data"
                      onChange={(e) => {
                        const newValue = e.target.value;
                        handleInputChange("days_approved", newValue);
                      }}
                      className="textbox-label disabled-input"
                    />
                  </Form.Item>
                </Paragraph>
              </Col>
            </Row>

            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>Date Approved by Chief Legal:</strong>
                  <Form.Item name="date_approved_legal" noStyle>
                    <Input
                      value={localRecord.date_approved_legal || ""}
                      disabled={!isEditing}
                      placeholder="No data"
                      onChange={(e) => {
                        const newValue = e.target.value;
                        handleInputChange("date_approved_legal", newValue);
                      }}
                      className="textbox-label disabled-input textbox_legal"
                    />
                  </Form.Item>
                </Paragraph>
              </Col>
            </Row>

            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>NOV Released Date:</strong>
                  <Form.Item name="nov_released_date" noStyle>
                    <Input
                      value={localRecord.nov_released_date || ""}
                      disabled={!isEditing}
                      placeholder="No data"
                      onChange={(e) => {
                        const newValue = e.target.value;
                        handleInputChange("nov_released_date", newValue);
                      }}
                      className="textbox-label disabled-input textbox_legal"
                    />
                  </Form.Item>
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}>
              <Paragraph>
                  <strong>Service Mode:</strong>
                  <Form.Item name="service_mode" noStyle>
                    <Input
                      value={localRecord.service_mode || ""}
                      disabled={!isEditing}
                      placeholder="No data"
                      onChange={(e) => {
                        const newValue = e.target.value;
                        handleInputChange("service_mode", newValue);
                      }}
                      className="textbox-label disabled-input textbox_legal"
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
              width: 450,
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
                      value={localRecord.docket_no || ""}
                      disabled={!isEditing}
                      placeholder="No data"
                      onChange={(e) => {
                        const newValue = e.target.value;
                        handleInputChange("docket_no", newValue);
                      }}
                      className="textbox-label disabled-input"
                    />
                  </Form.Item>
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>DENR PAB Case No.</strong>
                  <Form.Item name="pab_case_no" noStyle>
                    <Input
                      value={localRecord.pab_case_no || ""}
                      disabled={!isEditing}
                      placeholder="No data"
                      onChange={(e) => {
                        const newValue = e.target.value;
                        handleInputChange("pab_case_no", newValue);
                      }}
                      className="textbox-label disabled-input"
                    />
                  </Form.Item>
                </Paragraph>
              </Col>
            </Row>


            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>Date Forwared to Legal Staff:</strong>
                  <Form.Item name="date_forwarded_legal" noStyle>
                    <Input
                      value={localRecord.date_forwarded_legal || ""}
                      disabled={!isEditing}
                      placeholder="No data"
                      onChange={(e) => {
                        const newValue = e.target.value;
                        handleInputChange("date_forwarded_legal", newValue);
                      }}
                      className="textbox-label disabled-input textbox_legal"
                    />
                  </Form.Item>
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                <span className="label_container">
                    <strong className="label_title_legal">No. of Days</strong>
                    <p className="label">(Monitored vs. Date Submitted)</p>
                  </span>
                  <Form.Item name="days_approved" noStyle>
                    <Input
                      value={localRecord.days_approved || ""}
                      disabled={!isEditing}
                      placeholder="No data"
                      onChange={(e) => {
                        const newValue = e.target.value;
                        handleInputChange("days_approved", newValue);
                      }}
                      className="textbox-label disabled-input"
                    />
                  </Form.Item>
                </Paragraph>
              </Col>
            </Row>

            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>Date Approved by Chief Legal:</strong>
                  <Form.Item name="date_approved_legal" noStyle>
                    <Input
                      value={localRecord.date_approved_legal || ""}
                      disabled={!isEditing}
                      placeholder="No data"
                      onChange={(e) => {
                        const newValue = e.target.value;
                        handleInputChange("date_approved_legal", newValue);
                      }}
                      className="textbox-label disabled-input textbox_legal"
                    />
                  </Form.Item>
                </Paragraph>
              </Col>
            </Row>

            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>NOV Released Date:</strong>
                  <Form.Item name="nov_released_date" noStyle>
                    <Input
                      value={localRecord.nov_released_date || ""}
                      disabled={!isEditing}
                      placeholder="No data"
                      onChange={(e) => {
                        const newValue = e.target.value;
                        handleInputChange("nov_released_date", newValue);
                      }}
                      className="textbox-label disabled-input textbox_legal"
                    />
                  </Form.Item>
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}>
              <Paragraph>
                  <strong>Service Mode:</strong>
                  <Form.Item name="service_mode" noStyle>
                    <Input
                      value={localRecord.service_mode || ""}
                      disabled={!isEditing}
                      placeholder="No data"
                      onChange={(e) => {
                        const newValue = e.target.value;
                        handleInputChange("service_mode", newValue);
                      }}
                      className="textbox-label disabled-input textbox_legal"
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