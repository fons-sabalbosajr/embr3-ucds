import React, { useState, useEffect } from "react";
import {
  Table,
  Input,
  Tooltip,
  Button,
  Modal,
  Progress,
  Select,
  Pagination,
  Tabs,
  Row,
  Col,
  Checkbox,
  Typography,
  Card,
  DatePicker,
  Space,
  Spin,
  TimePicker,
  notification,
  Tag,
} from "antd";
import "./permits.css";
import moment from "moment";
import TextArea from "antd/es/input/TextArea";
import styled from "styled-components";
import { PlusOutlined, MinusOutlined } from "@ant-design/icons";
import PermitSource from "../../../components/PermitSource";

const { Option } = Select;
const { TabPane } = Tabs;
const { Paragraph } = Typography;
const BoldTab = styled.span`
  font-weight: 600;
  font-size: 16px;
`;

const Permits = ({ editedRecord, handleChange, isEditing }) => {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const showModal = () => {
    setIsModalVisible(true);
  };

  const handleOk = () => {
    setIsModalVisible(false);
  };

  const handleCancel = () => {
    setIsModalVisible(false);
  };

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={24} md={12} lg={12}>
          <Card
            style={{
              width: 600,
              marginBottom: 20,
              padding: 5,
            }}
            size="small"
            title={
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Checkbox
                  checked={editedRecord?.pd1586 === "REQUIRED"}
                  disabled={!isEditing}
                  onChange={(e) =>
                    handleChange("pd1586", e.target.checked ? "REQUIRED" : "")
                  }
                  style={{ fontSize: "15px" }}
                >
                  {editedRecord?.pd1586 === "REQUIRED" ? "" : ""}
                  <span className="permit-label">PD1586</span>
                </Checkbox>
                {/* <div className="add-remove-container">
                <Tooltip title="Add New Permit">
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={handleAddRowECC}
                    disabled={rowsECC.length >= maxRowsECC}
                    style={{ marginRight: 8 }}
                  />
                </Tooltip>
                <Tooltip title="Remove">
                  <Button
                    type="primary"
                    danger
                    icon={<MinusOutlined />}
                    onClick={handleRemoveRowECC}
                    disabled={rowsECC.length <= 1}
                  />
                </Tooltip>
              </div> */}
              </div>
            }
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>ECC/CNC Reference No.</strong>
                  <TextArea
                    value={editedRecord ? editedRecord.ecc_cnc : ""}
                    onChange={(e) => handleChange("ecc_cnc", e.target.value)}
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={1}
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>Permit Process Source</strong>
                  <TextArea
                    value={editedRecord ? editedRecord.permit_process : ""}
                    onChange={(e) =>
                      handleChange("permit_process", e.target.value)
                    }
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={1}
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>Date Approved</strong>
                  <TextArea
                    value={editedRecord ? editedRecord.date_approved : ""}
                    onChange={(e) =>
                      handleChange("date_approved", e.target.value)
                    }
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={1}
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>Date Amended</strong>
                  <TextArea
                    value={editedRecord ? editedRecord.date_amended : ""}
                    onChange={(e) =>
                      handleChange("date_amended", e.target.value)
                    }
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={1}
                  />
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
            title={
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Checkbox
                  checked={editedRecord?.ra8749 === "REQUIRED"}
                  disabled={!isEditing}
                  onChange={(e) =>
                    handleChange("ra8749", e.target.checked ? "REQUIRED" : "")
                  }
                  style={{ fontSize: "15px" }}
                >
                  {editedRecord?.ra8749 === "REQUIRED" ? "" : ""}
                  <span className="permit-label">RA9275</span>
                </Checkbox>
              </div>
            }
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>WWDP Code</strong>
                  <TextArea
                    value={editedRecord ? editedRecord.pto_code : ""}
                    onChange={(e) => handleChange("pto_code", e.target.value)}
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={1}
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}></Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>WWDP Date Issued</strong>
                  <TextArea
                    value={editedRecord ? editedRecord.pto_issued : ""}
                    onChange={(e) => handleChange("pto_issued", e.target.value)}
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={1}
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>WWDP Date of Expiration</strong>
                  <TextArea
                    value={editedRecord ? editedRecord.pto_expiration : ""}
                    onChange={(e) =>
                      handleChange("pto_expiration", e.target.value)
                    }
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={1}
                  />
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
            title={
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Checkbox
                  checked={editedRecord?.ra9275 === "REQUIRED"}
                  disabled={!isEditing}
                  onChange={(e) =>
                    handleChange("ra9275", e.target.checked ? "REQUIRED" : "")
                  }
                  style={{ fontSize: "15px" }}
                >
                  {editedRecord?.ra9275 === "REQUIRED" ? "" : ""}
                  <span className="permit-label">RA9275</span>
                </Checkbox>
              </div>
            }
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>WWDP Code</strong>
                  <TextArea
                    value={editedRecord ? editedRecord.wwdp_code : ""}
                    onChange={(e) => handleChange("wwdp_code", e.target.value)}
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={1}
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}></Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>WWDP Date Issued</strong>
                  <TextArea
                    value={editedRecord ? editedRecord.wwdp_issued : ""}
                    onChange={(e) =>
                      handleChange("wwdp_issued", e.target.value)
                    }
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={1}
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>WWDP Date of Expiration</strong>
                  <TextArea
                    value={editedRecord ? editedRecord.wwdp_expiration : ""}
                    onChange={(e) =>
                      handleChange("wwdp_expiration", e.target.value)
                    }
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={1}
                  />
                </Paragraph>
              </Col>
            </Row>
          </Card>

          <Card
            style={{
              width: 600,
              marginBottom: 10,
              padding: 5,
            }}
            size="small"
            title={
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Checkbox
                  checked={editedRecord?.ra6969 === "REQUIRED"}
                  disabled={!isEditing}
                  onChange={(e) =>
                    handleChange("ra6969", e.target.checked ? "REQUIRED" : "")
                  }
                  style={{ fontSize: "15px" }}
                >
                  {editedRecord?.ra6969 === "REQUIRED" ? "" : ""}
                  <span className="permit-label">RA6969</span>
                </Checkbox>
              </div>
            }
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>Haz-waste ID</strong>
                  <TextArea
                    value={editedRecord ? editedRecord.haz_id : ""}
                    onChange={(e) => handleChange("haz_id", e.target.value)}
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={1}
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>Haz-waste ID Date Issued</strong>
                  <TextArea
                    value={editedRecord ? editedRecord.haz_issued : ""}
                    onChange={(e) => handleChange("haz_issued", e.target.value)}
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={1}
                  />
                </Paragraph>
              </Col>
            </Row>
          </Card>
        </Col>

        <Col xs={24} sm={24} md={12} lg={12}>
          <Card
            style={{
              width: 600,
              marginBottom: 20,
              padding: 5,
            }}
            size="small"
            title={
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Checkbox
                  checked={editedRecord?.tsd === "REQUIRED"}
                  disabled={!isEditing}
                  onChange={(e) =>
                    handleChange("tsd", e.target.checked ? "REQUIRED" : "")
                  }
                  style={{ fontSize: "15px" }}
                >
                  {editedRecord?.tsd === "REQUIRED" ? "" : ""}
                  <span className="permit-label">TSD Permit</span>
                </Checkbox>
              </div>
            }
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>TSD Date of Expiration</strong>
                  <TextArea
                    value={editedRecord ? editedRecord.tsd_ref_no : ""}
                    onChange={(e) => handleChange("tsd_ref_no", e.target.value)}
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={1}
                  />
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
            title={
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Checkbox
                  checked={editedRecord?.tp_trc === "REQUIRED"}
                  disabled={!isEditing}
                  onChange={(e) =>
                    handleChange("tp_trc", e.target.checked ? "REQUIRED" : "")
                  }
                  style={{ fontSize: "15px" }}
                >
                  {editedRecord?.tp_trc === "REQUIRED" ? "" : ""}
                  <span className="permit-label">TP/TRC Permit</span>
                </Checkbox>
              </div>
            }
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>TP/TRC Date of Expiration</strong>
                  <TextArea
                    value={editedRecord ? editedRecord.tsd_ref_no : ""}
                    onChange={(e) => handleChange("tsd_ref_no", e.target.value)}
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={1}
                  />
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
            title={
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Checkbox
                  checked={editedRecord?.chemical_permit === "REQUIRED"}
                  disabled={!isEditing}
                  onChange={(e) =>
                    handleChange(
                      "chemical_permit",
                      e.target.checked ? "REQUIRED" : ""
                    )
                  }
                  style={{ fontSize: "15px" }}
                >
                  {editedRecord?.chemical_permit === "REQUIRED" ? "" : ""}
                  <span className="permit-label">Chemical Permits</span>
                </Checkbox>
              </div>
            }
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={6} lg={6}>
                <Paragraph>
                  <strong>Permit Type:</strong>
                  <Input
                    value={
                      editedRecord ? editedRecord.chemical_permit_type : ""
                    }
                    onChange={(e) =>
                      handleChange("chemical_permit_type", e.target.value)
                    }
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={1}
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={6} lg={6}>
                <Paragraph>
                  <strong>Sub-Type:</strong>
                  <Input
                    value={
                      editedRecord ? editedRecord.chemical_permit_sub_type : ""
                    }
                    onChange={(e) =>
                      handleChange("chemical_permit_sub_type", e.target.value)
                    }
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={1}
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>Chemical Code:</strong>
                  <Input
                    value={editedRecord ? editedRecord.chemical_code : ""}
                    onChange={(e) =>
                      handleChange("chemical_code", e.target.value)
                    }
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={1}
                  />
                </Paragraph>
              </Col>
            </Row>
            <Button
              type="default"
              size="small"
              className="btn-chemical-viewmore"
              onClick={showModal}
              disabled={!isEditing}
            >
              View More Information...
            </Button>
          </Card>

          <Card
            style={{
              width: 600,
              marginBottom: 10,
              padding: 5,
            }}
            size="small"
            title={
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Checkbox
                  checked={editedRecord?.pco === "REQUIRED"}
                  disabled={!isEditing}
                  onChange={(e) =>
                    handleChange("pco", e.target.checked ? "REQUIRED" : "")
                  }
                  style={{ fontSize: "15px" }}
                >
                  {editedRecord?.pco === "REQUIRED" ? "" : ""}
                  <span className="permit-label">PCO Accreditation</span>
                </Checkbox>
              </div>
            }
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>Certificate of Accreditation No.:</strong>
                  <TextArea
                    value={editedRecord ? editedRecord.pco_no : ""}
                    onChange={(e) => handleChange("pco_no", e.target.value)}
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={1}
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>PCO Validity Date:</strong>
                  <TextArea
                    value={editedRecord ? editedRecord.pco_validity : ""}
                    onChange={(e) =>
                      handleChange("pco_validity", e.target.value)
                    }
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={1}
                  />
                </Paragraph>
              </Col>
            </Row>
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>PCO Name:</strong>
                  <TextArea
                    value={editedRecord ? editedRecord.pco_name : ""}
                    onChange={(e) => handleChange("pco_name", e.target.value)}
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={1}
                  />
                </Paragraph>
              </Col>
            </Row>
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>PCO Contact No.:</strong>
                  <TextArea
                    value={editedRecord ? editedRecord.pco_tel_no : ""}
                    onChange={(e) => handleChange("pco_tel_no", e.target.value)}
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={1}
                  />
                </Paragraph>
              </Col>
            </Row>
          </Card>
        </Col>

        <Modal
          title="Full Information"
          visible={isModalVisible}
          onOk={handleOk}
          onCancel={handleCancel}
        >
          <p>
            <strong>Permit Type:</strong>{" "}
            {editedRecord ? editedRecord.chemical_permit_type : "No data"}
          </p>
          <p>
            <strong>Sub-Type:</strong>{" "}
            {editedRecord ? editedRecord.chemical_permit_sub_type : "No data"}
          </p>
          <p>
            <strong>Chemical Code:</strong>{" "}
            {editedRecord ? editedRecord.chemical_code : "No data"}
          </p>
          {/* Add more fields here if needed */}
        </Modal>
      </Row>
    </div>
  );
};

export default Permits;
