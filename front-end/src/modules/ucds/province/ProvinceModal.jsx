import React, { useContext, useState, useEffect } from "react";
import { Modal, Button, ConfigProvider, Tabs, Space, Typography, Spin } from "antd";
import { EditOutlined, SaveOutlined, CloseOutlined, FileTextOutlined } from "@ant-design/icons";
import "./provincemodal.css";
import styled from "styled-components";
import Swal from "sweetalert2";
import PropTypes from "prop-types";
import GenInfo from "./tabpanes/GeneralInfo/GenInfo";
import FocalPerson from "./tabpanes/FocalPerson/FocalPerson";
import Permit from "./tabpanes/PermitsInfo/Permits";
import ProvTransactionLog from "./tabpanes/TransactionLog/ProvTransaction";
import { getItem, setItem } from "../../../shared/secureStorage";
import ICIR from "./reports/icir/ICIR";
import { UCDS_ACCENT } from "../ucdsColors";
import Drafts from "./reports/drafts/ReportDrafts";
import EstablishmentRecordsPanel from "../components/EstablishmentRecordsPanel";
import {
  fetchRecordDetailsBySortKey,
  checkExistingLogsByEccCnc,
  fetchAllUcdsLogs,
  createUcdsLogEntry,
  updateUcdsDataBySortKey,
  fetchRecordByEccCnc,
} from "../../../api/provinceService";

