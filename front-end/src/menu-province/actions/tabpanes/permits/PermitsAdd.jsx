import React, { useState } from "react";
import { Row, Col, Card, Input, ConfigProvider, AutoComplete } from "antd";
import ECC_CNC from "../../autocomplete/ECC_CNC";
import PTO from "../../autocomplete/PTO";
import WWDP from "../../autocomplete/WWDP";
import HazWaste from "../../autocomplete/HAZ";
import PCO from "../../autocomplete/PCO";
import PCO_Name from "../../autocomplete/PCO_Name";
import "./permitsadd.css";

const { TextArea } = Input;

const PermitsAdd = ({ isEditing }) => {
  const [dateApprove, setDateApprove] = useState("");
  const [dateAmended, setDateAmended] = useState("");
  const [ptoCode, setPtoCode] = useState("");
  const [ptoDateIssued, setPtoDateIssued] = useState("");
  const [ptoExpiration, setPtoExpiration] = useState("");
  const [wwdpDateIssued, setWwdpDateIssued] = useState("");
  const [wwdpExpiration, setWwdpExpiration] = useState("");
  const [hazWastePermitType, setHazWastePermitType] = useState("");
  const [hazWasteDateIssued, setHazWasteDateIssued] = useState("");
  const [contact, setContact] = useState("");
  const [validityDate, setValidityDate] = useState("");
  const [ECCTracking, setECCTracking] = useState("");
  const [HAZTracking, setHAZTracking] = useState("");

  const ECCOptions = [
    { value: "ECC Manual" },
    { value: "ECC Online" },
    { value: "ECC EMB CO" },
    { value: "CNC Manual" },
    { value: "CNC Online" },
  ];

  const HAZOptions = [
    { value: "Hazwaste Manual" },
    { value: "Hazwaste Online" }
  ];

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24}>
        <Card
          title={<div className="card-title pd1586">PD1586</div>}
          size="small"
          headStyle={{ padding: 0 }}
          className="pd1586-card"
        >
          <Row gutter={[16, 16]}>
            <Col span={6}>
              <ECC_CNC isEditing={isEditing} />
            </Col>
            <Col span={6}>
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
                  options={ECCOptions}
                  dropdownClassName="custom-autocomplete-dropdown"
                  value={ECCTracking}
                  onChange={setECCTracking}
                  filterOption={(inputValue, option) =>
                    option.value
                      .toLowerCase()
                      .includes(inputValue.toLowerCase())
                  }
                  allowClear={true}
                  disabled={!isEditing}
                >
                  <TextArea
                    style={{
                      fontSize: "11px",
                      height: "29px",
                      padding: "4px 8px",
                    }}
                    placeholder="Select ECC Process Permit Type"
                    disabled={!isEditing}
                  />
                </AutoComplete>
              </ConfigProvider>
            </Col>
            <Col span={6}>
              <TextArea
                value={dateApprove}
                onChange={(e) => setDateApprove(e.target.value)}
                placeholder="Date Approve"
                autoSize
                style={{ fontSize: "11px" }}
                disabled={!isEditing}
              />
            </Col>
            <Col span={6}>
              <TextArea
                value={dateAmended}
                onChange={(e) => setDateAmended(e.target.value)}
                placeholder="Date Amended"
                autoSize
                style={{ fontSize: "11px" }}
                disabled={!isEditing}
              />
            </Col>
          </Row>
        </Card>
      </Col>
      <Col xs={24}>
        <Card
          title={<div className="card-title ra8749">RA8749</div>}
          size="small"
          headStyle={{ padding: 0 }}
          className="ra8749-card"
        >
          <Row gutter={[16, 16]}>
            <Col span={6}>
             <PTO isEditing={isEditing} />  
            </Col>
            <Col span={6}>
              <TextArea
                value={ptoDateIssued}
                onChange={(e) => setPtoDateIssued(e.target.value)}
                placeholder="PTO Date Issued"
                autoSize
                style={{ fontSize: "11px" }}
                disabled={!isEditing}
              />
            </Col>
            <Col span={6}>
              <TextArea
                value={ptoExpiration}
                onChange={(e) => setPtoExpiration(e.target.value)}
                placeholder="PTO Code Expiration"
                autoSize
                style={{ fontSize: "11px" }}
                disabled={!isEditing}
              />
            </Col>
          </Row>
        </Card>
      </Col>
      <Col xs={24}>
        <Card
          title={<div className="card-title ra9275">RA9275</div>}
          size="small"
          headStyle={{ padding: 0 }}
          className="ra9275-card"
        >
          <Row gutter={[16, 16]}>
            <Col span={6}>
              <WWDP isEditing={isEditing} /> 
            </Col>
            <Col span={6}>
              <TextArea
                value={wwdpDateIssued}
                onChange={(e) => setWwdpDateIssued(e.target.value)}
                placeholder="Hazwaste ID Date Issued"
                autoSize
                style={{ fontSize: "11px" }}
                disabled={!isEditing}
              />
            </Col>
            <Col span={6}>
              <TextArea
                value={wwdpExpiration}
                onChange={(e) => setWwdpExpiration(e.target.value)}
                placeholder="Date of Expiration"
                autoSize
                style={{ fontSize: "11px" }}
                disabled={!isEditing}
              />
            </Col>
          </Row>
        </Card>
      </Col>
      <Col xs={24}>
        <Card
          title={<div className="card-title ra6969">RA6969</div>}
          size="small"
          headStyle={{ padding: 0 }}
          className="ra6969-card"
        >
          <Row gutter={[16, 16]}>
            <Col span={6}>
              <HazWaste isEditing={isEditing}/>
            </Col>
            <Col span={6}>
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
                  options={HAZOptions}
                  dropdownClassName="custom-autocomplete-dropdown"
                  value={HAZTracking}
                  onChange={setHAZTracking}
                  filterOption={(inputValue, option) =>
                    option.value
                      .toLowerCase()
                      .includes(inputValue.toLowerCase())
                  }
                  allowClear={true}
                  disabled={!isEditing}
                >
                  <TextArea
                    style={{
                      fontSize: "11px",
                      height: "29px",
                      padding: "4px 8px",
                    }}
                    placeholder="Select Hazwaste Permit Type"
                    disabled={!isEditing}
                  />
                </AutoComplete>
              </ConfigProvider>
            </Col>
            <Col span={6}>
              <TextArea
                value={hazWasteDateIssued}
                onChange={(e) => setHazWasteDateIssued(e.target.value)}
                placeholder="Date Issued"
                autoSize
                style={{ fontSize: "11px" }}
                disabled={!isEditing}
              />
            </Col>
          </Row>
        </Card>
      </Col>
      <Col xs={24}>
        <Card
          title={<div className="card-title pco">PCO</div>}
          size="small"
          headStyle={{ padding: 0 }}
          className="pco-card"
        >
          <Row gutter={[16, 16]}>
            <Col span={6}>
              <PCO isEditing={isEditing}/> 
            </Col>
            <Col span={6}>
             <PCO_Name isEditing={isEditing}/>
            </Col>
            <Col span={6}>
              <TextArea
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="Contact"
                autoSize
                style={{ fontSize: "11px" }}
                disabled={!isEditing}
              />
            </Col>
            <Col span={6}>
              <TextArea
                value={validityDate}
                onChange={(e) => setValidityDate(e.target.value)}
                placeholder="Validity Date"
                autoSize
                style={{ fontSize: "11px" }}
                disabled={!isEditing}
              />
            </Col>
          </Row>
        </Card>
      </Col>
    </Row>
  );
};

export default PermitsAdd;
