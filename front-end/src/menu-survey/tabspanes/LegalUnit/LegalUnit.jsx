import React, { useEffect, useState } from "react";
import {
  Form,
  Input,
  Row,
  Col,
  Typography,
  Card,
  Checkbox,
  DatePicker,
  TimePicker,
  Button,
  Tooltip,
  ConfigProvider,
} from "antd";
import {
  LinkOutlined,
  DeleteOutlined,
  PlusCircleFilled,
  DeleteFilled,
} from "@ant-design/icons";
import axios from "axios";
import Swal from "sweetalert2";
import "./legalunit.css";
import TextArea from "antd/es/input/TextArea";
import dayjs from "dayjs";
import LegalOfficer from "../../../components/Autocomplete/LegalOfficers";

const { Paragraph } = Typography;

function calculateWeekdayDiff(startDate, endDate) {
  if (!startDate || !endDate) return "No data"; // handle missing dates

  const startDayjs = dayjs(startDate);
  const endDayjs = dayjs(endDate);
  const totalDays = endDayjs.diff(startDayjs, "day");

  if (totalDays < 0) return "Invalid date range"; // in case end date is earlier than start date

  let weekendDays = 0;

  for (let i = 0; i < totalDays; i++) {
    const day = startDayjs.add(i, "day");
    const dayOfWeek = day.day(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      weekendDays++;
    }
  }

  const weekdayDiff = Math.max(1, totalDays - weekendDays);
  const dayString = weekdayDiff === 1 ? " day" : " days";
  return `${weekdayDiff}${dayString}`;
}

