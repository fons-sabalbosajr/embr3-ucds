import React, { useState, useEffect } from "react";
import {
  Table,
  Button,
  Modal,
  Row,
  Col,
  Checkbox,
  Typography,
  Card,
  Input,
  notification,
} from "antd";
import "./permits.css";
import TextArea from "antd/es/input/TextArea";

const { Paragraph } = Typography;
const { confirm } = Modal;

const Permits = ({ editedRecord, handleChange, onSaveChanges, isEditing }) => {
  const [dataSource, setDataSource] = useState([]);
  const [isModalVisible, setIsModalVisible] = useState(false);

  useEffect(() => {
    if (editedRecord) {
      setDataSource([
        {
          key: "1",
          permitNo: editedRecord?.chemical_permit || "",
          permitIssued: editedRecord?.chem_permit_issued || "",
          permitExpiration: editedRecord?.chem_permit_exp || "",
        },
      ]);
    }
  }, [editedRecord]);

  const showModal = () => {
    setIsModalVisible(true);
  };

  const handleOk = () => {
    setIsModalVisible(false);
  };

  const handleCancelPermit = () => {
    setIsModalVisible(false);
  };

  const handleSavePermit = () => {
    confirm({
      title: "Save Changes",
      content: "Are you sure you want to save the changes?",
      okText: "Save",
      cancelText: "Cancel",
      onOk() {
        console.log("onOk triggered");

        // Update the editedRecord with the current dataSource values
        const updatedRecord = { ...editedRecord };
        updatedRecord.chemical_permit = dataSource[0].permitNo;
        updatedRecord.chem_permit_issued = dataSource[0].permitIssued;
        updatedRecord.chem_permit_exp = dataSource[0].permitExpiration;

        // Update the dataSource state with the new values
        setDataSource([
          {
            key: "1",
            permitNo: updatedRecord.chemical_permit,
            permitIssued: updatedRecord.chem_permit_issued,
            permitExpiration: updatedRecord.chem_permit_exp,
          },
        ]);

        // Trigger the parent component's save function
        onSaveChanges(updatedRecord, false);

        notification.success({
          message: "Success",
          description: "Your changes have been saved successfully.",
        });
      },
      onCancel() {
        console.log("Changes discarded");
      },
    });
  };

  const renderTextArea = (text, record, dataIndex) => (
    <TextArea
      value={record[dataIndex]}
      onChange={(e) => {
        const newDataSource = [...dataSource];
        const index = newDataSource.findIndex(
          (item) => item.key === record.key
        );
        newDataSource[index][dataIndex] = e.target.value;
        setDataSource(newDataSource);
      }}
      autoSize={{ minRows: 7 }}
      size="small"
    />
  );

  const handleValueChange = (field, newValue) => {
    const oldValue = editedRecord[field]; // Capture the old value
    // console.log(
    //   `Field: ${field}, Old Value: ${oldValue}, New Value: ${newValue}`
    // );
  };

  const columns = [
    {
      title: "Permit No.",
      dataIndex: "permitNo",
      key: "permitNo",
      width: "300px",
      align: "left",
      render: (text, record) => renderTextArea(text, record, "permitNo"),
    },
    {
      title: "Permit Issued",
      dataIndex: "permitIssued",
      key: "permitIssued",
      align: "left",
      render: (text, record) => renderTextArea(text, record, "permitIssued"),
    },
    {
      title: "Permit Expiration",
      dataIndex: "permitExpiration",
      key: "permitExpiration",
      align: "left",
      render: (text, record) =>
        renderTextArea(text, record, "permitExpiration"),
    },
  ];

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={24} md={12} lg={12}>
          <Card
            style={{
              width: 500,
              marginBottom: 10,
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
                  checked={editedRecord?.pd1586 === "REQUIRED ECC"}
                  disabled={!isEditing}
                  onChange={(e) => {
                    const isChecked = e.target.checked;
                    const newValue = isChecked
                      ? "REQUIRED ECC"
                      : "NOT REQUIRED ECC";
                    handleValueChange("pd1586", newValue); // Log and handle the value change
                    handleChange("pd1586", newValue); // Keep the existing handleChange for parent component
                  }}
                  style={{ fontSize: "15px" }}
                >
                  {/* {editedRecord?.pd1586 === "REQUIRED" ? "" : ""} */}
                  <span className="permit-label">PD1586</span>
                </Checkbox>
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
                    rows={2}
                    className="text-area-permit"
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
                    rows={2}
                    className="text-area-permit"
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12} className="row-bot">
                <Paragraph>
                  <strong>Date Approved</strong>
                  <TextArea
                    value={editedRecord ? editedRecord.date_approved : ""}
                    onChange={(e) =>
                      handleChange("date_approved", e.target.value)
                    }
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={2}
                    className="text-area-permit"
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12} className="row-bot">
                <Paragraph>
                  <strong>Date Amended</strong>
                  <TextArea
                    value={editedRecord ? editedRecord.date_amended : ""}
                    onChange={(e) =>
                      handleChange("date_amended", e.target.value)
                    }
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={2}
                    className="text-area-permit"
                  />
                </Paragraph>
              </Col>
            </Row>
          </Card>

          <Card
            style={{
              width: 500,
              marginBottom: 10,
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
                  checked={editedRecord?.ra8749 === "REQUIRED PTO"}
                  disabled={!isEditing}
                  onChange={(e) => {
                    const isChecked = e.target.checked;
                    const newValue = isChecked
                      ? "REQUIRED PTO"
                      : "NOT REQUIRED PTO";
                    handleValueChange("ra8749", newValue); // Log and handle the value change
                    handleChange("ra8749", newValue); // Keep the existing handleChange for parent component
                  }}
                  style={{ fontSize: "15px" }}
                >
                  {/* {editedRecord?.ra8749 === "REQUIRED" ? "" : ""} */}
                  <span className="permit-label">RA8749</span>
                </Checkbox>
              </div>
            }
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={8} lg={8}>
                <Paragraph>
                  <strong>PTO Code</strong>
                  <TextArea
                    value={editedRecord ? editedRecord.pto_code : ""}
                    onChange={(e) => handleChange("pto_code", e.target.value)}
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={2}
                    className="text-area-permit"
                  />
                </Paragraph>
              </Col>

              <Col xs={24} sm={24} md={8} lg={8}>
                <Paragraph>
                  <strong>PTO Date Issued</strong>
                  <TextArea
                    value={editedRecord ? editedRecord.pto_issued : ""}
                    onChange={(e) => handleChange("pto_issued", e.target.value)}
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={2}
                    className="text-area-permit"
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={8} lg={8}>
                <Paragraph>
                  <strong>PTO Date of Expiration</strong>
                  <TextArea
                    value={editedRecord ? editedRecord.pto_expiration : ""}
                    onChange={(e) =>
                      handleChange("pto_expiration", e.target.value)
                    }
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={2}
                    className="text-area-permit"
                  />
                </Paragraph>
              </Col>
            </Row>
          </Card>

          <Card
            style={{
              width: 500,
              marginBottom: 10,
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
                  checked={editedRecord?.ra9275 === "REQUIRED WWDP"}
                  disabled={!isEditing}
                  onChange={(e) => {
                    const isChecked = e.target.checked;
                    const newValue = isChecked
                      ? "REQUIRED WWDP"
                      : "NOT REQUIRED WWDP";
                    handleValueChange("ra9275", newValue); // Log and handle the value change
                    handleChange("ra9275", newValue); // Keep the existing handleChange for parent component
                  }}
                  style={{ fontSize: "15px" }}
                >
                  {/* {editedRecord?.ra9275 === "REQUIRED" ? "" : ""} */}
                  <span className="permit-label">RA9275</span>
                </Checkbox>
              </div>
            }
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={8} lg={8}>
                <Paragraph>
                  <strong>WWDP Code</strong>
                  <TextArea
                    value={editedRecord ? editedRecord.wwdp_code : ""}
                    onChange={(e) => handleChange("wwdp_code", e.target.value)}
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={2}
                    className="text-area-permit"
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={8} lg={8}>
                <Paragraph>
                  <strong>WWDP Date Issued</strong>
                  <TextArea
                    value={editedRecord ? editedRecord.wwdp_issued : ""}
                    onChange={(e) =>
                      handleChange("wwdp_issued", e.target.value)
                    }
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={2}
                    className="text-area-permit"
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={8} lg={8}>
                <Paragraph>
                  <strong>WWDP Date of Expiration</strong>
                  <TextArea
                    value={editedRecord ? editedRecord.wwdp_expiration : ""}
                    onChange={(e) =>
                      handleChange("wwdp_expiration", e.target.value)
                    }
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={2}
                    className="text-area-permit"
                  />
                </Paragraph>
              </Col>
            </Row>
          </Card>

          
        </Col>

        <Col xs={24} sm={24} md={12} lg={12}>

        <Card
            style={{
              width: 500,
              marginBottom: 10,
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
                  checked={editedRecord?.ra6969 === "REQUIRED HAZWASTE PERMIT"}
                  disabled={!isEditing}
                  onChange={(e) => {
                    const isChecked = e.target.checked;
                    const newValue = isChecked
                      ? "REQUIRED HAZWASTE PERMIT"
                      : "NOT REQUIRED HAZWASTE PERMIT";
                    handleValueChange("ra6969", newValue); // Log and handle the value change
                    handleChange("ra6969", newValue); // Keep the existing handleChange for parent component
                  }}
                  style={{ fontSize: "15px" }}
                >
                  {/* {editedRecord?.ra6969 === "REQUIRED" ? "" : ""} */}
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
                    rows={2}
                    className="text-area-permit"
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
                    rows={2}
                    className="text-area-permit"
                  />
                </Paragraph>
              </Col>
            </Row>
          </Card>
         
          <Card
            style={{
              width: 500,
              marginBottom: 10,
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
                  checked={editedRecord?.pco === "REQUIRED PCO Accreditation"}
                  disabled={!isEditing}
                  onChange={(e) => {
                    const isChecked = e.target.checked;
                    const newValue = isChecked
                      ? "REQUIRED PCO Accreditation"
                      : "NOT REQUIRED PCO Accreditation";
                    handleValueChange("pco", newValue); // Log and handle the value change
                    handleChange("pco", newValue); // Keep the existing handleChange for parent component
                  }}
                  style={{ fontSize: "15px" }}
                >
                  {/* {editedRecord?.pco === "REQUIRED" ? "" : ""} */}
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
                    rows={2}
                    className="text-area-permit"
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
                    rows={2}
                    className="text-area-permit"
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
                    rows={2}
                    className="text-area-permit"
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>PCO Contact No.:</strong>
                  <TextArea
                    value={editedRecord ? editedRecord.pco_tel_no : ""}
                    onChange={(e) => handleChange("pco_tel_no", e.target.value)}
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={2}
                    className="text-area-permit"
                  />
                </Paragraph>
              </Col>
            </Row>
          </Card>

         
        </Col>

        <Modal
          title={
            <div className="modal-title-container-permit">
              <span className="modal-title-permit">
                Record ID: {editedRecord ? editedRecord.id_no : ""}
              </span>
              <span
                className="modal-title-permit"
                style={{
                  whiteSpace: "normal",
                  textAlign: "center",
                  width: "50%",
                }}
              >
                {editedRecord ? editedRecord.title : ""}
              </span>
              <span
                className="modal-title-permit"
                style={{ whiteSpace: "normal", textAlign: "right" }}
              >
                {editedRecord ? editedRecord.ecc_cnc : ""}
              </span>
            </div>
          }
          visible={isModalVisible}
          onCancel={handleCancelPermit}
          footer={[
            <Button key="cancel" onClick={handleCancelPermit}>
              Cancel
            </Button>,
            <Button key="save" type="primary" onClick={handleSavePermit}>
              Save
            </Button>,
          ]}
          width={1000}
        >
          <Table
            dataSource={dataSource}
            columns={columns}
            pagination={false}
            bordered
            className="custom-table"
          />
        </Modal>
      </Row>
    </div>
  );
};

export default Permits;
