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
import "./surveyreport.css";

const fieldTitles = {
  id_no: "Firm ID",
  survey_eia: "EIA Survey",
  survey_air: "AIR Survey",
  survey_water: "Water Survey",
  survey_haz: "Hazwaste Survey",
  survey_chem: "Chemical Survey",
  project_title: "Project Title",
  project_type: "Industry Type",
  project_subtype: "Industry Sub-Type",
  industry_class: "Industry Class",
  psic_code: "PSIC Code",
  other_proj_type: "Other Project_Type",
  mbu_area: "Within Manila Bay Area?",
  waterbody: "Receiving Waterbody/River System",
  employee_no: "Total Number of Employees",
  bod: "Bio-Oxygen Demand",
  long: "Longitude",
  lat: "Latitude",
  cong_district: "Congressional District",
  address: "Address",
  street: "Street",
  brgy: "Barangay",
  city: "City",
  province: "Province",
  resp_unit: "Responsible Unit",
  handler: "Handler",
  iis_no: "IIS Reference No.",
  date_surveyed: "Date Surveyed",
  date_routed: "Date Routed to IIS",
  date_signed: "Date Report Signed (Date Forwarded to Focal Person)",
  total_days: "Total Days (Date surveyed vs. Date Submitted",
  track_report_unit: "Tracking of Reports (Route - Section/Unit",
  track_report_planning: "Tracking of Reports (Received by Planning Unit)",
  remarks: "Remarks/Recommendations",
  docket_no: "Docket No",
  denr_pab_case_no: "DENR PAB Case No",
  date_forwarded_legal: "Date Forwarded to Legal Staff",
  date_approved_legal: "Date Approved by Chief Legal",
  daysDfDa: "Total Days (Date Forwarded vs. Date Approved)",
  service_mode: "Service Mode",
  nov_released_date: "NOV Date Released",
  v_pd1586: "Violation PD1586",
  v_ra9275: "Violation RA9275",
  v_ra8749: "Violation RA8749",
  v_haz: "Violation HAZ",
  v_toxichem: "Violation TChem",
  tc_schedule: "TC Date Scheduled",
  tc_time: "TC Scheduled Time",
  tc_date_actual: "TC Date Actual",
  tc_legal_officer: "Assigned Legal Officer",
  tc_commitment: "TC Commitment/Deadline of Compliance",
  pos_paper: "Position Paper",
  date_payment_penalty: "Date of Payment of Penalty",
  penalty_amount: "Amount",
  penalty_or_number: "OR Number",
  tc_compliance: "Compliance with TC Commitment/Order",
  tc_compliance_remarks: "Remarks",
  issued_resolution: "Issued Resolution",
  issued_order: "Issued Order",
  order_status: "Status of Issued Order",
};

