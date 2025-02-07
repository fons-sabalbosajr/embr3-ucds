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
} from "@ant-design/icons";
import TextArea from "antd/es/input/TextArea";
import dayjs from "dayjs";
import "./legal.css";
import LegalOfficers from "../../../components/Autocomplete/LegalOfficers";

const { Paragraph } = Typography;

const Legal = ({
  record,
  handleChange,
  isEditing,
  penaltyAmounts,
  setPenaltyAmounts,
  penaltyOrNumbers,
  setPenaltyOrNumbers,
}) => {
  const [loadedInitialFields, setLoadedInitialFields] = useState([]);
  const [localRecord, setLocalRecord] = useState(record || {});

  useEffect(() => {
    setLocalRecord(record);
  }, [record]);

  useEffect(() => {
    if (!record) return; // Ensure record is defined before proceeding
  
    // Load penalty amounts and OR numbers safely
    const loadedPenaltyAmounts = (record.amount || "")
      .split("\n")
      .map((amount) => amount.trim())
      .filter((amount) => amount !== ""); // Remove empty strings
  
    const loadedPenaltyOrNumbers = (record.or_number || "")
      .split("\n")
      .map((number) => number.trim())
      .filter((number) => number !== ""); // Remove empty strings
  
    setPenaltyAmounts(loadedPenaltyAmounts.length ? loadedPenaltyAmounts : [""]);
    setPenaltyOrNumbers(loadedPenaltyOrNumbers.length ? loadedPenaltyOrNumbers : [""]);
  
    // Ensure indices are properly initialized
    setLoadedInitialFields([...Array(loadedPenaltyAmounts.length).keys()]);
  }, [record, setPenaltyAmounts, setPenaltyOrNumbers, setLoadedInitialFields]);
  

  const handleDateChange = (date, dateString) => {
    if (dateString) {
      handleChange("tc_actual_date", dateString);
      handleChange("penalty_date", dateString);
    } else {
      handleChange("tc_actual_date", null);
      handleChange("penalty_date", null);
    }
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

  const handlePenaltyInputChange = (field, value, index) => {
    if (field === "amount") {
      // Replace non-numeric characters but allow decimal points and commas
      const cleanedValue = value.replace(/[^0-9.,]/g, "");
  
      // Create a new array with updated value
      setPenaltyAmounts((prevAmounts) => {
        const newAmounts = [...prevAmounts];
        newAmounts[index] = cleanedValue;
        return [...newAmounts]; // Ensure a new array is returned to trigger re-render
      });
    } else if (field === "or_number") {
      // Remove non-numeric characters
      const formattedValue = value.replace(/[^0-9]/g, "");
  
      setPenaltyOrNumbers((prevNumbers) => {
        const newNumbers = [...prevNumbers];
        newNumbers[index] = formattedValue;
        return [...newNumbers]; // Return a new array reference
      });
    }
  };
  

  const handleAmountBlur = (index) => {
    setPenaltyAmounts((prevAmounts) => {
      const newAmounts = [...prevAmounts];
      const rawValue = newAmounts[index].replace(/[^0-9.]/g, ""); // Remove any non-numeric characters except decimal
      const num = parseFloat(rawValue);
      newAmounts[index] = isNaN(num)
        ? ""
        : num.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
      return newAmounts;
    });
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
                      handleDateChange(date, dateString);
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
            title="For Penalty and Order/Resolution"
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>Penalty Payment Date:</strong>
                  <DatePicker
                    value={
                      record.penalty_date
                        ? dayjs(record.penalty_date, "MM/DD/YYYY")
                        : null
                    }
                    onChange={(date, dateString) => {
                      handleDateChange(date, dateString);
                    }}
                    disabled={!isEditing}
                    format="MM/DD/YYYY"
                    className="text-area-legal custom-date-picker"
                    style={{ width: "100%" }}
                  />
                </Paragraph>
              </Col>
            </Row>

            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>Penalty Amount:</strong>
                  {penaltyAmounts.map((amount, index) => (
                    <div key={`amount-${index}`}>
                      <Input
                        value={amount}
                        onBlur={() => handleAmountBlur(index)} // Call formatting on blur
                        disabled={!isEditing}
                        placeholder="No data"
                        onChange={(e) => {
                          handlePenaltyInputChange(
                            "amount",
                            e.target.value,
                            index
                          );
                        }}
                        className="textbox-label textbox_legal"
                        prefix="₱"
                      />
                    </div>
                  ))}
                </Paragraph>
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Legal;
