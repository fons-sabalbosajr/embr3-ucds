import React from "react";
import {
  Table,
  Input,
  Tooltip,
  Button,
  Modal,
  Progress,
  Select,
  Pagination,
  Tabs,
  Row,
  Col,
  Checkbox,
  Typography,
  Card,
  DatePicker,
  Space,
  Spin,
  TimePicker,
  notification,
  Tag,
} from "antd";
import { PlusCircleFilled } from "@ant-design/icons";
import TextArea from "antd/es/input/TextArea";
import styled from "styled-components";
import moment from "moment";
import "./focalperson.css";
import SectionInCharged from "../../../components/SectionInCharge";
import Inspector from "../../../components/Inspectors";
import Month from "../../../components/Month";
import ReportType from "../../../components/ReportType";
import InspectionType from "../../../components/InspectionType";

const { Option } = Select;
const { TabPane } = Tabs;
const { Paragraph } = Typography;
const BoldTab = styled.span`
  font-weight: 600;
  font-size: 16px;
`;

const capitalizeFirstLetter = (str) => {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

const normalizeAndSplit = (str) => {
  return str
    .replace(/_/g, " ") // Replace underscores with spaces
    .replace(/\s+/g, " ") // Replace multiple spaces with a single space
    .split(/(?<!,\s)[\n,]/) // Split by new lines and commas
    .map((s, i, arr) => {
      if (
        i < arr.length - 1 &&
        arr[i + 1] &&
        arr[i + 1].trim().startsWith(",")
      ) {
        return s.trim() + ", ";
      }
      return s.trim();
    }) // Trim each string and add ", " if the next element starts with a comma
    .filter((s) => s); // Remove empty strings
};

const FocalPerson = ({ editedRecord, handleChange, isEditing }) => {
  const dateFormat = "MM/DD/YYYY";
  const timeFormat = "h:mm A";

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
        <Paragraph>
          <strong>Number of Employees</strong>
          <Input
            value={editedRecord ? editedRecord.emp_no_total : ""}
            onChange={(e) => handleChange("emp_no_total", e.target.value)}
            disabled={!isEditing}
            placeholder="No data"
          />
        </Paragraph>
        <Paragraph>
          <strong>Bio-Oxygen Demand (kg/day)</strong>
          <Input
            value={editedRecord ? editedRecord.bod : ""}
            onChange={(e) => handleChange("bod", e.target.value)}
            disabled={!isEditing}
            placeholder="No data"
          />
        </Paragraph>
        <Row gutter={[16, 16]} className="row-auto">
          <Col xs={24} sm={24} md={10} lg={10} className="modal-col">
            <Paragraph>
              <strong>Section In Charged</strong>
              <SectionInCharged
                value={editedRecord ? editedRecord.section_incharge : ""}
                onChange={(value) => handleChange("section_incharge", value)}
                disabled={!isEditing}
                placeholder="No data"
              />
            </Paragraph>
          </Col>
          <Col xs={24} sm={24} md={10} lg={10} className="modal-col">
            <Paragraph>
              <strong>Inspector/Handler</strong>
              <Inspector
                value={editedRecord ? editedRecord.handler : ""}
                onChange={(value) => handleChange("handler", value)}
                disabled={!isEditing}
                placeholder="No data"
              />
            </Paragraph>
          </Col>
          <Col xs={24} sm={24} md={2} lg={2} className="modal-col">
            <PlusCircleFilled className="plus-button" />
          </Col>
        </Row>
        <Paragraph>
          <strong>Schedule of Monitoring</strong>
          <Month
            value={editedRecord ? editedRecord.monitoring_sched : ""}
            onChange={(e) => handleChange("monitoring_sched", e.target.value)}
            disabled={!isEditing}
            placeholder="No data"
          />
        </Paragraph>
      </Col>

      <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
        <Paragraph>
          <strong>IIS Reference No.</strong>
          <Input
            value={editedRecord ? editedRecord.iis_no : ""}
            onChange={(e) => handleChange("iis_no", e.target.value)}
            disabled={!isEditing}
            placeholder="No data"
          />
        </Paragraph>
        <Row gutter={[16, 16]} className="row-auto">
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
              <DatePicker
                value={
                  editedRecord ? moment(editedRecord.date_monitored) : null
                }
                format="MM/DD/YYYY"
                disabled={!isEditing}
                onChange={(date, dateString) =>
                  handleChange("date_monitored", dateString)
                }
                placeholder="Select date"
                style={{ width: "100%" }}
              />
            </Paragraph>
          </Col>
          <Col xs={24} sm={24} md={8} lg={8} className="modal-col">
            <Paragraph>
              <strong>Date Routed (IIS)</strong>
              <DatePicker
                value={editedRecord ? moment(editedRecord.date_routed) : null}
                format="MM/DD/YYYY"
                disabled={!isEditing}
                onChange={(date, dateString) =>
                  handleChange("date_routed", dateString)
                }
                placeholder="Select date"
                style={{ width: "100%" }}
              />
            </Paragraph>
          </Col>
          <Col xs={24} sm={24} md={8} lg={8} className="modal-col">
            <Paragraph>
              <strong>Date Signed</strong>
              <DatePicker
                value={editedRecord ? moment(editedRecord.date_signed) : null}
                format="MM/DD/YYYY"
                disabled={!isEditing}
                onChange={(date, dateString) =>
                  handleChange("date_signed", dateString)
                }
                placeholder="Select date"
                style={{ width: "100%" }}
              />
            </Paragraph>
          </Col>
        </Row>
        <Card
          style={{
            width: 600,
            marginBottom: 5,
          }}
          size="small"
        >
          <strong>PLANNING UNIT</strong>
          <Row gutter={[16, 16]} className="row-auto">
            <Col xs={24} sm={24} md={12} lg={12} className="modal-col">
              <Paragraph>
                <strong className="label_container">Total No. of Days</strong>
                <p className="label">(Date Monitored VS Date Submitted)</p>
                <InspectionType
                  value={editedRecord ? editedRecord.days_dmds : ""}
                  onChange={(value) => handleChange("days_dmds", value)}
                  disabled={!isEditing}
                  placeholder="No data"
                />
              </Paragraph>
            </Col>
            <Col xs={24} sm={24} md={12} lg={12} className="modal-col">
              <Paragraph>
              <strong className="label_container">Total No. of Days</strong>
              <p className="label">(Date Monitored VS Date Submitted)</p>
                <ReportType
                  value={editedRecord ? editedRecord.days_dsdrs : ""}
                  onChange={(value) => handleChange("days_dsdrs", value)}
                  disabled={!isEditing}
                  placeholder="No data"
                />
              </Paragraph>
            </Col>
          </Row>
        </Card>
      </Col>
    </Row>
  );
};

export default FocalPerson;
