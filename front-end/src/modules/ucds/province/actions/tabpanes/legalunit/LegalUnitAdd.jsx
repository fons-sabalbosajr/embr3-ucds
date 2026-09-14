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
import "./legalunitadd.css";
import dayjs from "dayjs";
import moment from "moment";

const { Paragraph } = Typography;
const { TextArea } = Input;

const LegalUnitAdd = ({ isEditing }) => {
  const [docketNo, setdocketNo] = useState("");
  const [amount, setAmount] = useState("");
  const [ORNumber, setORNumber] = useState("");
  const [denrPab, setDenrPab] = useState("");
  const [dateNOVIssued, setNOVIssued] = useState("");
  const [dateTCActual, setTCActual] = useState("");
  const [datePospaper, setPospaper] = useState("");
  const [datePenalty, setPenalty] = useState("");
  const [dateResolution, setResolution] = useState("");
  const [dateOrder, setOrder] = useState("");
  const [vpd1586, setvpd1586] = useState("");
  const [vra8749, setvra8749] = useState("");
  const [vra9275, setvra9275] = useState("");
  const [vra6969, setvra6969] = useState("");
  const [legalOfficersOptions, setlegaOfficersOptions] = useState("");
  const [tcCompliance, settcCompliance] = useState("");
  const [tcCommitment, settcCommitment] = useState("");
  const [orderStatus, setorderStatus] = useState("");
  const [Remarks, setRemarks] = useState("");

  const legalOfficerOptions = [
    { value: "Mr. Brylle Warren L. Lacsina" },
    { value: "Ms. Yvette N. Miranda" },
    { value: "Ms. Janice Salvador" },
    { value: "Mr. Arnold Patrick Manalastas" },
    { value: "Ms. Manilyn C. Benoza" },
    { value: "Ms. Shirley A Owatan" },
    { value: "Mr. Jeriney Macapagal" },
  ];

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
        <Card title="NOTICE OF VIOLATION" size="small" className="card-nov">
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
              <Paragraph>
                <strong>Docket No.</strong>
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
                    value={docketNo}
                    onChange={(e) => setdocketNo(e.target.value)}
                    placeholder="Enter Docket No."
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
            <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
              <Paragraph>
                <strong>DENR PAB Case No.</strong>
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
                    value={denrPab}
                    onChange={(e) => setDenrPab(e.target.value)}
                    placeholder="Enter DENR PAB Case No."
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
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
              <Paragraph>
                <strong>Date NOV Issued</strong>
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
                      dateNOVIssued ? dayjs(dateNOVIssued, "MM/DD/YYYY") : null
                    }
                    onChange={(date, dateString) => setNOVIssued(dateString)}
                    format="MM/DD/YYYY"
                    style={{
                      fontSize: "11px",
                      height: "29px",
                      padding: "4px 8px",
                      width: "100%",
                    }}
                    allowClear
                    disabled={!isEditing}
                  />
                </ConfigProvider>
              </Paragraph>
            </Col>
          </Row>

          <Row gutter={[16, 16]} className="row-pd1586">
            <Col xs={24} sm={24} md={24} lg={24} className="modalcol">
              <Paragraph>
                <strong>Violation in PD1586</strong>
              </Paragraph>
              <ConfigProvider
                theme={{
                  components: {
                    TextArea: {
                      fontSize: "11px",
                      padding: "4px 8px",
                    },
                  },
                }}
              >
                <TextArea
                  value={vpd1586}
                  onChange={(e) => setvpd1586(e.target.value)}
                  placeholder="violation description"
                  style={{
                    fontSize: "11px",
                    padding: "4px 8px",
                    marginTop: "-10px",
                  }}
                  rows={5}
                  readOnly={!isEditing}
                />
              </ConfigProvider>
            </Col>
            <Col xs={24} sm={24} md={24} lg={24} className="modalcol">
              <Paragraph>
                <strong>Violation in RA8749</strong>
              </Paragraph>
              <ConfigProvider
                theme={{
                  components: {
                    TextArea: {
                      fontSize: "11px",
                      padding: "4px 8px",
                    },
                  },
                }}
              >
                <TextArea
                  value={vra8749}
                  onChange={(e) => setvra8749(e.target.value)}
                  placeholder="violation description"
                  style={{
                    fontSize: "11px",
                    padding: "4px 8px",
                    marginTop: "-10px",
                  }}
                  rows={5}
                  readOnly={!isEditing}
                />
              </ConfigProvider>
            </Col>
            <Col xs={24} sm={24} md={24} lg={24} className="modalcol">
              <Paragraph>
                <strong>Violation in RA9275</strong>
              </Paragraph>
              <ConfigProvider
                theme={{
                  components: {
                    TextArea: {
                      fontSize: "11px",
                      padding: "4px 8px",
                    },
                  },
                }}
              >
                <TextArea
                  value={vra9275}
                  onChange={(e) => setvra9275(e.target.value)}
                  placeholder="violation description"
                  style={{
                    fontSize: "11px",
                    padding: "4px 8px",
                    marginTop: "-10px",
                  }}
                  rows={5}
                  readOnly={!isEditing}
                />
              </ConfigProvider>
            </Col>{" "}
            <Col xs={24} sm={24} md={24} lg={24} className="modalcol">
              <Paragraph>
                <strong>Violation in RA6969</strong>
              </Paragraph>
              <ConfigProvider
                theme={{
                  components: {
                    TextArea: {
                      fontSize: "11px",
                      padding: "4px 8px",
                    },
                  },
                }}
              >
                <TextArea
                  value={vra6969}
                  onChange={(e) => setvra6969(e.target.value)}
                  placeholder="violation description"
                  style={{
                    fontSize: "11px",
                    padding: "4px 8px",
                    marginTop: "-10px",
                  }}
                  rows={5}
                  readOnly={!isEditing}
                />
              </ConfigProvider>
            </Col>
          </Row>
        </Card>
      </Col>

      <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
        <Card title="TECHNICAL CONFERENCE" size="small" className="card-nov">
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
              <Paragraph>
                <strong>TC Actual Date</strong>
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
                      dateTCActual ? dayjs(dateTCActual, "MM/DD/YYYY") : null
                    }
                    onChange={(date, dateString) => setTCActual(dateString)}
                    format="MM/DD/YYYY"
                    style={{
                      fontSize: "11px",
                      height: "29px",
                      padding: "4px 8px",
                      width: "100%",
                    }}
                    allowClear
                    disabled={!isEditing}
                  />
                </ConfigProvider>
              </Paragraph>
            </Col>
            <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
              <Paragraph>
                <strong>Legal Officer</strong>
                <ConfigProvider
                  theme={{
                    components: {
                      AutoComplete: {
                        optionFontSize: 10,
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
                    options={legalOfficerOptions}
                    popupClassName="custom-autocomplete-dropdown"
                    value={legalOfficersOptions}
                    onChange={setlegaOfficersOptions}
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
                      placeholder="Select Legal Officer"
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
                <strong>Technical Compliance Link</strong>
                <ConfigProvider
                  theme={{
                    components: {
                      TextArea: {
                        fontSize: "11px",
                        padding: "4px 8px",
                      },
                    },
                  }}
                >
                  <TextArea
                    rows={3}
                    value={tcCompliance}
                    onChange={(e) => settcCompliance(e.target.value)}
                    placeholder="e.g. https//:drive.google.com...."
                    style={{
                      fontSize: "11px",
                      padding: "4px 8px",
                    }}
                    readOnly={!isEditing}
                  />
                </ConfigProvider>
              </Paragraph>
            </Col>
          </Row>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
              <Paragraph>
                <strong>Position Paper Date Received</strong>
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
                      datePospaper ? dayjs(datePospaper, "MM/DD/YYYY") : null
                    }
                    onChange={(date, dateString) => setPospaper(dateString)}
                    format="MM/DD/YYYY"
                    style={{
                      fontSize: "11px",
                      height: "29px",
                      padding: "4px 8px",
                      width: "100%",
                    }}
                    allowClear
                    disabled={!isEditing}
                  />
                </ConfigProvider>
              </Paragraph>
            </Col>
            <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
              <Paragraph>
                <strong>Penalty Payment Date</strong>
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
                      datePenalty ? dayjs(datePenalty, "MM/DD/YYYY") : null
                    }
                    onChange={(date, dateString) => setPenalty(dateString)}
                    format="MM/DD/YYYY"
                    style={{
                      fontSize: "11px",
                      height: "29px",
                      padding: "4px 8px",
                      width: "100%",
                    }}
                    allowClear
                    disabled={!isEditing}
                  />
                </ConfigProvider>
              </Paragraph>
            </Col>
          </Row>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
              <Paragraph>
                <strong>Amount</strong>
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
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Enter amount"
                    prefix="₱"
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
            <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
              <Paragraph>
                <strong>OR Number</strong>
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
                    value={ORNumber}
                    onChange={(e) => setORNumber(e.target.value)}
                    placeholder="#123456789"
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

          <Row gutter={[16, 16]}>
            <Col xs={24} sm={24} md={24} lg={24} className="modalcol">
              <Paragraph>
                <ConfigProvider
                  theme={{
                    components: {
                      Checkbox: {
                        fontSize: "11px",
                        padding: "4px 8px",
                      },
                    },
                  }}
                >
                  <Checkbox
                    checked={tcCompliance === "✔"}
                    onChange={(e) =>
                      settcCompliance(e.target.checked ? "✔" : "")
                    }
                    disabled={!isEditing}
                    style={{
                      fontSize: "11px",
                      padding: "4px 8px",
                    }}
                  >
                    <strong>Compliance with TC Commitment/Order</strong>
                  </Checkbox>
                </ConfigProvider>
              </Paragraph>
            </Col>
          </Row>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={24} md={24} lg={24} className="modalcol">
              <Paragraph>
                <strong>Remarks</strong>
                <ConfigProvider
                  theme={{
                    components: {
                      TextArea: {
                        fontSize: "11px",
                        padding: "4px 8px",
                      },
                    },
                  }}
                >
                  <TextArea
                    rows={3}
                    value={Remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder=""
                    style={{
                      fontSize: "11px",
                      padding: "4px 8px",
                    }}
                    readOnly={!isEditing}
                  />
                </ConfigProvider>
              </Paragraph>
            </Col>
          </Row>
        </Card>

        <Card
          title="FOR ORDER AND RESOLUTION"
          size="small"
          className="card-order"
        >
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
              <Paragraph>
                <strong>Resolution Date Issued</strong>
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
                      dateResolution
                        ? dayjs(dateResolution, "MM/DD/YYYY")
                        : null
                    }
                    onChange={(date, dateString) => setResolution(dateString)}
                    format="MM/DD/YYYY"
                    style={{
                      fontSize: "11px",
                      height: "29px",
                      padding: "4px 8px",
                      width: "100%",
                    }}
                    allowClear
                    disabled={!isEditing}
                  />
                </ConfigProvider>
              </Paragraph>
            </Col>
            <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
              <Paragraph>
                <strong>Order Date Issued</strong>
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
                    value={dateOrder ? dayjs(dateOrder, "MM/DD/YYYY") : null}
                    onChange={(date, dateString) => setOrder(dateString)}
                    format="MM/DD/YYYY"
                    style={{
                      fontSize: "11px",
                      height: "29px",
                      padding: "4px 8px",
                      width: "100%",
                    }}
                    allowClear
                    disabled={!isEditing}
                  />
                </ConfigProvider>
              </Paragraph>
            </Col>
          </Row>

          <Row gutter={[16, 16]}>
            <Col xs={24} sm={24} md={24} lg={24} className="modalcol">
              <Paragraph>
                <strong>Order Status</strong>
                <ConfigProvider
                  theme={{
                    components: {
                      TextArea: {
                        fontSize: "11px",
                        padding: "4px 8px",
                      },
                    },
                  }}
                >
                  <TextArea
                    value={orderStatus}
                    onChange={(e) => setorderStatus(e.target.value)}
                    placeholder=""
                    style={{
                      fontSize: "11px",
                      padding: "4px 8px",
                    }}
                    readOnly={!isEditing}
                  />
                </ConfigProvider>
              </Paragraph>
            </Col>
          </Row>
        </Card>
      </Col>
    </Row>
  );
};

export default LegalUnitAdd;
