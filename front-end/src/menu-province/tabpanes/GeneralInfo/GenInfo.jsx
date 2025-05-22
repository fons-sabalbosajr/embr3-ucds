import { useState, useEffect } from "react";
import axios from "axios";
import { Input, Row, Col, Typography, ConfigProvider, Checkbox } from "antd";
import TextArea from "antd/es/input/TextArea";
import "./geninfo.css";
import IndustryClass from "../../actions/autocomplete/IndustryClass";
import IndustryType from "../../actions/autocomplete/IndustryType";
import IndustrySubType from "../../actions/autocomplete/IndustrySubType";
import PSICCode from "../../actions/autocomplete/PSICCode";
import Province from "../../../components/Autocomplete/Province";
import Municipality from "../../../components/Autocomplete/Municipalities";
import Barangay from "../../../components/Autocomplete/Barangay";
import Waterbody from "../../actions/autocomplete/Waterbody";
import District from "../../actions/autocomplete/District";

const { Paragraph } = Typography;

const GenInfo = ({ editedRecord, setEditedRecord, isEditing, theme }) => {
  // Local state for fields
  const [proponentName, setProponentName] = useState("");
  const [projectTitle, setProjectTitle] = useState("");
  const [selectedIndustryClass, setSelectedIndustryClass] = useState("");
  const [industryType, setIndustryType] = useState("");
  const [industrySubType, setIndustrySubType] = useState("");
  const [psicCode, setPsicCode] = useState("");
  const [selectedProvince, setSelectedProvince] = useState("");
  const [selectedMunicipality, setSelectedMunicipality] = useState("");
  const [selectedBarangay, setSelectedBarangay] = useState("");
  const [street, setStreet] = useState("");
  const [fullAddress, setFullAddress] = useState("");
  const [longitude, setLongitude] = useState("");
  const [latitude, setLatitude] = useState("");
  const [withinManilaBayArea, setWithinManilaBayArea] = useState(false);

  // Load data from editedRecord
  useEffect(() => {
    if (editedRecord) {
      setProponentName(editedRecord.name || "");
      setProjectTitle(editedRecord.title || "");
      setSelectedIndustryClass(editedRecord.industry_class || "");
      setIndustryType(editedRecord.industry_type || "");
      setIndustrySubType(editedRecord.industry_subtype || "");
      setPsicCode(editedRecord.psic_code || "");
      setSelectedProvince(editedRecord.province || "");
      setSelectedMunicipality(editedRecord.city || "");
      setSelectedBarangay(editedRecord.barangay || editedRecord.brgy || "");
      setStreet(editedRecord.street || "");
      setLongitude(
        editedRecord.long !== undefined &&
          editedRecord.long !== null &&
          editedRecord.long !== ""
          ? editedRecord.long
          : ""
      );
      setLatitude(
        editedRecord.lat !== undefined &&
          editedRecord.lat !== null &&
          editedRecord.lat !== ""
          ? editedRecord.lat
          : ""
      );
      setWithinManilaBayArea(!!editedRecord.within_manila_bay_area);
    }
  }, [editedRecord]);

  useEffect(() => {
    // If all are empty, show "N/A"
    if (
      !street &&
      !selectedBarangay &&
      !selectedMunicipality &&
      !selectedProvince
    ) {
      setFullAddress("N/A");
    } else {
      const addressComponents = [
        street,
        selectedBarangay,
        selectedMunicipality,
        selectedProvince,
      ];
      const filteredComponents = addressComponents.filter(
        (component) => component
      );
      setFullAddress(filteredComponents.join(", "));
    }
  }, [street, selectedBarangay, selectedMunicipality, selectedProvince]);

  // Optionally update parent editedRecord when local state changes (if editing)
  useEffect(() => {
    if (isEditing && setEditedRecord) {
      setEditedRecord((prev) => ({
        ...prev,
        name: proponentName,
        title: projectTitle,
        industry_class: selectedIndustryClass,
        industry_type: industryType,
        industry_subtype: industrySubType,
        psic_code: psicCode,
        province: selectedProvince,
        city: selectedMunicipality,
        barangay: selectedBarangay,
        street,
        long: longitude,
        lat: latitude,
        within_manila_bay_area: withinManilaBayArea,
      }));
    }
    // eslint-disable-next-line
  }, [
    proponentName,
    projectTitle,
    selectedIndustryClass,
    industryType,
    industrySubType,
    psicCode,
    selectedProvince,
    selectedMunicipality,
    selectedBarangay,
    street,
    longitude,
    latitude,
    withinManilaBayArea,
    isEditing,
  ]);

  // Helper for N/A display
  const isAddressEmpty =
    !selectedProvince && !selectedMunicipality && !selectedBarangay;

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
        <Paragraph>
          <strong>Proponent Name</strong>
          <TextArea
            value={proponentName}
            onChange={(e) => setProponentName(e.target.value)}
            placeholder="Enter street"
            style={{
              fontSize: "11px",
              padding: "4px 8px",
              cursor: isEditing ? "text" : "not-allowed",
              color: isEditing ? "" : "#aaa",
            }}
            readOnly={!isEditing}
            rows={2}
          />
        </Paragraph>
        <Paragraph>
          <strong>Project Title</strong>
          <TextArea
            value={projectTitle}
            onChange={(e) => setProjectTitle(e.target.value)}
            placeholder="Enter street"
            style={{
              fontSize: "11px",
              padding: "4px 8px",
              cursor: isEditing ? "text" : "not-allowed",
              color: isEditing ? "" : "#aaa",
            }}
            readOnly={!isEditing}
            rows={2}
          />
        </Paragraph>
        <Paragraph>
          <strong>Industry Classification</strong>
          <IndustryClass
            onChange={setSelectedIndustryClass}
            value={selectedIndustryClass}
            readOnly={!isEditing}
          />
        </Paragraph>
        <IndustryType
          selectedIndustryClass={selectedIndustryClass}
          setIndustryType={setIndustryType}
          readOnly={!isEditing}
        />
        <IndustrySubType
          selectedIndustryClass={selectedIndustryClass}
          setIndustrySubType={setIndustrySubType}
          readOnly={!isEditing}
        />
        <PSICCode
          selectedIndustryClass={selectedIndustryClass}
          value={psicCode}
          onChange={setPsicCode}
          readOnly={!isEditing}
        />
      </Col>

      <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={24} md={8} lg={8} className="modalcol">
            <Paragraph>
              <strong>Province</strong>
              <Province
                value={selectedProvince}
                onChange={setSelectedProvince}
                disabled={!isEditing}
                readOnly={!isEditing}
              />
            </Paragraph>
          </Col>
          <Col xs={24} sm={24} md={8} lg={8} className="modalcol">
            <Paragraph>
              <strong>Municipality</strong>
              <Municipality
                value={selectedMunicipality}
                onChange={setSelectedMunicipality}
                selectedProvince={selectedProvince}
                readOnly={!selectedProvince || !isEditing}
                theme={theme}
                style={{
                  cursor:
                    !selectedProvince || !isEditing ? "not-allowed" : "pointer",
                }}
              />
            </Paragraph>
          </Col>
          <Col xs={24} sm={24} md={8} lg={8} className="modalcol">
            <Paragraph>
              <strong>Barangay</strong>
              <Barangay
                value={selectedBarangay}
                onChange={setSelectedBarangay}
                selectedProvince={selectedProvince}
                selectedMunicipality={selectedMunicipality}
                readOnly={!selectedMunicipality || !isEditing}
                style={{
                  cursor:
                    !selectedMunicipality || !isEditing
                      ? "not-allowed"
                      : "pointer",
                }}
              />
            </Paragraph>
          </Col>
        </Row>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={24} md={24} lg={24} className="modalcol">
            <Paragraph style={{ marginTop: "13px" }}>
              <strong>Street</strong>
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
                <TextArea
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  placeholder="Enter street"
                  style={{
                    fontSize: "11px",
                    padding: "4px 8px",
                    cursor: isEditing ? "text" : "not-allowed",
                    color: isEditing ? "" : "#aaa",
                  }}
                  readOnly={!isEditing}
                  rows={2}
                />
              </ConfigProvider>
            </Paragraph>
          </Col>
        </Row>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={24} md={24} lg={24} className="modalcol">
            <Paragraph>
              <strong>Complete Address</strong>
              <ConfigProvider
                theme={{
                  components: {
                    Input: {
                      fontSize: "11px",
                      height: "29px",
                      padding: "4px 8px",
                      cursor: "not-allowed",
                    },
                  },
                }}
              >
                <TextArea
                  value={fullAddress}
                  readOnly
                  rows={5}
                  style={{
                    fontSize: "11px",
                    padding: "4px 8px",
                    marginTop: "4px",
                    cursor: isEditing ? "text" : "not-allowed",
                    color: isEditing ? "" : "#aaa",
                  }}
                />
              </ConfigProvider>
            </Paragraph>
          </Col>
          {/* District removed */}
          <Col xs={24} sm={24} md={15} lg={15} className="modalcol-zipcode">
            <Paragraph style={{ marginTop: "-24px" }}>
              {isAddressEmpty ? (
                <Input
                  value="N/A"
                  readOnly
                  style={{
                    fontSize: "11px",
                    height: "29px",
                    padding: "4px 8px",
                  }}
                />
              ) : (
                <Waterbody
                  selectedMunicipality={selectedMunicipality}
                  readOnly={!isEditing}
                />
              )}
            </Paragraph>
          </Col>

          <Col xs={24} sm={24} md={9} lg={9} className="modalcol-zipcode">
            <Paragraph style={{ marginTop: "-24px" }}>
              {isAddressEmpty ? (
                <Input
                  value="N/A"
                  readOnly
                  style={{
                    fontSize: "11px",
                    height: "29px",
                    padding: "4px 8px",
                    background: "#f5f5f5",
                    cursor: "not-allowed",
                  }}
                />
              ) : (
                <District
                  selectedMunicipality={selectedMunicipality}
                  inputHeight="29px"
                  style={{
                    cursor: "pointer",
                  }}
                  readOnly={!isEditing}
                />
              )}
            </Paragraph>
          </Col>

          <Col xs={24} sm={24} md={24} lg={24} className="modalcol-zipcode">
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={24} md={24} lg={24} className="modalcol-zipcode">
                <Row gutter={[16, 16]}>
                  <Col
                    xs={24}
                    sm={24}
                    md={12}
                    lg={12}
                    className="modalcol-zipcode"
                  >
                    <Paragraph style={{ marginTop: "-10px" }}>
                      <strong>Longitude</strong>
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
                          value={
                            isAddressEmpty
                              ? "N/A"
                              : longitude !== ""
                              ? longitude
                              : ""
                          }
                          onChange={(e) => setLongitude(e.target.value)}
                          style={{
                            fontSize: "11px",
                            height: "29px",
                            padding: "4px 8px",
                            cursor: isEditing ? "text" : "not-allowed",
                            color: isEditing ? "" : "#aaa",
                          }}
                          readOnly={!isEditing || isAddressEmpty}
                          placeholder={
                            isAddressEmpty ? "N/A" : "Enter longitude"
                          }
                        />
                      </ConfigProvider>
                    </Paragraph>
                  </Col>
                  <Col
                    xs={24}
                    sm={24}
                    md={12}
                    lg={12}
                    className="modalcol-zipcode"
                  >
                    <Paragraph style={{ marginTop: "-10px" }}>
                      <strong>Latitude</strong>
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
                          value={
                            isAddressEmpty
                              ? "N/A"
                              : latitude !== ""
                              ? latitude
                              : ""
                          }
                          onChange={(e) => setLatitude(e.target.value)}
                          style={{
                            fontSize: "11px",
                            height: "29px",
                            padding: "4px 8px",
                            cursor: isEditing ? "text" : "not-allowed",
                            color: isEditing ? "" : "#aaa",
                          }}
                          readOnly={!isEditing || isAddressEmpty}
                          placeholder={
                            isAddressEmpty ? "N/A" : "Enter latitude"
                          }
                        />
                      </ConfigProvider>
                    </Paragraph>
                  </Col>
                </Row>
              </Col>
            </Row>
          </Col>
        </Row>
      </Col>
    </Row>
  );
};

export default GenInfo;
