import React, { useState, useEffect } from "react";
import { Modal, Tabs, Spin } from "antd";
import GenInfoAdd from "./tabpanes/geninfo/GenInfoAdd";
import FocalPersonAdd from "./tabpanes/focalperson/FocalPersonAdd";
import "./addprovincemodal.css";

const { TabPane } = Tabs;

const AddProvinceModal = ({ visible, onCancel, onCreate }) => {
  const [nextIdNo, setNextIdNo] = useState(null);
  const [loading, setLoading] = useState(false);

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

  const handleOk = () => {
    // Handle the OK button click
    onCreate();
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
          <span>Add New Province</span>
          {loading ? (
            <div className="id-no">
            <Spin size="small" /> loading...
          </div>
          ) : (
            nextIdNo && <span className="id-no">ID No: {nextIdNo}</span>
          )}
        </div>
      }
      okText="Create"
      cancelText="Cancel"
      onCancel={onCancel}
      onOk={handleOk}
      width={1000}
    >
      <Tabs defaultActiveKey="1">
        <TabPane tab="General Information" key="1">
          <GenInfoAdd nextIdNo={nextIdNo} />
        </TabPane>
        <TabPane tab="Focal Person" key="2">
          <FocalPersonAdd />
        </TabPane>
      </Tabs>
    </Modal>
  );
};

export default AddProvinceModal;
