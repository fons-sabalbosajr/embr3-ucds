import React, { useState } from "react";
import {
  Input,
  Row,
  Col,
  Checkbox,
  Typography,
  Card,
  Button,
  DatePicker,
  ConfigProvider,
} from "antd";
import TextArea from "antd/es/input/TextArea";
import dayjs from "dayjs";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
import "./hlegalunitadd.css";
import { NumericFormat } from "react-number-format";
import LegalOfficers from "../../../components/Autocomplete/LegalOfficers";

dayjs.extend(isSameOrBefore);
const { Paragraph } = Typography;

const HLegalUnitAdd = ({ isEditing }) => {
  // Main fields
  const [docketNo, setDocketNo] = useState("");
  const [denrPab, setDenrPab] = useState("");
  const [dateForwarded, setDateForwarded] = useState("");
  const [dateApproved, setDateApproved] = useState("");
  const [novReleased, setNovReleased] = useState("");
  const [serviceMode, setServiceMode] = useState("");
  // Violations
  const [vpd1586, setVpd1586] = useState("");
  const [vra9275, setVra9275] = useState("");
  const [vra8749, setVra8749] = useState("");
  const [vhaz, setVhaz] = useState("");
  const [vtchem, setVtchem] = useState("");
  // Technical Conference
  const [tcDateSched, setTcDateSched] = useState("");
  const [tcDateActual, setTcDateActual] = useState("");
  const [legalOfficer, setLegalOfficer] = useState("");
  const [tcCommitment, setTcCommitment] = useState("");
  const [posPaper, setPosPaper] = useState("");
  // Penalty rows
  const [fields, setFields] = useState([
    { id: 1, penalty: "", amount: "", or_number: "" },
  ]);
  // Checkboxes and remarks
  const [tcOrderCompliance, setTcOrderCompliance] = useState(false);
  const [issuedResolution, setIssuedResolution] = useState(false);
  const [issuedOrder, setIssuedOrder] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [orderStatus, setOrderStatus] = useState("");

  // Working days calculation
  const countWorkingDays = (start, end) => {
    let startDate = dayjs(start, "MM/DD/YYYY");
    let endDate = dayjs(end, "MM/DD/YYYY");
    if (!startDate.isValid() || !endDate.isValid()) return "";
    if (endDate.isBefore(startDate)) return "";
    let count = 0;
    let current = startDate.clone();
    while (current.isSameOrBefore(endDate, "day")) {
      const day = current.day();
      if (day !== 0 && day !== 6) count++;
      current = current.add(1, "day");
    }
    return count;
  };

  const workingDaysDFDA =
    dateForwarded && dateApproved
      ? countWorkingDays(dateForwarded, dateApproved)
      : "";

  // Penalty row handlers
  const addFieldSet = () => {
    setFields([
      ...fields,
      { id: Date.now(), penalty: "", amount: "", or_number: "" },
    ]);
  };
  const removeFieldSet = () => {
    if (fields.length > 1) setFields(fields.slice(0, -1));
  };

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
          <Card className="legalunit-card" size="small">
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph className="paragraph-container">
                  <strong>Docket No.</strong>
                  <Input
                    value={docketNo}
                    onChange={(e) => setDocketNo(e.target.value)}
                    readOnly={!isEditing}
                    placeholder="no data"
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph className="paragraph-container">
                  <strong>DENR PAB Case No.</strong>
                  <Input
                    value={denrPab}
                    onChange={(e) => setDenrPab(e.target.value)}
                    readOnly={!isEditing}
                    placeholder="no data"
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph className="paragraph-container">
                  <strong>Date Forwarded to Legal Staff</strong>
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
                        dateForwarded
                          ? dayjs(dateForwarded, "MM/DD/YYYY")
                          : null
                      }
                      onChange={(date) =>
                        setDateForwarded(date ? date.format("MM/DD/YYYY") : "")
                      }
                      disabled={!isEditing}
                      format="MM/DD/YYYY"
                      placeholder="MM/DD/YYYY"
                      style={{ width: "100%" }}
                    />
                  </ConfigProvider>
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
                    value={
                      workingDaysDFDA !== ""
                        ? `${workingDaysDFDA} day${
                            workingDaysDFDA === 1 ? "" : "s"
                          }`
                        : ""
                    }
                    readOnly={true}
                    placeholder="no data"
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph className="paragraph-container">
                  <strong>Date Approved by Chief Legal</strong>
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
                        dateApproved ? dayjs(dateApproved, "MM/DD/YYYY") : null
                      }
                      onChange={(date) =>
                        setDateApproved(date ? date.format("MM/DD/YYYY") : "")
                      }
                      disabled={!isEditing}
                      format="MM/DD/YYYY"
                      placeholder="MM/DD/YYYY"
                      style={{ width: "100%" }}
                    />
                  </ConfigProvider>
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}></Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph className="paragraph-container">
                  <strong>NOV Date Released</strong>
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
                        novReleased ? dayjs(novReleased, "MM/DD/YYYY") : null
                      }
                      onChange={(date) =>
                        setNovReleased(date ? date.format("MM/DD/YYYY") : "")
                      }
                      disabled={!isEditing}
                      format="MM/DD/YYYY"
                      placeholder="MM/DD/YYYY"
                      style={{ width: "100%" }}
                    />
                  </ConfigProvider>
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph className="paragraph-container">
                  <strong>Service Mode</strong>
                  <Input
                    value={serviceMode}
                    onChange={(e) => setServiceMode(e.target.value)}
                    readOnly={!isEditing}
                    placeholder="no data"
                  />
                </Paragraph>
              </Col>
            </Row>
            <Card className="legalunit-card" size="small" title="VIOLATION/S">
              <Row gutter={[16, 16]}>
                <Col xs={24} sm={24} md={24} lg={24}>
                  <Paragraph className="paragraph-container">
                    <strong>PD1586:</strong>
                    <TextArea
                      value={vpd1586}
                      onChange={(e) => setVpd1586(e.target.value)}
                      readOnly={!isEditing}
                      placeholder="no data"
                      rows={3}
                    />
                  </Paragraph>
                </Col>
                <Col xs={24} sm={24} md={24} lg={24}>
                  <Paragraph className="paragraph-container">
                    <strong>RA9275:</strong>
                    <TextArea
                      value={vra9275}
                      onChange={(e) => setVra9275(e.target.value)}
                      readOnly={!isEditing}
                      placeholder="no data"
                      rows={3}
                    />
                  </Paragraph>
                </Col>
                <Col xs={24} sm={24} md={24} lg={24}>
                  <Paragraph className="paragraph-container">
                    <strong>RA8749:</strong>
                    <TextArea
                      value={vra8749}
                      onChange={(e) => setVra8749(e.target.value)}
                      readOnly={!isEditing}
                      placeholder="no data"
                      rows={3}
                    />
                  </Paragraph>
                </Col>
                <Col xs={24} sm={24} md={24} lg={24}>
                  <Paragraph className="paragraph-container">
                    <strong>HAZWASTE:</strong>
                    <TextArea
                      value={vhaz}
                      onChange={(e) => setVhaz(e.target.value)}
                      readOnly={!isEditing}
                      placeholder="no data"
                      rows={3}
                    />
                  </Paragraph>
                </Col>
                <Col xs={24} sm={24} md={24} lg={24}>
                  <Paragraph className="paragraph-container">
                    <strong>TOXIC CHEM:</strong>
                    <TextArea
                      value={vtchem}
                      onChange={(e) => setVtchem(e.target.value)}
                      readOnly={!isEditing}
                      placeholder="no data"
                      rows={3}
                    />
                  </Paragraph>
                </Col>
              </Row>
            </Card>
          </Card>
        </Col>
        <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
          <Card
            className="legalunit-card"
            size="small"
            title="Technical Conference"
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph className="paragraph-container">
                  <strong>TC Date Scheduled:</strong>
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
                        tcDateSched ? dayjs(tcDateSched, "MM/DD/YYYY") : null
                      }
                      onChange={(date) =>
                        setTcDateSched(date ? date.format("MM/DD/YYYY") : "")
                      }
                      disabled={!isEditing}
                      format="MM/DD/YYYY"
                      placeholder="MM/DD/YYYY"
                      style={{ width: "100%" }}
                    />
                  </ConfigProvider>
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph className="paragraph-container">
                  <strong>TC Date (Actual):</strong>
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
                        tcDateActual ? dayjs(tcDateActual, "MM/DD/YYYY") : null
                      }
                      onChange={(date) =>
                        setTcDateActual(date ? date.format("MM/DD/YYYY") : "")
                      }
                      disabled={!isEditing}
                      format="MM/DD/YYYY"
                      placeholder="MM/DD/YYYY"
                      style={{ width: "100%" }}
                    />
                  </ConfigProvider>
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph className="paragraph-container">
                  <strong className="label_title">Legal Officer:</strong>
                  <LegalOfficers
                    value={legalOfficer}
                    onChange={setLegalOfficer}
                    readOnly={!isEditing}
                    placeholder="no data"
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
                    value={tcCommitment}
                    onChange={(e) => setTcCommitment(e.target.value)}
                    readOnly={!isEditing}
                    placeholder="no data"
                    rows={2}
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={24} lg={24} className="col-format-tc">
                <Paragraph className="paragraph-container">
                  <strong>Position Paper</strong>
                  <span>
                    <i> &nbsp; (Paste Link Here)</i>
                  </span>
                  <TextArea
                    value={posPaper}
                    onChange={(e) => setPosPaper(e.target.value)}
                    readOnly={!isEditing}
                    placeholder="no data"
                    rows={2}
                  />
                </Paragraph>
              </Col>
            </Row>
          </Card>
          <Card
            className="legalunit-card card-order"
            size="small"
            title="For Order/Resolution"
          >
            <Row gutter={[16, 16]} className="row-penalty-label" align="middle">
              <Col xs={24} sm={24} md={9} lg={9}>
                <Paragraph className="paragraph-container-legal">
                  <strong>Date Payment of Penalty:</strong>
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={7} lg={7}>
                <Paragraph>
                  <strong>Amount:</strong>
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={6} lg={6}>
                <Paragraph className="paragraph-container-legal">
                  <strong>(OR) Number:</strong>
                </Paragraph>
              </Col>
            </Row>
            {fields.map((field) => (
              <Row key={field.id} gutter={[16, 16]} className="row-penalty-add">
                <Col xs={24} sm={24} md={9} lg={9}>
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
                        field.penalty
                          ? dayjs(field.penalty, "MM/DD/YYYY")
                          : null
                      }
                      onChange={(date) => {
                        const newDate = date ? date.format("MM/DD/YYYY") : "";
                        setFields(
                          fields.map((f) =>
                            f.id === field.id ? { ...f, penalty: newDate } : f
                          )
                        );
                      }}
                      disabled={!isEditing}
                      format="MM/DD/YYYY"
                      placeholder="MM/DD/YYYY"
                      className="text-penalty"
                      style={{ width: "100%" }}
                    />
                  </ConfigProvider>
                </Col>
                <Col xs={24} sm={24} md={7} lg={7}>
                  <NumericFormat
                    prefix="₱"
                    value={field.amount}
                    thousandSeparator
                    decimalScale={2}
                    fixedDecimalScale
                    allowNegative={false}
                    placeholder="0.00"
                    className="text-penalty ant-input"
                    customInput={Input}
                    onValueChange={(values) => {
                      const { value } = values; // raw numeric value (e.g. "1000.00")
                      setFields(
                        fields.map((f) =>
                          f.id === field.id ? { ...f, amount: value } : f
                        )
                      );
                    }}
                    readOnly={!isEditing}
                  />
                </Col>
                <Col xs={24} sm={24} md={6} lg={6}>
                  <Input
                    prefix={<span>#</span>}
                    value={field.or_number}
                    onChange={(e) => {
                      setFields(
                        fields.map((f) =>
                          f.id === field.id
                            ? { ...f, or_number: e.target.value }
                            : f
                        )
                      );
                    }}
                    readOnly={!isEditing}
                    placeholder="1234567"
                    className="text-penalty"
                  />
                </Col>
              </Row>
            ))}

            <Col xs={24} sm={24} md={4} lg={4} className="action-buttons-col">
              <Button
                type="primary"
                onClick={addFieldSet}
                size="small"
                disabled={!isEditing}
                style={{ fontSize: "11px", padding: "0 8px", marginRight: 4 }}
              >
                Add
              </Button>
              {fields.length > 1 && (
                <Button
                  danger
                  type="primary"
                  onClick={removeFieldSet}
                  size="small"
                  disabled={!isEditing}
                  style={{ fontSize: "11px", padding: "0 8px" }}
                >
                  Remove
                </Button>
              )}
            </Col>

            <Col xs={24} sm={24} md={24} lg={24}>
              <Paragraph>
                <Checkbox
                  checked={tcOrderCompliance}
                  disabled={!isEditing}
                  onChange={(e) => setTcOrderCompliance(e.target.checked)}
                  className="checkbox-compliance"
                />
                <span>
                  <strong>Compliance with TC Commitment/Order</strong>
                </span>
              </Paragraph>
            </Col>
            <Col xs={24} sm={24} md={24} lg={24}>
              <Paragraph className="paragraph-container">
                <strong>Remarks:</strong>
                <TextArea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  readOnly={!isEditing}
                  placeholder="no data"
                  rows={2}
                />
              </Paragraph>
            </Col>
            <Col xs={24} sm={24} md={24} lg={24} className="col-format">
              <Paragraph className="paragraph-container">
                <Checkbox
                  checked={issuedResolution}
                  disabled={!isEditing}
                  onChange={(e) => setIssuedResolution(e.target.checked)}
                  className="checkbox-compliance order"
                />
                <strong>Issued Resolution</strong>
              </Paragraph>
            </Col>
            <Col xs={24} sm={24} md={24} lg={24}>
              <Paragraph className="paragraph-container">
                <Checkbox
                  checked={issuedOrder}
                  disabled={!isEditing}
                  onChange={(e) => setIssuedOrder(e.target.checked)}
                 className="checkbox-compliance"
                />
                <strong>Issued Order</strong>
              </Paragraph>
            </Col>
            <Col xs={24} sm={24} md={24} lg={24}>
              <Paragraph className="paragraph-container">
                <strong>Order Status:</strong>
                <TextArea
                  value={orderStatus}
                  onChange={(e) => setOrderStatus(e.target.value)}
                  readOnly={!isEditing}
                  placeholder="no data"
                  rows={2}
                />
              </Paragraph>
            </Col>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default HLegalUnitAdd;
