import React, { useState, useEffect } from "react";
import {
  Input,
  Row,
  Col,
  Checkbox,
  Typography,
  Card,
  DatePicker,
} from "antd";
import TextArea from "antd/es/input/TextArea";
import dayjs from "dayjs";
import SectionInCharged from "../../../components/Autocomplete/SectionInCharge";
import Inspector from "../../../components/Autocomplete/Inspectors";
import Month from "../../../components/Autocomplete/Month";
import InspectionType from "../../../components/Autocomplete/InspectionType";
import WWTFType from "../../../components/Autocomplete/WWTFType";
import ProjectStatus from "../../../components/Autocomplete/ProjectStatus";
import ChemicalPermitCategory from "../../../components/Autocomplete/Chem_Permit_Cat";
import ReportType from "../../../components/Autocomplete/ReportType";
import "./focalperson.css";

const { Paragraph } = Typography;

const FocalPerson = ({
  record,
  isEditing,
  handleChange,
}) => {
  const safeRecord = record || {};

  const [empNoTotal, setEmpNoTotal] = useState(safeRecord?.emp_no_total || "");
  const [wwtftype, setWwtftype] = useState(safeRecord?.wwtftype || "");
  const [bod, setBod] = useState(safeRecord?.bod || "");

  const calculateBOD = (empNoTotal, wwtfType) => {
    let bod = 0;
    const wwtfTypeValues = {
      WWTF: 0.6,
      "SEPTIC TANK": 0.25,
      "DIRECT DISCHARGE": 1,
      "N/A": 0,
    };
    const v1 = wwtfTypeValues[wwtfType?.toUpperCase()] ?? 0;
    const v2 = Number(empNoTotal);
    if (!v2) {
      bod = "";
    } else if (wwtfType?.toUpperCase() === "DIRECT DISCHARGE") {
      bod = (v2 * 0.0378).toFixed(4);
    } else {
      bod = (v2 * 0.0378 * (1 - v1)).toFixed(4);
    }
    return bod ? bod + " kg/day" : "";
  };

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
      const bodValue = calculateBOD(empNoTotal, value);
      setBod(bodValue);
      handleChange("bod", bodValue);
    } else {
      setBod("");
      handleChange("bod", "");
    }
  };

  // Date formatting and difference calculation
  const convertToMMDDYYYY = (dateString) => {
    if (!dateString) return "";
    const date = dayjs(dateString, [
      "MM/DD/YYYY",
      "M/D/YYYY",
      "YYYY-MM-DD",
      "YYYY/MM/DD",
      "MMM D, YYYY",
      "MMMM DD, YYYY",
    ]);
    return date.isValid() ? date.format("MM/DD/YYYY") : "";
  };

  const [daysDmds, setDaysDmds] = useState("");
  const [daysDsdrs, setDaysDsdrs] = useState("");

  const formattedDateMonitored = convertToMMDDYYYY(safeRecord.date_monitored);
  const formattedDateRouted = convertToMMDDYYYY(safeRecord.date_routed);
  const formattedDateSigned = convertToMMDDYYYY(safeRecord.date_signed);

  const calculateWeekdayDiff = (startDate, endDate) => {
    if (!startDate || !endDate) return "";
    const startDayjs = dayjs(startDate, "MM/DD/YYYY");
    const endDayjs = dayjs(endDate, "MM/DD/YYYY");
    const totalDays = endDayjs.diff(startDayjs, "day");
    let weekendDays = 0;
    for (let i = 0; i < totalDays; i++) {
      const day = startDayjs.add(i, "day");
      const dayOfWeek = day.day();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        weekendDays++;
      }
    }
    return `${Math.max(1, totalDays - weekendDays)} days`;
  };

  useEffect(() => {
    if (formattedDateMonitored && formattedDateRouted) {
      const daysDiff = calculateWeekdayDiff(formattedDateMonitored, formattedDateRouted);
      setDaysDmds(daysDiff);
      handleChange("days_dmds", daysDiff);
    } else {
      setDaysDmds("");
      handleChange("days_dmds", "");
    }
  }, [formattedDateMonitored, formattedDateRouted]);

  useEffect(() => {
    if (formattedDateRouted && formattedDateSigned) {
      const daysDiff = calculateWeekdayDiff(formattedDateRouted, formattedDateSigned);
      setDaysDsdrs(daysDiff);
      handleChange("days_dsdrs", daysDiff);
    } else {
      setDaysDsdrs("");
      handleChange("days_dsdrs", "");
    }
  }, [formattedDateRouted, formattedDateSigned]);

  return (
    <Row gutter={[16, 16]}>
      {/* Left Column */}
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
                readOnly={!isEditing}
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
                readOnly={!isEditing}
                placeholder="No data"
              />
            </Paragraph>
          </Col>
          <Col xs={24} sm={24} md={8} lg={8} className="modal-col">
            <Paragraph>
              <strong>BOD (kg/day)</strong>
              <Input
                value={bod}
                readOnly
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
                value={safeRecord?.section_incharge || ""}
                onChange={(value) => handleChange("section_incharge", value)}
                readOnly={!isEditing}
                placeholder="No data"
              />
            </Paragraph>
          </Col>
          <Col xs={24} sm={24} md={12} lg={12} className="modal-col">
            <Paragraph>
              <strong>Inspector/Handler</strong>
              <Inspector
                value={safeRecord?.handler || ""}
                onChange={(value) => handleChange("handler", value)}
                readOnly={!isEditing}
                placeholder="No data"
              />
            </Paragraph>
          </Col>
        </Row>

        <Row gutter={[16, 16]} className="row-auto">
          <Col xs={24} sm={24} md={12} lg={12} className="modal-col">
            <Paragraph>
              <strong>Schedule of Monitoring</strong>
              <Month
                value={safeRecord?.monitoring_sched || ""}
                onChange={(value) => handleChange("monitoring_sched", value)}
                readOnly={!isEditing}
                placeholder="No data"
              />
            </Paragraph>
            <Paragraph>
              <strong>Project Status</strong>
              <ProjectStatus
                value={safeRecord?.project_status || ""}
                onChange={(value) => handleChange("project_status", value)}
                readOnly={!isEditing}
                placeholder="No data"
              />
            </Paragraph>
          </Col>
        </Row>
      </Col>

      {/* Right Column */}
      <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
        <Paragraph>
          <strong>IIS Reference No.</strong>
          <Input
            value={safeRecord?.iis_no || ""}
            onChange={(e) => handleChange("iis_no", e.target.value)}
            readOnly={!isEditing}
            placeholder="No data"
            className="textbox-label"
          />
        </Paragraph>

        <Row gutter={[16, 16]} className="row-auto-date">
          <Col xs={24} sm={24} md={12} lg={12} className="modal-col">
            <Paragraph>
              <strong>Type of Inspection</strong>
              <InspectionType
                value={safeRecord?.insp_type || ""}
                onChange={(value) => handleChange("insp_type", value)}
                readOnly={!isEditing}
                placeholder="No data"
              />
            </Paragraph>
          </Col>
          <Col xs={24} sm={24} md={12} lg={12} className="modal-col">
            <Paragraph>
              <strong>Chemical Permit Category</strong>
              <ChemicalPermitCategory
                value={safeRecord?.report_type || ""}
                onChange={(value) => handleChange("report_type", value)}
                readOnly={!isEditing}
                placeholder="No data"
              />
            </Paragraph>
          </Col>
        </Row>

        <Row gutter={[16, 16]} className="row-auto">
          <Col xs={24} sm={24} md={8} lg={8} className="modal-col">
            <Paragraph>
              <strong>Date Monitored</strong>
              <DatePicker
                value={formattedDateMonitored ? dayjs(formattedDateMonitored, "MM/DD/YYYY") : null}
                onChange={(date) => handleChange("date_monitored", date ? date.format("MM/DD/YYYY") : "")}
                disabled={!isEditing}
                format="MM/DD/YYYY"
                placeholder="MM/DD/YYYY"
                className="custom-date-picker"
                style={{ width: "100%" }}
              />
            </Paragraph>
          </Col>
          <Col xs={24} sm={24} md={8} lg={8} className="modal-col">
            <Paragraph>
              <strong>Date Routed (IIS)</strong>
              <DatePicker
                value={formattedDateRouted ? dayjs(formattedDateRouted, "MM/DD/YYYY") : null}
                onChange={(date) => handleChange("date_routed", date ? date.format("MM/DD/YYYY") : "")}
                disabled={!isEditing}
                format="MM/DD/YYYY"
                placeholder="MM/DD/YYYY"
                className="custom-date-picker"
                style={{ width: "100%" }}
              />
            </Paragraph>
          </Col>
          <Col xs={24} sm={24} md={8} lg={8} className="modal-col">
            <Paragraph>
              <strong>Date Signed</strong>
              <DatePicker
                value={formattedDateSigned ? dayjs(formattedDateSigned, "MM/DD/YYYY") : null}
                onChange={(date) => handleChange("date_signed", date ? date.format("MM/DD/YYYY") : "")}
                disabled={!isEditing}
                format="MM/DD/YYYY"
                placeholder="MM/DD/YYYY"
                className="custom-date-picker"
                style={{ width: "100%" }}
              />
            </Paragraph>
          </Col>
        </Row>

        <Row gutter={[16, 16]} className="row-auto">
          <Col xs={24} sm={24} md={8} lg={8} className="modal-col">
            <Card
              style={{
                width: 470,
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
                      readOnly
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
                      readOnly
                      placeholder="No data"
                      className="textbox-label"
                    />
                  </Paragraph>
                </Col>
              </Row>
              <Paragraph>
                <strong>Remarks/Recommendations:</strong> <br />
                <TextArea
                  value={safeRecord?.remarks_recommendations || ""}
                  onChange={(e) => handleChange("remarks_recommendations", e.target.value)}
                  readOnly={!isEditing}
                  placeholder="No data"
                  rows={3}
                  className="text-area"
                />
              </Paragraph>
              <Paragraph>
                <Checkbox
                  checked={safeRecord?.pismu_tracking === "Report Tracked (received/routed to Planning Unit)"}
                  onChange={(e) => handleChange("pismu_tracking", e.target.checked ? "Report Tracked (received/routed to Planning Unit)" : "Report Untracked")}
                  disabled={!isEditing}
                  style={{ fontSize: "12px" }}
                >
                  <span className="permit-label"></span>
                </Checkbox>
                <strong>Tracking of Reports (Received by Planning Unit)</strong>
              </Paragraph>
            </Card>
          </Col>
        </Row>
      </Col>
    </Row>
  );
};

export default FocalPerson;