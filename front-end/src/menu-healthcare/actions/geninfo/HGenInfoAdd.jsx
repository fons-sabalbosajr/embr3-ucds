import React, {
  useState,
  useEffect,
  useImperativeHandle,
  forwardRef,
} from "react";
import { Row, Col, Typography, Input, ConfigProvider, Checkbox } from "antd";
import ProponentName from "../autocomplete/ProjectName";
import ProjectTitle from "../autocomplete/ProjectTitle";
import IndustryClass from "../autocomplete/IndustryClass";
import IndustryType from "../autocomplete/IndustryType";
import IndustrySubType from "../autocomplete/IndustrySubType";
import PSICCode from "../autocomplete/PSICCode";
import Province from "../../../components/Autocomplete/Province";
import Municipality from "../../../components/Autocomplete/Municipalities";
import Barangay from "../../../components/Autocomplete/Barangay";
import District from "../../actions/autocomplete/District";
import "./hgeninfoadd.css";

const { Paragraph } = Typography;
const { TextArea } = Input;

const initialState = {
  proponentName: "",
  projectTitle: "",
  selectedIndustryClass: "",
  industryType: "",
  industrySubType: "",
  psicCode: "",
  selectedProvince: "",
  selectedMunicipality: "",
  selectedBarangay: "",
  street: "",
  fullAddress: "",
  longitude: "",
  latitude: "",
  withinManilaBayArea: false,
};

