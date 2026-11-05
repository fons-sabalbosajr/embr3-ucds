import { Modal, Upload, Button, Spin, Typography } from "antd";
import { message } from "../../../../shared/feedback";
import { UploadOutlined } from "@ant-design/icons";
import { useState } from "react";

const { Text } = Typography;

const UploadDocumentModal = ({ visible, onClose, onExtractedData }) => {
  const [fileList, setFileList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [formattedPreview, setFormattedPreview] = useState("");
  const [extractedData, setExtractedData] = useState(null);

  const handleFileUpload = async (file) => {
    setLoading(true);
    setFormattedPreview("");

    const reader = new FileReader();
    reader.onload = async (e) => {
      const typedArray = new Uint8Array(e.target.result);

      try {
        // Fetched when a PDF is read: imported above, the reader came with every
        // province screen (over a megabyte) whether or not anything was uploaded.
        const [pdfjsLib] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker")]);
        const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;
        let textContent = "";

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const text = await page.getTextContent();
          let pageText = text.items.map((item) => item.str).join(" ");

          console.log(`Page ${i} Text:\n`, pageText);

          textContent += pageText + "\n";
        }

        const processedData = processExtractedText(textContent);
        console.log("Extracted Data:", processedData);

        setExtractedData(processedData);
        setFormattedPreview(formatPreview(processedData));
      } catch (error) {
        console.error("Error extracting text:", error);
        message.error("Failed to extract text from document.");
      } finally {
        setLoading(false);
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const getAccuracyStatus = (percentage) => {
    if (percentage >= 80)
      return { color: "#52c41a", label: "Data Detection Good" }; // Green
    if (percentage >= 50)
      return { color: "#faad14", label: "Data Detection Average" }; // Orange
    return { color: "#f5222d", label: "Data Detection Poor" }; // Red
  };

  const calculateDetectionPercentage = (data) => {
    if (!data) return { percentage: 0, color: "#d9d9d9", label: "N/A" };

    const totalFields = Object.keys(data).length;
    const extractedFields = Object.values(data).filter(
      (value) => value !== "N/A"
    ).length;
    const percentage = ((extractedFields / totalFields) * 100).toFixed(2);

    return { percentage, ...getAccuracyStatus(percentage) };
  };

  const { percentage, color, label } =
    calculateDetectionPercentage(extractedData);

  const processExtractedText = (text) => {
    //console.log("Raw Extracted Text:\n", text); // ✅ Debugging extracted text

    const extracted = {
      project_title:
        text
          .match(
            /Name\s*of\s*Establishment\s*[:\-]?\s*(.*?)\s*(?=Address:)/i
          )?.[1]
          ?.trim() || "N/A",
      full_address:
        text
          .match(/Address:\s*(.*?)\s*(?=Nature of Business:)/i)?.[1]
          ?.trim() || "N/A",
      nature_of_business:
        text
          .match(/Nature of Business:\s*(.*?)\s*(?=PSIC CODE:)/i)?.[1]
          ?.trim() || "N/A",
      psic_code: text.match(/PSIC CODE:\s*(\d+)/i)?.[1] || "N/A",
      year_established:
        text.match(/Year Established:\s*(\d{4})/i)?.[1] || "N/A",
      date_of_inspection:
        text
          .match(
            /Date and time of inspection:\s*(.*?)(?=\s*Operating hours)/i
          )?.[1]
          ?.trim() || "N/A",
      operating_hours:
        text.match(/Operating hours\/day:\s*(\d+)/i)?.[1] || "N/A",
      operating_days_week:
        text.match(/Operating days\/week:\s*(\d+)/i)?.[1] || "N/A",
      operating_days_year:
        text.match(/Operating days\/year:\s*(\d+)/i)?.[1] || "N/A",
      pco_name:
        text
          .match(/Name of PCO:\s*(.*?)\s*(?=PCO Accreditation No.)/i)?.[1]
          ?.trim() || "N/A",
      pco_no:
        text
          .match(
            /PCO Accreditation No.:\s*(.*?)\s*(?=Date of Effectivity:)/i
          )?.[1]
          ?.trim() || "N/A",
      phone:
        text.match(/Phone \/ Fax No.:\s*([\d\s\-]+)/i)?.[1]?.trim() || "N/A",
      email:
        text
          .match(/Email Address:\s*([\w._%+-]+@[\w.-]+\.[a-zA-Z]{2,})/i)?.[1]
          ?.trim() || "N/A",
      coordinates_lat: text.match(/Coordinates:\s*([\d.]+)N/i)?.[1] || "N/A",
      coordinates_lng: text.match(/Coordinates:.*?([\d.]+)E/i)?.[1] || "N/A",

      ecc_cnc:
        text.match(/CNC\s*-\s*R03\s*-\s*\d+\s*-\s*\d+/i)?.[0]?.trim() || "N/A",
      ecc_cnc_date_issued:
        text
          .match(
            /CNC\s*-\s*R03\s*-\s*\d+\s*-\s*\d+\s*(\w+\s+\d{1,2},\s*\d{4})/i
          )?.[1]
          ?.trim() || "N/A",

      wwdp_code:
        text
          .match(/Discharge Permit No.:\s*(.*?)\s*(?=\n|None)/i)?.[1]
          ?.trim() || "N/A",
      pto_code:
        text
          .match(/POA No.:\s*(.*?)\s*(?=Discharge Permit No.|$)/i)?.[1]
          ?.trim() || "N/A",

      haz_id:
        text
          .match(/DENR\s*Registry\s*ID\s*[:\-]?\s*([A-Z0-9\s\-]+)/i)?.[1]
          ?.trim() || "N/A",
      haz_id_date_issued:
        text
          .match(
            /DENR\s*Registry\s*ID.*?issued\s*on\s*([\w]+\s+\d{1,2},\s*\d{4})/i
          )?.[1]
          ?.trim() || "N/A",
      recommendation_shaded:
        text.match(/RECOMMENDATION:\s*(.*?)(?=\n\n|$)/i)?.[1]?.trim() || "N/A", // ✅ Extract shaded box
      remarks: text.match(/Remarks:\s*(.*?)(?=\n\n|$)/i)?.[1]?.trim() || "N/A",
      inspected_by:
        text.match(/Prepared \/ Inspected by:\s*([A-Z\s.]+)/i)?.[1]?.trim() ||
        "N/A",
      reviewed_by:
        text.match(/Reviewed by:\s*([A-Z\s.]+)/i)?.[1]?.trim() || "N/A",
      noted_by: text.match(/Noted by:\s*([A-Z\s.]+)/i)?.[1]?.trim() || "N/A",
    };

    // 🏡 **Split Address into Barangay, City, and Province**
    const addressParts = extracted.full_address.split(",");
    extracted.barangay = addressParts[0]?.trim() || "N/A";
    extracted.city = addressParts[1]?.trim() || "N/A";
    extracted.province = addressParts[2]?.trim() || "N/A";

    // ✅ **Dynamically detect shaded recommendation text**
    const recommendationMatch = text.match(
      /Recommendation:\s*(.*?)\s*(?=\n\n|$)/i
    );
    extracted.recommendation_shaded = recommendationMatch
      ? recommendationMatch[1]?.trim()
      : "N/A";

    return extracted;
  };

  const formatPreview = (data) => {
    return (
      `\nINTEGRATED COMPLIANCE INSPECTION REPORT\n\n` +
      `Title: ${data.title}\n` +
      `Barangay: ${data.barangay}\n` +
      `City: ${data.city}\n` +
      `Province: ${data.province}\n` +
      `Nature of Business: ${data.nature_of_business}\n` +
      `PSIC Code: ${data.psic_code}\n` +
      `Year Established: ${data.year_established}\n` +
      `Date of Inspection: ${data.date_of_inspection}\n` +
      `Operating Hours: ${data.operating_hours} hrs/day\n` +
      `Operating Days (Week): ${data.operating_days_week}\n` +
      `Operating Days (Year): ${data.operating_days_year}\n` +
      `PCO Name: ${data.pco_name}\n` +
      `PCO No.: ${data.pco_no}\n` +
      `Phone: ${data.phone}\n` +
      `Email: ${data.email}\n` +
      `Coordinates: ${data.coordinates_lat}N, ${data.coordinates_lng}E\n` +
      `ECC/CNC: ${data.ecc_cnc}\n` +
      `ECC/CNC Date Issued: ${data.ecc_cnc_date_issued}\n` +
      `WWDP Code: ${data.wwdp_code}\n` +
      `PTO Code: ${data.pto_code}\n` +
      `Hazardous Waste ID: ${data.haz_id}\n` +
      `Hazardous Waste ID Date Issued: ${data.haz_id_date_issued}\n` +
      `Remarks: ${data.recommendation_shaded}\n` +
      `Prepared / Inspected by: ${data.inspected_by}\n` +
      `Reviewed by: ${data.reviewed_by}\n` +
      `Noted by: ${data.noted_by}\n`
    );
  };

  const handleConfirm = () => {
    if (!extractedData) {
      message.error("No extracted data found! Please upload a document first.");
      return;
    }
  
    console.log("Extracted Data Before Cleanup:", extractedData); // Debugging
  
    // Ensure all fields have a default value of "N/A" to prevent errors
    const cleanedData = Object.keys(extractedData).reduce((acc, key) => {
      acc[key] = extractedData[key] || "N/A";
      return acc;
    }, {});
  
    console.log("Cleaned Data:", cleanedData); // Debugging
  
    // Pass extracted data to parent
    onExtractedData(cleanedData);
    message.success("Data successfully populated in the form!");
    onClose();
  };
  

  return (
    <Modal
      visible={visible}
      title={
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: "12px", marginRight: "30px" }}>
            Upload Document
          </span>
          <span
            style={{
              color,
              fontWeight: "bold",
              fontSize: "11px",
              marginRight: "30px",
            }}
          >
            {label} - {percentage}%
          </span>
        </div>
      }
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>
          Cancel
        </Button>,
        <Button
          key="confirm"
          type="primary"
          disabled={!extractedData}
          onClick={handleConfirm}
        >
          Confirm & Fill Form
        </Button>,
      ]}
    >
      <Upload
        fileList={fileList}
        beforeUpload={(file) => {
          setFileList([file]);
          handleFileUpload(file);
          return false;
        }}
        onRemove={() => {
          setFileList([]);
          setFormattedPreview("");
          setExtractedData(null);
        }}
      >
        <Button icon={<UploadOutlined />}>Select PDF File</Button>
      </Upload>

      {loading && (
        <Spin size="large" style={{ display: "block", marginTop: 10 }} />
      )}

      {extractedData && (
        <div style={{ fontSize: "14px", marginTop: 20 }}>
          <Text strong>Extracted Title:</Text>
          <h3
            style={{
              background: "#e6f7ff",
              padding: "10px",
              borderRadius: "5px",
            }}
          >
            {extractedData.title}
          </h3>
        </div>
      )}

      {formattedPreview && (
        <div
          style={{
            fontSize: "11px",
            marginTop: 20,
            padding: 10,
            background: "#f5f5f5",
            borderRadius: 5,
            whiteSpace: "pre-wrap",
          }}
        >
          <Text strong>Extracted Data Preview:</Text>
          <pre style={{ maxHeight: 200, overflowY: "auto" }}>
            {formattedPreview}
          </pre>
        </div>
      )}
    </Modal>
  );
};

export default UploadDocumentModal;