const LegalUnit = ({
  editedRecord,
  handleChange,
  isEditing,
  penaltyAmounts,
  setPenaltyAmounts,
  penaltyOrNumbers,
  setPenaltyOrNumbers,
}) => {
  const [loadedInitialFields, setLoadedInitialFields] = useState([]);
  const [hasNewFields, setHasNewFields] = useState(false);
  const [localRecord, setLocalRecord] = useState(editedRecord || {});

  useEffect(() => {
    setLocalRecord(editedRecord);
  }, [editedRecord]);

  useEffect(() => {
    // Load penalty amounts and OR numbers from the edited record
    const loadedPenaltyAmounts = (editedRecord.penalty_amount || "")
      .split("\n")
      .map((amount) => amount.trim());
    const loadedPenaltyOrNumbers = (editedRecord.penalty_or_number || "")
      .split("\n")
      .map((number) => number.trim());

    setPenaltyAmounts(loadedPenaltyAmounts);
    setPenaltyOrNumbers(loadedPenaltyOrNumbers);
    setLoadedInitialFields(loadedPenaltyAmounts.map((_, index) => index));
  }, [editedRecord, setPenaltyAmounts, setPenaltyOrNumbers]);

  const handlePenaltyInputChange = (field, value, index) => {
    if (field === "penalty_amount") {
      // Replace non-numeric characters but allow decimal points and commas
      const cleanedValue = value.replace(/[^0-9.,]/g, "");

      // Set the raw cleaned value to state
      setPenaltyAmounts((prevAmounts) => {
        const newAmounts = [...prevAmounts];
        newAmounts[index] = cleanedValue;
        return newAmounts;
      });
    } else if (field === "penalty_or_number") {
      // Remove non-numeric characters
      const formattedValue = value.replace(/[^0-9]/g, "");
      setPenaltyOrNumbers((prevNumbers) => {
        const newNumbers = [...prevNumbers];
        newNumbers[index] = formattedValue;
        return newNumbers;
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

  const addNewFields = () => {
    setPenaltyAmounts([...penaltyAmounts, ""]);
    setPenaltyOrNumbers([...penaltyOrNumbers, ""]);
    setHasNewFields(true);
  };

  const removeField = (index) => {
    if (!loadedInitialFields.includes(index)) {
      const newAmounts = penaltyAmounts.filter((_, i) => i !== index);
      const newNumbers = penaltyOrNumbers.filter((_, i) => i !== index);
      setPenaltyAmounts(newAmounts);
      setPenaltyOrNumbers(newNumbers);
    }
  };

  const handleInputChange = (field, value) => {
    setLocalRecord((prevRecord) => ({ ...prevRecord, [field]: value }));
    handleChange(field, value);
  };

  const handleCheckboxChange = (field, e) => {
    const value = e.target.checked ? "✔" : "";
    handleInputChange(field, value);
  };

  const convertToMMDDYYYY = (dateString) => {
    if (typeof dateString === "number") {
      // Handle Excel date numeric value
      const date = new Date(Math.round((dateString - 25569) * 86400 * 1000));
      return `${padZero(date.getMonth() + 1)}/${padZero(
        date.getDate()
      )}/${date.getFullYear()}`;
    } else {
      // Handle string date formats
      const date = dayjs(
        dateString,
        [
          "MM/DD/YYYY",
          "M/D/YYYY",
          "YYYY-MM-DD",
          "YYYY/MM/DD",
          "@",
          "MMM D, YYYY",
          "MMMM DD, YYYY",
        ],
        true
      );
      return date.isValid() ? date.format("MM/DD/YYYY") : null;
    }
  };

  const padZero = (num) => {
    return (num < 10 ? "0" : "") + num;
  };

  // Convert the date before loading it into the DatePicker
  const formattedDateForwarededLegalStaff = convertToMMDDYYYY(
    editedRecord.date_forwarded_legal
  );
  const formattedDateApprovedLegal = convertToMMDDYYYY(
    editedRecord.date_approved_legal
  );

  const formattedNOVRelease = convertToMMDDYYYY(editedRecord.nov_released_date);
  const formattedTCSchedule = convertToMMDDYYYY(editedRecord.tc_schedule);
  const formattedTCActual = convertToMMDDYYYY(editedRecord.tc_actual);
  const penaltyDate = convertToMMDDYYYY(editedRecord.penalty_date);

  const [daysDfDa, setdaysDfDa] = useState(
    editedRecord ? editedRecord.days_approved : 0
  );

  useEffect(() => {
    const collectionHasDaysDfDa = editedRecord.days_approved;

    if (collectionHasDaysDfDa) {
      // Load value from collection if available
      setdaysDfDa(collectionHasDaysDfDa);
      handleChange("daysDfDa", collectionHasDaysDfDa);
    } else if (
      formattedDateForwarededLegalStaff &&
      formattedDateApprovedLegal
    ) {
      // Compute if both dates are available and no collection data
      const newdaysDfDa = calculateWeekdayDiff(
        formattedDateForwarededLegalStaff,
        formattedDateApprovedLegal
      );
      setdaysDfDa(newdaysDfDa);
      handleChange("daysDfDa", newdaysDfDa);
    } else {
      // If any date is missing, set "No data"
      setdaysDfDa("");
      handleChange("daysDfDa", "");
    }
  }, [
    formattedDateForwarededLegalStaff,
    formattedDateApprovedLegal,
    editedRecord.days_approved,
  ]);

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
                  <Input
                    value={localRecord.docket_no || ""}
                    readOnly={!isEditing}
                    placeholder="No data"
                    className="textbox-label"
                    onChange={(e) =>
                      handleInputChange("docket_no", e.target.value)
                    }
                  />
                </Paragraph>
              </Col>

              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>DENR PAB Case No.</strong>
                  <Input
                    value={localRecord.pab_case_no || ""}
                    readOnly={!isEditing}
                    placeholder="No data"
                    className="textbox-label"
                    onChange={(e) =>
                      handleInputChange("pab_case_no", e.target.value)
                    }
                  />
                </Paragraph>
              </Col>
            </Row>

            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>Date Forwarded to Legal Staff:</strong>
                  <ConfigProvider
                    theme={{
                      components: {
                        DatePicker: {
                          fontSize: "11px",
                          height: "29px",
                          padding: "4px 8px",
                        },
                      },
                    }}
                  >
                    <DatePicker
                      value={
                        formattedDateForwarededLegalStaff
                          ? dayjs(
                              formattedDateForwarededLegalStaff,
                              "MM/DD/YYYY"
                            )
                          : null
                      }
                      onChange={(date) => {
                        const newDate = date ? date.format("MM/DD/YYYY") : "";
                        handleChange("date_forwarded_legal", newDate);
                      }}
                      disabled={!isEditing}
                      format="MM/DD/YYYY"
                      placeholder="MM/DD/YYYY"
                      className="custom-date-picker"
                      style={{ width: "100%" }}
                    />
                  </ConfigProvider>
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>Date Approved by Chief Legal:</strong>
                  <ConfigProvider
                    theme={{
                      components: {
                        DatePicker: {
                          fontSize: "11px",
                          height: "29px",
                          padding: "4px 8px",
                        },
                      },
                    }}
                  >
                    {" "}
                    <DatePicker
                      value={
                        formattedDateApprovedLegal
                          ? dayjs(formattedDateApprovedLegal, "MM/DD/YYYY")
                          : null
                      }
                      onChange={(date) => {
                        const newDate = date ? date.format("MM/DD/YYYY") : "";
                        handleChange("date_approved_legal", newDate);
                      }}
                      disabled={!isEditing}
                      format="MM/DD/YYYY"
                      placeholder="MM/DD/YYYY"
                      className="custom-date-picker"
                      style={{ width: "100%" }}
                    />
                  </ConfigProvider>
                </Paragraph>
              </Col>
            </Row>

            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <span className="label_container_legal">
                    <strong className="label_title_legal">No. of Days</strong>
                    <p className="label_legal">
                      (Forwarded to LSU Staff VS. Approved by LSU Chief)
                    </p>
                  </span>
                  <Input
                    value={daysDfDa}
                    readOnly
                    placeholder="No data"
                    className="disabled-input-legal-days"
                  />
                </Paragraph>
              </Col>

              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>NOV Released Date:</strong>
                  <ConfigProvider
                    theme={{
                      components: {
                        DatePicker: {
                          fontSize: "11px",
                          height: "29px",
                          padding: "4px 8px",
                        },
                      },
                    }}
                  >
                    {" "}
                    <DatePicker
                      value={
                        formattedNOVRelease
                          ? dayjs(formattedNOVRelease, "MM/DD/YYYY")
                          : null
                      }
                      onChange={(date) => {
                        const newDate = date ? date.format("MM/DD/YYYY") : "";
                        handleChange("nov_released_date", newDate);
                      }}
                      disabled={!isEditing}
                      format="MM/DD/YYYY"
                      placeholder="MM/DD/YYYY"
                      className="textbox_legal_survey"
                      style={{ width: "100%" }}
                    />
                  </ConfigProvider>
                </Paragraph>
              </Col>
            </Row>
          </Card>

          <Card
            style={{
              width: 450,
              marginBottom: 20,
              padding: 5,
            }}
            size="small"
            title="VIOLATIONS"
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={24} lg={24}>
                <Paragraph>
                  <strong>Violation PD1586:</strong>
                  <TextArea
                    value={localRecord.v_pd1586 || ""}
                    readOnly={!isEditing}
                    placeholder="No data"
                    className=""
                    onChange={(e) =>
                      handleInputChange("v_pd1586", e.target.value)
                    }
                    rows={3}
                  />
                </Paragraph>
                <Paragraph>
                  <strong>Violation RA9275:</strong>
                  <TextArea
                    value={localRecord.v_ra9275 || ""}
                    readOnly={!isEditing}
                    placeholder="No data"
                    className=""
                    onChange={(e) =>
                      handleInputChange("v_ra9275", e.target.value)
                    }
                    rows={3}
                  />
                </Paragraph>
                <Paragraph>
                  <strong>Violation RA8749:</strong>
                  <TextArea
                    value={localRecord.v_ra8749 || ""}
                    readOnly={!isEditing}
                    placeholder="No data"
                    className=""
                    onChange={(e) =>
                      handleInputChange("v_ra8749", e.target.value)
                    }
                    rows={3}
                  />
                </Paragraph>
                <Paragraph>
                  <strong>Violation HAZWASTE:</strong>
                  <TextArea
                    value={localRecord.v_haz || ""}
                    readOnly={!isEditing}
                    placeholder="No data"
                    className=""
                    onChange={(e) => handleInputChange("v_haz", e.target.value)}
                    rows={3}
                  />
                </Paragraph>
                <Paragraph>
                  <strong>Violation TOXIC CHEM:</strong>
                  <TextArea
                    value={localRecord.v_toxichem || ""}
                    readOnly={!isEditing}
                    placeholder="No data"
                    className=""
                    onChange={(e) =>
                      handleInputChange("v_toxichem", e.target.value)
                    }
                    rows={3}
                  />
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
            title="Technical Conference"
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>TC Date Scheduled:</strong>
                  <ConfigProvider
                    theme={{
                      components: {
                        DatePicker: {
                          fontSize: "11px",
                          height: "29px",
                          padding: "4px 8px",
                        },
                      },
                    }}
                  >
                    <DatePicker
                      value={
                        formattedTCSchedule
                          ? dayjs(formattedTCSchedule, "MM/DD/YYYY")
                          : null
                      }
                      onChange={(date) => {
                        const newDate = date ? date.format("MM/DD/YYYY") : "";
                        handleChange("tc_schedule", newDate);
                      }}
                      disabled={!isEditing}
                      format="MM/DD/YYYY"
                      placeholder="MM/DD/YYYY"
                      className="custom-date-picker"
                      style={{ width: "100%" }}
                    />
                  </ConfigProvider>
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>TC Date Actual:</strong>
                  <ConfigProvider
                    theme={{
                      components: {
                        DatePicker: {
                          fontSize: "11px",
                          height: "29px",
                          padding: "4px 8px",
                        },
                      },
                    }}
                  >
                    {" "}
                    <DatePicker
                      value={
                        formattedTCActual
                          ? dayjs(formattedTCActual, "MM/DD/YYYY")
                          : null
                      }
                      onChange={(date) => {
                        const newDate = date ? date.format("MM/DD/YYYY") : "";
                        handleChange("tc_actual", newDate);
                      }}
                      disabled={!isEditing}
                      format="MM/DD/YYYY"
                      placeholder="MM/DD/YYYY"
                      className="custom-date-picker"
                      style={{ width: "100%" }}
                    />
                  </ConfigProvider>
                </Paragraph>
              </Col>
            </Row>

            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>Time:</strong>
                  <ConfigProvider
                    theme={{
                      components: {
                        TimePicker: {
                          fontSize: "11px",
                          height: "29px",
                          padding: "4px 8px",
                        },
                      },
                    }}
                  >
                    <TimePicker
                      value={
                        localRecord.tc_time
                          ? dayjs(localRecord.tc_time, "hh:mm:ss A") // Change format to match the input time
                          : null
                      }
                      disabled={!isEditing}
                      placeholder="Select Time"
                      onChange={(time) => {
                        const newValue = time ? time.format("hh:mm A") : "";
                        handleInputChange("tc_time", newValue);
                      }}
                      use12Hours
                      format="hh:mm A"
                      minuteStep={15}
                      style={{ width: "100%" }}
                    />
                  </ConfigProvider>
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>Assigned Legal Officer:</strong>
                  <LegalOfficer
                    value={localRecord.tc_legal_officer || ""} // Handle undefined handler
                    readOnly={!isEditing}
                    placeholder="No data"
                    onChange={(value) =>
                      handleInputChange("tc_legal_officer", value)
                    }
                    className="textbox_legal"
                  />
                </Paragraph>
              </Col>
            </Row>

            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={24} lg={24}>
                <Paragraph style={{ display: "flex", flexDirection: "column" }}>
                  <strong>
                    TC Commitment/Deadline of Compliance:{" "}
                    <i> &nbsp; (Paste Link Here)</i>
                  </strong>
                  <div
                    style={{
                      position: "relative",
                      width: "100%",
                      marginTop: "10px",
                    }}
                  >
                    <TextArea
                      value={localRecord.tc_commitment || ""}
                      readOnly={!isEditing}
                      placeholder="No data"
                      onChange={(e) => {
                        const newValue = e.target.value;
                        handleInputChange("tc_commitment", newValue);
                      }}
                      rows={2}
                    />

                    {localRecord.tc_commitment && (
                      <Tooltip
                        title={
                          <div style={{ fontSize: "10px" }}>Open Link</div>
                        }
                        placement="topRight"
                      >
                        <Button
                          type="primary"
                          size="small"
                          icon={<LinkOutlined />}
                          onClick={() => {
                            const url = localRecord.tc_commitment;

                            // Function to check if the URL is valid
                            const isValidUrl = (string) => {
                              try {
                                new URL(string);
                                return true;
                              } catch (error) {
                                return false;
                              }
                            };

                            if (isValidUrl(url)) {
                              window.open(url, "_blank"); // Open link if valid
                            } else {
                              Swal.fire({
                                icon: "error",
                                title: "Invalid Link",
                                text: "The provided link is not valid. Please check and try again.",
                              });
                            }
                          }}
                          style={{
                            position: "absolute",
                            top: "-30px", // Adjust as necessary for vertical positioning
                            right: "4px", // Adjust as necessary for horizontal positioning
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
              width: 450,
              marginBottom: 20,
              padding: 5,
            }}
            size="small"
            title="For Order/Resolution"
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={24} lg={24}>
                <Paragraph style={{ display: "flex", flexDirection: "column" }}>
                  <strong>
                    Position Paper: <i> &nbsp; (Paste Link Here)</i>
                  </strong>
                  <div style={{ position: "relative", width: "100%" }}>
                    <TextArea
                      value={localRecord.pos_paper || ""}
                      readOnly={!isEditing}
                      placeholder="No data"
                      onChange={(e) => {
                        const newValue = e.target.value;
                        handleInputChange("pos_paper", newValue);
                      }}
                      rows={2}
                    />

                    {localRecord.pos_paper && (
                      <Tooltip
                        title={
                          <div style={{ fontSize: "10px" }}>Open Link</div>
                        }
                        placement="topRight"
                      >
                        <Button
                          type="primary"
                          size="small"
                          icon={<LinkOutlined />}
                          onClick={() => {
                            const url = localRecord.pos_paper;

                            // Function to check if the URL is valid
                            const isValidUrl = (string) => {
                              try {
                                new URL(string);
                                return true;
                              } catch (error) {
                                return false;
                              }
                            };

                            if (isValidUrl(url)) {
                              window.open(url, "_blank"); // Open link if valid
                            } else {
                              Swal.fire({
                                icon: "error",
                                title: "Invalid Link",
                                text: "The provided link is not valid. Please check and try again.",
                              });
                            }
                          }}
                          style={{
                            position: "absolute",
                            top: "-30px", // Adjust as necessary for vertical positioning
                            right: "4px", // Adjust as necessary for horizontal positioning
                          }}
                        />
                      </Tooltip>
                    )}
                  </div>
                </Paragraph>
              </Col>
            </Row>

            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>Date Payment of Penalty:</strong>
                  <ConfigProvider
                    theme={{
                      components: {
                        DatePicker: {
                          fontSize: "11px",
                          height: "29px",
                          padding: "4px 8px",
                        },
                      },
                    }}
                  >
                    {" "}
                    <DatePicker
                      value={
                        penaltyDate ? dayjs(penaltyDate, "MM/DD/YYYY") : null
                      }
                      onChange={(date) => {
                        const newDate = date ? date.format("MM/DD/YYYY") : "";
                        handleChange("penalty_date", newDate);
                      }}
                      disabled={!isEditing}
                      format="MM/DD/YYYY"
                      placeholder="MM/DD/YYYY"
                      className="custom-date-picker"
                      style={{ width: "100%" }}
                    />
                  </ConfigProvider>
                </Paragraph>
              </Col>
            </Row>

            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>Penalty Amount:</strong>
                  {penaltyAmounts.map((amount, index) => (
                    <div key={`penalty-amount-${index}`}>
                      <Input
                        value={amount}
                        onBlur={() => handleAmountBlur(index)}
                        disabled={!isEditing}
                        placeholder="No data"
                        onChange={(e) => {
                          handlePenaltyInputChange(
                            "penalty_amount",
                            e.target.value,
                            index
                          );
                        }}
                        className="textbox-label-payments"
                        prefix="₱"
                      />
                    </div>
                  ))}
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>Official Receipt (OR) Number:</strong>
                  {penaltyOrNumbers.map((number, index) => (
                    <div key={`penalty-or-number-${index}`}>
                      <Input
                        value={number}
                        prefix="#"
                        disabled={!isEditing}
                        placeholder="No data"
                        onChange={(e) => {
                          handlePenaltyInputChange(
                            "penalty_or_number",
                            e.target.value,
                            index
                          );
                        }}
                        className="textbox-label-payments"
                      />
                    </div>
                  ))}
                </Paragraph>
              </Col>
            </Row>
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={4} lg={4}>
                <Button
                  type="primary"
                  size="small"
                  onClick={addNewFields}
                  disabled={!isEditing}
                  icon={<PlusCircleFilled />}
                >
                  Add
                </Button>
              </Col>
              <Col xs={24} sm={24} md={5} lg={5}>
                {hasNewFields && (
                  <Button
                    disabled={!isEditing}
                    type="primary"
                    size="small"
                    danger
                    icon={<DeleteFilled />}
                    onClick={() => {
                      removeField(penaltyAmounts.length - 1);
                      if (
                        penaltyAmounts.length <=
                        loadedInitialFields.length + 1
                      ) {
                        setHasNewFields(false);
                      }
                    }}
                  >
                    Remove
                  </Button>
                )}
              </Col>
            </Row>

            <Row gutter={[16, 16]} className="row-margin">
              <Col xs={24} sm={24} md={24} lg={24}>
                <Paragraph>
                  <Checkbox
                    disabled={!isEditing}
                    checked={localRecord.tc_compliance === "✔"}
                    onChange={(e) => handleCheckboxChange("tc_compliance", e)}
                  >
                    <strong className="label-title">
                      Compliance with TC Commitment/Order
                    </strong>
                  </Checkbox>
                </Paragraph>
              </Col>
            </Row>

            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={24} lg={24}>
                <Paragraph>
                  <strong>Remarks:</strong>
                  <Form.Item name="tc_compliance_remarks" noStyle>
                    <TextArea
                      value={localRecord.tc_compliance_remarks || ""}
                      readOnly={!isEditing}
                      placeholder="No data"
                      onChange={(e) => {
                        const newValue = e.target.value;
                        handleInputChange("tc_compliance_remarks", newValue);
                      }}
                      className="textbox-label"
                      rows={2}
                    />
                  </Form.Item>
                </Paragraph>
              </Col>
            </Row>

            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={24} lg={24}>
                <Paragraph>
                  <Checkbox
                    disabled={!isEditing}
                    checked={localRecord.issued_resolution === "✔"}
                    onChange={(e) =>
                      handleCheckboxChange("issued_resolution", e)
                    }
                  >
                    <strong className="label-title">Issued Resolution</strong>
                  </Checkbox>
                </Paragraph>
              </Col>
            </Row>

            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={24} lg={24}>
                <Paragraph>
                  <Checkbox
                    disabled={!isEditing}
                    checked={localRecord.issued_order === "✔"}
                    onChange={(e) => handleCheckboxChange("issued_order", e)}
                  >
                    <strong className="label-title">Issued Order</strong>
                  </Checkbox>
                </Paragraph>
              </Col>
            </Row>

            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={24} lg={24}>
                <Paragraph>
                  <strong>Order Status:</strong>
                  <Form.Item name="order_status" noStyle>
                    <TextArea
                      value={localRecord.order_status || ""}
                      readOnly={!isEditing}
                      placeholder="No data"
                      onChange={(e) => {
                        const newValue = e.target.value;
                        handleInputChange("tc_compliance_remarks", newValue);
                      }}
                      className="textbox-label"
                      rows={2}
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
