import React from "react";
import {
  Input,
  Row,
  Col,
  Checkbox,
  Typography,
  Card,
} from "antd";
import TextArea from "antd/es/input/TextArea";
import styled from "styled-components";
import "./legalunit.css";

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

const LegalUnit = ({ editedRecord, handleChange, isEditing }) => {
  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
          <Card
            style={{
              width: 600,
              marginBottom: 20,
              padding: 5,
            }}
            size="small"
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph className="paragraph-container">
                  <strong>Docket No.</strong>
                  <Input
                    value={editedRecord ? editedRecord.docket_no : ""}
                    onChange={(e) => handleChange("docket_no", e.target.value)}
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={1}
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph className="paragraph-container">
                  <strong>DENR PAB Case No.</strong>
                  <Input
                    value={editedRecord ? editedRecord.denr_pab_case_no : ""}
                    onChange={(e) =>
                      handleChange("denr_pab_case_no", e.target.value)
                    }
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={1}
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph className="paragraph-container">
                  <strong>Date Forwarded to Legal Staff</strong>
                  <Input
                    value={editedRecord ? editedRecord.date_forwarded : ""}
                    onChange={(e) =>
                      handleChange("date_forwarded", e.target.value)
                    }
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={1}
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph className="paragraph-container">
                  <span className="label_container">
                    <strong className="label_title">Total No. of Days:</strong>
                    <p className="label">
                      (Date Forwarded to staff vs. Date Approved)
                    </p>
                  </span>
                  <Input
                    value={editedRecord ? editedRecord.days_dfda : ""}
                    onChange={(e) => handleChange("days_dfda", e.target.value)}
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={1}
                  />
                </Paragraph>
              </Col>
            </Row>
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph className="paragraph-container">
                  <strong>Date Approved by Chief Legal</strong>
                  <Input
                    value={
                      editedRecord ? editedRecord.date_approved_clegal : ""
                    }
                    onChange={(e) =>
                      handleChange("date_approved_clegal", e.target.value)
                    }
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={1}
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}></Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph className="paragraph-container">
                  <strong>NOV Date Released</strong>
                  <Input
                    value={editedRecord ? editedRecord.nov_released : ""}
                    onChange={(e) =>
                      handleChange("nov_released", e.target.value)
                    }
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={1}
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph className="paragraph-container">
                  <strong>Service Mode</strong>
                  <Input
                    value={editedRecord ? editedRecord.service_mode : ""}
                    onChange={(e) =>
                      handleChange("service_mode", e.target.value)
                    }
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={1}
                  />
                </Paragraph>
              </Col>
            </Row>
          </Card>

          <Card
            style={{
              width: 600,
              marginBottom: 20,
              padding: 5,
            }}
            size="small"
            title="VIOLATION/S"
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={24} lg={24}>
                <Paragraph className="paragraph-container">
                  <strong>PD1586:</strong>
                  <TextArea
                    value={editedRecord ? editedRecord.v_pd1586 : ""}
                    onChange={(e) => handleChange("v_pd1586", e.target.value)}
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={3}
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={24} lg={24}>
                <Paragraph className="paragraph-container">
                  <strong>RA9275:</strong>
                  <TextArea
                    value={editedRecord ? editedRecord.v_ra9275 : ""}
                    onChange={(e) => handleChange("v_ra9275", e.target.value)}
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={3}
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={24} lg={24}>
                <Paragraph className="paragraph-container">
                  <strong>RA8749:</strong>
                  <TextArea
                    value={editedRecord ? editedRecord.v_ra8749 : ""}
                    onChange={(e) => handleChange("v_ra8749", e.target.value)}
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={3}
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={24} lg={24}>
                <Paragraph className="paragraph-container">
                  <strong>HAZWASTE:</strong>
                  <TextArea
                    value={editedRecord ? editedRecord.v_haz : ""}
                    onChange={(e) => handleChange("v_haz", e.target.value)}
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={3}
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={24} lg={24}>
                <Paragraph className="paragraph-container">
                  <strong>TOXIC CHEM:</strong>
                  <TextArea
                    value={editedRecord ? editedRecord.v_tchem : ""}
                    onChange={(e) => handleChange("v_tchem", e.target.value)}
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={3}
                  />
                </Paragraph>
              </Col>
            </Row>
          </Card>
        </Col>

        <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
          <Card
            style={{
              width: 600,
              marginBottom: 20,
              padding: 5,
            }}
            size="small"
            title="Technical Conference"
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph className="paragraph-container">
                  <strong>TC Date Scheduled:</strong>
                  <Input
                    value={editedRecord ? editedRecord.tc_date_sched : ""}
                    onChange={(e) =>
                      handleChange("tc_date_sched", e.target.value)
                    }
                    disabled={!isEditing}
                    placeholder="No data"
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph className="paragraph-container">
                  <strong>TC Date (Actual):</strong>
                  <Input
                    value={editedRecord ? editedRecord.tc_date_actual : ""}
                    onChange={(e) =>
                      handleChange("tc_date_actual", e.target.value)
                    }
                    disabled={!isEditing}
                    placeholder="No data"
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph className="paragraph-container">
                  <strong>Time:</strong>
                  <Input
                    value={editedRecord ? editedRecord.time : ""}
                    onChange={(e) => handleChange("time", e.target.value)}
                    disabled={!isEditing}
                    placeholder="No data"
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph className="paragraph-container">
                  <span className="label_container">
                    <strong className="label_title">Legal Officer:</strong>
                  </span>
                  <Input
                    value={editedRecord ? editedRecord.legal_officer : ""}
                    onChange={(e) =>
                      handleChange("legal_officer", e.target.value)
                    }
                    disabled={!isEditing}
                    placeholder="No data"
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={24} lg={24}>
                <Paragraph className="paragraph-container">
                  <strong>TC Commitment/Deadline of Compliance</strong>
                  <span>
                    <i> &nbsp; (Paste Link Here)</i>
                  </span>
                  <TextArea
                    value={editedRecord ? editedRecord.tc_commitment : ""}
                    onChange={(e) =>
                      handleChange("tc_commitment", e.target.value)
                    }
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={2}
                  />
                </Paragraph>
              </Col>
            </Row>
          </Card>

          <Card
            style={{
              width: 600,
              marginBottom: 20,
              padding: 5,
            }}
            size="small"
            title="For Order/Resolution"
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={24} lg={24}>
                <Paragraph className="paragraph-container">
                  <strong>Position Paper:</strong>
                  <Input
                    value={editedRecord ? editedRecord.pos_paper : ""}
                    onChange={(e) => handleChange("pos_paper", e.target.value)}
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={3}
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph className="paragraph-container">
                  <strong>Date Payment of Penalty:</strong>
                  <Input
                    value={editedRecord ? editedRecord.penalty : ""}
                    onChange={(e) => handleChange("penalty", e.target.value)}
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={3}
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}></Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph className="paragraph-container">
                  <strong>Amount:</strong>
                  <Input
                    value={editedRecord ? editedRecord.amount : ""}
                    onChange={(e) => handleChange("amount", e.target.value)}
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={3}
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={12} lg={12}>
                <Paragraph className="paragraph-container">
                  <strong>Official Receipt (OR) Number:</strong>
                  <Input
                    value={editedRecord ? editedRecord.or_number : ""}
                    onChange={(e) => handleChange("or_number", e.target.value)}
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={3}
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={24} lg={24}>
                <Paragraph>
                  <Checkbox
                    checked={editedRecord?.tc_order_compliance === "✔"}
                    disabled={!isEditing}
                    onChange={(e) =>
                      handleChange(
                        "tc_order_compliance",
                        e.target.checked ? "✔" : ""
                      )
                    }
                    style={{ fontSize: "15px" }}
                  >
                    {editedRecord?.tc_order_compliance === "✔" ? "" : ""}
                  </Checkbox>
                  <strong>Compliance with TC Commitment/Order</strong> <br />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={24} lg={24}>
                <Paragraph className="paragraph-container">
                  <strong>Remarks:</strong>
                  <TextArea
                    value={editedRecord ? editedRecord.remarks : ""}
                    onChange={(e) => handleChange("remarks", e.target.value)}
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={3}
                  />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={24} lg={24}>
                <Paragraph className="paragraph-container">
                  <Checkbox
                    checked={editedRecord?.resolution === "✔"}
                    disabled={!isEditing}
                    onChange={(e) =>
                      handleChange("resolution", e.target.checked ? "✔" : "")
                    }
                    style={{ fontSize: "15px" }}
                  >
                    {editedRecord?.resolution === "✔" ? "" : ""}
                  </Checkbox>
                  <strong>Issued Resolution</strong> <br />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={24} lg={24}>
                <Paragraph className="paragraph-container">
                  <Checkbox
                    checked={editedRecord?.order === "✔"}
                    disabled={!isEditing}
                    onChange={(e) =>
                      handleChange("order", e.target.checked ? "✔" : "")
                    }
                    style={{ fontSize: "15px" }}
                  >
                    {editedRecord?.order === "✔" ? "" : ""}
                  </Checkbox>
                  <strong>Issued Order</strong> <br />
                </Paragraph>
              </Col>
              <Col xs={24} sm={24} md={24} lg={24}>
                <Paragraph className="paragraph-container">
                  <strong>Order Status:</strong>
                  <TextArea
                    value={editedRecord ? editedRecord.order_status : ""}
                    onChange={(e) => handleChange("order_status", e.target.value)}
                    disabled={!isEditing}
                    placeholder="No data"
                    rows={2}
                  />
                </Paragraph>
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default LegalUnit;
