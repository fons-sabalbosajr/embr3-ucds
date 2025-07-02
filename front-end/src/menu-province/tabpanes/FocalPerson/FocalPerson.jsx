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
  AutoComplete,
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
  const [pismuTracking, setpismuTracking] = useState("");
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
  const [useMonthRange, setUseMonthRange] = useState(false);

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
    editedRecord ? editedRecord.emp_total : ""
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
    // console.log(
    //   `Field: ${field}, Old Value: ${oldValue}, New Value: ${newValue}`
    // );
  };

  const pismuTrackingOptions = [
    { value: "Ms. Alyanna Y. Patdu" },
    { value: "Mr. Christian M. Abad" },
    { value: "Mr. Marshalle Julluice V. Catua" },
  ];

  const iisCombined = [editedRecord?.iis_no_2024, editedRecord?.iis_no_2025]
    .filter(Boolean)
    .join(" | ");

  // Handler for merged input
  const handleIisCombinedChange = (e) => {
    const value = e.target.value;
    // Split by separator " | "
    const [iis_no_2024, iis_no_2025] = value.split(" | ");
    handleChange("iis_no_2024", iis_no_2024 ? iis_no_2024.trim() : "");
    handleChange("iis_no_2025", iis_no_2025 ? iis_no_2025.trim() : "");
  };

  // Extract permissions from currentUser
  const permissions = currentUser?.permissions || [];
  const canManageData = permissions[1];
  const isCardDisabled = !canManageData;
  const isPismuTracked = !!editedRecord?.pismu_tracking;

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
                name="emp_total"
                value={empNoTotal}
                onChange={handleEmpNoTotalChange}
                readOnly={!isEditing}
                placeholder="No data"
                style={{
                  cursor: isEditing ? "text" : "not-allowed",
                  color: isEditing ? "" : "#aaa",
                }}
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
                style={{
                  cursor: isEditing ? "text" : "not-allowed",
                  color: isEditing ? "" : "#aaa",
                }}
              />
            </Paragraph>
          </Col>
          <Col xs={24} sm={24} md={8} lg={8} className="modal-col">
            <Paragraph>
              <strong>BOD (kg/day)</strong>
              <Input
                value={bod}
                onChange={(e) => handleChange("bod", e.target.value)}
                readOnly
                placeholder="No data"
                style={{
                  cursor: isEditing ? "text" : "not-allowed",
                  color: isEditing ? "" : "#aaa",
                }}
              />
            </Paragraph>
          </Col>
        </Row>

        <Row gutter={[16, 16]} className="row-auto">
          <Col xs={24} sm={24} md={12} lg={12} className="modal-col">
            <Paragraph>
              <strong>Current Section In Charged</strong>
              <SectionInCharged
                value={editedRecord ? editedRecord.section_incharged : ""}
                onChange={(value) => handleChange("section_incharged", value)}
                readOnly={!isEditing} // Pass readOnly dynamically based on isEditing
                style={{
                  cursor: isEditing ? "text" : "not-allowed",
                  color: isEditing ? "" : "#aaa",
                }}
              />
            </Paragraph>
          </Col>
          <Col xs={24} sm={24} md={12} lg={12} className="modal-col">
            <Paragraph>
              <strong>Inspector/Handler</strong>
              <Inspector
                value={editedRecord ? editedRecord.handler : ""}
                onChange={(value) => handleChange("handler", value)}
                readOnly={!isEditing}
                placeholder="No data"
                style={{
                  cursor: isEditing ? "text" : "not-allowed",
                  color: isEditing ? "" : "#aaa",
                }}
              />
            </Paragraph>
          </Col>
        </Row>

        <Row gutter={[16, 16]} className="row-auto">
          <Col xs={24} sm={24} md={12} lg={12} className="modal-col">
            <Paragraph>
              <strong>Schedule of Monitoring</strong>
              <Month
                value={editedRecord ? editedRecord.monitoring_sched : ""}
                onChange={(value) => handleChange("monitoring_sched", value)}
                readOnly={!isEditing}
                placeholder="No data"
                style={{
                  cursor: isEditing ? "text" : "not-allowed",
                  color: isEditing ? "" : "#aaa",
                }}
              />
            </Paragraph>

            <Paragraph>
              <strong>Project Status</strong>
              <ProjectStatus
                value={editedRecord ? editedRecord.title_status : ""}
                onChange={(value) => handleChange("title_status", value)}
                readOnly={!isEditing}
                placeholder="No data"
                style={{
                  cursor: isEditing ? "text" : "not-allowed",
                  color: isEditing ? "" : "#aaa",
                }}
              />
            </Paragraph>
          </Col>
        </Row>

        <Row gutter={[16, 16]} className="row-auto">
          <Col xs={24} sm={24} md={24} lg={24} className="modal-col">
            <Paragraph>
              <strong>IIS Reference No. (2024 | 2025)</strong>
              <Input
                value={iisCombined}
                onChange={handleIisCombinedChange}
                readOnly={!isEditing}
                placeholder="No data"
                style={{
                  cursor: isEditing ? "text" : "not-allowed",
                  color: isEditing ? "" : "#aaa",
                }}
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
                  style={{
                    cursor: isEditing ? "text" : "not-allowed",
                    color: isEditing ? "" : "#aaa",
                    width: "100%",
                  }}
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
                  format="MM/DD/YYYY"
                  placeholder="MM/DD/YYYY"
                  className="custom-date-picker"
                  disabled={!isEditing}
                  style={{
                    cursor: isEditing ? "text" : "not-allowed",
                    color: isEditing ? "" : "#aaa",
                    width: "100%",
                  }}
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
                  style={{
                    cursor: isEditing ? "text" : "not-allowed",
                    color: isEditing ? "" : "#aaa",
                    width: "100%",
                  }}
                />
              </ConfigProvider>
            </Paragraph>
          </Col>
        </Row>
      </Col>

      <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
        <Row gutter={[16, 16]} className="row-auto-date">
          <Col xs={24} sm={24} md={12} lg={12} className="modal-col">
            <Paragraph>
              <strong>Type of Inspection</strong>
              <InspectionType
                value={editedRecord ? editedRecord.insp_type : ""}
                onChange={(value) => handleChange("insp_type", value)}
                readOnly={!isEditing}
                placeholder="No data"
                style={{
                  cursor: isEditing ? "text" : "not-allowed",
                  color: isEditing ? "" : "#aaa",
                }}
              />
            </Paragraph>
          </Col>

          <Col xs={24} sm={24} md={12} lg={12} className="modal-col">
            <Paragraph>
              <strong>Type of Report Submitted</strong>
              <ReportType
                value={editedRecord ? editedRecord.report_type : ""}
                onChange={(value) => handleChange("report_type", value)}
                readOnly={!isEditing}
                placeholder="No data"
                style={{
                  cursor: isEditing ? "text" : "not-allowed",
                  color: isEditing ? "" : "#aaa",
                }}
              />
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
              disabled={isCardDisabled}
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
                      readOnly
                      placeholder="0 day"
                      style={{
                        cursor: isEditing ? "text" : "not-allowed",
                        color: isEditing ? "" : "#aaa",
                        width: "100%",
                      }}
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
                      readOnly
                      placeholder="0 day"
                      style={{
                        cursor: isEditing ? "text" : "not-allowed",
                        color: isEditing ? "" : "#aaa",
                        width: "100%",
                      }}
                    />
                  </Paragraph>
                </Col>
              </Row>
              <Paragraph>
                <strong>Remarks/Recommendations:</strong> <br />
                <TextArea
                  value={editedRecord ? editedRecord.remarks : ""}
                  onChange={(e) => handleChange("remarks", e.target.value)}
                  readOnly={!isEditing}
                  placeholder="No data"
                  style={{
                    cursor: isEditing ? "text" : "not-allowed",
                    color: isEditing ? "" : "#aaa",
                  }}
                  rows={3}
                />
              </Paragraph>
              <Paragraph>
                <Checkbox
                  checked={isPismuTracked}
                  disabled={!isEditing || isCardDisabled}
                  onChange={(e) => {
                    const isChecked = e.target.checked;
                    if (!isChecked) {
                      setpismuTracking("");
                      handleChange("pismu_tracking", "");
                    }
                  }}
                  style={{ fontSize: "11px" }}
                >
                  <span> Tracking of Reports Received by Planning Unit</span>
                </Checkbox>
              </Paragraph>
              <Paragraph>
                <Row gutter={[16, 16]} className="row-auto">
                  <Col xs={24} sm={24} md={9} lg={9} className="modalcol">
                    <Paragraph>
                      <ConfigProvider
                        theme={{
                          components: {
                            AutoComplete: {
                              optionFontSize: 10,
                              colorTextPlaceholder: "#555",
                              fontSize: "11px",
                              boxShadow: "none",
                            },
                          },
                        }}
                      >
                        <AutoComplete
                          style={{
                            width: "100%",
                            fontSize: "11px",
                          }}
                          options={pismuTrackingOptions}
                          value={editedRecord?.pismu_tracking || pismuTracking}
                          onChange={(value) => {
                            setpismuTracking(value);
                            handleChange("pismu_tracking", value);
                          }}
                          filterOption={(inputValue, option) =>
                            option.value
                              .toLowerCase()
                              .includes(inputValue.toLowerCase())
                          }
                          allowClear={true}
                          readOnly={!isEditing || !isPismuTracked}
                        >
                          <Input
                            style={{
                              fontSize: "11px",
                              height: "29px",
                              padding: "4px 8px",
                              cursor: isEditing ? "text" : "not-allowed",
                              color: isEditing ? "" : "#aaa",
                            }}
                            placeholder="Select PISMU Staff"
                            readOnly={!isEditing || !isPismuTracked}
                          />
                        </AutoComplete>
                      </ConfigProvider>
                    </Paragraph>
                  </Col>

                  <Col xs={24} sm={24} md={15} lg={15} className="modalcol">
                    <Paragraph>
                      <Input
                        value={editedRecord ? editedRecord.pismu_count_month : ""}
                        onChange={(e) =>
                          handleChange("pismu_count_month", e.target.value)
                        }
                        readOnly={!isEditing}
                        placeholder="No data"
                        style={{
                          cursor: isEditing ? "text" : "not-allowed",
                          color: isEditing ? "" : "#aaa",
                          height: "29px",
                        }}
                      />
                    </Paragraph>
                  </Col>
                </Row>
              </Paragraph>
              <Paragraph>
                <Checkbox
                  checked={editedRecord?.with_nov === "✔"}
                  disabled={!isEditing || isCardDisabled}
                  onChange={(e) => {
                    const isChecked = e.target.checked;
                    const newValue = isChecked ? "✔" : "✘";
                    handleValueChange("with_nov", newValue);
                    handleChange("with_nov", newValue);
                  }}
                  style={{ fontSize: "11px" }}
                >
                  <span> With previously issued NOV</span>
                </Checkbox>
              </Paragraph>
            </Card>
          </Col>
        </Row>
      </Col>
    </Row>
  );
};

export default FocalPerson;
