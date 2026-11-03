import { useState, useEffect, useRef } from "react";
import PropTypes from "prop-types";
import { getPreference, setPreference } from "../../../../../shared/preferences";
import { Table, Checkbox, Button, Dropdown, Tour, Tag, Typography, Space, Segmented, Input } from "antd";
import { message, modal } from "../../../../../shared/feedback";
import { QuestionCircleOutlined, FilePdfOutlined, SaveOutlined, DownOutlined, SearchOutlined } from "@ant-design/icons";
import axios from "axios";
import "./icir.css";
import { API_BASE_URL } from "../../../../../config/api";

const fieldTitles = {
  id_no: "Firm ID",
  title: "Project Title",
  name: "Proponent Name",
  address: "Address",
  industry_type: "Industry Type",
  industry_subtype: "Industry Sub-Type",
  industry_class: "Industry Class",
  psic_code: "PSIC Code",
  proj_type: "Project_Type",
  mbu_area: "Within Manila Bay Area?",
  title_status: "Establishment Status",
  with_nov: "With NOV?",
  waterbody: "Receiving Waterbody/River System",
  emp_total: "Total Number of Employees",
  wwtf_type: "WWTF Type",
  bod: "Bio-Oxygen Demand",
  long: "Longitude",
  lat: "Latitude",
  cong_district: "Congressional District",
  street: "Street",
  brgy: "Barangay",
  city: "City",
  province: "Province",
  section_incharged: "Current Section In-Charge",
  fmr_section_incharged: "Former Section In-Charge",
  handler: "Handler",
  monitoring_sched: "Schedule of Monitoring",
  iis_no: "IIS Reference No.",
  iis_no_2024: "IIS Reference No. (2024)",
  iis_no_2025: "IIS Reference No. (2025)",
  iis_no_2026: "IIS Reference No. (2026)",
  iis_no_nov: "IIS No. of the Notice of Violation",
  protected_area: "Protected Area",
  recommendations: "Remarks / Recommendations",
  insp_type: "Inspection Type",
  report_type: "Report Type",
  date_monitored: "Date Monitored",
  date_routed: "Date Routed to IIS",
  date_signed: "Date Report Signed (Routed to PISMU)",
  days_dmds: "Total Days (Date Monitored vs. Date Submitted",
  days_drds: "Total Days (Date Submitted vs. Date Report Signed)",
  pismu_tracking: "Tracking of Reports",
  remarks: "Remarks/Recommendations",
  pd1586: "PD1586",
  ecc_cnc: "ECC/CNC Reference Code",
  permit_process: "ECC/CNC Process Source",
  date_amended: "Date Amended",
  date_approved: "Date Approved",
  ra8749: "RA8749",
  pto_code: "PTO Code",
  pto_issued: "PTO Date Issued",
  pto_expiration: "PTO Date of Expiration",
  ra9275: "RA9275",
  wwdp_code: "WWDP Code",
  wwdp_issued: "WWDP Date Issued",
  wwdp_expiration: "WWDP Date of Expiration",
  ra6969: "RA6969",
  haz_id: "Haz-Waste Generated ID",
  haz_issued: "Haz-Waste ID Date Issued",
  tsd: "TSD",
  tsd_ref_no: "TSD Reference Number",
  tsd_expiration: "TSD Date of Expiration",
  tp_trc: "TP/TRC",
  tp_trc_ref_no: "TP/TRC Reference Code",
  tp_trc_expiration: "TP/TRC Date of Expiration",
  chemical_permit: "Chemical Permit/s",
  chemical_permit_type: "Chemical Permit Type",
  chemical_permit_sub_type: "Chemical Permit Sub-Type",
  chem_permit_issued: "Chemical Permit Issued",
  chem_permit_exp: "Chemical Permit Expiration",
  pco: "PCO",
  pco_no: "PCO Number",
  pco_name: "PCO Name",
  pco_tel_no: "PCO Tel. No.",
  pco_validity: "PCO Validity",
  docket_no: "Docket No",
  denr_pab_case_no: "DENR PAB Case No",
  nov_issued: "NOV Issued",
  date_forwarded: "Date Forwarded to Legal Staff",
  date_approved_clegal: "Date Approved by Chief Legal",
  days_dfda: "Total Days (Date Forwarded vs. Date Approved)",
  service_mode: "Service Mode",
  nov_released: "NOV Date Released",
  v_pd1586: "Violation PD1586",
  v_ra9275: "Violation RA9275",
  v_ra8749: "Violation RA8749",
  v_ra6969_haz: "Violation HAZ",
  v_ra6969_tchem: "Violation TChem",
  tc_date_sched: "TC Date Scheduled",
  tc_date_actual: "TC Date Actual",
  time: "Time",
  legal_officer: "Legal Officer",
  tc_commitment: "TC Commitment/Deadline of Compliance",
  pos_paper: "Position Paper",
  penalty_date: "Date of Payment of Penalty",
  amount: "Amount",
  or_number: "OR Number",
  tc_compliance_link: "Compliance with TC Commitment/Order",
  other_tc_remarks: "Remarks",
  resolution_issued: "Issued Resolution",
  order_issued: "Issued Order",
  order_status: "Status of Issued Order",
  mbu_priority: "MBU Priority",
  mbu_survey: "MBU Survey",
  mbu_survey_request: "MBU Survey Request",
  dp_universe: "DP Universe",
  color: "Tagged Status",
};

