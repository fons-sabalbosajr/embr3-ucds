import React, { useContext, useState, useEffect } from "react";
import { Modal, Button, Tabs, Space, Typography } from "antd";
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
    const transactionDate = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()} ${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
  
    try {
      const response = await axios.get("http://localhost:8081/api/ucds-log");
      const transactions = response.data;
  
      const existingLog = transactions.find(
        (log) =>
          log.ecc_cnc === record.ecc_cnc &&
          log.newValue === `${record.ecc_cnc} \n ${record.title}`
      );
  
      if (existingLog) {
        console.log("Initial data already logged for ecc_cnc:", record.ecc_cnc);
        isLogging = false;
        return;
      }
  
      let transactionCounter = 1;
  
      if (!transactions || transactions.length === 0) {
        console.log("No transactions found");
      } else {
        const lastTransaction = transactions[transactions.length - 1];
        if (!lastTransaction) {
          console.error("Last transaction is undefined");
        } else {
          if (lastTransaction.transactionID) {
            const lastTransactionID = lastTransaction.transactionID;
            const lastTransactionNumber = parseInt(
              lastTransactionID.replace("TRXM-", "")
            );
            transactionCounter = lastTransactionNumber + 1;
          } else {
            console.error("Last transaction ID is undefined");
          }
        }
      }
  
      // Decrypt the username
      const encryptedUsername = localStorage.getItem("username");
      const encryptionKey = import.meta.env.VITE_CRYPTOJS_ENCRYPTION_KEY; // Get the encryption key from your environment variable
      let username = null;
  
      if (encryptedUsername) {
        const bytes = CryptoJS.AES.decrypt(encryptedUsername, encryptionKey);
        username = bytes.toString(CryptoJS.enc.Utf8);
      }
  
      const logData = {
        transactionID: `TRXM-${String(transactionCounter).padStart(4, "0")}`,
        transactionDate: transactionDate,
        actionType: "Initial Data",
        oldValue: "-",
        newValue: `${record.ecc_cnc} \n ${record.title}`,
        userActed: username, // Use the decrypted username
        dateActed: transactionDate,
        ecc_cnc: record.ecc_cnc,
      };
  
      try {
        const response = await axios.post(
          "http://localhost:8081/api/ucds-log",
          logData
        );
      } catch (error) {
        console.error("Error logging initial data:", error);
      } finally {
        isLogging = false;
      }
    } catch (error) {
      console.error("Error fetching transactions:", error);
      isLogging = false;
    }
  };

  useEffect(() => {
    setEditedRecord(record);
  }, [record]);

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

          const currentUsername = localStorage.getItem("username");
          const updatedRecord = {
            ...recordToUpdate,
            ecc_cnc: editedRecord.ecc_cnc,
            updated_by: currentUsername, // Add the username to the request body
          };

          const response = await axios.put(
            `http://localhost:8081/api/update-data/${editedRecord.id_no}`,
            updatedRecord
          );

          if (response.status === 200) {
            const auditLog = response.data; // Assuming this contains audit log information

            if (showNotification) {
              Swal.fire("Success", "Changes saved successfully!", "success");
            }
            if (setShouldRefreshTable) {
              setShouldRefreshTable(true);
            }
            setIsEditing(false);
            //handleReload();

            // Get the latest transaction ID from the ucds-log collection
            const logResponse = await axios.get(
              "http://localhost:8081/api/ucds-log"
            );
            const transactions = logResponse.data;

            let transactionCounter = 1;
            if (transactions.length > 0) {
              const lastTransaction = transactions[transactions.length - 1];
              const lastTransactionID = lastTransaction.transactionID;
              const lastTransactionNumber = parseInt(
                lastTransactionID.replace("TRXM-", "")
              );
              transactionCounter = lastTransactionNumber + 1;
            }

            const transactionDate = new Date().toLocaleString();

            // Safely handle missing or empty changes
            const changes = auditLog.changes || []; // Default to empty array if changes is undefined
            const oldValues = changes.length
              ? changes.map((change) => `${change.old_value}`).join("\n")
              : "-"; // Use "-" if there are no changes
            const newValues = changes.length
              ? `${auditLog.ecc_cnc} \n${changes
                  .map((change) => `${change.new_value}`)
                  .join("\n")}`
              : `${auditLog.ecc_cnc || editedRecord.ecc_cnc}`; // Use ecc_cnc directly if no changes

            // Ensure the updated_at field is valid before converting to string
            const updatedAt = auditLog.updated_at
              ? new Date(auditLog.updated_at).toLocaleString()
              : new Date().toLocaleString(); // Use current date if updated_at is invalid

            // Create the log entry based on the audit log returned from the server
            const logData = {
              transactionID: `TRXM-${String(transactionCounter).padStart(
                4,
                "0"
              )}`,
              transactionDate: transactionDate,
              actionType: "Modified",
              oldValue: oldValues,
              newValue: newValues,
              userActed: auditLog.updated_by || currentUsername, // Fallback to the current user if undefined
              dateActed: updatedAt,
              ecc_cnc: auditLog.ecc_cnc || editedRecord.ecc_cnc, // Fallback to the editedRecord ecc_cnc
            };

            // Save the log entry to the ucds-log collection
            try {
              await axios.post("http://localhost:8081/api/ucds-log", logData);
              console.log("Log entry created successfully");
            } catch (error) {
              console.error("Error creating log entry:", error);
            }
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

  return (
    <div className="modal-container">
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
          />
        </TabPane>
        <TabPane
          tab={<span className="custom-tab">Concerned Unit/Focal Person</span>}
          key="2"
          className="tabpane-container"
        >
          <FocalPerson
            editedRecord={editedRecord}
            handleChange={handleChange}
            isEditing={isEditing}
            currentUser={currentUser}
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
          />
        </TabPane>
        <TabPane
          tab={<span className="custom-tab-history">History</span>}
          key="6"
        >
          <ProvTransactionLog
            editedRecord={editedRecord}
            currentUser={currentUser}
          />
        </TabPane>
      </Tabs>

      <Modal
        title="Generate Report"
        visible={isModalVisible}
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
                resetCheckboxesKey={resetCheckboxesKey} // Pass reset state as a key
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
                  <Button onClick={handleCancelEdit}>Cancel</Button>
                </>
              ) : (
                <Button
                  onClick={() => setIsEditing(true)}
                  type="primary"
                  icon={<EditOutlined />}
                  className="button-right"
                >
                  Edit
                </Button>
              )}
            </Space>
          </div>
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
};

export default ProvinceModal;
