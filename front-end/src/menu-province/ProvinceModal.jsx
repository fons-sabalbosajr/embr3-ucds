import React, { useContext, useState, useEffect } from "react";
import { Modal, Button, Tabs, Space, Typography, Spin } from "antd";
import { EditOutlined, SaveOutlined, CloseOutlined } from "@ant-design/icons";
import "./provincemodal.css";
import styled from "styled-components";
import axios from "axios";
import Swal from "sweetalert2";
import PropTypes from "prop-types";
import GenInfo from "./tabpanes/GeneralInfo/GenInfo";
import FocalPerson from "./tabpanes/FocalPerson/FocalPerson";
import Permit from "./tabpanes/PermitsInfo/Permits";
import Legal from "./tabpanes/LegalInfo/LegalUnit";
import MBU from "./tabpanes/MBUInfo/MBUnit";
import ProvTransactionLog from "./tabpanes/TransactionLog/ProvTransaction";
import CryptoJS from "crypto-js";
import ICIR from "./reports/icir/ICIR";
import IC from "./reports/ic/formIC";
import CIC from "./reports/cic/formCIC";
import Drafts from "./reports/drafts/ReportDrafts";

const { TabPane } = Tabs;
const { Paragraph } = Typography;
const BoldTab = styled.span`
  font-weight: 600;
  font-size: 16px;
`;

