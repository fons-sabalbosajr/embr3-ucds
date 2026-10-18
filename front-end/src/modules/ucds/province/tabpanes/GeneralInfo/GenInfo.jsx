import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Col, Input, Select, Space, Tag, Tooltip, Typography } from "antd";
import { AimOutlined, EnvironmentOutlined, LinkOutlined } from "@ant-design/icons";
import Papa from "papaparse";
import "./geninfo.css";
import { Columns, Field, Section, Stack, Value } from "../RecordForm";
import SuggestInput from "../SuggestInput";
import { isRawLayout, isYes } from "../registerLayout";
import IndustryClass from "../../actions/autocomplete/IndustryClass";
import IndustryType from "../../actions/autocomplete/IndustryType";
import IndustrySubType from "../../actions/autocomplete/IndustrySubType";
import PSICCode from "../../actions/autocomplete/PSICCode";
import Province from "../../../../../components/Autocomplete/Province";
import Municipality from "../../../../../components/Autocomplete/Municipalities";
import Barangay from "../../../../../components/Autocomplete/Barangay";
import { geocodeAddress } from "../../../ucdsService";
// The municipalities' congressional district and receiving waterbody, bundled
// with the code (it used to be fetched from /data/, which a production build
// does not serve).
import districtCsv from "../../../../../../data/district.csv?raw";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// The record view's General Information, in four plain sections —
// Establishment, Industry, Location, Coordinates — with fields large enough
// to read, and what can be worked out filled in for the person:
//
//   - the complete address, from street, barangay, municipality, province;
//   - the congressional district and the receiving waterbody, from the
//     municipality (data/district.csv) — and saved with the record;
//   - the coordinates, from the address ("Locate from address", and by
//     itself when an address being edited has none), checked to fall in
//     Region III, with a link to see the point on a map.
// ---------------------------------------------------------------------------

/** Municipality -> { district, waterbody }, by the register's own spelling ("San_Miguel_b"). */
const MUNICIPALITIES = (() => {
  const out = {};
  for (const row of Papa.parse(districtCsv, { header: true, skipEmptyLines: true }).data) {
    const name = String(row.Municipality || row["﻿Municipality"] || "").trim();
    if (!name) continue;
    const clean = (v) => (v && v.trim() !== "-" ? v.trim() : "");
    out[name.toLowerCase()] = { district: clean(row.ZipCode), waterbody: clean(row.Waterbody) };
  }
  return out;
})();
const lookupMunicipality = (city) => MUNICIPALITIES[String(city || "").trim().toLowerCase()] || null;

const REGION = { south: 14.4, north: 16.6, west: 119.7, east: 122.3 };
const toNumber = (v) => {
  const x = Number(String(v ?? "").trim());
  return Number.isFinite(x) && String(v ?? "").trim() !== "" ? x : null;
};
const blank = (v) => v === undefined || v === null || String(v).trim() === "" || /^n\/?a$/i.test(String(v).trim());
const PRECISION = { street: "street", barangay: "barangay", municipality: "town centre" };

