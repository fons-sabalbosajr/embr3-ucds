import React, { useState, useEffect } from "react";
import {
  Row,
  Col,
  Typography,
  Input,
  ConfigProvider,
  AutoComplete,
  DatePicker,
  Card,
  Checkbox,
} from "antd";
import WWTFTypeAdd from "../autocomplete/WWTFTypeAdd";
import SectionInCharge from "../autocomplete/SectionInCharge";
import Handler from "../autocomplete/Handler";
import "./hfocalpersonadd.css";
import dayjs from "dayjs";

const { Paragraph } = Typography;
const { TextArea } = Input;

const HFocalPersonAdd = ({ isEditing, extractedData }) => {
  const [totalEmployees, setTotalEmployees] = useState("");
  const [wwtfType, setWwtfType] = useState("");
  const [bioOxygenDemand, setBioOxygenDemand] = useState("");
  const [sectionInCharge, setSectionInCharge] = useState("");
  const [monitoringSchedule, setMonitoringSchedule] = useState("");
  const [inspectionType, setInspectionType] = useState("");
  const [iisNo, setIisNo] = useState("");
  const [dateMonitored, setDateMonitored] = useState(null);
  const [dateRouted, setDateRouted] = useState(null);
  const [dateSigned, setDateSigned] = useState(null);
  const [reportType, setReportType] = useState("");
  const [pismuTracking, setpismuTracking] = useState("");
  const [totalDaysMonitoredRouted, setTotalDaysMonitoredRouted] = useState("");
  const [totalDaysRoutedSigned, setTotalDaysRoutedSigned] = useState("");
  const [remarks, setRemarks] = useState("");
  const [handler, setHandler] = useState("");
  const [isPismuTracking, setIsPismuTracking] = useState(false);

  useEffect(() => {
    if (extractedData && Object.keys(extractedData).length > 0) {
      setHandler(extractedData.handler || "n/a");
      setRemarks(extractedData.recommendation_shaded || "n/a");
    }
  }, [extractedData]);

  const calculateBOD = (empNoTotal, wwtfType) => {
    if (!wwtfType || !empNoTotal) {
      return "";
    }
    const typeKey = String(wwtfType).trim().toUpperCase();
    const wwtfTypeValues = {
      WWTF: 0.6,
      "SEPTIC TANK": 0.25,
      "DIRECT DISCHARGE": 1,
      "N/A": 0,
    };
    if (!wwtfTypeValues.hasOwnProperty(typeKey)) {
      return "";
    }
    const v1 = wwtfTypeValues[typeKey] ?? 0;
    const v2 = Number(empNoTotal) || 0;
    if (v2 <= 0) {
      return "";
    }
    let bod;
    if (typeKey === "DIRECT DISCHARGE") {
      bod = v2 * 0.0378;
    } else {
      bod = v2 * 0.0378 * (1 - v1);
    }
    return bod.toFixed(4) + " kg/day";
  };

  useEffect(() => {
    const newBOD = calculateBOD(totalEmployees, wwtfType);
    setBioOxygenDemand(newBOD);
  }, [totalEmployees, wwtfType]);

  function calculateBusinessDays(startDate, endDate) {
    const startDayjs = dayjs(startDate).startOf("day");
    const endDayjs = dayjs(endDate).startOf("day");
    if (startDayjs.isSame(endDayjs, "day")) return "1 day";
    let weekdayCount = 0;
    let currentDay = startDayjs.add(1, "day");
    while (
      currentDay.isBefore(endDayjs, "day") ||
      currentDay.isSame(endDayjs, "day")
    ) {
      const dayOfWeek = currentDay.day();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        weekdayCount++;
      }
      currentDay = currentDay.add(1, "day");
    }
    const dayString = weekdayCount === 1 ? " day" : " days";
    return `${weekdayCount}${dayString}`;
  }

  useEffect(() => {
    if (dateMonitored && dateRouted) {
      const diff = calculateBusinessDays(dateMonitored, dateRouted);
      setTotalDaysMonitoredRouted(diff);
    } else {
      setTotalDaysMonitoredRouted("");
    }
  }, [dateMonitored, dateRouted]);

  useEffect(() => {
    if (dateRouted && dateSigned) {
      const diff = calculateBusinessDays(dateRouted, dateSigned);
      setTotalDaysRoutedSigned(diff);
    } else {
      setTotalDaysRoutedSigned("");
    }
  }, [dateRouted, dateSigned]);

  const currentYear = new Date().getFullYear();
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const monthOptions = months.map((month) => ({
    value: `${month} ${currentYear}`,
  }));

  const inspectionTypeOptions = [
    { value: "ACTUAL MONITORING" },
    { value: "TABLE MONITORING" },
  ];

  const reportTypeOptions = [
    { value: "MONITORING/ INSPECTION REPORT (ICIR)" },
    { value: "NECP (ICIR)" },
    { value: "SURVEY REPORT" },
    { value: "SITE VALIDATION REPORT" },
    { value: "INVESTIGATION REPORT (IR)" },
  ];

  const pismuOptions = [
    { value: "Ms. Alyanna Y. Patdu" },
    { value: "Mr. Marshalle Julluice V. Catua" },
  ];

  const handlePismuTrackingChange = (value) => {
  setpismuTracking(value);
  setIsPismuTracking(!!value);
};



  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
        <Row gutter={[16, 16]} className="row-auto">
          <Col xs={24} sm={24} md={12} lg={12}>
            <Paragraph>
              <strong>Total No. of Employees</strong>

              <Input
                value={totalEmployees}
                onChange={(e) => {
                  const numericValue =
                    parseInt(e.target.value.replace(/\D/g, ""), 10) || 0;
                  setTotalEmployees(numericValue);
                }}
                placeholder="ex. 100, 234, 1500"
                readOnly={!isEditing}
              />
            </Paragraph>
          </Col>
          <Col xs={24} sm={24} md={12} lg={12}>
            <Paragraph>
              <strong>Type of WWTF Type</strong>
              <WWTFTypeAdd
                value={wwtfType}
                onChange={setWwtfType}
                isEditing={isEditing}
              />
            </Paragraph>
          </Col>
        </Row>

        <Row gutter={[16, 16]}>
          <Col xs={24} sm={24} md={12} lg={12}>
            <Paragraph>
              <strong>Bio-Oxygen Demand</strong>
              <Input
                value={bioOxygenDemand}
                placeholder="0.0 kg/day"
                style={{
                  color: "#a9a9a9",
                  cursor: "not-allowed",
                }}
              />
            </Paragraph>
          </Col>
        </Row>

        <Row gutter={[16, 16]}>
          <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
            <Paragraph>
              <strong>Section In Charge</strong>
              <SectionInCharge
                value={sectionInCharge}
                onChange={setSectionInCharge}
                isEditing={isEditing}
              />
            </Paragraph>
          </Col>
          <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
            <Paragraph>
              <Handler
                selectedSection={sectionInCharge}
                isEditing={isEditing}
              />
            </Paragraph>
          </Col>
        </Row>

        <Row gutter={[16, 16]}>
          <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
            <Paragraph>
              <strong>Monitoring Schedule</strong>
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
                  options={monthOptions}
                  value={monitoringSchedule}
                  onChange={setMonitoringSchedule}
                  filterOption={(inputValue, option) =>
                    option.value
                      .toLowerCase()
                      .includes(inputValue.toLowerCase())
                  }
                  allowClear={true}
                  readOnly={!isEditing}
                >
                  <Input
                    style={{
                      fontSize: "11px",
                    }}
                    placeholder="Select Monitoring Schedule"
                    placeholderStyle={{
                      fontSize: "9px",
                    }}
                    readOnly={!isEditing}
                  />
                </AutoComplete>
              </ConfigProvider>
            </Paragraph>
          </Col>

          <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
            <Paragraph>
              <strong>Inspection Type</strong>
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
                  }}
                  options={inspectionTypeOptions}
                  value={inspectionType}
                  onChange={setInspectionType}
                  filterOption={(inputValue, option) =>
                    option.value
                      .toLowerCase()
                      .includes(inputValue.toLowerCase())
                  }
                  allowClear={true}
                  readOnly={!isEditing}
                >
                  <Input
                    style={{
                      fontSize: "11px",
                    }}
                    placeholder="Select Inspection Type"
                    placeholderStyle={{
                      fontSize: "9px",
                    }}
                    readOnly={!isEditing}
                  />
                </AutoComplete>
              </ConfigProvider>
            </Paragraph>
          </Col>
        </Row>

        <Row gutter={[16, 16]}>
          <Col xs={24} sm={24} md={24} lg={24} className="modalcol">
            <Paragraph>
              <strong>IIS Transaction No.</strong>

              <Input
                value={iisNo}
                onChange={(e) => setIisNo(e.target.value)}
                placeholder="Enter IIS No."
                style={{
                  fontSize: "11px",
                }}
                readOnly={!isEditing}
              />
            </Paragraph>
          </Col>
        </Row>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={24} md={8} lg={8} className="modalcol">
            <Paragraph className="date-picker-focal">
              <strong>Date Monitored</strong>
              <ConfigProvider
                theme={{
                  components: {
                    DatePicker: {
                      fontSize: "10px",
                      padding: "4px 8px",
                    },
                  },
                }}
              >
                <DatePicker
                  value={dateMonitored}
                  onChange={(date) => setDateMonitored(date)}
                  format="MM/DD/YYYY"
                  style={{
                    width: "100%",
                    fontSize: "11px",
                  }}
                  disabled={!isEditing}
                />
              </ConfigProvider>
            </Paragraph>
          </Col>
          <Col xs={24} sm={24} md={8} lg={8} className="modalcol">
            <Paragraph className="date-picker-focal">
              <strong>Date Routed</strong>
              <ConfigProvider
                theme={{
                  components: {
                    DatePicker: {
                      fontSize: "10px",
                      padding: "4px 8px",
                    },
                  },
                }}
              >
                <DatePicker
                  value={dateRouted}
                  onChange={(date) => setDateRouted(date)}
                  format="MM/DD/YYYY"
                  style={{
                    width: "100%",
                    fontSize: "11px",
                  }}
                  disabled={!isEditing}
                />
              </ConfigProvider>
            </Paragraph>
          </Col>
          <Col xs={24} sm={24} md={8} lg={8} className="modalcol">
            <Paragraph className="date-picker-focal">
              <strong>Date Signed</strong>
              <ConfigProvider
                theme={{
                  components: {
                    DatePicker: {
                      fontSize: "10px",
                      padding: "4px 8px",
                    },
                  },
                }}
              >
                <DatePicker
                  value={dateSigned}
                  onChange={(date) => setDateSigned(date)}
                  format="MM/DD/YYYY"
                  style={{
                    width: "100%",
                    fontSize: "11px",
                  }}
                  disabled={!isEditing}
                />
              </ConfigProvider>
            </Paragraph>
          </Col>
        </Row>

        <Row gutter={[16, 16]} className="row-auto">
          <Col xs={24} sm={24} md={16} lg={16} className="modalcol">
            <Paragraph>
              <strong>Report Type</strong>
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
                  options={reportTypeOptions}
                  value={reportType}
                  onChange={setReportType}
                  filterOption={(inputValue, option) =>
                    option.value
                      .toLowerCase()
                      .includes(inputValue.toLowerCase())
                  }
                  allowClear={true}
                  readOnly={!isEditing}
                >
                  <Input
                    style={{
                      fontSize: "11px",
                    }}
                    placeholder="Select Report Type"
                    placeholderStyle={{
                      fontSize: "9px",
                    }}
                    readOnly={!isEditing}
                  />
                </AutoComplete>
              </ConfigProvider>
            </Paragraph>
          </Col>
        </Row>
      </Col>

      <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
        <Row gutter={[16, 16]} className="row-auto">
          <Col xs={24} sm={24} md={24} lg={24} className="modalcol">
            <Card title="PLANNING UNIT" size="small" className="card-focal">
              <Row gutter={[16, 16]}>
                <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
                  <Paragraph>
                    <Row>
                      <Col span={12} className="column-title-add">
                        Total No. of Days
                      </Col>
                      <Col span={12} className="column-subtitle-add">
                        (Date Monitored vs. Date Routed)
                      </Col>
                    </Row>

                    <Input
                      value={totalDaysMonitoredRouted}
                      readOnly
                      style={{
                        fontSize: "11px",
                        color: "#a9a9a9",
                        cursor: "not-allowed",
                      }}
                      placeholder="0 days"
                    />
                  </Paragraph>
                </Col>
                <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
                  <Paragraph>
                    <Row>
                      <Col span={12} className="column-title-add">
                        Total No. of Days
                      </Col>
                      <Col span={12} className="column-subtitle-add">
                        (Date Routed vs. Date Signed)
                      </Col>
                    </Row>

                    <Input
                      value={totalDaysRoutedSigned}
                      readOnly
                      style={{
                        cursor: "not-allowed",
                      }}
                      placeholder="0 days"
                    />
                  </Paragraph>
                </Col>
              </Row>

              <Row gutter={[16, 16]}>
                <Col xs={24} sm={24} md={24} lg={24} className="modalcol">
                  <Paragraph>
                    <strong>Remarks/Recommendations</strong>
                  </Paragraph>
                  <ConfigProvider
                    theme={{
                      components: {
                        TextArea: {
                          fontSize: "11px",
                          height: "100px",
                          padding: "4px 8px",
                        },
                      },
                    }}
                  >
                    <TextArea
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      placeholder="Enter remarks or recommendations"
                      style={{
                        fontSize: "11px",
                        height: "100px",
                        padding: "4px 8px",
                        marginTop: "-10px",
                      }}
                      readOnly={!isEditing}
                    />
                  </ConfigProvider>
                </Col>
              </Row>

              <Row gutter={[16, 16]} className="row-auto-pismu">
                <Col xs={24} sm={24} md={20} lg={20}>
                  <Paragraph>
                    <Checkbox
                      checked={isPismuTracking}
                      onChange={(e) => {
                        setIsPismuTracking(e.target.checked);
                        if (!e.target.checked) setpismuTracking("");
                      }}
                      disabled={!isEditing}
                      style={{ marginRight: 8 }}
                      className="checkbox-pismu"
                    >
                      Tracking of Reports (Received by Planning Unit)
                    </Checkbox>

                    <AutoComplete
                      options={pismuOptions}
                      value={pismuTracking}
                      onChange={handlePismuTrackingChange}
                      readOnly={!isEditing || !isPismuTracking}
                      filterOption={(inputValue, option) =>
                        option.value
                          .toLowerCase()
                          .includes(inputValue.toLowerCase())
                      }
                      style={{
                        fontSize: "11px",
                        height: "29px",
                        width: "100%",
                      }}
                      disabled={!isEditing || !isPismuTracking}
                    >
                      <Input
                        style={{
                          fontSize: "11px",
                          marginTop: "5px",
                          width: "100%",
                        }}
                        placeholder="Select PISMU Staff"
                        placeholderStyle={{
                          fontSize: "9px",
                        }}
                        allowClear
                      />
                    </AutoComplete>
                  </Paragraph>
                </Col>
              </Row>
            </Card>
          </Col>
        </Row>
      </Col>
    </Row>
  );
};

export default HFocalPersonAdd;