// Which part of the record a field belongs to, shown as a tag beside it (the
// rows used to be tinted whole, in six colours, with no key to them).
const GROUPS = [
  {
    label: "Profile",
    color: "geekblue",
    fields: ["id_no", "title", "name", "address", "industry_type", "industry_subtype", "industry_class", "psic_code", "proj_type", "mbu_area", "waterbody", "emp_total", "wwtf_type", "bod", "long", "lat", "cong_district", "street", "brgy", "city", "province", "protected_area", "title_status"],
  },
  {
    label: "Monitoring",
    color: "green",
    fields: ["section_incharged", "fmr_section_incharged", "handler", "monitoring_sched", "pismu_tracking", "recommendations", "remarks_recommendations", "with_nov", "iis_no", "iis_no_2024", "iis_no_2025", "iis_no_2026", "iis_no_nov", "insp_type", "report_type", "date_monitored", "date_routed", "date_signed", "days_dmds", "days_drds", "remarks"],
  },
  {
    label: "Permits",
    color: "cyan",
    fields: ["pd1586", "ecc_cnc", "permit_process", "date_amended", "date_approved", "ra8749", "pto_code", "pto_issued", "pto_expiration", "ra9275", "wwdp_code", "wwdp_issued", "wwdp_expiration", "ra6969", "haz_id", "haz_issued", "tsd", "tsd_ref_no", "tsd_issued", "tsd_expiration", "tp_trc", "tp_trc_ref_no", "tp_trc_issued", "tp_trc_expiration", "chemical_permit", "chemical_permit_type", "chemical_permit_sub_type", "chem_permit_issued", "chem_permit_exp", "pco", "pco_no", "pco_name", "pco_tel_no", "pco_validity"],
  },
  {
    label: "Legal",
    color: "volcano",
    fields: ["docket_no", "denr_pab_case_no", "date_forwarded", "date_approved_clegal", "days_dfda", "service_mode", "nov_released", "nov_issued", "v_pd1586", "v_ra9275", "v_ra8749", "v_ra6969_haz", "v_ra6969_tchem", "tc_date_sched", "tc_date_actual", "time", "legal_officer", "tc_commitment", "pos_paper", "penalty_date", "amount", "or_number", "tc_compliance_link", "other_tc_remarks", "resolution_issued", "order_issued", "order_status"],
  },
];
const groupOf = (field) => GROUPS.find((g) => g.fields.includes(field)) || { label: "Other", color: "default" };

// "Select initial data": what an ICIR nearly always carries.
const INITIAL_FIELDS = [
  "id_no", "title", "name", "address", "industry_class", "psic_code", "emp_total", "ecc_cnc", "date_approved", "date_amended",
  "haz_id", "haz_issued", "pto_code", "pto_issued", "pto_expiration", "wwdp_code", "wwdp_issued", "wwdp_expiration", "long", "lat", "handler",
];

// The register's own bookkeeping is not report data.
const INTERNAL = new Set(["_id", "sort_key", "formatted_sort_key", "helper_column", "helper_count", "searchText", "year", "createdAt", "updatedAt", "updated_by", "updated_at"]);