const HGenInfoAdd = forwardRef(({ isEditing, clearTrigger }, ref) => {
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
  const [district, setDistrict] = useState("");

  // Compose full address
  useEffect(() => {
    const addressComponents = [
      street,
      selectedBarangay,
      selectedMunicipality,
      selectedProvince,
    ];
    const filtered = addressComponents.filter((c) => c);
    setFullAddress(filtered.join(", "));
  }, [street, selectedBarangay, selectedMunicipality, selectedProvince]);

  // Fetch coordinates when full address changes
  useEffect(() => {
    const fetchCoordinates = async () => {
      if (fullAddress) {
        try {
          const response = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
              fullAddress
            )}&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`
          );
          const data = await response.json();
          if (data.results && data.results.length > 0) {
            const location = data.results[0].geometry.location;
            setLongitude(location.lng);
            setLatitude(location.lat);
          } else {
            setLongitude("");
            setLatitude("");
          }
        } catch (error) {
          setLongitude("");
          setLatitude("");
        }
      } else {
        setLongitude("");
        setLatitude("");
      }
    };
    fetchCoordinates();
  }, [fullAddress]);

  // Reset dependent fields when Industry Class changes
  useEffect(() => {
    if (!selectedIndustryClass) {
      setIndustryType("");
      setIndustrySubType("");
      setPsicCode("");
    }
  }, [selectedIndustryClass]);

  // Reset dependent fields when Province or Municipality changes
  useEffect(() => {
    if (!selectedProvince) {
      setSelectedMunicipality("");
      setSelectedBarangay("");
      setStreet("");
    }
    if (!selectedMunicipality) {
      setSelectedBarangay("");
      setStreet("");
    }
  }, [selectedProvince, selectedMunicipality]);

  // Clear all fields when clearTrigger changes (from parent on cancel)
  useEffect(() => {
    if (clearTrigger) {
      setProponentName(initialState.proponentName);
      setProjectTitle(initialState.projectTitle);
      setSelectedIndustryClass(initialState.selectedIndustryClass);
      setIndustryType(initialState.industryType);
      setIndustrySubType(initialState.industrySubType);
      setPsicCode(initialState.psicCode);
      setSelectedProvince(initialState.selectedProvince);
      setSelectedMunicipality(initialState.selectedMunicipality);
      setSelectedBarangay(initialState.selectedBarangay);
      setStreet(initialState.street);
      setFullAddress(initialState.fullAddress);
      setLongitude(initialState.longitude);
      setLatitude(initialState.latitude);
      setWithinManilaBayArea(initialState.withinManilaBayArea);
    }
  }, [clearTrigger]);

  // Optionally expose a clear method via ref
  useImperativeHandle(ref, () => ({
    clearAllFields: () => {
      setProponentName(initialState.proponentName);
      setProjectTitle(initialState.projectTitle);
      setSelectedIndustryClass(initialState.selectedIndustryClass);
      setIndustryType(initialState.industryType);
      setIndustrySubType(initialState.industrySubType);
      setPsicCode(initialState.psicCode);
      setSelectedProvince(initialState.selectedProvince);
      setSelectedMunicipality(initialState.selectedMunicipality);
      setSelectedBarangay(initialState.selectedBarangay);
      setStreet(initialState.street);
      setFullAddress(initialState.fullAddress);
      setLongitude(initialState.longitude);
      setLatitude(initialState.latitude);
      setWithinManilaBayArea(initialState.withinManilaBayArea);
    },
  }));

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
        <Paragraph>
          <strong>Proponent Name</strong>
          <ProponentName
            value={proponentName}
            onChange={setProponentName}
            placeholder="Enter proponent name"
            disabled={!isEditing}
          />
        </Paragraph>
        <Paragraph>
          <strong>Project Title</strong>
          <ProjectTitle
            value={projectTitle}
            onChange={setProjectTitle}
            placeholder="Enter project title"
            disabled={!isEditing}
          />
        </Paragraph>
        <Paragraph>
          <strong>Industry Classification</strong>
          <IndustryClass
            value={selectedIndustryClass}
            onChange={setSelectedIndustryClass}
            readOnly={!isEditing}
          />
        </Paragraph>
        <Paragraph>
          <IndustryType
            selectedIndustryClass={selectedIndustryClass}
            setIndustryType={setIndustryType}
            value={industryType}
            disabled={!isEditing || !selectedIndustryClass}
          />
        </Paragraph>
        <Paragraph>
          <IndustrySubType
            selectedIndustryClass={selectedIndustryClass}
            setIndustrySubType={setIndustrySubType}
            value={industrySubType}
            disabled={!isEditing || !selectedIndustryClass}
          />
        </Paragraph>
        <Paragraph>
          <PSICCode
            selectedIndustryClass={selectedIndustryClass}
            value={psicCode}
            onChange={setPsicCode}
            disabled={!isEditing || !selectedIndustryClass}
          />
        </Paragraph>
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
              />
            </Paragraph>
          </Col>
        </Row>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={24} md={15} lg={15} className="modalcol">
            <Paragraph>
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
                <Input
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  placeholder="Enter street"
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
          <Col xs={24} sm={24} md={9} lg={9}>
            <Paragraph>
              <Checkbox
                checked={withinManilaBayArea}
                onChange={(e) => setWithinManilaBayArea(e.target.checked)}
                disabled={!isEditing}
                className="checkbox-mbu"
              >
                <span>Within Manila Bay Area </span>
              </Checkbox>
            </Paragraph>
          </Col>
        </Row>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={24} md={24} lg={24}>
            <Paragraph>
              <strong>Complete Address</strong>
              <ConfigProvider
                theme={{
                  components: {
                    Input: {
                      fontSize: "11px",
                      cursor: "not-allowed",
                      padding: "4px 8px",
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
                    cursor: "not-allowed",
                    padding: "0px 4px",
                  }}
                  placeholder="n/a"
                />
              </ConfigProvider>
            </Paragraph>
          </Col>
        </Row>

        <Row gutter={[16, 16]}>
          <Col xs={24} sm={24} md={12} lg={12}>
            <Paragraph>
              <strong>Longitude</strong>
              <Input
                value={longitude}
                onChange={(e) => isEditing && setLongitude(e.target.value)}
                readOnly={!isEditing}
                placeholder="n/a"
              />
            </Paragraph>
          </Col>
          <Col xs={24} sm={24} md={12} lg={12}>
            <Paragraph>
              <strong>Latitude</strong>
              <Input
                value={latitude}
                onChange={(e) => isEditing && setLatitude(e.target.value)}
                readOnly={!isEditing}
                placeholder="n/a"
              />
            </Paragraph>
          </Col>
        </Row>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={24} md={12} lg={12}>
            <Paragraph>
              <District
                value={district}
                onChange={setDistrict}
                selectedProvince={selectedProvince}
                selectedMunicipality={selectedMunicipality}
                disabled={!selectedMunicipality || !isEditing}
              />
            </Paragraph>
          </Col>
        </Row>
      </Col>
    </Row>
  );
});

export default HGenInfoAdd;
