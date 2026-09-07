// AddSurvey.jsx
import React, { useState, useEffect } from "react";
import { Modal, Tabs, Spin, Button } from "antd";
import Swal from "sweetalert2";
import GenInfo from "./tabpanes/survey_geninfo/Survey_AddGenInfo";
import FocalPerson from "./tabpanes/survey_focalperson/Survey_AddFocalPerson";
import LegalUnit from "./tabpanes/survey_legal/Survey_AddLegal";
import "./addsurvey.css";
import { API_BASE_URL } from "../../../../config/api";
import { getActiveYear } from "../../../../context/YearContext";

const { TabPane } = Tabs;

const AddSurvey = ({ currentUser, visible, onCancel, onCreate }) => {
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [nextIdNo, setNextIdNo] = useState(null);
  const [surveyData, setSurveyData] = useState({});

  useEffect(() => {
    if (visible) {
      fetchNextIdNo();
    }
  }, [visible]);

  const fetchNextIdNo = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/surveys/last-id/${getActiveYear()}`
      );
      const data = await response.json();
      setNextIdNo(data.lastIdNo + 1);
    } catch (error) {
      console.error("Error fetching next id_no:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setSurveyData((prevState) => ({
      ...prevState,
      [field]: value,
    }));
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSave = () => {
    setIsEditing(false);
    onCreate();
  };

  const clearFields = () => {
    // Clear all fields in the tab panes
    // You can implement this function to reset the state of each tab pane component
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
        clearFields();
      }
    });
  };

  return (
    <Modal
      visible={visible}
      onCancel={onCancel}
      width={1000}
      footer={[
        isEditing ? (
          <Button type="primary" key="save" onClick={handleSave}>
            Add Establishment
          </Button>
        ) : (
          <Button type="primary" key="edit" onClick={handleEdit}>
            Start Adding
          </Button>
        ),
        isEditing && (
          <Button type="primary" danger key="cancel" onClick={handleCancel}>
            Cancel
          </Button>
        ),
      ]}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span className="modal-title">Add New Industry/Establishment</span>
        {loading ? (
          <div className="id-no">
            <Spin size="small" /> Loading...
          </div>
        ) : (
          nextIdNo && <span className="id-no">ID No: {nextIdNo}</span>
        )}
      </div>

      <Tabs defaultActiveKey="1">
        <TabPane className="custom-tab" tab="General Information" key="1">
          <GenInfo
            isEditing={isEditing}
            handleInputChange={handleInputChange}
          />
        </TabPane>
        <TabPane className="custom-tab" tab="Monitoring Data" key="2">
          <FocalPerson
            isEditing={isEditing}
            handleInputChange={handleInputChange}
          />
        </TabPane>
        <TabPane className="custom-tab" tab="Legal Unit" key="3">
          <LegalUnit
            isEditing={isEditing}
            handleInputChange={handleInputChange}
          />
        </TabPane>
      </Tabs>
    </Modal>
  );
};

export default AddSurvey;
