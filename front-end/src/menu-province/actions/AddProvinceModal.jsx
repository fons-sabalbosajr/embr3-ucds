import React, { useState, useEffect } from "react";
import { Modal, Tabs, Spin, Button } from "antd";
import Swal from "sweetalert2";
import GenInfoAdd from "./tabpanes/geninfo/GenInfoAdd";
import FocalPersonAdd from "./tabpanes/focalperson/FocalPersonAdd";
import PermitsAdd from "./tabpanes/permits/PermitsAdd";
import LegalUnitAdd from "./tabpanes/legalunit/LegalUnitAdd";
import "./addprovincemodal.css";

const { TabPane } = Tabs;

const AddProvinceModal = ({ visible, onCancel, onCreate }) => {
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [nextIdNo, setNextIdNo] = useState(null);

  useEffect(() => {
    if (visible) {
      fetchNextIdNo();
    }
  }, [visible]);

  const fetchNextIdNo = async () => {
    setLoading(true);
    try {
      const response = await fetch("http://localhost:8081/api/ucds/next-id");
      const data = await response.json();
      setNextIdNo(data.nextIdNo);
    } catch (error) {
      console.error("Error fetching next id_no:", error);
    } finally {
      setLoading(false);
    }
  };


  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSave = () => {
    setIsEditing(false);
    onCreate();
  };

  const handleCancel = () => {
    Swal.fire({
      title: 'Are you sure?',
      text: "You won't be able to revert this!",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, cancel adding!',
      cancelButtonText: 'No, keep editing',
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
      visible={visible}
      title={
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>Add New Establishment/Company</span>
          {loading ? (
            <div className="id-no">
              <Spin size="small" /> loading...
            </div>
          ) : (
            nextIdNo && <span className="id-no">ID No: {nextIdNo}</span>
          )}
        </div>
      }
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
      onCancel={onCancel}
      width={1000}
    >
      <Tabs defaultActiveKey="1">
        <TabPane tab="General Information" key="1">
          <GenInfoAdd isEditing={isEditing} />
        </TabPane>
        <TabPane tab="Monitoring Data" key="2">
          <FocalPersonAdd isEditing={isEditing} />
        </TabPane>
        <TabPane tab="Permits" key="3">
          <PermitsAdd isEditing={isEditing} />
        </TabPane>
        <TabPane tab="Legal Unit" key="4">
          <LegalUnitAdd isEditing={isEditing} />
        </TabPane>
      </Tabs>
    </Modal>
  );
};

export default AddProvinceModal;