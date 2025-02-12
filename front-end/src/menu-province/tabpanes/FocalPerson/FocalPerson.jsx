import React, { useState, useEffect } from "react";
import {
  Input,
  Row,
  Col,
  Checkbox,
  Typography,
  Card,
  DatePicker,
  ConfigProvider,
  Select,
} from "antd";
import TextArea from "antd/es/input/TextArea";
import dayjs from "dayjs";
import "./focalperson.css";
import SectionInCharged from "../../../components/Autocomplete/SectionInCharge";
import Inspector from "../../../components/Autocomplete/Inspectors";
import Month from "../../../components/Autocomplete/Month";
import ReportType from "../../../components/Autocomplete/ReportType";
import InspectionType from "../../../components/Autocomplete/InspectionType";
import WWTFType from "../../../components/Autocomplete/WWTFType";
import ProjectStatus from "../../../components/Autocomplete/ProjectStatus";

const { Paragraph } = Typography;

const { Option } = Select;

function calculateWeekdayDiff(startDate, endDate) {
  const startDayjs = dayjs(startDate);
  const endDayjs = dayjs(endDate);
  const totalDays = endDayjs.diff(startDayjs, "day");
  let weekendDays = 0;

  for (let i = 0; i < totalDays; i++) {
    const day = startDayjs.add(i, "day");
    const dayOfWeek = day.day(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      // Sunday or Saturday
      weekendDays++;
    }
  }

  const weekdayDiff = Math.max(1, totalDays - weekendDays);
  const dayString = weekdayDiff === 1 ? " day" : " days";
  return `${weekdayDiff}${dayString}`;
}