// AntD v5: prefer items API over TabPane
const { Paragraph } = Typography;

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

  useEffect(() => {
    if (record && record.sort_key) {
      const loadRecordData = async () => {
        try {
          const data = await fetchRecordDetailsBySortKey(record.sort_key);
          setEditedRecord(data);
        } catch (error) {
          console.error("Error fetching data:", error);
          // Optionally, set an error state or clear the record
          // setEditedRecord(null);
        }
      };
    } else if (record) {
      // Handle cases where record might exist but sort_key is missing
      console.warn("Record is missing sort_key:", record);
      setEditedRecord(null); // Or set to the passed record if partial display is okay
    }
  }, [record]);

  // Whether the log checkbox was ticked last time, through secureStorage.
  useEffect(() => {
    const stored = getItem("isLogChecked", null);
    if (typeof stored === "boolean") setIsLogChecked(stored);
  }, []);

  useEffect(() => {
    setItem("isLogChecked", Boolean(isLogChecked));
  }, [isLogChecked]);

  useEffect(() => {
    if (record && JSON.stringify(record) !== JSON.stringify(previousRecord)) {
      checkAndLogInitialData(record);
    }
    setPreviousRecord(record);
  }, [record, previousRecord, isLogChecked]);

  const checkAndLogInitialData = async (currentRecord) => {
    if (!currentRecord || !currentRecord.ecc_cnc) {
      console.warn("Component: Missing currentRecord or ecc_cnc");
      return;
    }
    try {
      const ecc_cnc = currentRecord.ecc_cnc;
      const existingLogs = await checkExistingLogsByEccCnc(ecc_cnc);

      if (existingLogs.length > 0) {
        setIsLogChecked((prevIsLogChecked) => ({
          ...prevIsLogChecked,
          [ecc_cnc]: true,
        }));
      } else {
        await createInitialLogEntry(currentRecord);
        setIsLogChecked((prevIsLogChecked) => ({
          ...prevIsLogChecked,
          [ecc_cnc]: true,
        }));
      }
    } catch (error) {
      // Error is already logged in the service, but you can add component-specific handling if needed
      // For example, display a notification to the user.
      console.error("Component: Error in checkAndLogInitialData:", error);
    }
  };

  let isLogging = false;

  useEffect(() => {
    setEditedRecord(record);
  }, [record]);

  const handleChange = (field, value) => {
    setEditedRecord({
      ...editedRecord,
      [field]: value,
    });
  };

  const createInitialLogEntry = async (record) => {
    if (isLogging) return;
    isLogging = true;

    const now = new Date();
    const transactionDate = `${
      now.getMonth() + 1 // eslint-disable-line no-mixed-operators
    }/${now.getDate()}/${now.getFullYear()} ${now.getHours()}:${String(
      now.getMinutes()
    ).padStart(2, "0")}`;

    try {
      const transactions = await fetchAllUcdsLogs();

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

      await createUcdsLogEntry(logData);
    } catch (error) {
      console.error("Error logging initial data:", error);
    } finally {
      isLogging = false;
    }
  };

  const pruneUnchangedFields = (original, updated) => {
    const changes = {};
    for (const key in updated) {
      const originalVal = original[key] ?? "";
      const updatedVal = updated[key] ?? "";

      const isEqual =
        typeof originalVal === "string" && typeof updatedVal === "string"
          ? originalVal.trim() === updatedVal.trim()
          : JSON.stringify(originalVal) === JSON.stringify(updatedVal);

      if (!isEqual) {
        changes[key] = updatedVal;
      }
    }
    return changes;
  };

  const handleSaveChanges = async () => {
    const result = await Swal.fire({
      title: "Confirm Save",
      text: "Do you want to save the changes?",
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#3085d6",
      cancelButtonColor: "#d33",
      confirmButtonText: "Save Data",
    });

    if (!result.isConfirmed) return;

    try {
      const currentUsername = currentUser?.username || "Unknown User";

      const changedFields = pruneUnchangedFields(record, editedRecord);

      if (Object.keys(changedFields).length === 0) {
        await Swal.fire({
          icon: "info",
          title: "No Changes Detected",
          text: "You haven't made any modifications to save.",
        });
        return;
      }

      const updatePayload = {
        updates: [
          {
            id_no: editedRecord.id_no,
            sort_key: editedRecord.sort_key,
            changes: {
              ...changedFields,
              updated_by: currentUsername,
            },
          },
        ],
      };

      const response = await updateUcdsDataBySortKey(
        editedRecord.sort_key,
        updatePayload
      );

      if (response.status === 200) {
        await Swal.fire({
          icon: "success",
          title: "Changes Saved",
          text: response.data.message,
          timer: 2000,
          confirmButtonText: "OK",
        });

        if (typeof handleReload === "function") {
          await handleReload(editedRecord.province, editedRecord);
        }

        setIsEditing(false);
        setEditedRecord(null);
      } else {
        Swal.fire(
          "Error",
          `Failed to save changes. Server responded with status: ${response.status}`,
          "error"
        );
      }
    } catch (error) {
      const errorMessage =
        error.response?.data?.error ||
        error.message ||
        "An unexpected error occurred while saving.";
      Swal.fire("Error", errorMessage, "error");
      console.error("Component: Error updating data:", error);
    }
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

const getProvincePermissionKey = (provinceNameFromRecord) => {
  if (!provinceNameFromRecord) return null;

  // Normalize: convert to uppercase and replace underscores with spaces
  const name = String(provinceNameFromRecord).toUpperCase().replace(/_/g, " ");

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
      console.warn(`Unknown province name for permission key: ${provinceNameFromRecord}`);
      return null;
  }
};

  const reloadEditedRecord = async (eccCncKey) => {
    const updated = await fetchRecordByEccCnc(eccCncKey);
    if (updated) {
      setEditedRecord(updated);
    }
  };

  const provinceKey = getProvincePermissionKey(record?.province);
  const canShowEditButton =
    currentUser?.provinceStringPermissions?.[provinceKey] === "readWrite";

  return (
    <div>
      {!record || !record.sort_key || !editedRecord ? (
        <div style={{ textAlign: "center", padding: 40 }}>
          <Spin size="large" tip="Loading record details...">
            <div style={{ width: 1, height: 1 }} />
          </Spin>
        </div>
      ) : (
        <>
          {/* The tabs in the Universe Central DB's accent, the record's
              actions on the tab bar's right — not floating at the page's corner. */}
          <ConfigProvider theme={{ components: { Tabs: { itemHoverColor: UCDS_ACCENT, itemSelectedColor: UCDS_ACCENT, itemActiveColor: UCDS_ACCENT, inkBarColor: UCDS_ACCENT, titleFontSize: 14 } } }}>
          <Tabs
            className="ucds-record-tabs"
            tabPosition="left"
            activeKey={activeTab}
            onChange={handleTabChange}
            tabBarExtraContent={{
              right: activeTab !== "6" && (
                <Space size={8} direction="vertical" className="ucds-record-actions">
                  <Button icon={<FileTextOutlined />} onClick={handleopenModal} loading={loadingPDF}>
                    Generate report
                  </Button>
                  {isEditing ? (
                    <>
                      <Button onClick={handleCancelEdit}>Cancel</Button>
                      <Button onClick={handleSaveChanges} type="primary" icon={<SaveOutlined />}>
                        Save
                      </Button>
                    </>
                  ) : (
                    canShowEditButton && (
                      <Button onClick={() => setIsEditing(true)} type="primary" icon={<EditOutlined />}>
                        Edit
                      </Button>
                    )
                  )}
                </Space>
              ),
            }}
            items={[
              {
                key: "1",
                label: "General Information",
                children: (
                  <GenInfo
                    editedRecord={editedRecord}
                    setEditedRecord={setEditedRecord}
                    handleChange={handleChange}
                    isEditing={isEditing}
                    theme={theme}
                  />
                ),
              },
              {
                key: "2",
                label: "Concerned Unit / Focal Person",
                children: (
                  <FocalPerson
                    editedRecord={editedRecord}
                    handleChange={handleChange}
                    isEditing={isEditing}
                    currentUser={currentUser}
                    theme={theme}
                  />
                ),
              },
              {
                key: "3",
                label: "Clearances and Permits",
                children: (
                  <Permit
                    editedRecord={editedRecord}
                    handleChange={handleChange}
                    isEditing={isEditing}
                    onSaveChanges={(updatedRecord, showNotification) => {
                      setEditedRecord(updatedRecord);
                      handleSaveChanges(showNotification);
                    }}
                  />
                ),
              },
              {
                key: "6",
                label: "History",
                children: (
                  <ProvTransactionLog
                    editedRecord={editedRecord}
                    currentUser={currentUser}
                    theme={theme}
                    reloadEditedRecord={reloadEditedRecord}
                  />
                ),
              },
              // Permits, clearances and scanned documents filed against this
              // establishment. Read-only on purpose, including while the rest
              // of the record is being edited: Monitoring Plan metadata and
              // document metadata are separate things, and editing one must
              // not be able to repoint the other at a different file. The
              // panel renders nothing when document access is unavailable to
              // the viewer, so this tab is empty rather than broken.
              {
                key: "7",
                label: "Documents",
                children: (
                  <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                    {isEditing && (
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        Documents are not edited here. Editing this record
                        changes its Monitoring Plan details only — the filed
                        documents and where they live are held separately.
                      </Typography.Text>
                    )}
                    <EstablishmentRecordsPanel sortKey={editedRecord.sort_key} />
                  </Space>
                ),
              },
            ]}
          />
          </ConfigProvider>

          <Modal
            title={<Space><FileTextOutlined />Generate report — {editedRecord.title || editedRecord.sort_key}</Space>}
            open={isModalVisible}
            onOk={handleModalOk}
            onCancel={handleModalCancel}
            width="min(1320px, 96vw)"
            style={{ top: 20 }}
            footer={null}
            destroyOnHidden
          >
            <div className="report-modal-container">
              {/* The Inspection and Compliance Inspection Report, and the log of
                  those generated. (The CIC and IC forms were never built: their
                  tabs showed "404 — under development" and are gone.) */}
              <Tabs
                defaultActiveKey="1"
                items={[
                  {
                    key: "1",
                    label: "Inspection report (ICIR)",
                    children: (
                      <ICIR editedRecord={editedRecord} resetCheckboxesKey={resetCheckboxesKey} />
                    ),
                  },
                  {
                    key: "4",
                    label: "Reports log",
                    children: <Drafts />,
                  },
                ]}
              />
            </div>
          </Modal>

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
