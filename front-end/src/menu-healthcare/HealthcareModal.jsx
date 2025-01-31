import React, { useState } from "react";
import { Modal, Button } from "antd";
import { EditOutlined } from "@ant-design/icons";
import Swal from "sweetalert2";
import axios from "axios";
import { Tabs } from "antd";
import GenInfo from "./tabpanes/geninfo/GenInfo";
import FocalPerson from "./tabpanes/focalperson/FocalPerson";
import Permits from "./tabpanes/permits/Permits";
import Legal from "./tabpanes/legal/Legal";
import "./healthcaremodal.css";

const { TabPane } = Tabs;

const HealthcareModal = ({
  record,
  isEditing,
  handleChange,
  setIsEditing,
  setIsModalVisible,
  setOriginalRecord,
  setCurrentRecord,
  originalRecord,
  isModalVisible,
}) => {
  const handleSave = async (showNotification = true) => {
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
          const { _id, ...recordToUpdate } = record;

          const currentUsername = localStorage.getItem("username");
          const updatedRecord = {
            ...recordToUpdate,
            ecc_cnc: record.ecc_cnc,
            updated_by: currentUsername, // Add the username to the request body
          };

          const response = await axios.put(
            `http://localhost:8081/api/update-healthcare/${record.id_no}`,
            updatedRecord
          );

          if (response.status === 200) {
            const auditLog = response.data.auditLog; // Assuming this contains audit log information

            if (showNotification) {
              Swal.fire("Success", "Changes saved successfully!", "success");
            }
            setIsEditing(false);
            setOriginalRecord(record);

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
              : `${auditLog.ecc_cnc || record.ecc_cnc}`; // Use ecc_cnc directly if no changes

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
              ecc_cnc: auditLog.ecc_cnc || record.ecc_cnc, // Fallback to the record ecc_cnc
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

  const handleCancel = () => {
    if (isEditing) {
      Swal.fire({
        title: "Are you sure?",
        text: "You haven't saved your changes!",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Yes, discard changes",
        cancelButtonText: "No, keep editing",
      }).then((result) => {
        if (result.isConfirmed) {
          setCurrentRecord({ ...originalRecord });
          setIsEditing(false);
          // Optionally clear or reset data here
          //setIsModalVisible(false); // Close modal after canceling
        }
      });
    } else {
      setIsModalVisible(false); // Close the modal if not editing
    }
  };

  const handleEditClick = () => {
    setIsEditing(true);
  };

  return (
    <Modal
      title={
        <div className="healthcare-modal-header">
          <span className="healthcare-id">ID No: {record?.id_no || "N/A"}</span>
          <span className="healthcare-title">{record?.title || "-"}</span>
          <span className="healthcare-ecc">{record?.ecc_cnc || "-"}</span>
        </div>
      }
      width={1000}
      visible={isModalVisible} // Use isModalVisible instead of true
      onCancel={() => setIsModalVisible(false)} // Close modal when clicking "X"
      footer={
        isEditing ? (
          <>
            <Button onClick={handleSave} type="primary">
              Save
            </Button>
            <Button onClick={handleCancel}>Cancel</Button>
          </>
        ) : (
          <Button
            onClick={handleEditClick}
            icon={<EditOutlined />}
            type="primary"
          >
            Edit
          </Button>
        )
      }
    >
      <Tabs defaultActiveKey="1" className="healthcare-modal-tabs">
        <TabPane tab="General Information" key="1">
          <GenInfo
            record={record}
            isEditing={isEditing}
            handleChange={handleChange}
          />
        </TabPane>
        <TabPane tab="Focal Person" key="2">
          <FocalPerson
            record={record}
            isEditing={isEditing}
            handleChange={handleChange}
          />
        </TabPane>
        <TabPane tab="Permits/Clearances" key="3">
          <Permits
            record={record}
            isEditing={isEditing}
            handleChange={handleChange}
          />
        </TabPane>
        <TabPane tab="Legal Unit" key="4">
          <Legal
            record={record}
            isEditing={isEditing}
            handleChange={handleChange}
          />
        </TabPane>
      </Tabs>
    </Modal>
  );
};

export default HealthcareModal;