const ProvinceModal = ({
  visible,
  onClose,
  record,
  setShouldRefreshTable,
  handleReload,
  currentUser,
  theme,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedRecord, setEditedRecord] = useState(null);
  const [loadingPDF, setLoadingPDF] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [loadingICIR, setLoadingICIR] = useState(false);
  const [resetCheckboxesKey, setResetCheckboxesKey] = useState(Date.now());
  const [activeTab, setActiveTab] = useState("1");
  const [isLogChecked, setIsLogChecked] = useState({});
  const [previousRecord, setPreviousRecord] = useState(null);
  const encryptionKey = import.meta.env.VITE_CRYPTOJS_ENCRYPTION_KEY;

  useEffect(() => {
    if (record && record.id_no) {
      const fetchData = async () => {
        try {
          const response = await axios.get(
            `http://localhost:8081/api/ucds-data/${record.id_no}`
          );
          setEditedRecord(response.data);
        } catch (error) {
          console.error("Error fetching data:", error);
        }
      };

      fetchData();
    }
  }, [record]);

  // Load the checked log state from localStorage
  useEffect(() => {
    const storedValue = localStorage.getItem("isLogChecked");
    if (storedValue) {
      try {
        const decryptedBytes = CryptoJS.AES.decrypt(storedValue, encryptionKey);
        const decryptedValue = decryptedBytes.toString(CryptoJS.enc.Utf8);
        setIsLogChecked(JSON.parse(decryptedValue)); // Set the state with the decrypted value
      } catch (error) {
        console.error("Error decrypting isLogChecked:", error);
      }
    }
  }, [encryptionKey]);

  useEffect(() => {
    try {
      const encryptedValue = CryptoJS.AES.encrypt(
        JSON.stringify(isLogChecked),
        encryptionKey
      ).toString();
      localStorage.setItem("isLogChecked", encryptedValue);
    } catch (error) {
      console.error("Error encrypting isLogChecked:", error);
    }
  }, [isLogChecked, encryptionKey]);

  useEffect(() => {
    if (record && JSON.stringify(record) !== JSON.stringify(previousRecord)) {
      checkIfLogExists(record);
    }
    setPreviousRecord(record);
  }, [record, previousRecord, isLogChecked]);

  const checkIfLogExists = async (record) => {
    try {
      const ecc_cnc = record.ecc_cnc;
      const response = await axios.get(
        `http://localhost:8081/api/ucds-log?ecc_cnc=${ecc_cnc}`
      );
      const existingLogs = response.data;

      if (existingLogs.length > 0) {
        setIsLogChecked((prevIsLogChecked) => ({
          ...prevIsLogChecked,
          [ecc_cnc]: true,
        }));
      } else {
        logInitialData(record);
        setIsLogChecked((prevIsLogChecked) => ({
          ...prevIsLogChecked,
          [ecc_cnc]: true,
        }));
      }
    } catch (error) {
      console.error("Error checking existing logs:", error);
    }
  };

  let isLogging = false;

  const logInitialData = async (record) => {
    if (isLogging) return;
    isLogging = true;

    const now = new Date();
    const transactionDate = `${
      now.getMonth() + 1
    }/${now.getDate()}/${now.getFullYear()} ${now.getHours()}:${String(
      now.getMinutes()
    ).padStart(2, "0")}`;

    try {
      // Fetch all logs to determine the next transaction number
      const response = await axios.get("http://localhost:8081/api/ucds-log");
      const transactions = response.data;

      const existingLog = transactions.find(
        (log) =>
          log.ecc_cnc === record.ecc_cnc &&
          log.newValue === `${record.ecc_cnc} \n ${record.title}`
      );

      if (existingLog) {
        isLogging = false;
        return;
      }

      let transactionCounter = 1;

      if (transactions && transactions.length > 0) {
        const lastTransaction = transactions[transactions.length - 1];
        if (lastTransaction && lastTransaction.transactionID) {
          const lastTransactionID = lastTransaction.transactionID;
          const lastTransactionNumber = parseInt(
            lastTransactionID.replace("TRXM-", "")
          );
          transactionCounter = lastTransactionNumber + 1;
        }
      }

      // Use currentUser.username directly
      const username = currentUser?.username || null;

      const logData = {
        transactionID: `TRXM-${String(transactionCounter).padStart(4, "0")}`,
        transactionDate: transactionDate,
        actionType: "Initial Data",
        oldValue: "-",
        newValue: `${record.ecc_cnc} \n ${record.title}`,
        userActed: username,
        dateActed: transactionDate,
        ecc_cnc: record.ecc_cnc,
      };

      // Save the log to ucds-log (POST)
      await axios.post("http://localhost:8081/api/ucds-log", logData);
    } catch (error) {
      console.error("Error logging initial data:", error);
    } finally {
      isLogging = false;
    }
  };

  useEffect(() => {
    setEditedRecord(record);
  }, [record]);

  useEffect(() => {
    // Only log if modal is visible and record is valid
    if (visible && record && record.ecc_cnc && record.title) {
      logInitialData(record);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, record]);

  const handleChange = (field, value) => {
    setEditedRecord({
      ...editedRecord,
      [field]: value,
    });
  };

  const handleSaveChanges = async (showNotification = true) => {
    Swal.fire({
      title: "Confirm Save",
      text: "Do you want to save the changes?",
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#3085d6",
      cancelButtonColor: "#d33",
      confirmButtonText: "Save Data",
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const { _id, ...recordToUpdate } = editedRecord;

          const currentUsername = currentUser?.username;
          const updatedRecord = {
            ...recordToUpdate,
            ecc_cnc: editedRecord.ecc_cnc,
            updated_by: currentUsername, // Add username
          };

          const fullIdNo = editedRecord.id_no;

          if (!fullIdNo) {
            console.error("Missing id_no in editedRecord");
            return;
          }

          const response = await axios.put(
            `http://localhost:8081/api/update-data/${fullIdNo}`,
            updatedRecord
          );

          if (response.status === 200) {
            if (showNotification) {
              Swal.fire("Success", "Changes saved successfully!", "success");
            }
            if (setShouldRefreshTable) {
              setShouldRefreshTable(true);
            }
            setIsEditing(false);
            // handleReload(); // Optional reload if needed

            // No need to manually create logs here — backend handles it
          } else {
            Swal.fire("Error", "Failed to save changes", "error");
          }
        } catch (error) {
          Swal.fire("Error", "Failed to save changes", "error");
          console.error("Error updating data:", error);
        }
      }
    });
  };

  const handleCancelEdit = () => {
    Swal.fire({
      title: "Are you sure?",
      text: "You won't be able to revert this!",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#3085d6",
      cancelButtonColor: "#d33",
      confirmButtonText: "Yes, cancel it!",
    }).then((result) => {
      if (result.isConfirmed) {
        setIsEditing(false);
        setEditedRecord(record);
      }
    });
  };

  const handleopenModal = () => {
    setIsModalVisible(true);
    setLoadingICIR(true);
  };

  const handleModalOk = () => {
    setIsModalVisible(false);
    setResetCheckboxesKey(Date.now());
  };

  const handleModalCancel = () => {
    setIsModalVisible(false);
    setResetCheckboxesKey(Date.now());
  };

  const handleTabChange = (key) => {
    setActiveTab(key);
  };

  // Helper function to get the permission key for the current province
  const getProvincePermissionKey = (provinceNameFromRecord) => {
    if (!provinceNameFromRecord) return null;
    const name = String(provinceNameFromRecord).toUpperCase(); // Ensure it's a string and standardize to uppercase
    switch (name) {
      case "AURORA":
        return "aurora";
      case "BATAAN":
        return "bataan";
      case "BULACAN":
        return "bulacan";
      case "NUEVA ECIJA":
        return "nuevaEcija";
      case "PAMPANGA":
        return "pampanga";
      case "TARLAC":
        return "tarlac";
      case "ZAMBALES":
        return "zambales";
      default:
        console.warn(
          `Unknown province name for permission key: ${provinceNameFromRecord}`
        );
        return null;
    }
  };

  const provinceKey = getProvincePermissionKey(record?.province);
  const canShowEditButton =
    currentUser?.provinceStringPermissions?.[provinceKey] === "readWrite";

  return (
    <div className={`modal-container ${theme}-theme`}>
      {!record || !record.id_no || !editedRecord ? (
        <div style={{ textAlign: "center", padding: 40 }}>
          <Spin size="large" tip="Loading record details..." />
        </div>
      ) : (
        <>
          <Tabs activeKey={activeTab} onChange={handleTabChange}>
            <TabPane
              tab={<span className="custom-tab">General Information</span>}
              key="1"
              className="tabpane-container"
            >
              <GenInfo
                editedRecord={editedRecord}
                setEditedRecord={setEditedRecord}
                handleChange={handleChange}
                isEditing={isEditing}
                theme={theme}
              />
            </TabPane>
            <TabPane
              tab={
                <span className="custom-tab">Concerned Unit/Focal Person</span>
              }
              key="2"
              className="tabpane-container"
            >
              <FocalPerson
                editedRecord={editedRecord}
                handleChange={handleChange}
                isEditing={isEditing}
                currentUser={currentUser}
                theme={theme}
              />
            </TabPane>
            <TabPane
              tab={<span className="custom-tab">Clearances and Permits</span>}
              key="3"
              className="tabpane-container"
            >
              <Permit
                editedRecord={editedRecord}
                handleChange={handleChange}
                isEditing={isEditing}
                onSaveChanges={(updatedRecord, showNotification) => {
                  setEditedRecord(updatedRecord);
                  handleSaveChanges(showNotification);
                }}
                theme={theme}
              />
            </TabPane>
            <TabPane
              tab={<span className="custom-tab">Legal Services Unit</span>}
              key="4"
              className="tabpane-container"
            >
              <Legal
                editedRecord={editedRecord}
                handleChange={handleChange}
                isEditing={isEditing}
                theme={theme}
              />
            </TabPane>
            <TabPane
              tab={<span className="custom-tab">Manila Bay Unit</span>}
              key="5"
              className="tabpane-container"
            >
              <MBU
                editedRecord={editedRecord}
                handleChange={handleChange}
                isEditing={isEditing}
                theme={theme}
              />
            </TabPane>

            <TabPane
              tab={<span className="custom-tab-history">History</span>}
              key="6"
            >
              <ProvTransactionLog
                editedRecord={editedRecord}
                currentUser={currentUser}
                theme={theme}
                handleReload={handleReload}
              />
            </TabPane>
          </Tabs>

          <Modal
            title="Generate Report"
            open={isModalVisible}
            onOk={handleModalOk}
            onCancel={handleModalCancel}
            width={1200}
            footer={null}
          >
            <div className="report-modal-container">
              <Tabs defaultActiveKey="1" tabPosition="left" tabBarGutter={5}>
                <TabPane
                  tab={<span className="tabpane-title">Generate ICIR</span>}
                  key="1"
                >
                  <ICIR
                    editedRecord={editedRecord}
                    onIncludeChange={() => {}}
                    resetCheckboxesKey={resetCheckboxesKey}
                  />
                </TabPane>
                <TabPane
                  tab={<span className="tabpane-title">Generate CIC</span>}
                  key="2"
                >
                  <IC />
                </TabPane>
                <TabPane
                  tab={<span className="tabpane-title">Generate IC</span>}
                  key="3"
                >
                  <CIC />
                </TabPane>
                <TabPane
                  tab={<span className="tabpane-title">Reports Logs</span>}
                  key="4"
                >
                  <Drafts />
                </TabPane>
              </Tabs>
            </div>
          </Modal>

          {activeTab !== "6" && (
            <>
              <Button
                className="button-generate"
                type="primary"
                onClick={handleopenModal}
                disabled={loadingPDF}
              >
                {loadingPDF ? "Generating PDF..." : "Generate Report"}
              </Button>

              <div className="action-buttons-container">
                <Space>
                  {isEditing ? (
                    <>
                      <Button
                        onClick={handleSaveChanges}
                        type="primary"
                        icon={<SaveOutlined />}
                      >
                        Save
                      </Button>
                      <Button onClick={handleCancelEdit} type="primary" danger>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    canShowEditButton && (
                      <Button // Conditionally render Edit button
                        onClick={() => setIsEditing(true)}
                        type="primary"
                        icon={<EditOutlined />}
                        className="button-right"
                      >
                        Edit
                      </Button>
                    )
                  )}
                </Space>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};

ProvinceModal.propTypes = {
  visible: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  record: PropTypes.object.isRequired,
  setShouldRefreshTable: PropTypes.func,
  handleReload: PropTypes.func.isRequired,
  theme: PropTypes.string.isRequired,
};

export default ProvinceModal;
