import React from "react";
import { Row, Col, Typography, Card, Input } from "antd";
import TextArea from "antd/es/input/TextArea";
import "./permits.css";

const { Paragraph } = Typography;

const Permits = ({ record, isEditing, handleChange }) => {
  return (
    <Row gutter={[12, 12]}>
      <Col xs={24} sm={24} md={12} lg={12}>
        <Card
          style={{ width: 450, marginBottom: 8 }}
          size="small"
          title={<div className="card-title pd1586">PD1586</div>}
          headStyle={{ padding: 0, borderRadius: 0 }}
          
        >
          <Row gutter={[8, 8]}>
            <Col xs={24} sm={12}>
              <Paragraph>
                <strong>ECC/CNC Reference No.</strong>
                <TextArea
                  value={record?.ecc_cnc || ""}
                  onChange={(e) => handleChange("ecc_cnc", e.target.value)}
                  disabled={!isEditing}
                  placeholder="No data"
                  rows={1}
                  className="text-area-permit"
                />
              </Paragraph>
            </Col>
            <Col xs={24} sm={12}>
              <Paragraph>
                <strong>Permit Process Source</strong>
                <TextArea
                  value={record?.permit_process || ""}
                  onChange={(e) =>
                    handleChange("permit_process", e.target.value)
                  }
                  disabled={!isEditing}
                  placeholder="No data"
                  rows={1}
                  className="text-area-permit"
                />
              </Paragraph>
            </Col>
            <Col xs={24} sm={12}>
              <Paragraph>
                <strong>Date Approved</strong>
                <TextArea
                  value={record?.date_approved || ""}
                  onChange={(e) =>
                    handleChange("date_approved", e.target.value)
                  }
                  disabled={!isEditing}
                  placeholder="No data"
                  rows={1}
                  className="text-area-permit"
                />
              </Paragraph>
            </Col>
            <Col xs={24} sm={12}>
              <Paragraph>
                <strong>Date Amended</strong>
                <TextArea
                  value={record?.date_amended || ""}
                  onChange={(e) => handleChange("date_amended", e.target.value)}
                  disabled={!isEditing}
                  placeholder="No data"
                  rows={1}
                  className="text-area-permit"
                />
              </Paragraph>
            </Col>
          </Row>
        </Card>

        <Card
          style={{ width: 450, marginBottom: 8 }}
          size="small"
          title={<div className="card-title ra8749">RA8749</div>}
          headStyle={{ padding: 0, borderRadius: 0 }}
        >
          <Row gutter={[8, 8]}>
            <Col xs={24} sm={12}>
              <Paragraph>
                <strong>PTO Code</strong>
                <TextArea
                  value={record?.pto_code || ""}
                  onChange={(e) => handleChange("pto_code", e.target.value)}
                  disabled={!isEditing}
                  placeholder="No data"
                  rows={1}
                  className="text-area-permit"
                />
              </Paragraph>
            </Col>
            <Col xs={24} sm={12}>
              <Paragraph>
                <strong>PTO Date Issued</strong>
                <TextArea
                  value={record?.pto_issued || ""}
                  onChange={(e) => handleChange("pto_issued", e.target.value)}
                  disabled={!isEditing}
                  placeholder="No data"
                  rows={1}
                  className="text-area-permit"
                />
              </Paragraph>
            </Col>
            <Col xs={24} sm={12}>
              <Paragraph>
                <strong>PTO Expiration</strong>
                <TextArea
                  value={record?.pto_expiration || ""}
                  onChange={(e) =>
                    handleChange("pto_expiration", e.target.value)
                  }
                  disabled={!isEditing}
                  placeholder="No data"
                  rows={1}
                  className="text-area-permit"
                />
              </Paragraph>
            </Col>
          </Row>
        </Card>

        <Card
          style={{ width: 450, marginBottom: 8 }}
          size="small"
          title={<div className="card-title ra9275">RA9275</div>}
          headStyle={{ padding: 0, borderRadius: 0 }}
        >
          <Row gutter={[8, 8]}>
            <Col xs={24} sm={12}>
              <Paragraph>
                <strong>WWDP Code</strong>
                <TextArea
                  value={record?.wwdp_code || ""}
                  onChange={(e) => handleChange("wwdp_code", e.target.value)}
                  disabled={!isEditing}
                  placeholder="No data"
                  rows={1}
                  className="text-area-permit"
                />
              </Paragraph>
            </Col>
            <Col xs={24} sm={12}>
              <Paragraph>
                <strong>WWDP Date Issued</strong>
                <TextArea
                  value={record?.wwdp_issued || ""}
                  onChange={(e) => handleChange("wwdp_issued", e.target.value)}
                  disabled={!isEditing}
                  placeholder="No data"
                  rows={1}
                  className="text-area-permit"
                />
              </Paragraph>
            </Col>
            <Col xs={24} sm={12}>
              <Paragraph>
                <strong>WWDP Expiration</strong>
                <TextArea
                  value={record?.wwdp_expiration || ""}
                  onChange={(e) =>
                    handleChange("wwdp_expiration", e.target.value)
                  }
                  disabled={!isEditing}
                  placeholder="No data"
                  rows={1}
                  className="text-area-permit"
                />
              </Paragraph>
            </Col>
          </Row>
        </Card>
      </Col>

      <Col xs={24} sm={24} md={12} lg={12}>
        <Card
          style={{ width: 450, marginBottom: 8 }}
          size="small"
          title={<div className="card-title ra6969">RA6969</div>}
          headStyle={{ padding: 0, borderRadius: 0 }}
        >
          <Row gutter={[8, 8]}>
            <Col xs={24} sm={12}>
              <Paragraph>
                <strong>Haz-waste ID</strong>
                <TextArea
                  value={record?.haz_id || ""}
                  onChange={(e) => handleChange("haz_id", e.target.value)}
                  disabled={!isEditing}
                  placeholder="No data"
                  rows={1}
                  className="text-area-permit"
                />
              </Paragraph>
            </Col>
            <Col xs={24} sm={12}>
              <Paragraph>
                <strong>Haz-waste ID Date Issued</strong>
                <TextArea
                  value={record?.haz_issued || ""}
                  onChange={(e) => handleChange("haz_issued", e.target.value)}
                  disabled={!isEditing}
                  placeholder="No data"
                  rows={1}
                  className="text-area-permit"
                />
              </Paragraph>
            </Col>
          </Row>
        </Card>

        <Card
          style={{ width: 450, marginBottom: 8 }}
          size="small"
          title={<div className="card-title pco">PCO Accreditation</div>}
          headStyle={{ padding: 0, borderRadius: 0 }}
        >
          <Row gutter={[8, 8]}>
            <Col xs={24} sm={12}>
              <Paragraph>
                <strong>Accreditation No.</strong>
                <TextArea
                  value={record?.pco_no || ""}
                  onChange={(e) => handleChange("pco_no", e.target.value)}
                  disabled={!isEditing}
                  placeholder="No data"
                  rows={1}
                  className="text-area-permit"
                />
              </Paragraph>
            </Col>
            <Col xs={24} sm={12}>
              <Paragraph>
                <strong>Validity Date</strong>
                <TextArea
                  value={record?.pco_validity || ""}
                  onChange={(e) => handleChange("pco_validity", e.target.value)}
                  disabled={!isEditing}
                  placeholder="No data"
                  rows={1}
                  className="text-area-permit"
                />
              </Paragraph>
            </Col>
          </Row>
          <Row gutter={[8, 8]}>
            <Col xs={24} sm={12}>
              <Paragraph>
                <strong>PCO Name</strong>
                <TextArea
                  value={record?.pco_name || ""}
                  onChange={(e) => handleChange("pco_name", e.target.value)}
                  disabled={!isEditing}
                  placeholder="No data"
                  rows={1}
                  className="text-area-permit"
                />
              </Paragraph>
            </Col>
            <Col xs={24} sm={12}>
              <Paragraph>
                <strong>Contact No.</strong>
                <TextArea
                  value={record?.pco_tel_no || ""}
                  onChange={(e) => handleChange("pco_tel_no", e.target.value)}
                  disabled={!isEditing}
                  placeholder="No data"
                  rows={1}
                  className="text-area-permit"
                />
              </Paragraph>
            </Col>
          </Row>
        </Card>
      </Col>
    </Row>
  );
};

export default Permits;
