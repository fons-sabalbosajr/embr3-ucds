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
} from "antd";
import WWTFTypeAdd from "../../autocomplete/WWTFTypeAdd";
import SectionInCharge from "../../autocomplete/SectionInCharge";
import Handler from "../../autocomplete/Handler";
import "./focalpersonadd.css";
import moment from "moment";
import dayjs from "dayjs";

const { Paragraph } = Typography;
const { TextArea } = Input;

const FocalPersonAdd = ({ isEditing, extractedData, }) => {
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
  

    useEffect(() => {
      if (extractedData && Object.keys(extractedData).length > 0) {
        setHandler(extractedData.handler|| "n/a");
        setRemarks(extractedData.recommendation_shaded || "n/a");
      }
    }, [extractedData]);
  

  const calculateBOD = (empNoTotal, wwtfType) => {
    //console.log("Calculating BOD for:", empNoTotal, wwtfType); // Debugging log

    if (!wwtfType || !empNoTotal) {
      return "0.0000 kg/day"; // Show default value instead of empty
    }

    // Normalize wwtfType (trim and uppercase)
    const typeKey = String(wwtfType).trim().toUpperCase();

    const wwtfTypeValues = {
      WWTF: 0.6,
      "SEPTIC TANK": 0.25,
      "DIRECT DISCHARGE": 1,
      "N/A": 0,
    };

    if (!wwtfTypeValues.hasOwnProperty(typeKey)) {
      console.warn("Invalid WWTF Type:", typeKey);
      return "0.0000 kg/day"; // Handle unknown values
    }

    const v1 = wwtfTypeValues[typeKey] ?? 0;
    const v2 = Number(empNoTotal) || 0; // Ensure numeric conversion

    if (v2 <= 0) {
      return "0.0000 kg/day"; // Prevent empty result
    }

    let bod;
    if (typeKey === "DIRECT DISCHARGE") {
      bod = v2 * 0.0378;
    } else {
      bod = v2 * 0.0378 * (1 - v1);
    }

    //console.log("Computed BOD:", bod.toFixed(4) + " kg/day"); // Debugging log
    return bod.toFixed(4) + " kg/day";
  };

  useEffect(() => {
    //console.log("Total Employees:", totalEmployees);
    //console.log("WWTF Type:", wwtfType);

    const newBOD = calculateBOD(totalEmployees, wwtfType);

    //console.log("BOD Updated:", newBOD);
    setBioOxygenDemand(newBOD);
  }, [totalEmployees, wwtfType]);

  function calculateBusinessDays(startDate, endDate) {
    const startDayjs = dayjs(startDate).startOf("day");
    const endDayjs = dayjs(endDate).startOf("day");

    if (startDayjs.isSame(endDayjs, "day")) return "1 day"; // If same day, return 1

    let weekdayCount = 0;
    let currentDay = startDayjs.add(1, "day"); // Start counting from the next day

    while (
      currentDay.isBefore(endDayjs, "day") ||
      currentDay.isSame(endDayjs, "day")
    ) {
      const dayOfWeek = currentDay.day(); // 0 = Sunday, 6 = Saturday
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

  const pismuTrackingOptions = [
    { value: "Ms. Alyanna Y. Patdu" },
    { value: "Mr. Christian M. Abad" },
    { value: "Mr. Marshalle Julluice V. Catua" },
  ];

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
        <Row gutter={[16, 16]} className="row-auto">
          <Col xs={24} sm={24} md={8} lg={8} className="modalcol">
            <Paragraph>
              <strong>Total No. of Employees</strong>
              <ConfigProvider
                theme={{
                  components: {
                    Input: {
                      fontSize: "11px",
                      height: "29px",
                      padding: "4px 8px",
                    },
                  },
                }}
              >
                <Input
                  value={totalEmployees}
                  onChange={(e) => {
                    const numericValue =
                      parseInt(e.target.value.replace(/\D/g, ""), 10) || 0;
                    setTotalEmployees(numericValue); // Ensures numeric value
                  }}
                  placeholder="ex. 100, 234, 1500"
                  style={{
                    fontSize: "11px",
                    height: "29px",
                    padding: "4px 8px",
                  }}
                  readOnly={!isEditing}
                />
              </ConfigProvider>
            </Paragraph>
          </Col>
          <Col xs={24} sm={24} md={8} lg={8} className="modalcol">
            <Paragraph>
              <strong>Type of WWTF Type</strong>
              <WWTFTypeAdd
                value={wwtfType} // Ensure controlled input
                onChange={(newType) => {
                  setWwtfType(newType);
                }}
                isEditing={isEditing}
              />
            </Paragraph>
          </Col>
          <Col xs={24} sm={24} md={8} lg={8} className="modalcol">
            <Paragraph>
              <strong>Bio-Oxygen Demand</strong>
              <ConfigProvider
                theme={{
                  components: {
                    Input: {
                      fontSize: "11px",
                      height: "29px",
                      padding: "4px 8px",
                    },
                  },
                }}
              >
                <Input
                  value={bioOxygenDemand}
                  readOnly
                  placeholder="0.0 kg/day"
                  style={{
                    fontSize: "11px",
                    height: "29px",
                    padding: "4px 8px",
                    color: "#a9a9a9", // Gray text color
                    cursor: "not-allowed", // Change cursor to indicate disabled
                  }}
                />
              </ConfigProvider>
            </Paragraph>
          </Col>
        </Row>
        <Row gutter={[16, 16]} className="row-auto">
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
        <Row gutter={[16, 16]} className="row-auto">
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
                  dropdownStyle={{
                    boxShadow: "none",
                    backgroundColor: "#f1f1f1",
                  }}
                  options={monthOptions}
                  popupClassName="custom-autocomplete-dropdown"
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
                      height: "29px",
                      padding: "4px 8px",
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
        </Row>
        <Row gutter={[16, 16]} className="row-auto">
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
                    fontSize: "11px",
                  }}
                  dropdownStyle={{
                    boxShadow: "none",
                    backgroundColor: "#f1f1f1",
                  }}
                  options={inspectionTypeOptions}
                  popupClassName="custom-autocomplete-dropdown"
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
                      height: "29px",
                      padding: "4px 8px",
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
      </Col>

      <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
        <Row gutter={[16, 16]} className="row-auto">
          <Col xs={24} sm={24} md={24} lg={24} className="modalcol">
            <Paragraph>
              <strong>IIS Transaction No.</strong>
              <ConfigProvider
                theme={{
                  components: {
                    Input: {
                      fontSize: "11px",
                      height: "29px",
                      padding: "4px 8px",
                    },
                  },
                }}
              >
                <Input
                  value={iisNo}
                  onChange={(e) => setIisNo(e.target.value)}
                  placeholder="Enter IIS No."
                  style={{
                    fontSize: "11px",
                    height: "29px",
                    padding: "4px 8px",
                  }}
                  readOnly={!isEditing}
                />
              </ConfigProvider>
            </Paragraph>
          </Col>
        </Row>

        <Row gutter={[16, 16]} className="row-date-picker">
          <Col xs={24} sm={24} md={8} lg={8} className="modalcol">
            <Paragraph className="date-picker-focal">
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
                  value={dateMonitored}
                  onChange={(date) => setDateMonitored(date)}
                  format="MM/DD/YYYY"
                  style={{
                    width: "100%",
                    fontSize: "11px",
                    height: "29px",
                    padding: "4px 8px",
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
                      fontSize: "11px",
                      height: "29px",
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
                    height: "29px",
                    padding: "4px 8px",
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
                      fontSize: "11px",
                      height: "29px",
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
                    height: "29px",
                    padding: "4px 8px",
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
                  dropdownStyle={{
                    boxShadow: "none",
                    backgroundColor: "#f1f1f1",
                  }}
                  options={reportTypeOptions}
                  popupClassName="custom-autocomplete-dropdown"
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
                      height: "29px",
                      padding: "4px 8px",
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

        <Row gutter={[16, 16]} className="row-auto">
          <Col xs={24} sm={24} md={24} lg={24} className="modalcol">
            <Card title="PLANNING UNIT" size="small" className="card-focal">
              <Row gutter={[16, 16]} className="row-auto">
                <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
                  <Paragraph>
                    <Row>
                      {/* Column 1: Title */}
                      <Col span={11} className="column-title">
                        Total No. of Days
                      </Col>
                      {/* Column 2: Subtitle */}
                      <Col span={12} className="column-subtitle">
                        (Date Monitored vs. Date Routed)
                      </Col>
                    </Row>
                    <ConfigProvider
                      theme={{
                        components: {
                          Input: {
                            fontSize: "11px",
                            height: "29px",
                            padding: "4px 8px",
                          },
                        },
                      }}
                    >
                      <Input
                        value={totalDaysMonitoredRouted}
                        readOnly
                        style={{
                          fontSize: "11px",
                          height: "29px",
                          padding: "4px 8px",
                          color: "#a9a9a9", // Gray text color
                          cursor: "not-allowed",
                        }}
                         placeholder="0 days"
                      />
                    </ConfigProvider>
                  </Paragraph>
                </Col>
                <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
                  <Paragraph>
                    <Row>
                      {/* Column 1: Title */}
                      <Col span={11} className="column-title">
                        Total No. of Days
                      </Col>
                      {/* Column 2: Subtitle */}
                      <Col span={12} className="column-subtitle">
                        (Date Routed vs. Date Signed)
                      </Col>
                    </Row>
                    <ConfigProvider
                      theme={{
                        components: {
                          Input: {
                            fontSize: "11px",
                            height: "29px",
                            padding: "4px 8px",
                          },
                        },
                      }}
                    >
                      <Input
                        value={totalDaysRoutedSigned}
                        readOnly
                        style={{
                          fontSize: "11px",
                          height: "29px",
                          padding: "4px 8px",
                          cursor: "not-allowed", 
                          // Change cursor to indicate disabled
                        }}
                        placeholder="0 days"
                      />
                    </ConfigProvider>
                  </Paragraph>
                </Col>
              </Row>

              <Row gutter={[16, 16]} className="row-auto">
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
                <Col xs={24} sm={24} md={16} lg={16} className="modalcol">
                  <Paragraph>
                    <strong>
                      PISMU Tracking of Reports (Receiver InCharge)
                    </strong>
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
                        dropdownStyle={{
                          boxShadow: "none",
                          backgroundColor: "#f1f1f1",
                        }}
                        options={pismuTrackingOptions}
                        popupClassName="custom-autocomplete-dropdown"
                        value={pismuTracking}
                        onChange={setpismuTracking}
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
                            height: "29px",
                            padding: "4px 8px",
                          }}
                          placeholder="Select PISMU Staff"
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
            </Card>
          </Col>
        </Row>
      </Col>
    </Row>
  );
};

export default FocalPersonAdd;
