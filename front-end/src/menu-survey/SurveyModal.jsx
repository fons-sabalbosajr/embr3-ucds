import React, { useEffect, useState } from "react";
import { Tabs, Button, message } from "antd";
import { EditOutlined, SaveOutlined, CloseOutlined } from "@ant-design/icons";
import GenInfo from "./tabspanes/GenInfo/GenInfo";
import FocalPerson from "./tabspanes/FocalPerson/FocalPerson";
import LegalUnit from "./tabspanes/LegalUnit/LegalUnit";
import MBU from "./tabspanes/MBU/MBU";
import Swal from "sweetalert2";
import axios from "axios";
import styled from "styled-components";
import "./surveymodal.css";

const { TabPane } = Tabs;
const BoldTab = styled.span`
  font-weight: 600;
  font-size: 16px;
`;

const SurveyModal = ({ record, onUpdate, onClose, handleReload }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedRecord, setEditedRecord] = useState(record);

  useEffect(() => {
    setEditedRecord(record);
  }, [record]);

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

  const handleSave = async () => {
    Swal.fire({
      title: "Confirm Save",
      text: "Do you want to save the changes?",
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#3085d6",
      cancelButtonColor: "#d33",
      confirmButtonText: "Yes, save it!",
      cancelButtonText: "No, cancel",
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          // Create a copy of editedRecord excluding _id
          const { _id, ...updatedFields } = editedRecord;
  
          const response = await axios.put(
            `http://localhost:8081/api/update-survey-data/${editedRecord.id_no}`, // Ensure this matches your API
            updatedFields // Send only the fields to be updated
          );
  
          if (response.status === 200) {
            Swal.fire({
              title: "Success",
              text: "Survey data updated successfully!",
              icon: "success",
              confirmButtonColor: "#3085d6",
              confirmButtonText: "OK",
            }).then(() => {
              setIsEditing(false);
              if (handleReload) handleReload();
            });
          } else {
            Swal.fire("Error", "Failed to save changes", "error");
          }
        } catch (error) {
          console.error(
            "Error updating data:",
            error.response ? error.response.data : error.message
          );
          Swal.fire("Error", "Failed to save changes", "error");
        }
      }
    });
  };
  

  
  const handleTabChange = (key) => {
    // Handle tab change if needed
  };

  const updateEditedRecord = (updatedFields) => {
    setEditedRecord((prevRecord) => ({
      ...prevRecord,
      ...updatedFields,
    }));
  };

  return (
    <div>
      <Tabs defaultActiveKey="1" onChange={handleTabChange}>
        <TabPane tab={<BoldTab>General Information</BoldTab>} key="1">
          <GenInfo
            record={editedRecord}
            isEditing={isEditing}
            onUpdate={updateEditedRecord}
          />
        </TabPane>
        <TabPane tab={<BoldTab>Concerned Unit/Focal Person</BoldTab>} key="2">
          <FocalPerson
            record={editedRecord}
            isEditing={isEditing}
            onUpdate={updateEditedRecord}
          />
        </TabPane>
        <TabPane tab={<BoldTab>Legal Services Unit</BoldTab>} key="3">
          <LegalUnit
            record={editedRecord}
            isEditing={isEditing}
            onUpdate={updateEditedRecord}
          />
        </TabPane>
        <TabPane tab={<BoldTab>Manila Bay Unit</BoldTab>} key="4">
          <MBU
            record={editedRecord}
            isEditing={isEditing}
            onUpdate={updateEditedRecord}
          />
        </TabPane>
      </Tabs>

      <div className="action-buttons-container">
        {isEditing ? (
          <div>
            <Button onClick={handleCancelEdit} className="btn-cancel-right">
              Cancel
            </Button>
            <Button type="primary" icon={<SaveOutlined />} onClick={handleSave}>
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
