import React, { useEffect, useState } from "react";
import { Tabs, Button, message, Modal } from "antd";
import { EditOutlined, SaveOutlined } from "@ant-design/icons";
import Swal from "sweetalert2";
import axios from "axios";
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
  const [penaltyAmounts, setPenaltyAmounts] = useState([]);
  const [penaltyOrNumbers, setPenaltyOrNumbers] = useState([]);

  useEffect(() => {
    setCurrentRecord(record);
    setOriginalRecord(record);
    const loadedPenaltyAmounts = (record.penalty_amount || "")
      .split("\n")
      .map((amount) => amount.trim());
    const loadedPenaltyOrNumbers = (record.penalty_or_number || "")
      .split("\n")
      .map((number) => number.trim());
    setPenaltyAmounts(loadedPenaltyAmounts);
    setPenaltyOrNumbers(loadedPenaltyOrNumbers);
  }, [record]);

  const handleSaveChanges = async () => {
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
            penalty_amount: penaltyAmounts.join("\n"),
            penalty_or_number: penaltyOrNumbers.join("\n"),
            updated_by: currentUsername,
          };

          const response = await axios.put(
            `http://localhost:8081/api/update-healthcare/${record.id_no}`,
            updatedRecord
          );

          if (response.status === 200) {
            Swal.fire("Success", "Data updated successfully!", "success").then(
              () => {
                setIsEditing(false);
              }
            );
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
            <Button onClick={handleSaveChanges} type="primary">
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
            handleChange={handleChange} 
            isEditing={isEditing} 
            penaltyAmounts={penaltyAmounts}
            setPenaltyAmounts={setPenaltyAmounts}
            penaltyOrNumbers={penaltyOrNumbers}
            setPenaltyOrNumbers={setPenaltyOrNumbers}
          />
        </TabPane>
      </Tabs>
    </Modal>
  );
};

export default HealthcareModal;