const GenInfo = ({ editedRecord, setEditedRecord, isEditing }) => {
  const raw = isRawLayout(editedRecord);
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
  const [longitude, setLongitude] = useState("");
  const [latitude, setLatitude] = useState("");
  // Manila Bay: the register's mbu_area, ✔ or ✘ (every year); the protected area: the RAW workbooks' (2027 on).
  const [mbuArea, setMbuArea] = useState("");
  const [protectedArea, setProtectedArea] = useState("");
  const [locating, setLocating] = useState(false);
  const [located, setLocated] = useState(null); // { label, precision, inRegion } | { error }
  const autoTried = useRef("");

  // Load the record.
  useEffect(() => {
    if (!editedRecord) return;
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
    setLongitude(blank(editedRecord.long) ? "" : String(editedRecord.long));
    setLatitude(blank(editedRecord.lat) ? "" : String(editedRecord.lat));
    setMbuArea(editedRecord.mbu_area ?? (editedRecord.within_manila_bay_area ? "✔" : ""));
    setProtectedArea(editedRecord.protected_area || "");
  }, [editedRecord]);

  // A different record: its own coordinates, nothing carried over.
  useEffect(() => {
    setLocated(null);
    autoTried.current = "";
  }, [editedRecord?.sort_key]);

  // Worked out from the fields.
  const fullAddress = useMemo(() => [street, selectedBarangay, selectedMunicipality, selectedProvince].filter((x) => !blank(x)).map((x) => String(x).replace(/_/g, " ")).join(", "), [street, selectedBarangay, selectedMunicipality, selectedProvince]);
  const derived = lookupMunicipality(selectedMunicipality);
  const district = derived?.district || (!isEditing && editedRecord?.cong_district) || "";
  const waterbody = derived?.waterbody || (!isEditing && editedRecord?.waterbody) || "";
  const lat = toNumber(latitude);
  const lng = toNumber(longitude);
  const hasPoint = lat !== null && lng !== null;
  const outside = hasPoint && (lat < REGION.south || lat > REGION.north || lng < REGION.west || lng > REGION.east);
  const swapped = hasPoint && lat > 100 && lng < 30; // longitude typed in the latitude box

  // Back to the record while editing — the derived fields too.
  useEffect(() => {
    if (!isEditing || !setEditedRecord) return;
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
      // The register keeps the barangay in `brgy` (it was saved to a `barangay` nothing else read).
      brgy: selectedBarangay,
      street,
      long: longitude,
      lat: latitude,
      mbu_area: mbuArea,
      ...(raw ? { protected_area: protectedArea } : {}),
      ...(derived?.district ? { cong_district: derived.district } : {}),
      ...(derived?.waterbody ? { waterbody: derived.waterbody } : {}),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proponentName, projectTitle, selectedIndustryClass, industryType, industrySubType, psicCode, selectedProvince, selectedMunicipality, selectedBarangay, street, longitude, latitude, mbuArea, protectedArea, isEditing]);

  const locate = async () => {
    if (!selectedMunicipality && !selectedBarangay) {
      setLocated({ error: "Choose the municipality first." });
      return;
    }
    setLocating(true);
    try {
      const r = await geocodeAddress({ street, barangay: selectedBarangay, city: selectedMunicipality, province: selectedProvince });
      if (!r) {
        setLocated({ error: "The address was not found on the map. Enter the coordinates by hand." });
      } else {
        setLatitude(String(r.lat));
        setLongitude(String(r.lng));
        setLocated(r);
      }
    } catch (e) {
      setLocated({ error: e?.response?.data?.message || "The map service could not be reached." });
    } finally {
      setLocating(false);
    }
  };

  // While editing, an address with no coordinates is located by itself (once per address).
  useEffect(() => {
    if (!isEditing || hasPoint || !selectedMunicipality) return undefined;
    const key = `${street}|${selectedBarangay}|${selectedMunicipality}|${selectedProvince}`;
    if (autoTried.current === key) return undefined;
    const t = setTimeout(() => {
      autoTried.current = key;
      locate();
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, hasPoint, street, selectedBarangay, selectedMunicipality, selectedProvince]);

  const mapUrl = hasPoint ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}` : null;
  
  return (
    <div className={`rf gi ${isEditing ? "is-editing" : "is-viewing"}`}>
      <Columns>
      <Stack>
      <Section title="Establishment">
        <Field label="Proponent name">
          {isEditing ? <SuggestInput field="name" multiline value={proponentName} onChange={setProponentName} placeholder="Name of the proponent" autoSize={{ minRows: 1, maxRows: 4 }} /> : <Value>{proponentName}</Value>}
        </Field>
        <Field label="Project title">
          {isEditing ? <SuggestInput field="title" multiline onEmpty={false} value={projectTitle} onChange={setProjectTitle} placeholder="Title of the project" autoSize={{ minRows: 1, maxRows: 4 }} /> : <Value strong>{projectTitle}</Value>}
        </Field>
      </Section>

      <Section title="Industry">
        <Field label="Industry classification">
          <IndustryClass onChange={setSelectedIndustryClass} value={selectedIndustryClass} readOnly={!isEditing} />
        </Field>
        <Field label="PSIC code" hint="from the classification" md={8}>
          <PSICCode selectedIndustryClass={selectedIndustryClass} value={psicCode} onChange={setPsicCode} readOnly={!isEditing} />
        </Field>
        <Field label="Industry type" hint="from the classification" md={8}>
          <IndustryType bare selectedIndustryClass={selectedIndustryClass} setIndustryType={setIndustryType} readOnly={!isEditing} />
        </Field>
        <Field label="Industry sub-type" hint="from the classification" md={8}>
          <IndustrySubType bare selectedIndustryClass={selectedIndustryClass} setIndustrySubType={setIndustrySubType} readOnly={!isEditing} />
        </Field>
      </Section>

      <Section title="Environment" className="rf-fill">
        <Field label="Within Manila Bay area" md={raw ? 8 : 24}>
          {isEditing ? (
            <Select
              value={mbuArea || undefined}
              onChange={(v) => setMbuArea(v ?? "")}
              allowClear
              placeholder="Yes or no"
              options={[{ value: "✔", label: "✔ Yes" }, { value: "✘", label: "✘ No" }]}
              style={{ width: "100%" }}
            />
          ) : (
            <Value>{mbuArea ? (isYes(mbuArea) ? "✔ Yes" : "✘ No") : ""}</Value>
          )}
        </Field>
        {raw && (
          <Field label="Protected area" md={16}>
            {isEditing ? <SuggestInput field="protected_area" value={protectedArea} onChange={setProtectedArea} placeholder="N/A, or the protected area's name" /> : <Value>{protectedArea}</Value>}
          </Field>
        )}
      </Section>
      </Stack>

      <Stack>
      <Section title="Location" icon={<EnvironmentOutlined />}>
        <Field label="Province" md={8}>
          <Province value={selectedProvince} onChange={setSelectedProvince} disabled={!isEditing} readOnly={!isEditing} />
        </Field>
        <Field label="Municipality / city" md={8}>
          <Municipality value={selectedMunicipality} onChange={setSelectedMunicipality} selectedProvince={selectedProvince} readOnly={!selectedProvince || !isEditing} />
        </Field>
        <Field label="Barangay" md={8}>
          <Barangay value={selectedBarangay} onChange={setSelectedBarangay} selectedProvince={selectedProvince} selectedMunicipality={selectedMunicipality} readOnly={!selectedMunicipality || !isEditing} />
        </Field>
        <Field label="Street / building">
          {isEditing ? <SuggestInput field="street" value={street} onChange={setStreet} placeholder="House no., street, building, purok" /> : <Value>{street}</Value>}
        </Field>
        <Field label="Complete address" hint="from the fields above">
          <Value auto>{fullAddress}</Value>
        </Field>
        <Field label="Congressional district" hint="from the municipality" md={12}>
          <Value auto>{district}</Value>
        </Field>
        <Field label="Receiving waterbody" hint="from the municipality" md={12}>
          <Value auto>{waterbody}</Value>
        </Field>
      </Section>

      <Section
        className="rf-fill"
        title="Coordinates"
        icon={<AimOutlined />}
        extra={
          <Space size={8}>
            {mapUrl && (
              <Button size="small" href={mapUrl} target="_blank" rel="noopener noreferrer" icon={<LinkOutlined />}>
                Open map
              </Button>
            )}
            {isEditing && (
              <Tooltip title="Find the latitude and longitude of the address above">
                <Button size="small" type="primary" ghost icon={<AimOutlined />} loading={locating} onClick={locate}>
                  Locate from address
                </Button>
              </Tooltip>
            )}
          </Space>
        }
      >
        <Field label="Latitude" hint="e.g. 14.9022" md={12}>
          {isEditing ? <Input value={latitude} onChange={(e) => setLatitude(e.target.value.trim())} placeholder="14.xxxxx – 16.xxxxx" inputMode="decimal" status={latitude && lat === null ? "error" : undefined} /> : <Value mono>{latitude}</Value>}
        </Field>
        <Field label="Longitude" hint="e.g. 120.8488" md={12}>
          {isEditing ? <Input value={longitude} onChange={(e) => setLongitude(e.target.value.trim())} placeholder="119.xxxxx – 122.xxxxx" inputMode="decimal" status={longitude && lng === null ? "error" : undefined} /> : <Value mono>{longitude}</Value>}
        </Field>
        <Col xs={24}>
          {swapped ? (
            <Alert type="warning" showIcon message="The latitude and longitude look swapped: latitude is about 14–17 in Region III, longitude about 119–122." />
          ) : outside ? (
            <Alert type="warning" showIcon message="This point is outside Region III. Check the coordinates." />
          ) : located?.error ? (
            <Alert type="info" showIcon message={located.error} />
          ) : located ? (
            <Text type="secondary" className="gi-located">
              Located: {located.label}{" "}
              <Tag color={located.precision === "street" ? "green" : located.precision === "barangay" ? "blue" : "gold"} style={{ marginInlineStart: 4 }}>
                {PRECISION[located.precision] || located.precision}
              </Tag>
              {located.precision === "municipality" && "Only the town's centre was found: move the point if you know the exact place."}
            </Text>
          ) : null}
        </Col>
      </Section>
      </Stack>
      </Columns>
    </div>
  );
};

export default GenInfo;