const SurveyReport = ({
  editedRecord,
  onIncludeChange,
  resetCheckboxesKey,
}) => {
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
      .get(`http://10.14.77.100:8081/api/survey-data/${editedRecord.id_no}`)
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
      "project_title",
      "name",
      "address",
      "industry_class",
      "long",
      "lat",
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
        `http://10.14.77.100:8081/generate-custom-survey-report/${editedRecord.id_no}`,
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
        ? `Survey Report-${selectedFields.establishment_name}.pdf`
        : editedRecord.project_title
        ? `Survey Report-${editedRecord.project_title}.pdf`
        : `Survey Report-${editedRecord.id_no}.pdf`;

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

      const userResponse = await axios.get("http://10.14.77.100:8081/check-auth", {
        withCredentials: true,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });

      if (
        userResponse.status === 200 &&
        userResponse.data.status === "Success"
      ) {
        const currentUser = userResponse.data;
        setCurrentUser(currentUser);
      } else {
        throw new Error("Failed to fetch current user");
      }

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

      const selectedFields = Object.keys(selectedData)
        .filter((key) => includedFields[key])
        .reduce((obj, key) => {
          obj[key] = selectedData[key];
          return obj;
        }, {});

      response = await axios.get(
        `http://10.14.77.100:8081/generate-custom-survey-report/${editedRecord.id_no}`,
        {
          params: selectedFields,
          responseType: "arraybuffer",
          withCredentials: true,
        }
      );

      processingModal.destroy();

      const blob = new Blob([response.data], { type: "application/pdf" });
      const fileName = selectedFields.establishment_name
        ? `Survey Report_Draft-${selectedFields.establishment_name}.pdf`
        : editedRecord.project_title
        ? `Survey Report_Draft-${editedRecord.project_title}.pdf`
        : `Survey Report_Draft-${editedRecord.id_no}.pdf`;

      const formData = new FormData();
      formData.append("reportInfo", JSON.stringify(selectedFields));
      formData.append("user", JSON.stringify({ name: currentUser.name })); // Ensure currentUser.name exists
      formData.append("date", new Date().toISOString());
      formData.append("fileName", fileName);
      formData.append("pdfFile", blob, fileName);

      // Log formData for debugging
      console.log([...formData.entries()]);

      await axios.post(
        "http://10.14.77.100:8081/save-draft-report-survey",
        formData
      );

      Modal.success({
        title: "Success",
        content: "Draft report has been saved successfully.",
      });

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
              <li>Project Title</li>
              <li>Proponent Name</li>
              <li>Address</li>
            </ul>
            <ul className="data-ul">
              <li>Industry Classification</li>
              <li>Longitude</li>
              <li>Latitude</li>
            </ul>
          </div>
        </div>
      ),
      placement: "bottom",
      target: () => document.querySelector(".info-icon"),
    },
  ];

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

  // Filter out '_id', 'color', and 'updated_by' from editedRecord
  const filteredRecord = Object.entries(editedRecord).filter(
    ([field]) => !["_id", "color", "updated_by"].includes(field)
  );

  // Create data array for the table
  const data = filteredRecord.map(([field, value]) => ({
    field,
    value,
    include: !!value, // set include to true if value is not empty
  }));

  data.sort((a, b) => {
    if (!!a.value && !b.value) return -1;
    if (!a.value && !!b.value) return 1;
    return 0;
  });

  const draftMenu = (
    <Menu>
      <Menu.Item
        key="monitoring"
        onClick={() => confirmGenerateDraft("Draft Survey")}
      >
        Save Draft
      </Menu.Item>
      {/* <Menu.Item
        key="inspection"
        onClick={() => handleSaveDraft("For Inspection")}
      >
        For Inspection
      </Menu.Item>
      <Menu.Item key="nov" onClick={() => handleSaveDraft("For NOV")}>
        For NOV
      </Menu.Item> */}
    </Menu>
  );

  return (
    <div>
      <div className="survey-header">
        <div className="survey-header-left">
          <h3>Please choose data to be included in the report.</h3>
          <p>
            If the data is not updated, please update the data first before
            generating.
          </p>
        </div>

        <div className="survey-header-center">
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

        <div className="survey-header-right">
          <Button
            type="primary"
            className="button-gen-pdf"
            onClick={confirmGeneratePDF}
            disabled={Object.values(includedFields).every((x) => !x)}
          >
            Generate PDF
          </Button>
          {/* <Dropdown
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
          </Dropdown> */}

          {tourVisible && (
            <Tour
              steps={steps}
              current={0}
              //mask={false}
              onClose={() => setTourVisible(false)}
              onFinish={() => (
                <div>
                  <div>
                    <Button type="primary" onClick={handleDontShowAgain}>
                      Finish
                    </Button>
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
        size="small"
        columns={columns}
        dataSource={data}
        pagination={{
          pageSize: 20,
          showSizeChanger: true,
          pageSizeOptions: ["10", "20", "50", "100"],
          position: ["topRight"], // Add this line to position pagination
        }}
        scroll={{ y: 750 }}
        rowClassName={(record) => {
          if (
            [
              "id_no",
              "survey_eia",
              "survey_air",
              "survey_water",
              "survey_haz",
              "survey_chem",
            ].includes(record.field)
          ) {
            return "green-row";
          } else if (
            [
              "project_title",
              "project_type",
              "project_subtype",
              "industry_class",
              "psic_code",
              "other_project_type",
              "mbu_area",
              "waterbody",
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
            return "blue-row";
          } else if (
            [
              "resp_unit",
              "handler",
              "iis_no",
              "date_surveyed",
              "date_routed",
              "date_signed",
              "total_days",
              "track_report_unit",
              "track_report_planning",
              "remarks",
            ].includes(record.field)
          ) {
            return "orange-row";
          } else if (
            [
              "docket_no",
              "pab_case_no",
              "date_forwarded_legal",
              "date_approved_legal",
              "daysDfDa",
              "service_mode",
              "nov_released_date",
              "v_pd1586",
              "v_ra9275",
              "v_ra8749",
              "v_haz",
              "v_toxichem",
              "tc_schedule",
              "tc_time",
              "tc_actual",
              "tc_legal_officer",
              "tc_commitment",
              "pos_paper",
              "date_payment_penalty",
              "penalty_amount",
              "penalty_or_number",
              "tc_compliance",
              "tc_compliance_remarks",
              "issued_resolution",
              "issued_order",
              "order_status",
            ].includes(record.field)
          ) {
            return "gray-row";
          }
          return "";
        }}
        className="table-rows"
      />
    </div>
  );
};

export default SurveyReport;
