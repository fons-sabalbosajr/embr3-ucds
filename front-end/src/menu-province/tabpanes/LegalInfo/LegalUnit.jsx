import React from "react";
import {
  Input,
  Row,
  Col,
  Checkbox,
  Typography,
  Card,
  TimePicker,
  DatePicker,
  ConfigProvider,
} from "antd";
import TextArea from "antd/es/input/TextArea";
import dayjs from "dayjs";
import "./legalunit.css";
import LegalOfficers from "../../../components/Autocomplete/LegalOfficers";

const { Paragraph } = Typography;

const customToken = {
  token: {
    componentSize: "small",
    fontSize: 9,
    fontSizeSM: 9,
  },
};


const LegalUnit = ({ editedRecord, handleChange, isEditing }) => {
  const handleDateChange = (dateString) => {
    //console.log("handleDateChange called with:", dateString);
    if (dateString) {
      handleChange("tc_date_sched", dateString);
    } else {
      handleChange("tc_date_sched", null);
    }
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
  const formattedDate = convertToMMDDYYYY(editedRecord.tc_date_sched);
  const formattedDateTCAcual = convertToMMDDYYYY(editedRecord.tc_date_actual);
  const formattedDateNOVRelease = convertToMMDDYYYY(editedRecord.nov_released);
  const formattedDateLegalForwarded = convertToMMDDYYYY(
    editedRecord.date_forwarded
  );
  const formattedDateLegalApproved = convertToMMDDYYYY(
    editedRecord.date_approved_clegal
  );
  const formattedDatePenalty = convertToMMDDYYYY(editedRecord.penalty);

  return (
    <div>
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
                <Paragraph className="paragraph-container">
                  <strong>Docket No.</strong>
                  <Input
                   value={editedRecord ? editedRecord.docket_no : ""}
                    onChange={(e) => handleChange("docket_no", e.target.value)}
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={1}
                    className="text-area-legal"
                  />
                </Paragraph>
              </Col>

              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph className="paragraph-container">
                  <strong>DENR PAB Case No.</strong>
                  <Input
                    value={editedRecord ? editedRecord.denr_pab_case_no : ""}
                    onChange={(e) =>
                      handleChange("denr_pab_case_no", e.target.value)
                    }
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={1}
                    className="text-area-legal"
                  />
                </Paragraph>
              </Col>

              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph className="paragraph-container">
                  <strong>Date Forwarded to Legal Staff</strong>
                  <DatePicker
                    value={
                      formattedDateLegalForwarded
                        ? dayjs(formattedDateLegalForwarded, "MM/DD/YYYY")
                        : null
                    }
                    onChange={(date) => {
                      const newDate = date ? date.format("MM/DD/YYYY") : "";
                      handleChange("date_forwarded", newDate);
                    }}
                    disabled={!isEditing}
                    format="MM/DD/YYYY"
                    placeholder="MM/DD/YYYY"
                    className="text-area-legal custom-date-picker"
                    style={{ width: "100%" }}
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph className="paragraph-container">
                  <span className="label_container_legal">
                    <strong className="label_title_legal">
                      Total No. of Days:
                    </strong>
                    <p className="label_legal">
                      (Date Forwarded to staff vs. Date Approved)
                    </p>
                  </span>
                  <Input
                    value={editedRecord ? editedRecord.days_dfda : ""}
                    onChange={(e) => handleChange("days_dfda", e.target.value)}
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={1}
                    className="text-area-legal"
                  />
                </Paragraph>
              </Col>
            </Row>
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph className="paragraph-container">
                  <strong>Date Approved by Chief Legal</strong>
                  <DatePicker
                    value={
                      formattedDateLegalApproved
                        ? dayjs(formattedDateLegalApproved, "MM/DD/YYYY")
                        : null
                    }
                    onChange={(date) => {
                      const newDate = date ? date.format("MM/DD/YYYY") : "";
                      handleChange("date_approved_clegal", newDate);
                    }}
                    disabled={!isEditing}
                    format="MM/DD/YYYY"
                    placeholder="MM/DD/YYYY"
                    className="text-area-legal custom-date-picker"
                    style={{ width: "100%" }}
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}></Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph className="paragraph-container">
                  <strong>NOV Date Released</strong>
                  <DatePicker
                    value={
                      formattedDateNOVRelease
                        ? dayjs(formattedDateNOVRelease, "MM/DD/YYYY")
                        : null
                    }
                    onChange={(date) => {
                      const newDate = date ? date.format("MM/DD/YYYY") : "";
                      handleChange("nov_released", newDate);
                    }}
                    disabled={!isEditing}
                    format="MM/DD/YYYY"
                    placeholder="No data"
                    className="text-area-legal custom-date-picker"
                    style={{ width: "100%" }}
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph className="paragraph-container">
                  <strong>Service Mode</strong>
                  <Input
                    value={editedRecord ? editedRecord.service_mode : ""}
                    onChange={(e) =>
                      handleChange("service_mode", e.target.value)
                    }
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={1}
                    className="text-area-legal"
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
            title="VIOLATION/S"
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={24} lg={24}>
                <Paragraph className="paragraph-container">
                  <strong>PD1586:</strong>
                  <TextArea
                    value={editedRecord ? editedRecord.v_pd1586 : ""}
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
                    value={editedRecord ? editedRecord.v_ra9275 : ""}
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
                    value={editedRecord ? editedRecord.v_ra8749 : ""}
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
                  <strong>HAZWASTE:</strong>
                  <TextArea
                    value={editedRecord ? editedRecord.v_haz : ""}
                    onChange={(e) => handleChange("v_haz", e.target.value)}
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={3}
                    className="text-area-legal"
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={24} lg={24}>
                <Paragraph className="paragraph-container">
                  <strong>TOXIC CHEM:</strong>
                  <TextArea
                    value={editedRecord ? editedRecord.v_tchem : ""}
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
              width: 600,
              marginBottom: 20,
              padding: 5,
            }}
            size="small"
            title="Technical Conference"
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph className="paragraph-container">
                  <strong>TC Date Scheduled:</strong>
                  <DatePicker
                    value={
                      formattedDate ? dayjs(formattedDate, "MM/DD/YYYY") : null
                    }
                    onChange={(date, dateString) => {
                      const parsedDate = dayjs(dateString, "MM/DD/YYYY", false);
                      if (parsedDate.isValid()) {
                        handleDateChange(parsedDate.format("MM/DD/YYYY"));
                      } else {
                        handleDateChange(null);
                      }
                    }}
                    disabled={!isEditing}
                    format="MM/DD/YYYY"
                    maxDate={dayjs()} // Set the maximum date to today
                    //disabledDate={(current) => current > dayjs()} // Disable dates after today
                    placeholder="No data"
                    className="text-area-legal custom-date-picker"
                    style={{ width: "100%" }}
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph className="paragraph-container">
                  <strong>TC Date (Actual):</strong>
                  <DatePicker
                    value={
                      formattedDateTCAcual
                        ? dayjs(formattedDateTCAcual, "MM/DD/YYYY")
                        : null
                    }
                    onChange={(date) => {
                      const newDate = date ? date.format("MM/DD/YYYY") : "";
                      console.log(`New date selected: ${newDate}`);
                      handleChange("tc_date_actual", newDate);
                    }}
                    disabled={!isEditing}
                    placeholder="MM/DD/YYYY"
                    format="MM/DD/YYYY"
                    className="text-area-legal custom-date-picker"
                    style={{ width: "100%" }}
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph className="paragraph-container">
                  <strong>Time:</strong>
                  <ConfigProvider token={customToken.token}>
                    <TimePicker
                      value={
                        editedRecord
                          ? dayjs(editedRecord.time, "hh:mm a")
                          : null
                      }
                      onOk={(time) => {
                        const newTime = time ? time.format("hh:mm a") : "";
                        console.log(`New time selected: ${newTime}`);
                        handleChange("time", newTime);
                      }}
                      disabled={!isEditing}
                      format="hh:mm a"
                      placeholder="No data"
                      className="text-area-legal custom-time-picker time-picker-small"
                      style={{ width: "100%" }}
                    />
                  </ConfigProvider>
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph className="paragraph-container">
                  <strong className="label_title">Legal Officer:</strong>

                  <LegalOfficers
                    value={editedRecord ? editedRecord.legal_officer : ""}
                    onChange={(value) => handleChange("legal_officer", value)}
                    disabled={!isEditing}
                    placeholder="No data"
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={24} lg={24} className="col-format-tc">
                <Paragraph className="paragraph-container">
                  <strong>TC Commitment/Deadline of Compliance</strong>
                  <span>
                    <i> &nbsp; (Paste Link Here)</i>
                  </span>
                  <TextArea
                    value={editedRecord ? editedRecord.tc_commitment : ""}
                    onChange={(e) =>
                      handleChange("tc_commitment", e.target.value)
                    }
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={2}
                    className="text-area-legal"
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
            title="For Order/Resolution"
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={24} lg={24}>
                <Paragraph className="paragraph-container">
                  <strong>Position Paper:</strong>
                  <Input
                    value={editedRecord ? editedRecord.pos_paper : ""}
                    onChange={(e) => handleChange("pos_paper", e.target.value)}
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={3}
                    className="text-area-legal"
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph className="paragraph-container">
                  <strong>Date Payment of Penalty:</strong>
                  <DatePicker
                    value={
                      formattedDatePenalty
                        ? dayjs(formattedDatePenalty, "MM/DD/YYYY")
                        : null
                    }
                    onChange={(date) => {
                      const newDate = date ? date.format("MM/DD/YYYY") : "";
                      console.log(`New date selected: ${newDate}`);
                      handleChange("penalty", newDate);
                    }}
                    disabled={!isEditing}
                    format="MM/DD/YYYY"
                    placeholder="No data"
                    className="text-area-legal custom-date-picker"
                    style={{ width: "100%" }}
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}></Col>
              <Col xs={24} sm={24} md={12} lg={12} className="col-format">
                <Paragraph className="paragraph-container">
                  <strong>Amount:</strong>
                  <Input
                    prefix={<span>&#x20B1;</span>} // Add Philippine Peso currency symbol
                    value={editedRecord ? editedRecord.amount : ""}
                    onChange={(e) => {
                      const regex = /^[0-9]+(\.[0-9][0-9]?)?$/; // Allow only numbers and optional decimal point
                      if (regex.test(e.target.value)) {
                        handleChange("amount", e.target.value);
                      }
                    }}
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={3}
                    className="text-area-legal"
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12} className="col-format">
                <Paragraph className="paragraph-container">
                  <strong>Official Receipt (OR) Number:</strong>
                  <Input
                    prefix={<span>#</span>} // Add "#" symbol
                    value={editedRecord ? editedRecord.or_number : ""}
                    onChange={(e) => handleChange("or_number", e.target.value)}
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={3}
                    className="text-area-legal"
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={24} lg={24}>
                <Paragraph>
                  <Checkbox
                    checked={editedRecord?.tc_order_compliance === "✔"}
                    disabled={!isEditing}
                    onChange={(e) =>
                      handleChange(
                        "tc_order_compliance",
                        e.target.checked ? "✔" : ""
                      )
                    }
                    style={{ fontSize: "15px" }}
                  >
                    {editedRecord?.tc_order_compliance === "✔" ? "" : ""}
                  </Checkbox>
                  <strong>Compliance with TC Commitment/Order</strong> <br />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={24} lg={24}>
                <Paragraph className="paragraph-container">
                  <strong>Remarks:</strong>
                  <TextArea
                    value={editedRecord ? editedRecord.remarks : ""}
                    onChange={(e) => handleChange("remarks", e.target.value)}
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={3}
                    className="text-area-legal"
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={24} lg={24} className="col-format">
                <Paragraph className="paragraph-container">
                  <Checkbox
                    checked={editedRecord?.resolution === "✔"}
                    disabled={!isEditing}
                    onChange={(e) =>
                      handleChange("resolution", e.target.checked ? "✔" : "")
                    }
                    style={{ fontSize: "15px" }}
                  >
                    {editedRecord?.resolution === "✔" ? "" : ""}
                  </Checkbox>
                  <strong>Issued Resolution</strong> <br />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={24} lg={24}>
                <Paragraph className="paragraph-container">
                  <Checkbox
                    checked={editedRecord?.order === "✔"}
                    disabled={!isEditing}
                    onChange={(e) =>
                      handleChange("order", e.target.checked ? "✔" : "")
                    }
                    style={{ fontSize: "15px" }}
                  >
                    {editedRecord?.order === "✔" ? "" : ""}
                  </Checkbox>
                  <strong>Issued Order</strong> <br />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={24} lg={24}>
                <Paragraph className="paragraph-container">
                  <strong>Order Status:</strong>
                  <TextArea
                    value={editedRecord ? editedRecord.order_status : ""}
                    onChange={(e) =>
                      handleChange("order_status", e.target.value)
                    }
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
      </Row>
    </div>
  );
};

export default LegalUnit;
