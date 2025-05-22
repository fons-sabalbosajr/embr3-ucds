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
  AutoComplete,
  ConfigProvider,
} from "antd";
import TextArea from "antd/es/input/TextArea";
import dayjs from "dayjs";
import SectionInCharge from "../../../components/Autocomplete/SectionInCharge";
import Inspectors from "../../../components/Autocomplete/Inspectors";
import WWTFType from "../../../components/Autocomplete/WWTFType";
import "./focalperson.css";

const { Paragraph } = Typography;

const pismuTrackingOptions = [
  { value: "Ms. Alyanna Y. Patdu" },
  { value: "Mr. Christian M. Abad" },
  { value: "Mr. Marshalle Julluice V. Catua" },
];

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

const FocalPerson = ({ editedRecord, handleChange, isEditing }) => {
  const [localRecord, setLocalRecord] = useState(editedRecord || {});
  const [pismuTracking, setPismuTracking] = useState(
    editedRecord?.pismu_tracking_receiver || ""
  );

  const [empNoTotal, setEmpNoTotal] = useState(
    editedRecord?.emp_no_total || ""
  );
  const [wwtftype, setWwtftype] = useState(editedRecord?.wwtftype || "");
  const [bod, setBod] = useState(editedRecord?.bod || "");

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

  const calculateBOD = (empNoTotal, wwtfType) => {
    let bod = 0;
    const wwtfTypeValues = {
      WWTF: 0.6,
      "SEPTIC TANK": 0.25,
      "DIRECT DISCHARGE": 1,
      "N/A": 0,
    };
    const v1 = wwtfTypeValues[String(wwtfType || "").toUpperCase()] ?? 0;
    const v2 = Number(empNoTotal);
    if (!v2) {
      bod = "";
    } else if (String(wwtfType || "").toUpperCase() === "DIRECT DISCHARGE") {
      bod = (v2 * 0.0378).toFixed(4);
    } else {
      bod = (v2 * 0.0378 * (1 - v1)).toFixed(4);
    }
    return bod ? bod + " kg/day" : "";
  };

  const padZero = (num) => {
    return (num < 10 ? "0" : "") + num;
  };

  // Convert the date before loading it into the DatePicker
  const formattedDateSurveyed = convertToMMDDYYYY(editedRecord.date_surveyed);
  const formattedDateRouted = convertToMMDDYYYY(editedRecord.date_routed);
  const formattedDateSigned = convertToMMDDYYYY(editedRecord.date_signed);

  const [days, setDays] = useState(editedRecord ? editedRecord.total_days : 0);
  const [daysRoutedToSigned, setDaysRoutedToSigned] = useState("");

  useEffect(() => {
    if (formattedDateSurveyed && formattedDateRouted) {
      const newDaysDmds = calculateWeekdayDiff(
        formattedDateSurveyed,
        formattedDateRouted
      );
      setDays(newDaysDmds);
      handleChange("total_days", newDaysDmds); // Add this line
    }
  }, [formattedDateSurveyed, formattedDateRouted]);

  useEffect(() => {
    if (formattedDateRouted && formattedDateSigned) {
      const newDaysRoutedToSigned = calculateWeekdayDiff(
        formattedDateRouted,
        formattedDateSigned
      );
      setDaysRoutedToSigned(newDaysRoutedToSigned);
      handleChange("total_days_routed_signed", newDaysRoutedToSigned);
    } else {
      setDaysRoutedToSigned("");
      handleChange("total_days_routed_signed", "");
    }
  }, [formattedDateRouted, formattedDateSigned]);

  useEffect(() => {
    setLocalRecord(editedRecord);
    setPismuTracking(editedRecord?.pismu_tracking_receiver || "");
    setEmpNoTotal(editedRecord?.emp_no_total || "");
    setWwtftype(editedRecord?.wwtftype || "");
    setBod(editedRecord?.bod || "");
  }, [editedRecord]);

  const handleInputChange = (field, value) => {
    const updatedRecord = { ...localRecord, [field]: value };
    setLocalRecord(updatedRecord);
    handleChange(field, value);
  };

  const handleCheckboxChange = (field, e) => {
    const value = e.target.checked ? "✔" : "";
    handleInputChange(field, value);
  };

  const handleEmpNoTotalChange = (e) => {
    const value = e.target.value;
    setEmpNoTotal(value);
    handleInputChange("emp_no_total", value);
    if (wwtftype) {
      const bodValue = calculateBOD(value, wwtftype);
      setBod(bodValue);
      handleInputChange("bod", bodValue);
    }
  };

  const handleWwtftypeChange = (value) => {
    setWwtftype(value);
    handleInputChange("wwtftype", value);
    if (empNoTotal) {
      const bodValue = calculateBOD(empNoTotal, value);
      setBod(bodValue);
      handleInputChange("bod", bodValue);
    } else {
      setBod("");
      handleInputChange("bod", "");
    }
  };

  return (
    <Form
      layout="vertical"
      initialValues={localRecord}
      onValuesChange={(changedValues) =>
        handleInputChange(
          Object.keys(changedValues)[0],
          Object.values(changedValues)[0]
        )
      }
    >
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={24} md={8} lg={8} className="modalcol">
          <Paragraph>
            <strong>Total No. of Employees</strong>
            <Input
              value={localRecord.employee_no || ""}
              readOnly={!isEditing}
              placeholder="No data"
             onChange={handleEmpNoTotalChange}
              className="textbox-label"
            />
          </Paragraph>

           <Paragraph>
            <strong>Type of WWTF</strong>
            <WWTFType
              value={wwtftype}
              onChange={handleWwtftypeChange}
              readOnly={!isEditing}
              placeholder="No data"
            />
          </Paragraph>

          <Paragraph>
            <strong>Bio-Oxygen Demand (kg/day)</strong>
            <Input
              value={bod}
              readOnly
              placeholder="No data"
              className="textbox-label"
            />
          </Paragraph>

          <Paragraph>
            <strong>Responsible Unit</strong>
            <SectionInCharge
              value={localRecord.resp_unit || ""} // Handle undefined resp_unit
              disabled={!isEditing}
              placeholder="No data"
              onChange={(value) => handleInputChange("resp_unit", value)}
            />
          </Paragraph>

          <Paragraph>
            <strong>Handler</strong>
            <Inspectors
              value={localRecord.handler || ""} // Handle undefined handler
              disabled={!isEditing}
              placeholder="No data"
              onChange={(value) => handleInputChange("handler", value)}
            />
          </Paragraph>
        </Col>

        <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
          <Paragraph>
            <strong>IIS Reference No.</strong>
            <Input
              value={localRecord.iis_no || ""}
              onChange={(e) => handleChange("iis_no", e.target.value)}
              readOnly={!isEditing}
              placeholder="No data"
              className="textbox-label"
            />
          </Paragraph>

          <Row gutter={[16, 16]}>
            <Col xs={24} sm={24} md={8} lg={8} className="modalcol">
              <Paragraph>
                <strong>Date Surveyed</strong>
                <DatePicker
                  value={
                    formattedDateSurveyed
                      ? dayjs(formattedDateSurveyed, "MM/DD/YYYY")
                      : null
                  }
                  onChange={(date) => {
                    const newDate = date ? date.format("MM/DD/YYYY") : "";
                    handleChange("date_surveyed", newDate);
                  }}
                  disabled={!isEditing}
                  format="MM/DD/YYYY"
                  placeholder="MM/DD/YYYY"
                  className="custom-date-picker"
                  style={{ width: "100%" }}
                />
              </Paragraph>
            </Col>

            <Col xs={24} sm={24} md={8} lg={8} className="modalcol">
              <Paragraph>
                <strong>Date Routed</strong>
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
              </Paragraph>
            </Col>

            <Col xs={24} sm={24} md={8} lg={8} className="modalcol">
              <Paragraph>
                <strong>Date Monitored</strong>
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
              </Paragraph>
            </Col>
          </Row>

          <Card style={{ width: 600, marginBottom: 50 }} size="small">
            <strong>PLANNING UNIT</strong>

            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
                <Paragraph>
                  <span className="label_container">
                    <strong className="label_title">Total No. of Days:</strong>
                    <p className="label">(Date Monitored vs. Date Submitted)</p>
                  </span>
                  <Input
                    value={days}
                    onChange={(e) => handleChange("total_days", e.target.value)}
                    readOnly
                    placeholder="No data"
                    className="textbox-label"
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
                <Paragraph>
                  <span className="label_container">
                    <strong className="label_title">Total No. of Days:</strong>
                    <p className="label">(Date Routed vs. Date Signed)</p>
                  </span>
                  <Input
                    value={daysRoutedToSigned}
                    onChange={(e) =>
                      handleChange("total_days_routed_signed", e.target.value)
                    }
                    readOnly
                    placeholder="No data"
                    className="textbox-label"
                  />
                </Paragraph>
              </Col>
            </Row>

            <Paragraph>
              <Checkbox
                disabled={!isEditing}
                checked={localRecord.track_report_unit === "✔"}
                onChange={(e) => handleCheckboxChange("track_report_unit", e)}
              >
                <strong className="label-title">
                  Tracking of Reports (Routed to Assigned Section/Unit)
                </strong>
              </Checkbox>

              <Row gutter={[16, 16]}>
                <Col xs={24} sm={24} md={15} lg={15} className="modalcol">
                  {" "}
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
                        dropdownStyle={{
                          boxShadow: "none",
                          backgroundColor: "#f1f1f1",
                        }}
                        options={pismuTrackingOptions}
                        popupClassName="custom-autocomplete-dropdown"
                        value={pismuTracking}
                        onChange={(value) => {
                          setPismuTracking(value);
                          handleChange("pismu_tracking_receiver", value);
                        }}
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
                          readOnly={!isEditing}
                        />
                      </AutoComplete>
                    </ConfigProvider>
                  </Paragraph>
                </Col>
              </Row>
            </Paragraph>

            <Paragraph>
              <Checkbox
                disabled={!isEditing}
                checked={localRecord.track_report_planning === "✔"}
                onChange={(e) =>
                  handleCheckboxChange("track_report_planning", e)
                }
              >
                <strong className="label-title">
                  Tracking of Reports (Received by Planning Unit)
                </strong>
              </Checkbox>
            </Paragraph>

            <Paragraph>
              <strong>Remarks/Recommendations</strong>
              <TextArea
                value={localRecord.remarks || ""} // Handle undefined remarks
                readOnly={!isEditing}
                placeholder="No data"
                rows={4}
                onChange={(e) => handleInputChange("remarks", e.target.value)}
                className="textbox-label"
              />
            </Paragraph>
          </Card>
        </Col>
      </Row>
    </Form>
  );
};

export default FocalPerson;
