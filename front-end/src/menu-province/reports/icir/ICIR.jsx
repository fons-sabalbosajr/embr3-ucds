import React, { useState, useEffect } from "react";
import {
  Table,
  Checkbox,
  Button,
  Modal,
  Spin,
  Menu,
  Dropdown,
  Tour,
} from "antd";
import { InfoCircleOutlined } from "@ant-design/icons";
import axios from "axios";
import "./icir.css";

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
  waterbody: "Receiving Waterbody/River System",
  emp_no_total: "Total Number of Employees",
  bod: "Bio-Oxygen Demand",
  long: "Longitude",
  lat: "Latitude",
  cong_district: "Congressional District",
  street: "Street",
  brgy: "Barangay",
  city: "City",
  province: "Province",
  section_incharge: "Current Section In-Charge",
  fmr_section_incharged: "Former Section In-Charge",
  handler: "Handler",
  monitoring_sched: "Schedule of Monitoring",
  iis_no: "IIS Reference No.",
  insp_type: "Inspection Type",
  report_type: "Report Type",
  date_monitored: "Date Monitored",
  date_routed: "Date Routed to IIS",
  date_signed: "Date Report Signed (Routed to PISMU)",
  days_dmds: "Total Days (Date Monitored vs. Date Submitted",
  days_dsdrs: "Total Days (Date Submitted vs. Date Report Signed)",
  pismu_tracking: "Tracking of Reports",
  remarks_recommendations: "Remarks/Recommendations",
  pd1586: "PD1586",
  ecc_cnc: "ECC/CNC Reference Code",
  permit_process: "ECC/CNC Process Source",
  date_amend: "Date Amended",
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
  date_forwarded: "Date Forwarded to Legal Staff",
  date_approved_clegal: "Date Approved by Chief Legal",
  days_dfda: "Total Days (Date Forwarded vs. Date Approved)",
  service_mode: "Service Mode",
  nov_released: "NOV Date Released",
  v_pd1586: "Violation PD1586",
  v_ra9275: "Violation RA9275",
  v_ra8749: "Violation RA8749",
  v_haz: "Violation HAZ",
  v_tchem: "Violation TChem",
  tc_date_sched: "TC Date Scheduled",
  tc_date_actual: "TC Date Actual",
  time: "Time",
  legal_officer: "Legal Officer",
  tc_commitment: "TC Commitment/Deadline of Compliance",
  pos_paper: "Position Paper",
  penalty: "Date of Payment of Penalty",
  amount: "Amount",
  or_number: "OR Number",
  tc_order_compliance: "Compliance with TC Commitment/Order",
  remarks: "Remarks",
  resolution: "Issued Resolution",
  order: "Issued Order",
  order_status: "Status of Issued Order",
  mbu_priority: "MBU Priority",
  mbu_survey: "MBU Survey",
  mbu_survey_request: "MBU Survey Request",
  dp_universe: "DP Universe",
};