const FocalPerson = ({
  editedRecord,
  handleChange,
  isEditing,
  currentUser,
}) => {
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
  const formattedDateMonitored = convertToMMDDYYYY(editedRecord.date_monitored);
  const formattedDateRouted = convertToMMDDYYYY(editedRecord.date_routed);
  const formattedDateSigned = convertToMMDDYYYY(editedRecord.date_signed);

  const [daysDmds, setDaysDmds] = useState(
    editedRecord ? editedRecord.days_dmds : 0
  );
  const [daysDsdrs, setDaysDsdrs] = useState(
    editedRecord ? editedRecord.days_dsdrs : 0
  );

  useEffect(() => {
    if (formattedDateMonitored && formattedDateRouted) {
      const newDaysDmds = calculateWeekdayDiff(
        formattedDateMonitored,
        formattedDateRouted
      );
      setDaysDmds(newDaysDmds);
      handleChange("days_dmds", newDaysDmds);
    }
  }, [formattedDateMonitored, formattedDateRouted]);

  useEffect(() => {
    if (formattedDateRouted && formattedDateSigned) {
      const newDaysDsdrs = calculateWeekdayDiff(
        formattedDateRouted,
        formattedDateSigned
      );
      setDaysDsdrs(newDaysDsdrs);
      handleChange("days_dsdrs", newDaysDsdrs); // Add this line
    }
  }, [formattedDateRouted, formattedDateSigned]);

  const calculateBOD = (empNoTotal, wwtfType) => {
    let bod = 0;

    const wwtfTypeValues = {
      WWTF: 0.6,
      "SEPTIC TANK": 0.25,
      "DIRECT DISCHARGE": 1,
      "N/A": 0, // assuming N/A means 0
    };

    const v1 = wwtfTypeValues[wwtfType.toUpperCase()];
    const v2 = Number(empNoTotal);

    if (v2 === 0) {
      bod = "";
    } else if (wwtfType.toUpperCase() === "DIRECT DISCHARGE") {
      bod = (v2 * 0.0378).toFixed(4); // round to 4 decimal points
    } else {
      bod = (v2 * 0.0378 * (1 - v1)).toFixed(4); // round to 4 decimal points
    }

    return bod + " kg/day"; // add " kg/day" to the result
  };

  const [empNoTotal, setEmpNoTotal] = useState(
    editedRecord ? editedRecord.emp_no_total : ""
  );
  const [wwtftype, setWwtftype] = useState(
    editedRecord ? editedRecord.wwtftype : ""
  );
  const [bod, setBod] = useState(editedRecord ? editedRecord.bod : "");

  const handleEmpNoTotalChange = (e) => {
    const value = e.target.value;
    setEmpNoTotal(value);
    handleChange("emp_no_total", value);
    if (wwtftype) {
      const bodValue = calculateBOD(value, wwtftype);
      setBod(bodValue);
      handleChange("bod", bodValue);
    }
  };

  const handleWwtftypeChange = (value) => {
    setWwtftype(value);
    handleChange("wwtftype", value);
    if (empNoTotal) {
      if (value) {
        const bodValue = calculateBOD(empNoTotal, value);
        setBod(bodValue);
        handleChange("bod", bodValue);
      } else {
        setBod(0);
        handleChange("bod", 0);
      }
    }
  };

  const handleValueChange = (field, newValue) => {
    const oldValue = editedRecord[field]; // Capture the old value
    console.log(
      `Field: ${field}, Old Value: ${oldValue}, New Value: ${newValue}`
    );
  };

  // Extract permissions from currentUser
  const permissions = currentUser?.permissions || [];
  const canGenerateData = permissions[0];
  const canManageData = permissions[1];
  const canViewAdminPanel = permissions[2];
  const canViewDataHistory = permissions[3];

  const isCardDisabled = !canManageData;

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
        <Row gutter={[16, 16]} className="row-auto">
          <Col xs={24} sm={24} md={8} lg={8} className="modal-col">
            <Paragraph>
              <strong>Number of Employees</strong>
              <Input
                type="number"
                min="0"
                name="emp_no_total"
                value={empNoTotal}
                onChange={handleEmpNoTotalChange}
                disabled={!isEditing}
                placeholder="No data"
                className="textbox-label"
              />
            </Paragraph>
          </Col>
          <Col xs={24} sm={24} md={8} lg={8} className="modal-col">
            <Paragraph>
              <strong>Type of WWTF</strong>
              <WWTFType
                value={wwtftype}
                onChange={handleWwtftypeChange}
                disabled={!isEditing}
                placeholder="No data"
              />
            </Paragraph>
          </Col>
          <Col xs={24} sm={24} md={8} lg={8} className="modal-col">
            <Paragraph>
              <strong>BOD (kg/day)</strong>
              <Input
                value={bod}
                onChange={(e) => handleChange("bod", e.target.value)}
                disabled
                placeholder="No data"
                className="textbox-label"
              />
            </Paragraph>
          </Col>
        </Row>

        <Row gutter={[16, 16]} className="row-auto">
          <Col xs={24} sm={24} md={12} lg={12} className="modal-col">
            <Paragraph>
              <strong>Current Section In Charge</strong>
              <SectionInCharged
                value={editedRecord ? editedRecord.section_incharge : ""}
                onChange={(value) => handleChange("section_incharge", value)}
                disabled={!isEditing}
                placeholder="No data"
              />
            </Paragraph>
          </Col>
          <Paragraph>
            <strong>Inspector/Handler</strong>
            <Inspector
              value={editedRecord ? editedRecord.handler : ""}
              onChange={(value) => handleChange("handler", value)}
              disabled={!isEditing}
              placeholder="No data"
            />
          </Paragraph>
        </Row>

        <Row gutter={[16, 16]} className="row-auto">
          <Col xs={24} sm={24} md={12} lg={12} className="modal-col">
            <Paragraph>
              <strong>Schedule of Monitoring</strong>
              <Month
                value={editedRecord ? editedRecord.monitoring_sched : ""}
                onChange={(value) => handleChange("monitoring_sched", value)}
                disabled={!isEditing}
                placeholder="No data"
              />
            </Paragraph>

            <Paragraph>
              <strong>Project Status</strong>
              <ProjectStatus
                value={editedRecord ? editedRecord.project_status : ""}
                onChange={(value) => handleChange("project_status", value)}
                disabled={!isEditing}
                placeholder="No data"
              />
            </Paragraph>
          </Col>
        </Row>
      </Col>

      <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
        <Paragraph>
          <strong>IIS Reference No.</strong>
          <Input
            value={editedRecord ? editedRecord.iis_no : ""}
            onChange={(e) => handleChange("iis_no", e.target.value)}
            disabled={!isEditing}
            placeholder="No data"
            className="textbox-label"
          />
        </Paragraph>

        <Row gutter={[16, 16]} className="row-auto-date">
          <Col xs={24} sm={24} md={12} lg={12} className="modal-col">
            <Paragraph>
              <strong>Type of Inspection</strong>
              <InspectionType
                value={editedRecord ? editedRecord.insp_type : ""}
                onChange={(value) => handleChange("insp_type", value)}
                disabled={!isEditing}
                placeholder="No data"
              />
            </Paragraph>
          </Col>

          <Col xs={24} sm={24} md={12} lg={12} className="modal-col">
            <Paragraph>
              <strong>Type of Report Submitted</strong>
              <ReportType
                value={editedRecord ? editedRecord.report_type : ""}
                onChange={(value) => handleChange("report_type", value)}
                disabled={!isEditing}
                placeholder="No data"
              />
            </Paragraph>
          </Col>
        </Row>

        <Row gutter={[16, 16]} className="row-auto">
          <Col xs={24} sm={24} md={8} lg={8} className="modal-col">
            <Paragraph>
              <strong>Date Monitored</strong>
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
                    formattedDateMonitored
                      ? dayjs(formattedDateMonitored, "MM/DD/YYYY")
                      : null
                  }
                  onChange={(date) => {
                    const newDate = date ? date.format("MM/DD/YYYY") : "";
                    handleChange("date_monitored", newDate);
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
          <Col xs={24} sm={24} md={8} lg={8} className="modal-col">
            <Paragraph>
              <strong>Date Routed (IIS)</strong>
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
                    formattedDateRouted
                      ? dayjs(formattedDateRouted, "MM/DD/YYYY")
                      : null
                  }
                  onChange={(date) => {
                    const newDate = date ? date.format("MM/DD/YYYY") : "";
                    handleChange("date_routed", newDate);
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
          <Col xs={24} sm={24} md={8} lg={8} className="modal-col">
            <Paragraph>
              <strong>Date Signed</strong>
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
                    formattedDateSigned
                      ? dayjs(formattedDateSigned, "MM/DD/YYYY")
                      : null
                  }
                  onChange={(date) => {
                    const newDate = date ? date.format("MM/DD/YYYY") : "";
                    handleChange("date_signed", newDate);
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

        <Row gutter={[16, 16]} className="row-auto">
          <Col xs={24} sm={24} md={8} lg={8} className="modal-col">
            <Card
              style={{
                width: 500,
                marginBottom: 5,
              }}
              size="small"
            >
              <strong>PLANNING UNIT</strong>
              <Row gutter={[16, 16]} className="row-auto">
                <Col xs={24} sm={24} md={12} lg={12} className="modal-col">
                  <Paragraph>
                    <span className="label_container">
                      <strong className="label_title">
                        Total No. of Days:
                      </strong>
                      <p className="label-focal">
                        (Date Monitored vs. Date Submitted)
                      </p>
                    </span>
                    <Input
                      value={daysDmds}
                      onChange={(e) =>
                        handleChange("days_dmds", e.target.value)
                      }
                      disabled
                      placeholder="No data"
                      className="textbox-label"
                    />
                  </Paragraph>
                </Col>
                <Col xs={24} sm={24} md={12} lg={12} className="modal-col">
                  <Paragraph>
                    <span className="label_container">
                      <strong className="label_title">
                        Total No. of Days:
                      </strong>
                      <p className="label-focal">
                        (Date Submitted vs. Date Signed)
                      </p>
                    </span>
                    <Input
                      value={daysDsdrs}
                      onChange={(e) =>
                        handleChange("days_dsdrs", e.target.value)
                      }
                      disabled
                      placeholder="No data"
                      className="textbox-label"
                    />
                  </Paragraph>
                </Col>
              </Row>
              <Paragraph>
                <strong>Remarks/Recommendations:</strong> <br />
                <TextArea
                  value={
                    editedRecord ? editedRecord.remarks_recommendations : ""
                  }
                  onChange={(e) =>
                    handleChange("remarks_recommendations", e.target.value)
                  }
                  disabled={!isEditing}
                  placeholder="No data"
                  rows={3}
                  className="text-area"
                />
              </Paragraph>
              <Paragraph>
                <Checkbox
                  checked={
                    editedRecord?.pismu_tracking ===
                    "Report Tracked (received/routed to Planning Unit)"
                  }
                  disabled={isCardDisabled}
                  onChange={(e) => {
                    const isChecked = e.target.checked;
                    const newValue = isChecked
                      ? "Report Tracked (received/routed to Planning Unit)"
                      : "Report Untracked (not yet received/routed to Planning Unit)";
                    handleValueChange("pismu_tracking", newValue); // Log and handle the value change
                    handleChange("pismu_tracking", newValue); // Keep the existing handleChange for parent component
                  }}
                  style={{ fontSize: "12px" }}
                >
                  <span className="permit-label"></span>
                </Checkbox>

                <strong>Tracking of Reports (Received by Planning Unit)</strong>
              </Paragraph>
              <Paragraph>
                <Checkbox
                  checked={editedRecord?.with_nov === "✔"}
                  disabled={isCardDisabled}
                  onChange={(e) => {
                    const isChecked = e.target.checked;
                    const newValue = isChecked ? "✔" : "✘";
                    handleValueChange("with_nov", newValue);
                    handleChange("with_nov", newValue);
                  }}
                  style={{ fontSize: "12px" }}
                >
                  <span className="permit-label"></span>
                </Checkbox>

                <strong>With previously issued NOV?</strong>
              </Paragraph>
            </Card>
          </Col>
        </Row>
      </Col>
    </Row>
  );
};

export default FocalPerson;
