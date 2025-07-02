import React, { useState, useEffect } from "react";
import { Modal, Tabs, Spin, Button, Tooltip } from "antd";
import Swal from "sweetalert2";
import CryptoJS from "crypto-js";
import GenInfoAdd from "./tabpanes/geninfo/GenInfoAdd";
import FocalPersonAdd from "./tabpanes/focalperson/FocalPersonAdd";
import PermitsAdd from "./tabpanes/permits/PermitsAdd";
import LegalUnitAdd from "./tabpanes/legalunit/LegalUnitAdd";
import UploadModal from "./UploadDocumentModal";
import "./addprovincemodal.css";

const { TabPane } = Tabs;

const AddProvinceModal = ({ visible, onCancel, onCreate }) => {
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [nextIdNo, setNextIdNo] = useState(null);
  const [selectedProvince, setSelectedProvince] = useState(null);

  const [generalInfo, setGeneralInfo] = useState({});
  const [monitoringData, setMonitoringData] = useState({});
  const [permitsData, setPermitsData] = useState({});
  const [legalData, setLegalData] = useState({});

  const encryptionKey = import.meta.env.VITE_CRYPTOJS_ENCRYPTION_KEY;
  const [currentUser, setCurrentUser] = useState("");

  const decryptData = (encryptedData) => {
    if (!encryptedData) return ""; // Return empty if no data
    try {
      const bytes = CryptoJS.AES.decrypt(encryptedData, encryptionKey);
      return bytes.toString(CryptoJS.enc.Utf8);
    } catch (error) {
      console.error("Decryption error:", error);
      return "";
    }
  };

  useEffect(() => {
    const encryptedUsername = localStorage.getItem("username");

    if (encryptedUsername) {
      setCurrentUser(decryptData(encryptedUsername));
    }
  }, []);

  useEffect(() => {
    if (visible) {
      fetchNextIdNo();
    }
  }, [visible]);

  const handleExtractedData = (data) => {
    console.log("Extracted Data:", data);

    setGeneralInfo((prev) => ({
      ...prev,
      project_title: data.project_title || prev.project_title,
      full_address: data.full_address || prev.full_address,
      industry_classification:
        data.industry_classification || prev.industry_classification, // ✅ Corrected
      psic_code: data.psic_code || prev.psic_code, // ✅ Ensure correct key is assigned
      province: data.province || prev.province,
      city: data.city || prev.city,
      barangay: data.barangay || prev.barangay,
      coordinates_lat: data.coordinates_lat || prev.coordinates_lat,
      coordinates_lng: data.coordinates_lng || prev.coordinates_lng,
    }));

    setMonitoringData((prev) => ({
      ...prev,
      handler: data.reviewed_by || prev.handler,
      inspected_by: data.inspected_by || prev.inspected_by,
      date_of_inspection: data.date_of_inspection || prev.date_of_inspection,
      noted_by: data.noted_by || prev.noted_by,
      recommendation_shaded:
        data.recommendation_shaded || prev.recommendation_shaded,
      remarks: data.remarks || prev.remarks,
    }));

    setPermitsData((prev) => ({
      ...prev,
      ecc_cnc: data.ecc_cnc || prev.ecc_cnc,
      ecc_cnc_date_issued: data.ecc_cnc_date_issued || prev.ecc_cnc_date_issued,
      pto_code: data.pto_code || prev.pto_code,
      wwdp_code: data.wwdp_code || prev.wwdp_code,
      wwdp_date_issued: data.wwdp_date_issued || prev.wwdp_date_issued,
      wwdp_date_expiration:
        data.wwdp_date_expiration || prev.wwdp_date_expiration,
      haz_id: data.haz_id || prev.haz_id,
      haz_id_date_issued: data.haz_id_date_issued || prev.haz_id_date_issued,
    }));
  };

  const fetchNextIdNo = async (province) => {
    if (!province) {
      setNextIdNo("No ID assigned yet"); // Set blank ID if no province is selected
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `http://10.14.77.107:8081/api/ucds/next-id?province=${province}`
      );
      const data = await response.json();
      setNextIdNo(data.nextIdNo);
    } catch (error) {
      console.error("Error fetching next id_no:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible && selectedProvince) {
      fetchNextIdNo(selectedProvince);
    }
  }, [visible, selectedProvince]);

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSave = async () => {
    const completeData = {
      ...generalInfo,
      ...monitoringData,
      ...permitsData,
      ...legalData,
      province: selectedProvince,
      dateAdded: new Date(),
      current_user: currentUser,
    };

    try {
      const response = await fetch(
        "http://10.14.77.107:8081/api/ucds/add-establishment",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(completeData),
        }
      );

      const data = await response.json();

      if (response.status === 201) {
        Swal.fire("Success!", "Establishment added successfully.", "success");
        onCreate(); // Callback after saving
      } else {
        Swal.fire("Error!", data.message, "error");
      }
    } catch (error) {
      console.error("Error adding establishment:", error);
      Swal.fire("Error!", "Server connection failed.", "error");
    }
  };

  const handleCancel = () => {
    Swal.fire({
      title: "Are you sure?",
      text: "You won't be able to revert this!",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, cancel adding!",
      cancelButtonText: "No, keep editing",
    }).then((result) => {
      if (result.isConfirmed) {
        setIsEditing(false);
        //onCancel();
        clearFields();
      }
    });
  };

  const clearFields = () => {
    // Clear all fields in the tab panes
    // You can implement this function to reset the state of each tab pane component
  };

  return (
    <Modal
      open={visible}
      title={
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span className="modal-title">Add New Establishment/Company</span>
          {loading ? (
            <div className="id-no">
              <Spin size="small" /> loading...
            </div>
          ) : (
            nextIdNo && <span className="id-no">ID No: {nextIdNo}</span>
          )}
        </div>
      }
      footer={
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            width: "100%",
          }}
        >
          {isEditing && (
            <Tooltip  title={
              <div style={{ fontSize: "10px" }}>
                This feature is in beta testing. <br/> Expect possible changes.
              </div>
            } size="small">
              <Button key="upload" onClick={() => setUploadModalVisible(true)}>
                Upload Document <span className="beta-label">(Beta)</span>
              </Button>
            </Tooltip>
          )}
          <div style={{ display: "flex", gap: "10px" }}>
            {isEditing ? (
              <Button type="primary" key="save" onClick={handleSave}>
                Add Establishment
              </Button>
            ) : (
              <Button type="primary" key="edit" onClick={handleEdit}>
                Start Adding
              </Button>
            )}
            {isEditing && (
              <Button type="primary" danger key="cancel" onClick={handleCancel}>
                Cancel
              </Button>
            )}
          </div>
        </div>
      }
      onCancel={onCancel}
      width={1000}
    >
      <Tabs defaultActiveKey="1">
        <TabPane tab="General Information" key="1">
          <GenInfoAdd
            isEditing={isEditing}
            selectedProvince={selectedProvince}
            setSelectedProvince={setSelectedProvince}
            setGeneralInfo={setGeneralInfo}
            extractedData={generalInfo}
            generalInfo={generalInfo}
          />
        </TabPane>
        <TabPane tab="Monitoring Data" key="2">
          <FocalPersonAdd
            isEditing={isEditing}
            setMonitoringData={setMonitoringData}
            extractedData={monitoringData}
          />
        </TabPane>
        <TabPane tab="Permits" key="3">
          <PermitsAdd isEditing={isEditing} setPermitsData={setPermitsData} />
        </TabPane>
        <TabPane tab="Legal Unit" key="4">
          <LegalUnitAdd isEditing={isEditing} setLegalData={setLegalData} />
        </TabPane>
      </Tabs>

      <UploadModal
        visible={uploadModalVisible}
        onClose={() => setUploadModalVisible(false)}
        onExtractedData={handleExtractedData} // ✅ Now properly passed
      />
    </Modal>
  );
};

export default AddProvinceModal;