const ICIR = ({ editedRecord, onIncludeChange, resetCheckboxesKey }) => {
  const [ucdsData, setUcdsData] = useState([]);
  const [includedFields, setIncludedFields] = useState({});
  const [selectedData, setSelectedData] = useState({});
  const [loadingPDF, setLoadingPDF] = useState(false);
  const [selectAllChecked, setSelectAllChecked] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [tourVisible, setTourVisible] = useState(false); // Initialize tourVisible to true
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    if (!dontShowAgain) {
      setTimeout(() => {
        setTourVisible(true);
      }, 1000);
    }
  }, [dontShowAgain]);

  const handleDontShowAgain = () => {
    setDontShowAgain(true);
    setTourVisible(false);
  };

  const handleTourClick = () => {
    setTourVisible(true);
  };

  useEffect(() => {
    axios
      .get(`http://localhost:8081/api/ucds-data/${editedRecord.id_no}`)
      .then((response) => {
        setUcdsData(response.data);
      })
      .catch((error) => {
        console.error(error);
      });

    // Reset fields when editedRecord changes
    setIncludedFields({});
    setSelectedData({});
    setSelectAllChecked(false);
  }, [editedRecord]);

  const handleCheckboxChange = (field, checked) => {
    setIncludedFields((prevIncludedFields) => ({
      ...prevIncludedFields,
      [field]: checked,
    }));
    if (checked) {
      setSelectedData((prevSelectedData) => ({
        ...prevSelectedData,
        [field]: ucdsData[field],
      }));
    } else {
      setSelectedData((prevSelectedData) => {
        const newSelectedData = { ...prevSelectedData };
        delete newSelectedData[field];
        return newSelectedData;
      });
    }
  };

  useEffect(() => {
    // Reset checkboxes when resetCheckboxesKey changes
    setIncludedFields({});
    setSelectAllChecked(false); // Reset Select All checkbox
  }, [resetCheckboxesKey]);

  const handleSelectAllChange = (e) => {
    const isChecked = e.target.checked;
    setSelectAllChecked(isChecked);
    const fieldsToInclude = [
      "id_no",
      "title",
      "name",
      "address",
      "industry_class",
      "psic_code",
      "emp_no_total",
      "ecc_cnc",
      "date_approved",
      "haz_id",
      "haz_issued",
      "pto_code",
      "pto_issued",
      "pto_expiration",
      "wwdp_code",
      "wwdp_issued",
      "wwdp_expiration",
      "long",
      "lat",
      "handler",
    ];
    fieldsToInclude.forEach((field) => {
      handleCheckboxChange(field, isChecked);
    });
  };

  const handleGeneratePDF = async () => {
    try {
      setLoadingPDF(true);
      document.body.style.cursor = "wait";

      // Show processing modal
      const processingModal = Modal.info({
        title: "Generating PDF...",
        content: (
          <Spin spinning={true} size="large">
            <p>Please wait...</p>
          </Spin>
        ),
        maskClosable: false,
        okButtonProps: { disabled: true },
        zIndex: 10000, // Ensure this modal is on top
      });

      // Filter and sort selected fields based on your field order
      const selectedFields = Object.keys(selectedData)
        .filter((key) => includedFields[key])
        .reduce((obj, key) => {
          obj[key] = selectedData[key];
          return obj;
        }, {});

      // Convert selected fields to query parameters
      const queryParams = new URLSearchParams(selectedFields).toString();

      // Call the API to generate PDF
      const response = await axios.get(
        `http://localhost:8081/generate-custom-icir/${editedRecord.id_no}`,
        {
          params: selectedFields,
          responseType: "arraybuffer",
        }
      );

      // Close processing modal
      processingModal.destroy();

      // Create a Blob from the PDF data and create a URL for it
      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);

      // Determine the filename
      const fileName = selectedFields.establishment_name
        ? `ICIR-${selectedFields.establishment_name}.pdf`
        : editedRecord.title
        ? `ICIR-${editedRecord.title}.pdf`
        : `ICIR-${editedRecord.id_no}.pdf`;

      // Create an anchor tag with the download attribute
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.download = fileName;

      // Simulate a click on the anchor tag
      a.click();

      // Clean up
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setLoadingPDF(false);
      document.body.style.cursor = "default";
      Modal.destroyAll();
      Modal.error({
        title: "Error",
        content: "Failed to generate PDF",
      });
      console.error("Error generating PDF:", error);
    } finally {
      document.body.style.cursor = "default";
      setLoadingPDF(false);
    }
  };

  const handleGeneratePDFDraft = async () => {
    let response;

    try {
      setLoadingPDF(true);
      document.body.style.cursor = "wait";

      // Fetch current user with credentials using /check-auth
      const userResponse = await axios.get("http://localhost:8081/check-auth", {
        withCredentials: true,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });

      //console.log("User Response:", userResponse.data);

      if (
        userResponse.status === 200 &&
        userResponse.data.status === "Success"
      ) {
        const currentUser = userResponse.data;
        //console.log("Current User:", currentUser);

        // Update your state with the full user object
        setCurrentUser(currentUser);
      } else {
        throw new Error("Failed to fetch current user");
      }

      // Show processing modal
      const processingModal = Modal.info({
        title: "Generating PDF...",
        content: (
          <Spin spinning={true} size="large">
            <p>Please wait...</p>
          </Spin>
        ),
        maskClosable: false,
        okButtonProps: { disabled: true },
        zIndex: 10000,
      });

      // Filter and sort selected fields based on your field order
      const selectedFields = Object.keys(selectedData)
        .filter((key) => includedFields[key])
        .reduce((obj, key) => {
          obj[key] = selectedData[key];
          return obj;
        }, {});

      // Call the API to generate PDF
      response = await axios.get(
        `http://localhost:8081/generate-custom-icir/${editedRecord.id_no}`,
        {
          params: selectedFields,
          responseType: "arraybuffer",
          withCredentials: true,
        }
      );

      // Close processing modal
      processingModal.destroy();

      // Create a Blob from the PDF data
      const blob = new Blob([response.data], { type: "application/pdf" });

      // Determine the filename
      const fileName = selectedFields.establishment_name
        ? `ICIR_Draft-${selectedFields.establishment_name}.pdf`
        : editedRecord.title
        ? `ICIR_Draft-${editedRecord.title}.pdf`
        : `ICIR_Draft-${editedRecord.id_no}.pdf`;

      // Create a new FormData object
      const formData = new FormData();
      formData.append("reportInfo", JSON.stringify(selectedFields));
      formData.append("user", JSON.stringify({ name: currentUser.name })); // Pass the user name only
      formData.append("date", new Date().toISOString());
      formData.append("fileName", fileName);
      formData.append("pdfFile", blob, fileName); // Attach file with filename

      // Save draft report to MongoDB
      await axios.post("http://localhost:8081/save-draft-report", formData);

      Modal.success({
        title: "Success",
        content: "Draft report has been saved successfully.",
      });

      // Create a temporary link element and trigger the download
      const downloadLink = document.createElement("a");
      downloadLink.href = URL.createObjectURL(blob);
      downloadLink.download = fileName;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    } catch (error) {
      Modal.destroyAll();
      Modal.error({
        title: "Error",
        content: "Failed to generate PDF",
      });
      console.error("Error generating PDF:", error);
    } finally {
      setLoadingPDF(false);
      document.body.style.cursor = "default";
    }
  };

  const confirmGeneratePDF = () => {
    Modal.confirm({
      title: "Are you sure you want to generate the PDF?",
      content:
        "Please confirm that you want to proceed. \n Note:All data sources can be modified upon generation of PDF.",
      onOk: handleGeneratePDF,
      onCancel() {
        console.log("Cancelled");
      },
    });
  };

  const confirmGenerateDraft = () => {
    Modal.confirm({
      title: "Save generated PDF to Draft Reports?",
      content:
        "Please confirm that you want to proceed. \n Note:All data sources can be modified upon generation of PDF.",
      onOk: handleGeneratePDFDraft,
      onCancel() {
        console.log("Cancelled");
      },
    });
  };

  const steps = [
    {
      title: "",
      description: (
        <div style={{ fontSize: 11 }}>
          {Object.keys(selectedData).map((field, index) => (
            <div key={index}>
              <strong>{field}:</strong> {selectedData[field]}
            </div>
          ))}
          <hr />
          <h4>About Select Initial Data:</h4>
          <div className="data-p">
            <p>
              The Select Initial Data function allows users to quickly select a
              set of initial data fields to be included in the report. When the
              user clicks the Select Initial Data checkbox, the function
              automatically selects a predefined set of fields that are commonly
              required in the report.
            </p>
            <p>
              This feature saves time, ensures consistency, and simplifies the
              reporting process. By selecting the initial data fields with a
              single click, users can quickly generate a report with the
              essential information.
            </p>
          </div>

          <h4>Initial Data Fields:</h4>
          <div className="data-container">
            <ul className="data-ul">
              <li>Firm ID</li>
              <li>Project Title</li>
              <li>Proponent Name</li>
              <li>Address</li>
              <li>Industry Class</li>
              <li>PSIC Code</li>
              <li>Total Number of Employees</li>
              <li>ECC/CNC Reference Code</li>
              <li>Date Approved</li>
              <li>Haz-Waste Generated ID</li>
            </ul>
            <ul className="data-ul">
              <li>Haz-Waste ID Date Issued</li>
              <li>PTO Code</li>
              <li>PTO Date Issued</li>
              <li>PTO Date of Expiration</li>
              <li>WWDP Code</li>
              <li>WWDP Date Issued</li>
              <li>WWDP Date of Expiration</li>
              <li>Longitude</li>
              <li>Latitude</li>
              <li>Handler</li>
            </ul>
          </div>
        </div>
      ),
      placement: "bottom",
      target: () => document.querySelector(".info-icon"),
    },
  ];

  const draftMenu = (
    <Menu>
      <Menu.Item
        key="monitoring"
        onClick={() => confirmGenerateDraft("For Monitoring")}
      >
        For Monitoring
      </Menu.Item>
      <Menu.Item
        key="inspection"
        onClick={() => handleSaveDraft("For Inspection")}
      >
        For Inspection
      </Menu.Item>
      <Menu.Item key="nov" onClick={() => handleSaveDraft("For NOV")}>
        For NOV
      </Menu.Item>
    </Menu>
  );

  const columns = [
    {
      title: "Required Field",
      dataIndex: "field",
      key: "field",
      align: "left",
      width: 250,
      render: (text) => <b>{fieldTitles[text] || text}</b>,
    },
    {
      title: "Description",
      dataIndex: "value",
      key: "value",
      align: "left",
      render: (text, record) => (
        <span
          onClick={(e) =>
            handleCheckboxChange(record.field, !includedFields[record.field])
          }
        >
          {text}
        </span>
      ),
    },
    {
      title: "Include to Report?",
      dataIndex: "include",
      key: "include",
      align: "left",
      width: 150,
      render: (text, record) => (
        <Checkbox
          checked={includedFields[record.field] === true}
          onChange={(e) => handleCheckboxChange(record.field, e.target.checked)}
        />
      ),
    },
  ];

  const data = Object.entries(editedRecord).map(([field, value]) => ({
    field,
    value,
    include: !!value, // set include to true if value is not empty
  }));

  data.sort((a, b) => {
    if (!!a.value && !b.value) return -1;
    if (!a.value && !!b.value) return 1;
    return 0;
  });

  return (
    <div className="icir-container">
      <div className="icir-header">
        <div className="icir-header-left">
          <h3>Please choose data to be included in the report.</h3>
          <p>
            If the data is not updated, please update the data first before
            generating.
          </p>
        </div>

        <div className="icir-header-center">
          <Button
            type="primary"
            shape="circle"
            size="small"
            icon={<InfoCircleOutlined style={{ fontSize: 14 }} />}
            onClick={handleTourClick}
            className="info-icon"
          />
          <Checkbox checked={selectAllChecked} onChange={handleSelectAllChange}>
            Select Initial Data
          </Checkbox>
        </div>

        <div className="icir-header-right">
          <Button
            type="primary"
            className="button-gen-pdf"
            onClick={confirmGeneratePDF}
            disabled={Object.values(includedFields).every((x) => !x)}
          >
            Generate PDF
          </Button>
          <Dropdown
            overlay={draftMenu}
            trigger={["click"]}
            disabled={Object.values(includedFields).every((x) => !x)}
          >
            <Button
              type="primary"
              className="button-gen-draft"
              disabled={Object.values(includedFields).every((x) => !x)}
            >
              Save Draft
            </Button>
          </Dropdown>

          {tourVisible && (
            <Tour
              steps={steps}
              current={0}
              //mask={false}
              onClose={() => setTourVisible(false)}
              onFinish={() => (
                <div>
                  <div>
                    <Button type="primary" onClick={handleDontShowAgain}>Finish</Button>
                  </div>
                  <div>
                    <Button type="primary" onClick={handleDontShowAgain}>
                      Don't show this again
                    </Button>
                  </div>
                </div>
              )}
            ></Tour>
          )}
        </div>
      </div>

      <Table
        columns={columns}
        dataSource={data}
        pagination={{
          pageSize: 20,
          showSizeChanger: true,
          pageSizeOptions: ["10", "20", "50", "100"],
        }}
        scroll={{ y: 750 }}
        rowClassName={(record) => {
          if (
            [
              "id_no",
              "title",
              "name",
              "address",
              "industry_type",
              "industry_subtype",
              "industry_class",
              "psic_code",
              "proj_type",
              "mbu_area",
              "waterbody",
              "emp_no_total",
              "bod",
              "long",
              "lat",
              "cong_district",
              "address",
              "street",
              "brgy",
              "city",
              "province",
            ].includes(record.field)
          ) {
            return "skyblue-row";
          } else if (
            [
              "section_incharge",
              "fmr_section_incharged",
              "handler",
              "monitoring_sched",
              "pismu_tracking",
              "remarks_recommendations",
            ].includes(record.field)
          ) {
            return "green-row";
          } else if (
            [
              "iis_no",
              "insp_type",
              "report_type",
              "date_monitored",
              "date_routed",
              "date_signed",
              "days_dmds",
              "days_dsdrs",
            ].includes(record.field)
          ) {
            return "orange-row";
          } else if (
            [
              "pd1586",
              "ecc_cnc",
              "permit_process",
              "date_amend",
              "date_approved",
              "pto_code",
              "pto_issued",
              "pto_expiration",
              "ra9275",
              "wwdp_code",
              "wwdp_issued",
              "wwdp_expiration",
              "ra6969",
              "haz_id",
              "haz_issued",
              "tsd",
              "tsd_ref_no",
              "tsd_expiration",
              "tp_trc",
              "tp_trc_ref_no",
              "tp_trc_expiration",
              "chemical_permit",
              "chemical_permit_type",
              "chemical_permit_sub_type",
              "chem_permit_issued",
              "chem_permit_exp",
              "pco",
              "pco_no",
              "pco_name",
              "pco_tel_no",
              "pco_validity",
              "ra8749",
            ].includes(record.field)
          ) {
            return "blue-row";
          } else if (
            [
              "docket_no",
              "denr_pab_case_no",
              "date_forwarded",
              "date_approved_clegal",
              "days_dfda",
              "service_mode",
              "nov_released",
              "v_pd1586",
              "v_ra9275",
              "v_ra8749",
              "v_haz",
              "v_tchem",
              "ra6969",
              "tc_date_sched",
              "tc_date_actual",
              "time",
              "tsd_ref_no",
              "tsd_expiration",
              "tp_trc",
              "tp_trc_ref_no",
              "tp_trc_expiration",
              "chemical_permit",
              "chemical_permit_type",
              "chemical_permit_sub_type",
              "chem_permit_issued",
              "chem_permit_exp",
              "pco",
              "pco_no",
              "pco_name",
              "pco_tel_no",
              "pco_validity",
              "ra8749",
              "legal_officer",
              "tc_commitment",
              "pos_paper",
              "penalty",
              "amount",
              "or_number",
              "tc_order_compliance",
              "remarks",
              "resolution",
              "order",
              "order_status",
            ].includes(record.field)
          ) {
            return "gray-row";
          } else if (
            [
              "mbu_priority",
              "mbu_survey",
              "mbu_survey_request",
              "dp_universe",
            ].includes(record.field)
          ) {
            return "yellow-row";
          }
          return "";
        }}
        className="table-rows"
      />
    </div>
  );
};

export default ICIR;