const hasValue = (v) => v !== null && v !== undefined && String(v).trim() !== "" && !/^(n\/a|-+|null|none)$/i.test(String(v).trim());

const ICIR = ({ editedRecord, resetCheckboxesKey }) => {
  const [includedFields, setIncludedFields] = useState({});
  const [selectedData, setSelectedData] = useState({});
  const [loadingPDF, setLoadingPDF] = useState(false);
  const [query, setQuery] = useState("");
  const [view, setView] = useState("filled");
  const [tourOpen, setTourOpen] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const initialRef = useRef(null);
  const tableRef = useRef(null);
  const pdfRef = useRef(null);
  const draftRef = useRef(null);

  // The tour once per person on this device, after the window has opened
  // (its targets are the window's own controls, which must be on screen);
  // afterwards from "How it works".
  useEffect(() => {
    if (getPreference("icirTourSeen") === "true") return undefined;
    const t = setTimeout(() => {
      setTourStep(0);
      setTourOpen(true);
    }, 700);
    return () => clearTimeout(t);
  }, []);

  const closeTour = () => {
    setPreference("icirTourSeen", "true");
    setTourOpen(false);
  };

  const data = Object.entries(editedRecord || {})
    .filter(([field]) => !INTERNAL.has(field))
    // The firm's ID is its serial as the screens show it (AU-2), not the
    // register's internal row number.
    .map(([field, value]) => ({ field, value: field === "id_no" && editedRecord.sort_key ? String(editedRecord.sort_key).replace(/-0*(\d+)$/, "-$1") : value }))
    .sort((a, b) => Number(hasValue(b.value)) - Number(hasValue(a.value)));
  const valueOf = (field) => data.find((d) => d.field === field)?.value;

  const selectedKeys = Object.keys(includedFields).filter((k) => includedFields[k]);
  const initialAvailable = INITIAL_FIELDS.filter((f) => hasValue(valueOf(f)));
  const initialChecked = initialAvailable.length > 0 && initialAvailable.every((f) => includedFields[f]);

  const setSelection = (keys) => {
    const included = {};
    const selected = {};
    for (const k of keys) {
      included[k] = true;
      selected[k] = valueOf(k);
    }
    setIncludedFields(included);
    setSelectedData(selected);
  };
  const toggle = (field) =>
    setSelection(includedFields[field] ? selectedKeys.filter((k) => k !== field) : [...selectedKeys, field]);

  // A new record, or the window reopened: start from nothing ticked.
  useEffect(() => {
    setSelection([]);
    setQuery("");
  }, [editedRecord?.sort_key, resetCheckboxesKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleInitialChange = (e) => {
    if (e.target.checked) setSelection([...new Set([...selectedKeys, ...initialAvailable])]);
    else setSelection(selectedKeys.filter((k) => !INITIAL_FIELDS.includes(k)));
  };

  const chosenFields = () =>
    Object.keys(selectedData)
      .filter((key) => includedFields[key] && selectedData[key] != null)
      .reduce((obj, key) => ({ ...obj, [key]: selectedData[key] }), {});

  const fileNameFor = (prefix, fields) =>
    `${prefix}-${fields.establishment_name || editedRecord.title || editedRecord.sort_key || editedRecord.id_no}.pdf`;

  const fetchPdf = async (fields) => {
    const response = await axios.get(`${API_BASE_URL}/generate-custom-icir/${encodeURIComponent(editedRecord.id_no)}`, {
      params: fields,
      responseType: "arraybuffer",
      withCredentials: true,
    });
    return new Blob([response.data], { type: "application/pdf" });
  };

  const download = (blob, fileName) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => window.URL.revokeObjectURL(url), 1000);
  };

  const handleGeneratePDF = async () => {
    setLoadingPDF(true);
    try {
      const fields = chosenFields();
      download(await fetchPdf(fields), fileNameFor("ICIR", fields));
      message.success("ICIR generated.");
    } catch (error) {
      console.error("Error generating PDF:", error);
      modal.error({ title: "The ICIR could not be generated", content: error.message || "Please try again." });
    } finally {
      setLoadingPDF(false);
    }
  };

  const handleGeneratePDFDraft = async (purpose) => {
    setLoadingPDF(true);
    try {
      const userResponse = await axios.get(`${API_BASE_URL}/check-auth`, { withCredentials: true });
      if (userResponse.status !== 200 || userResponse.data.status !== "Success") throw new Error("Your session could not be confirmed.");
      const fields = chosenFields();
      const blob = await fetchPdf(fields);
      const fileName = fileNameFor("ICIR_Draft", fields);
      const formData = new FormData();
      // Which establishment the draft is for, whatever was ticked to print:
      // the Reports log lists the open record's drafts by these.
      formData.append(
        "reportInfo",
        JSON.stringify({ ...fields, purpose, recordId: editedRecord._id, sort_key: editedRecord.sort_key, id_no: editedRecord.id_no, title: editedRecord.title, name: editedRecord.name, ecc_cnc: editedRecord.ecc_cnc })
      );
      formData.append("user", JSON.stringify({ name: userResponse.data.name }));
      formData.append("date", new Date().toISOString());
      formData.append("fileName", fileName);
      formData.append("pdfFile", blob, fileName);
      const saved = await axios.post(`${API_BASE_URL}/save-draft-report`, formData, { withCredentials: true });
      download(blob, fileName);
      modal.success({
        title: "Draft saved",
        content: saved.data?.fileSaved
          ? `Saved to this establishment's Reports log (${purpose}).`
          : `Listed in this establishment's Reports log (${purpose}), but the PDF could not be kept on the share — the copy just downloaded is the one to keep.`,
      });
    } catch (error) {
      console.error("Error saving the draft:", error);
      modal.error({ title: "The draft could not be saved", content: error.message || "Please try again." });
    } finally {
      setLoadingPDF(false);
    }
  };

  const confirmGeneratePDF = () =>
    modal.confirm({
      title: `Generate the ICIR with ${selectedKeys.length} field${selectedKeys.length === 1 ? "" : "s"}?`,
      content: "The PDF's fields stay editable after it is generated.",
      okText: "Generate PDF",
      onOk: handleGeneratePDF,
    });

  const confirmGenerateDraft = (purpose) =>
    modal.confirm({
      title: `Save as a draft — ${purpose}?`,
      content: "The PDF is generated, downloaded and kept in the Reports log.",
      okText: "Save draft",
      onOk: () => handleGeneratePDFDraft(purpose),
    });

  const nothingChosen = selectedKeys.length === 0;
  const filledCount = data.filter((d) => hasValue(d.value)).length;
  const q = query.trim().toLowerCase();
  const rows = data.filter((d) => {
    if (view === "filled" && !hasValue(d.value)) return false;
    if (view === "selected" && !includedFields[d.field]) return false;
    if (!q) return true;
    return (fieldTitles[d.field] || d.field).toLowerCase().includes(q) || String(d.value ?? "").toLowerCase().includes(q);
  });

  const columns = [
    {
      title: "Field",
      dataIndex: "field",
      key: "field",
      width: 300,
      render: (field) => {
        const g = groupOf(field);
        return (
          <div className="icir-field">
            <span className="icir-field-name">{fieldTitles[field] || field}</span>
            <Tag color={g.color} bordered={false} className="icir-group">
              {g.label}
            </Tag>
          </div>
        );
      },
    },
    {
      title: "Value in the record",
      dataIndex: "value",
      key: "value",
      render: (value) =>
        hasValue(value) ? <span className="icir-value">{String(value)}</span> : <Typography.Text type="secondary">—</Typography.Text>,
    },
  ];

  const steps = [
    {
      title: "Start with the usual fields",
      description: (
        <div className="icir-tour">
          <p>“Select initial data” ticks what an ICIR nearly always carries:</p>
          <div className="icir-tour-list">
            {INITIAL_FIELDS.map((f) => (
              <span key={f}>{fieldTitles[f] || f}</span>
            ))}
          </div>
          <p>Fields the record has no value for are skipped.</p>
        </div>
      ),
      target: () => initialRef.current,
      placement: "bottomLeft",
    },
    {
      title: "Add or remove any field",
      description: "Tick a row, or click it, to include it. Search, or show only what is ticked, to check the list before generating.",
      target: () => tableRef.current,
      placement: "top",
    },
    {
      title: "Generate the PDF",
      description: "Downloads the ICIR filled with the ticked fields. If a value is out of date, edit the record first.",
      target: () => pdfRef.current,
      placement: "bottomRight",
    },
    {
      title: "Or keep it as a draft",
      description: "Saves the PDF to the Reports log under its purpose — monitoring, inspection or NOV — and downloads it.",
      target: () => draftRef.current,
      placement: "bottomRight",
    },
  ];

  return (
    <div className="icir-panel">
      <div className="icir-bar">
        <div className="icir-bar-text">
          <Typography.Text strong style={{ fontSize: 15 }}>
            Choose what goes into the report
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
            Tick the fields to print on the Inspection and Compliance Inspection Report. A value out of date? Edit the record first.
          </Typography.Text>
        </div>
        <Space wrap>
          <Button
            icon={<QuestionCircleOutlined />}
            onClick={() => {
              setTourStep(0);
              setTourOpen(true);
            }}
          >
            How it works
          </Button>
          <span ref={draftRef}>
            <Dropdown
              trigger={["click"]}
              disabled={nothingChosen || loadingPDF}
              menu={{
                items: ["For Monitoring", "For Inspection", "For NOV"].map((p) => ({ key: p, label: p })),
                onClick: ({ key }) => confirmGenerateDraft(key),
              }}
            >
              <Button icon={<SaveOutlined />} disabled={nothingChosen || loadingPDF}>
                Save draft <DownOutlined />
              </Button>
            </Dropdown>
          </span>
          <span ref={pdfRef}>
            <Button type="primary" icon={<FilePdfOutlined />} onClick={confirmGeneratePDF} disabled={nothingChosen} loading={loadingPDF}>
              Generate PDF{nothingChosen ? "" : ` (${selectedKeys.length})`}
            </Button>
          </span>
        </Space>
      </div>

      <div className="icir-tools">
        <span ref={initialRef} className="icir-initial">
          <Checkbox checked={initialChecked} indeterminate={!initialChecked && initialAvailable.some((f) => includedFields[f])} onChange={handleInitialChange}>
            Select initial data
          </Checkbox>
        </span>
        <Segmented
          size="small"
          value={view}
          onChange={setView}
          options={[
            { label: `With a value (${filledCount})`, value: "filled" },
            { label: `All fields (${data.length})`, value: "all" },
            { label: `Ticked (${selectedKeys.length})`, value: "selected" },
          ]}
        />
        <Input
          allowClear
          size="small"
          prefix={<SearchOutlined />}
          placeholder="Find a field or a value"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ width: 240 }}
        />
        {!nothingChosen && (
          <Button size="small" type="link" onClick={() => setSelection([])}>
            Clear all
          </Button>
        )}
      </div>

      <div ref={tableRef}>
        <Table
          rowKey="field"
          size="small"
          className="icir-table"
          columns={columns}
          dataSource={rows}
          pagination={false}
          scroll={{ y: "calc(100vh - 360px)" }}
          locale={{ emptyText: view === "selected" ? "Nothing ticked yet." : "No field matches." }}
          rowSelection={{
            selectedRowKeys: selectedKeys,
            onChange: (keys) => setSelection([...new Set([...selectedKeys.filter((k) => !rows.some((r) => r.field === k)), ...keys])]),
            getCheckboxProps: (r) => ({ disabled: !hasValue(r.value) }),
            columnWidth: 44,
          }}
          onRow={(r) => ({
            onClick: (e) => {
              if (e.target.closest(".ant-table-selection-column") || !hasValue(r.value)) return;
              toggle(r.field);
            },
          })}
          rowClassName={(r) => (includedFields[r.field] ? "icir-row-on" : hasValue(r.value) ? "icir-row" : "icir-row-empty")}
        />
      </div>

      <Tour
        open={tourOpen}
        current={tourStep}
        onChange={setTourStep}
        steps={steps}
        onClose={closeTour}
        onFinish={closeTour}
        // Above the report window (a modal over a modal); the card is lifted
        // over its own backdrop in icir.css, which antd gives the same z-index.
        zIndex={3000}
        rootClassName="icir-tour-root"
      />
    </div>
  );
};

ICIR.propTypes = {
  editedRecord: PropTypes.object.isRequired,
  resetCheckboxesKey: PropTypes.number,
};

export default ICIR;
