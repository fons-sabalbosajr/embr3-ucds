import React, { useEffect, useState } from "react";
import { Tabs, Button, message, Result } from "antd";
import { EditOutlined, SaveOutlined, CloseOutlined } from "@ant-design/icons";
import Swal from "sweetalert2";
import axios from "axios";
import GenInfo from "./tabspanes/GenInfo/GenInfo";
import FocalPerson from "./tabspanes/FocalPerson/FocalPerson";
import LegalUnit from "./tabspanes/LegalUnit/LegalUnit";
import MBU from "./tabspanes/MBU/MBU";
import "./surveymodal.css";

const { TabPane } = Tabs;

const SurveyModal = ({ record, handleReload, onClose }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedRecord, setEditedRecord] = useState(record);
  const [activeTab, setActiveTab] = useState("1");

  useEffect(() => {
    if (record) {
      setEditedRecord(record);
    }
  }, [record]);

  const handleChange = (field, value) => {
    setEditedRecord({
      ...editedRecord,
      [field]: value,
    });
  };

  const handleSaveChanges = async () => {
    Swal.fire({
      title: "Confirm Save",
      text: "Do you want to save the changes?",
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#3085d6",
      cancelButtonColor: "#d33",
      confirmButtonText: "Yes, save it!",
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          // Create a copy of editedRecord and remove the '_id' field
          const { _id, ...recordToUpdate } = editedRecord;

          const response = await axios.put(
            `http://localhost:8081/api/update-survey-data/${editedRecord.id_no}`,
            recordToUpdate // Send the record without the '_id' field
          );

          if (response.status === 200) {
            Swal.fire("Success", "Data updated successfully!", "success").then(
              () => {
                setIsEditing(false);
                if (handleReload) handleReload();
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

  // Handle modal close and reset state
  const handleModalClose = () => {
    setEditedRecord(null); // Clear modal data on close
    setIsEditing(false); // Reset editing state
    setActiveTab("1"); // Reset to first tab
    if (onClose) onClose(); // Call the onClose callback if provided
  };

  return (
    // <>
    // <Result
    //     status="403"
    //     title="403"
    //     subTitle="Sorry, this page is under maintenance."
    //     extra={<Button type="primary">Back to Dashboard</Button>}
    //   />
    // </>

    <div className="modal-container">
      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        <TabPane tab="General Information" key="1">
          <GenInfo
            editedRecord={editedRecord}
            handleChange={handleChange}
            isEditing={isEditing}
          />
        </TabPane>
        <TabPane tab="Concerned Unit/Focal Person" key="2">
          <FocalPerson
            editedRecord={editedRecord}
            handleChange={handleChange}
            isEditing={isEditing}
          />
        </TabPane>
        <TabPane tab="Legal Services Unit" key="3">
          <LegalUnit
            editedRecord={editedRecord}
            handleChange={handleChange}
            isEditing={isEditing}
          />
        </TabPane>
        <TabPane tab="Manila Bay Unit" key="4">
          <MBU
            editedRecord={editedRecord}
            handleChange={handleChange}
            isEditing={isEditing}
          />
        </TabPane>
      </Tabs>

      <div className="action-buttons-container">
        {isEditing ? (
          <div>
            <Button onClick={handleCancelEdit} className="btn-cancel-right">
              Cancel
            </Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSaveChanges}
            >
              Save
            </Button>
          </div>
        ) : (
          <Button
            type="primary"
            icon={<EditOutlined />}
            onClick={() => setIsEditing(true)}
          >
            Edit
          </Button>
        )}
      </div>
    </div>
  );
};

export default SurveyModal;
