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
import "./legal.css";
import LegalOfficers from "../../../components/Autocomplete/LegalOfficers";

const { Paragraph } = Typography;

const customToken = {
  token: {
    componentSize: "small",
    fontSize: 9,
    fontSizeSM: 9,
  },
};

const Legal = ({ record, handleChange, isEditing }) => {
  const handleDateChange = (dateString) => {
    if (dateString) {
      handleChange("tc_date_sched", dateString);
    } else {
      handleChange("tc_date_sched", null);
    }
  };

  const convertToMMDDYYYY = (dateString) => {
    if (typeof dateString === "number") {
      const date = new Date(Math.round((dateString - 25569) * 86400 * 1000));
      return `${padZero(date.getMonth() + 1)}/${padZero(date.getDate())}/${date.getFullYear()}`;
    } else {
      const date = dayjs(dateString, [
        "MM/DD/YYYY",
        "M/D/YYYY",
        "YYYY-MM-DD",
        "YYYY/MM/DD",
        "@",
        "MMM D, YYYY",
        "MMMM DD, YYYY",
      ], true);
      return date.isValid() ? date.format("MM/DD/YYYY") : null;
    }
  };

  const padZero = (num) => (num < 10 ? "0" : "") + num;

  // Convert the date before loading it into the DatePicker
  const formattedDate = convertToMMDDYYYY(record.tc_date_sched);
  const formattedDateTCAcual = convertToMMDDYYYY(record.tc_date_actual);
  const formattedDateNOVRelease = convertToMMDDYYYY(record.nov_date_issued);
  const formattedDateLegalForwarded = convertToMMDDYYYY(record.date_forwarded);
  const formattedDateLegalApproved = convertToMMDDYYYY(record.date_approved_clegal);
  const formattedDatePenalty = convertToMMDDYYYY(record.penalty_payment_date);

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
                    onChange={(e) => handleChange("denr_pab_case_no", e.target.value)}
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
                      formattedDateNOVRelease ? dayjs(formattedDateNOVRelease, "MM/DD/YYYY") : null
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

              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph className="paragraph-container">
                  <strong>Amount</strong>
                  <Input
                    prefix={<span>&#x20B1;</span>} // Add Philippine Peso currency symbol
                    value={record ? record.amount : ""}
                    onChange={(e) => {
                      const regex = /^[0-9]+(\.[0-9][0-9]?)?$/; // Allow only numbers and optional decimal point
                      if (regex.test(e.target.value)) {
                        handleChange("amount", e.target.value);
                      }
                    }}
                    disabled={!isEditing}
                    placeholder="No data"
                    className="text-area-legal"
                  />
                </Paragraph>
              </Col>
            </Row>

            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph className="paragraph-container">
                  <strong>Penalty Payment Date</strong>
                  <DatePicker
                    value={
                      formattedDatePenalty ? dayjs(formattedDatePenalty, "MM/DD/YYYY") : null
                    }
                    onChange={(date) => {
                      const newDate = date ? date.format("MM/DD/YYYY") : "";
                      handleChange("penalty_payment_date", newDate);
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
                <Paragraph className="paragraph-container">
                  <strong>TC Date Scheduled:</strong>
                  <DatePicker
                    value={formattedDate ? dayjs(formattedDate, "MM/DD/YYYY") : null}
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
                    value={formattedDateTCAcual ? dayjs(formattedDateTCAcual, "MM/DD/YYYY") : null}
                    onChange={(date) => {
                      const newDate = date ? date.format("MM/DD/YYYY") : "";
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
            </Row>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Legal;
