import React, { useState, useEffect } from "react";
import { Table, Checkbox, Button, Modal, Spin } from "antd";
import "./icir.css";
import axios from "axios";
import Swal from "sweetalert2";

const fieldTitles = {
  id_no: "Firm ID",
  title: "Project Title",
  name: "Name",
  address: "Address",
  industry_class: "Industry Class",
  psic_code: "PSIC Code",
  // Add more field titles as needed
};

const ICIR = ({ editedRecord }) => {
  const [ucdsData, setUcdsData] = useState([]);
  const [includedFields, setIncludedFields] = useState({});
  const [selectedData, setSelectedData] = useState({});
  const [loadingPDF, setLoadingPDF] = useState(false);

  useEffect(() => {
    axios
      .get(`http://localhost:8081/api/ucds-data/${editedRecord.id_no}`)
      .then((response) => {
        setUcdsData(response.data);
      })
      .catch((error) => {
        console.error(error);
      });
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

  const handleGeneratePDF = async () => {
    try {
      setLoadingPDF(true);
  
      // Show loading cursor
      document.body.style.cursor = "wait";
  
      // Show processing modal
      Modal.info({
        title: "Generating PDF...",
        content: (
          <Spin spinning={true} size="large">
            <p>Please wait...</p>
          </Spin>
        ),
        maskClosable: false,
        okButtonProps: { disabled: true },
        zIndex: 10000, // Make sure the modal is on top
      });
  
      const params = new URLSearchParams();
      Object.keys(selectedData).forEach((key) => {
        if (selectedData[key] !== undefined && selectedData[key] !== "") {
          params.append(key, selectedData[key]);
        }
      });
  
      const url = `http://localhost:8081/generate-custom-icir/${editedRecord.id_no}?${params.toString()}`;
      console.log(`Request URL: ${url}`);
      console.log(`Request Params: ${params.toString()}`);
  
      const response = await axios.get(url, {
        responseType: "blob",
      });
  
      setLoadingPDF(false);
  
      // Reset cursor
      document.body.style.cursor = "default";
  
      // Close modal after PDF generation
      Modal.destroyAll();
  
      if (response.status === 200) {
        const blob = new Blob([response.data], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
  
        // Create a temporary anchor element
        const a = document.createElement("a");
        a.href = url;
        a.target = "_blank"; // Open in new tab
        a.download = `ICIR-${editedRecord.title}.pdf`; // Set the file name for download
        a.click();
  
        window.open(url, "_blank");
  
        // Clean up
        URL.revokeObjectURL(url);
  
        // Optional: Inform user if needed
        Modal.success({
          title: "PDF Generated!",
          content: "The PDF has been generated successfully!",
        });
      } else {
        Modal.error({
          title: "Error",
          content: "Failed to generate PDF",
        });
      }
    } catch (error) {
      setLoadingPDF(false);
      document.body.style.cursor = "default";
      Modal.destroyAll();
      Modal.error({
        title: "Error",
        content: "Failed to generate PDF",
      });
      console.error("Error generating PDF:", error);
    }
  };

  const handleFieldChange = (field, value) => {
    setSelectedData({ ...selectedData, [field]: value });
  };

  const columns = [
    {
      title: "Field",
      dataIndex: "field",
      key: "field",
      align: "left",
      width: 250,
      render: (text) => <b>{fieldTitles[text] || text}</b>,
    },
    {
      title: "Values",
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

  // Prioritize rows with non-empty values
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
          <Checkbox
            onChange={(e) => {
              const fieldsToInclude = [
                "title",
                "name",
                "address",
                "industry_class",
                "psic_code",
              ];
              const isChecked = e.target.checked;
              fieldsToInclude.forEach((field) => {
                handleCheckboxChange(field, isChecked);
              });
            }}
          >
            Select Primary Information
          </Checkbox>
        </div>

        <div className="icir-header-right">
          <Button
            type="primary"
            onClick={handleGeneratePDF}
            disabled={Object.values(includedFields).every((x) => !x)} // disable button if no checkbox is checked
          >
            Generate PDF
          </Button>
        </div>
      </div>

      <Table
        columns={columns}
        dataSource={data}
        pagination={false}
        scroll={{ y: 600 }} // adjust the height to your needs
      />
    </div>
  );
};

export default ICIR;
