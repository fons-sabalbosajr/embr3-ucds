import React, { useMemo, useState, useRef, useEffect } from "react";
import { Modal, Tabs, Spin, Button } from "antd";
import HGenInfoAdd from "./geninfo/HGenInfoAdd";
import HFocalPersonAdd from "./focalperson/HFocalPersonAdd";
import SPermitsClearancesAdd from "./permits/HPermitsAdd";
import SLegalUnitAdd from "./legalunit/HLegalUnitAdd";
import Swal from "sweetalert2";
import "./addhealthcaremodal.css";

const { TabPane } = Tabs;

const AddHealthcareModal = ({ visible, onCancel, onOk, dataSource = [] }) => {
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const genInfoRef = useRef();
  const [clearTrigger, setClearTrigger] = useState(false);
  const [modalWidth, setModalWidth] = useState(900);


   useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1400) {
        setModalWidth(1100);
      } else if (window.innerWidth >= 1080) {
        setModalWidth(1000);
      } else {
        setModalWidth(1000);
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Compute next id_no based on the highest id_no in dataSource
  const nextIdNo = useMemo(() => {
    if (!dataSource || dataSource.length === 0) return 1;
    const maxId = Math.max(
      ...dataSource.map((item) => Number(item.id_no || item.idNo || 0))
    );
    return maxId + 1;
  }, [dataSource]);

  const handleEdit = () => setIsEditing(true);

  const handleSave = () => {
    // TODO: Implement save logic
    onOk();
  };

  const handleCancel = async () => {
    const result = await Swal.fire({
      title: "Cancel Adding?",
      text: "Are you sure you want to cancel adding this industry? All unsaved data will be lost.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, cancel",
      cancelButtonText: "No, stay",
      reverseButtons: true,
    });
    if (result.isConfirmed) {
      setIsEditing(false);
      setClearTrigger((prev) => !prev);
      //onCancel();
    }
    // else do nothing, stay in modal
  };

  return (
    <Modal
      open={visible}
      title={
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span className="modal-title">Add New Healthcare Industry</span>
          {loading ? (
            <div className="id-no">
              <Spin size="small" /> loading...
            </div>
          ) : (
            <span className="id-no">ID No: {nextIdNo}</span>
          )}
        </div>
      }
      footer={
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            width: "100%",
            gap: "10px",
          }}
        >
          {isEditing ? (
            <Button type="primary" key="save" onClick={handleSave}>
              Add Industry
            </Button>
          ) : (
            <Button type="primary" key="edit" onClick={handleEdit}>
              Start Adding
            </Button>
          )}
          {isEditing && (
            <Button type="primary" danger key="cancel" onClick={handleCancel}>
              Cancel
            </Button>
          )}
        </div>
      }
      onCancel={onCancel}
      width={modalWidth}
      destroyOnClose
      maskClosable={false}
    >
      <Tabs defaultActiveKey="1">
        <TabPane tab="General Information" key="1">
          <HGenInfoAdd
            ref={genInfoRef}
            isEditing={isEditing}
            clearTrigger={clearTrigger}
          />
        </TabPane>
        <TabPane tab="Focal Person" key="2">
          <HFocalPersonAdd
            ref={genInfoRef}
            isEditing={isEditing}
            clearTrigger={clearTrigger}
          />
        </TabPane>
        <TabPane tab="Permits/Clearances" key="3">
          <SPermitsClearancesAdd isEditing={isEditing} />
        </TabPane>
        <TabPane tab="Legal Services Unit" key="4">
          <SLegalUnitAdd isEditing={isEditing} />
        </TabPane>
      </Tabs>
    </Modal>
  );
};

export default AddHealthcareModal;
