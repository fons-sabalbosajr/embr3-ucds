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
            </Row>
          </Card>
        </Col>
      </Row>
    </Form>
  );
};

export default LegalUnit;