import React, { useState } from "react";
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
  PlusCircleFilled,
  DeleteFilled,
} from "@ant-design/icons";
import TextArea from "antd/es/input/TextArea";
import dayjs from "dayjs";
import LegalOfficer from "../../../../components/Autocomplete/LegalOfficers";
import "./survey_addfocalperson.css";

const { Paragraph } = Typography;

const Survey_AddLegal = ({ onChange, isEditing = true }) => {
  // All fields blank for adding
  const [localRecord, setLocalRecord] = useState({
    docket_no: "",
    pab_case_no: "",
    date_forwarded_legal: null,
    date_approved_legal: null,
    nov_released_date: null,
    v_pd1586: "",
    v_ra9275: "",
    v_ra8749: "",
    v_haz: "",
    v_toxichem: "",
    tc_schedule: null,
    tc_actual: null,
    tc_time: "",
    tc_legal_officer: "",
    tc_commitment: "",
    pos_paper: "",
    penalty_date: null,
    penalty_amount: [""],
    penalty_or_number: [""],
    tc_compliance: "",
    tc_compliance_remarks: "",
    issued_resolution: "",
    issued_order: "",
    order_status: "",
  });

  const [penaltyAmounts, setPenaltyAmounts] = useState([""]);
  const [penaltyOrNumbers, setPenaltyOrNumbers] = useState([""]);
  const [hasNewFields, setHasNewFields] = useState(false);

  const handleInputChange = (field, value) => {
    setLocalRecord((prev) => ({ ...prev, [field]: value }));
    if (onChange) onChange(field, value);
  };

  const handleCheckboxChange = (field, e) => {
    const value = e.target.checked ? "✔" : "";
    handleInputChange(field, value);
  };

  const handlePenaltyInputChange = (field, value, index) => {
    if (field === "penalty_amount") {
      const cleanedValue = value.replace(/[^0-9.,]/g, "");
      setPenaltyAmounts((prev) => {
        const newArr = [...prev];
        newArr[index] = cleanedValue;
        return newArr;
      });
    } else if (field === "penalty_or_number") {
      const formattedValue = value.replace(/[^0-9]/g, "");
      setPenaltyOrNumbers((prev) => {
        const newArr = [...prev];
        newArr[index] = formattedValue;
        return newArr;
      });
    }
  };

  const addNewFields = () => {
    setPenaltyAmounts([...penaltyAmounts, ""]);
    setPenaltyOrNumbers([...penaltyOrNumbers, ""]);
    setHasNewFields(true);
  };

  const removeField = (index) => {
    setPenaltyAmounts((prev) => prev.filter((_, i) => i !== index));
    setPenaltyOrNumbers((prev) => prev.filter((_, i) => i !== index));
    if (penaltyAmounts.length <= 2) setHasNewFields(false);
  };

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
          <Card style={{ width: 450, marginBottom: 20, padding: 5 }} size="small">
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>Docket No.</strong>
                  <Input
                    value={localRecord.docket_no}
                    readOnly={!isEditing}
                    placeholder="No data"
                    className="textbox-label"
                    onChange={(e) => handleInputChange("docket_no", e.target.value)}
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>DENR PAB Case No.</strong>
                  <Input
                    value={localRecord.pab_case_no}
                    readOnly={!isEditing}
                    placeholder="No data"
                    className="textbox-label"
                    onChange={(e) => handleInputChange("pab_case_no", e.target.value)}
                  />
                </Paragraph>
              </Col>
            </Row>
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>Date Forwarded to Legal Staff:</strong>
                  <ConfigProvider theme={{ components: { DatePicker: { fontSize: "11px", height: "29px", padding: "4px 8px" } } }}>
                    <DatePicker
                      value={localRecord.date_forwarded_legal ? dayjs(localRecord.date_forwarded_legal, "MM/DD/YYYY") : null}
                      onChange={(date) => handleInputChange("date_forwarded_legal", date ? date.format("MM/DD/YYYY") : null)}
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
                  <ConfigProvider theme={{ components: { DatePicker: { fontSize: "11px", height: "29px", padding: "4px 8px" } } }}>
                    <DatePicker
                      value={localRecord.date_approved_legal ? dayjs(localRecord.date_approved_legal, "MM/DD/YYYY") : null}
                      onChange={(date) => handleInputChange("date_approved_legal", date ? date.format("MM/DD/YYYY") : null)}
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
                    <p className="label_legal">(Forwarded to LSU Staff VS. Approved by LSU Chief)</p>
                  </span>
                  <Input
                    value={""}
                    readOnly
                    placeholder="No data"
                    className="disabled-input-legal-days"
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>NOV Released Date:</strong>
                  <ConfigProvider theme={{ components: { DatePicker: { fontSize: "11px", height: "29px", padding: "4px 8px" } } }}>
                    <DatePicker
                      value={localRecord.nov_released_date ? dayjs(localRecord.nov_released_date, "MM/DD/YYYY") : null}
                      onChange={(date) => handleInputChange("nov_released_date", date ? date.format("MM/DD/YYYY") : null)}
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

          <Card style={{ width: 450, marginBottom: 20, padding: 5 }} size="small" title="VIOLATIONS">
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={24} lg={24}>
                <Paragraph>
                  <strong>Violation PD1586:</strong>
                  <TextArea
                    value={localRecord.v_pd1586}
                    readOnly={!isEditing}
                    placeholder="No data"
                    onChange={(e) => handleInputChange("v_pd1586", e.target.value)}
                    rows={3}
                  />
                </Paragraph>
                <Paragraph>
                  <strong>Violation RA9275:</strong>
                  <TextArea
                    value={localRecord.v_ra9275}
                    readOnly={!isEditing}
                    placeholder="No data"
                    onChange={(e) => handleInputChange("v_ra9275", e.target.value)}
                    rows={3}
                  />
                </Paragraph>
                <Paragraph>
                  <strong>Violation RA8749:</strong>
                  <TextArea
                    value={localRecord.v_ra8749}
                    readOnly={!isEditing}
                    placeholder="No data"
                    onChange={(e) => handleInputChange("v_ra8749", e.target.value)}
                    rows={3}
                  />
                </Paragraph>
                <Paragraph>
                  <strong>Violation HAZWASTE:</strong>
                  <TextArea
                    value={localRecord.v_haz}
                    readOnly={!isEditing}
                    placeholder="No data"
                    onChange={(e) => handleInputChange("v_haz", e.target.value)}
                    rows={3}
                  />
                </Paragraph>
                <Paragraph>
                  <strong>Violation TOXIC CHEM:</strong>
                  <TextArea
                    value={localRecord.v_toxichem}
                    readOnly={!isEditing}
                    placeholder="No data"
                    onChange={(e) => handleInputChange("v_toxichem", e.target.value)}
                    rows={3}
                  />
                </Paragraph>
              </Col>
            </Row>
          </Card>
        </Col>

        <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
          <Card style={{ width: 450, marginBottom: 20, padding: 5 }} size="small" title="Technical Conference">
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>TC Date Scheduled:</strong>
                  <ConfigProvider theme={{ components: { DatePicker: { fontSize: "11px", height: "29px", padding: "4px 8px" } } }}>
                    <DatePicker
                      value={localRecord.tc_schedule ? dayjs(localRecord.tc_schedule, "MM/DD/YYYY") : null}
                      onChange={(date) => handleInputChange("tc_schedule", date ? date.format("MM/DD/YYYY") : null)}
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
                  <ConfigProvider theme={{ components: { DatePicker: { fontSize: "11px", height: "29px", padding: "4px 8px" } } }}>
                    <DatePicker
                      value={localRecord.tc_actual ? dayjs(localRecord.tc_actual, "MM/DD/YYYY") : null}
                      onChange={(date) => handleInputChange("tc_actual", date ? date.format("MM/DD/YYYY") : null)}
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
                  <ConfigProvider theme={{ components: { TimePicker: { fontSize: "11px", height: "29px", padding: "4px 8px" } } }}>
                    <TimePicker
                      value={localRecord.tc_time ? dayjs(localRecord.tc_time, "hh:mm:ss A") : null}
                      disabled={!isEditing}
                      placeholder="Select Time"
                      onChange={(time) => handleInputChange("tc_time", time ? time.format("hh:mm A") : "")}
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
                    value={localRecord.tc_legal_officer}
                    readOnly={!isEditing}
                    placeholder="No data"
                    onChange={(value) => handleInputChange("tc_legal_officer", value)}
                    className="textbox_legal"
                  />
                </Paragraph>
              </Col>
            </Row>
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={24} lg={24}>
                <Paragraph style={{ display: "flex", flexDirection: "column" }}>
                  <strong>
                    TC Commitment/Deadline of Compliance: <i> &nbsp; (Paste Link Here)</i>
                  </strong>
                  <div style={{ position: "relative", width: "100%", marginTop: "10px" }}>
                    <TextArea
                      value={localRecord.tc_commitment}
                      readOnly={!isEditing}
                      placeholder="No data"
                      onChange={(e) => handleInputChange("tc_commitment", e.target.value)}
                      rows={2}
                    />
                  </div>
                </Paragraph>
              </Col>
            </Row>
          </Card>

          <Card style={{ width: 450, marginBottom: 20, padding: 5 }} size="small" title="For Order/Resolution">
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={24} lg={24}>
                <Paragraph style={{ display: "flex", flexDirection: "column" }}>
                  <strong>
                    Position Paper: <i> &nbsp; (Paste Link Here)</i>
                  </strong>
                  <div style={{ position: "relative", width: "100%" }}>
                    <TextArea
                      value={localRecord.pos_paper}
                      readOnly={!isEditing}
                      placeholder="No data"
                      onChange={(e) => handleInputChange("pos_paper", e.target.value)}
                      rows={2}
                    />
                  </div>
                </Paragraph>
              </Col>
            </Row>
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph>
                  <strong>Date Payment of Penalty:</strong>
                  <ConfigProvider theme={{ components: { DatePicker: { fontSize: "11px", height: "29px", padding: "4px 8px" } } }}>
                    <DatePicker
                      value={localRecord.penalty_date ? dayjs(localRecord.penalty_date, "MM/DD/YYYY") : null}
                      onChange={(date) => handleInputChange("penalty_date", date ? date.format("MM/DD/YYYY") : null)}
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
                        onBlur={() => {}}
                        disabled={!isEditing}
                        placeholder="No data"
                        onChange={(e) => handlePenaltyInputChange("penalty_amount", e.target.value, index)}
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
                        onChange={(e) => handlePenaltyInputChange("penalty_or_number", e.target.value, index)}
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
                    onClick={() => removeField(penaltyAmounts.length - 1)}
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
                      value={localRecord.tc_compliance_remarks}
                      readOnly={!isEditing}
                      placeholder="No data"
                      onChange={(e) => handleInputChange("tc_compliance_remarks", e.target.value)}
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
                    onChange={(e) => handleCheckboxChange("issued_resolution", e)}
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
                      value={localRecord.order_status}
                      readOnly={!isEditing}
                      placeholder="No data"
                      onChange={(e) => handleInputChange("order_status", e.target.value)}
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

export default Survey_AddLegal;