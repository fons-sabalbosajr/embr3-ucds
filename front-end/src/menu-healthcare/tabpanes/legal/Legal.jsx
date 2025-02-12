import React, { useEffect, useState } from "react";
import {
  Input,
  Row,
  Col,
  Typography,
  Card,
  DatePicker,
  Button,
  Form,
  Tooltip,
  Checkbox,
} from "antd";
import {
  LinkOutlined,
  PlusCircleFilled,
  DeleteFilled,
  CloseOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import TextArea from "antd/es/input/TextArea";
import dayjs from "dayjs";
import "./legal.css";
import LegalOfficers from "../../../components/Autocomplete/LegalOfficers";

const { Paragraph } = Typography;

const Legal = ({ record, handleChange, isEditing }) => {
  const [penalties, setPenalties] = useState([
    { penalty_date: null, amount: "", or_number: "" },
  ]);
  const [localRecord, setLocalRecord] = useState(record || {});

  const safeRecord = record || {};

  useEffect(() => {
    setLocalRecord(record);
  }, [record]);

  const handleDateChange = (date, dateString) => {
    // Only update the state if the date has changed
    if (dateString !== record.tc_actual_date) {
      handleChange("tc_actual_date", dateString); // Update state with the selected date
    }
  };

  const handlePenaltyDateChange = (index, date, dateString) => {
    const newPenalties = [...penalties];
    newPenalties[index].penalty_date = dateString;
    setPenalties(newPenalties);
  };

  const handlePenaltyInputChange = (index, field, value) => {
    const newPenalties = [...penalties];
    newPenalties[index][field] = value;
    setPenalties(newPenalties);
  };

  const convertToMMDDYYYY = (dateString) => {
    if (!dateString) return null; // Return null for empty values

    if (typeof dateString === "number") {
      const date = new Date(Math.round((dateString - 25569) * 86400 * 1000));
      return `${padZero(date.getMonth() + 1)}/${padZero(
        date.getDate()
      )}/${date.getFullYear()}`;
    }

    const date = dayjs(dateString, [
      "MM/DD/YYYY",
      "M/D/YYYY",
      "YYYY-MM-DD",
      "YYYY/MM/DD",
      "MMM D, YYYY",
      "MMMM DD, YYYY",
    ]);

    return date.isValid() ? date.format("MM/DD/YYYY") : null;
  };

  const padZero = (num) => (num < 10 ? "0" : "") + num;

  const handleInputChange = (field, value) => {
    setLocalRecord((prevRecord) => ({ ...prevRecord, [field]: value })); // Updates local state
    handleChange(field, value); // Calls parent function to update the actual record
  };

  const addPenalty = () => {
    setPenalties([
      ...penalties,
      { penalty_date: null, amount: "", or_number: "" },
    ]);
  };

  const removePenalty = () => {
    if (penalties.length > 1) {
      setPenalties(penalties.slice(0, -1));
    }
  };

  const formattedDateNOVRelease = convertToMMDDYYYY(record.nov_date_issued);

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
          <Card
            style={{
              width: "100%",
              marginBottom: 20,
              padding: 5,
            }}
            size="small"
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph className="paragraph-container">
                  <strong>Docket No.</strong>
                  <Input
                    value={record ? record.docket_no : ""}
                    onChange={(e) => handleChange("docket_no", e.target.value)}
                    disabled={!isEditing}
                    placeholder="No data"
                    className="text-area-legal"
                  />
                </Paragraph>
              </Col>

              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph className="paragraph-container">
                  <strong>DENR PAB Case No.</strong>
                  <Input
                    value={record ? record.denr_pab_case_no : ""}
                    onChange={(e) =>
                      handleChange("denr_pab_case_no", e.target.value)
                    }
                    disabled={!isEditing}
                    placeholder="No data"
                    className="text-area-legal"
                  />
                </Paragraph>
              </Col>

              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph className="paragraph-container">
                  <strong>NOV Date Issued</strong>
                  <DatePicker
                    value={
                      formattedDateNOVRelease
                        ? dayjs(formattedDateNOVRelease, "MM/DD/YYYY")
                        : null
                    }
                    onChange={(date) => {
                      const newDate = date ? date.format("MM/DD/YYYY") : "";
                      handleChange("nov_date_issued", newDate);
                    }}
                    disabled={!isEditing}
                    format="MM/DD/YYYY"
                    placeholder="MM/DD/YYYY"
                    className="text-area-legal custom-date-picker"
                    style={{ width: "100%" }}
                  />
                </Paragraph>
              </Col>
            </Row>
          </Card>

          <Card
            style={{
              width: "100%",
              marginBottom: 20,
              padding: 5,
            }}
            size="small"
            title="VIOLATION/S"
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={24} lg={24}>
                <Paragraph className="paragraph-container">
                  <strong>PD1586:</strong>
                  <TextArea
                    value={record ? record.v_pd1586 : ""}
                    onChange={(e) => handleChange("v_pd1586", e.target.value)}
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={3}
                    className="text-area-legal"
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={24} lg={24}>
                <Paragraph className="paragraph-container">
                  <strong>RA9275:</strong>
                  <TextArea
                    value={record ? record.v_ra9275 : ""}
                    onChange={(e) => handleChange("v_ra9275", e.target.value)}
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={3}
                    className="text-area-legal"
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={24} lg={24}>
                <Paragraph className="paragraph-container">
                  <strong>RA8749:</strong>
                  <TextArea
                    value={record ? record.v_ra8749 : ""}
                    onChange={(e) => handleChange("v_ra8749", e.target.value)}
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={3}
                    className="text-area-legal"
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={24} lg={24}>
                <Paragraph className="paragraph-container">
                  <strong>RA6969 Hazwaste:</strong>
                  <TextArea
                    value={record ? record.v_ra6969 : ""}
                    onChange={(e) => handleChange("v_ra6969", e.target.value)}
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={3}
                    className="text-area-legal"
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={24} lg={24}>
                <Paragraph className="paragraph-container">
                  <strong>RA6969 Toxic Chem:</strong>
                  <TextArea
                    value={record ? record.v_tchem : ""}
                    onChange={(e) => handleChange("v_tchem", e.target.value)}
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={3}
                    className="text-area-legal"
                  />
                </Paragraph>
              </Col>
            </Row>
          </Card>
        </Col>

        <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
          <Card
            style={{
              width: "100%",
              marginBottom: 20,
              padding: 5,
            }}
            size="small"
            title="Technical Conference"
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>TC Actual Schedule:</strong>
                  <DatePicker
                    value={
                      record.tc_actual_date
                        ? dayjs(record.tc_actual_date, "MM/DD/YYYY")
                        : null
                    }
                    onChange={(date, dateString) => {
                      handleDateChange(date, dateString); // Ensure we handle date change only when necessary
                    }}
                    disabled={!isEditing}
                    format="MM/DD/YYYY"
                    className="text-area-legal custom-date-picker"
                    style={{ width: "100%" }}
                  />
                </Paragraph>
              </Col>

              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>Assigned Legal Officer:</strong>
                  <LegalOfficers
                    value={record ? record.legal_officer : ""}
                    disabled={!isEditing}
                    placeholder="No data"
                    onChange={(value) =>
                      handleInputChange("legal_officer", value)
                    }
                    className="textbox_legal"
                  />
                </Paragraph>
              </Col>

              <Col xs={24} sm={24} md={24} lg={24}>
                <Paragraph style={{ display: "flex", flexDirection: "column" }}>
                  <strong>TC Commitment/Deadline of Compliance:</strong>
                  <span className="paste-here">
                    <i> &nbsp; (Paste Link Here)</i>
                  </span>
                  <div style={{ position: "relative", width: "100%" }}>
                    <TextArea
                      value={record ? record.tc_commitment : ""}
                      disabled={!isEditing}
                      placeholder="No data"
                      onChange={(e) => {
                        const newValue = e.target.value;
                        handleInputChange("tc_commitment", newValue);
                      }}
                      rows={2}
                    />
                    {record.tc_commitment?.trim() && (
                      <Tooltip title="Open link" placement="right">
                        <Button
                          type="primary"
                          size="small"
                          icon={<LinkOutlined />}
                          onClick={() => {
                            if (
                              record.tc_commitment?.trim().startsWith("http")
                            ) {
                              window.open(
                                record.tc_commitment.trim(),
                                "_blank"
                              );
                            } else {
                              alert(
                                "Invalid URL: Please enter a valid link starting with http:// or https://"
                              );
                            }
                          }}
                          style={{
                            position: "absolute",
                            top: "-30px",
                            right: "4px",
                          }}
                        />
                      </Tooltip>
                    )}
                  </div>
                </Paragraph>
                <Paragraph style={{ display: "flex", flexDirection: "column" }}>
                  <strong>Position Paper:</strong>
                  <span className="paste-here">
                    <i> &nbsp; (Paste Link Here)</i>
                  </span>
                  <div style={{ position: "relative", width: "100%" }}>
                    <TextArea
                      value={record ? record.pos_paper : ""}
                      disabled={!isEditing}
                      placeholder="No data"
                      onChange={(e) => {
                        const newValue = e.target.value;
                        handleInputChange("pos_paper", newValue);
                      }}
                      rows={2}
                    />
                    {record.pos_paper?.trim() && (
                      <Tooltip title="Open link" placement="right">
                        <Button
                          type="primary"
                          size="small"
                          icon={<LinkOutlined />}
                          onClick={() => {
                            if (record.pos_paper?.trim().startsWith("http")) {
                              window.open(record.pos_paper.trim(), "_blank");
                            } else {
                              alert(
                                "Invalid URL: Please enter a valid link starting with http:// or https://"
                              );
                            }
                          }}
                          style={{
                            position: "absolute",
                            top: "-30px",
                            right: "4px",
                          }}
                        />
                      </Tooltip>
                    )}
                  </div>
                </Paragraph>
              </Col>
            </Row>
          </Card>

          <Card
            style={{
              width: "100%",
              marginBottom: 20,
              padding: 5,
            }}
            size="small"
            title="For Penalty & Order/Resolution"
          >
            <div>
              {/* Labels placed outside of the .map */}
              <Row gutter={[16, 16]}>
                <Col xs={24} sm={24} md={8} lg={8}>
                  <Paragraph>
                    <strong>Penalty Date:</strong>
                  </Paragraph>
                </Col>
                <Col xs={24} sm={24} md={8} lg={8}>
                  <Paragraph>
                    <strong>Amount:</strong>
                  </Paragraph>
                </Col>
                <Col xs={24} sm={24} md={8} lg={8}>
                  <Paragraph>
                    <strong>OR Number:</strong>
                  </Paragraph>
                </Col>
              </Row>

              {/* Dynamic rendering of fields for each penalty */}
              {penalties.map((record, index) => (
                <Row gutter={[16, 16]} key={index}>
                  <Col xs={24} sm={24} md={8} lg={8}>
                    <DatePicker
                      value={
                        record.penalty_date
                          ? dayjs(record.penalty_date, "MM/DD/YYYY")
                          : null
                      }
                      onChange={(date, dateString) =>
                        handlePenaltyDateChange(index, date, dateString)
                      }
                      format="MM/DD/YYYY"
                      className="textbox_legal legal-add"
                      style={{ width: "100%" }}
                    />
                  </Col>
                  <Col xs={24} sm={24} md={8} lg={8}>
                    <Input
                      value={record.amount}
                      onChange={(e) =>
                        handlePenaltyInputChange(
                          index,
                          "amount",
                          e.target.value
                        )
                      }
                      placeholder="Amount"
                      className="textbox_legal legal-add"
                      prefix="₱"
                    />
                  </Col>
                  <Col xs={24} sm={24} md={8} lg={8}>
                    <Input
                      value={record.or_number}
                      onChange={(e) =>
                        handlePenaltyInputChange(
                          index,
                          "or_number",
                          e.target.value
                        )
                      }
                      placeholder="OR Number"
                      className="textbox_legal legal-add"
                      prefix="#"
                    />
                  </Col>
                </Row>
              ))}

              <div style={{ textAlign: "left" }}>
                <Button
                  type="primary"
                  onClick={addPenalty}
                  style={{ marginRight: "8px" }}
                  size="small"
                  icon={<PlusCircleFilled />}
                  disabled={!isEditing}
                >
                  Add
                </Button>
                {penalties.length > 1 && (
                  <Button
                    danger
                    onClick={removePenalty}
                    size="small"
                    type="primary"
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>
            <Paragraph className="legal-tc-compliance">
              <Checkbox
                checked={
                  safeRecord?.tc_order_compliance ===
                  "Compliance with TC Commitment/Order"
                }
                onChange={(e) =>
                  handleChange(
                    "tc_order_compliance",
                    e.target.checked
                      ? "Compliance with TC Commitment/Order"
                      : ""
                  )
                }
                disabled={!isEditing}
                style={{ fontSize: "12px" }}
              >
                <span className="permit-label"></span>
              </Checkbox>
              <strong>Compliance with TC Commitment/Order</strong>
            </Paragraph>

            <Paragraph>
              <strong>Remarks:</strong>
              <TextArea
                value={record ? record.remarks : ""}
                onChange={(e) => handleChange("remarks", e.target.value)}
                disabled={!isEditing}
                placeholder="No data"
                rows={3}
                className="text-area-legal"
              />
            </Paragraph>

            <Paragraph>
              <Checkbox
                checked={safeRecord?.resolution === "Resolution"}
                onChange={(e) =>
                  handleChange(
                    "resolution",
                    e.target.checked ? "Resolution" : ""
                  )
                }
                disabled={!isEditing}
                style={{ fontSize: "12px" }}
              >
                <span className="permit-label"></span>
              </Checkbox>
              <strong>Issued Resolution</strong>
            </Paragraph>

            <Paragraph>
              <Checkbox
                checked={safeRecord?.tc_order === "Order"}
                onChange={(e) =>
                  handleChange("tc_order", e.target.checked ? "Order" : "")
                }
                disabled={!isEditing}
                style={{ fontSize: "12px" }}
              >
                <span className="permit-label"></span>
              </Checkbox>
              <strong>Issued Order</strong>
            </Paragraph>

            <Paragraph>
              <strong>Order Status:</strong>
              <TextArea
                value={record ? record.order_status : ""}
                onChange={(e) => handleChange("order_status", e.target.value)}
                disabled={!isEditing}
                placeholder="No data"
                className="text-area-legal"
              />
            </Paragraph>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Legal;
