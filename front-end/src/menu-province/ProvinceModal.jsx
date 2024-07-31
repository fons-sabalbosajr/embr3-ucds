import React, { useContext, useState, useEffect } from "react";
import {
  Modal,
  Button,
  Form,
  Input,
  Row,
  Col,
  Tabs,
  Space,
  Select,
  Typography,
  Menu,
  Dropdown,
  Spin,
} from "antd";
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
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedRecord, setEditedRecord] = useState(null);
  const [loadingPDF, setLoadingPDF] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false); // State for modal visibility
  const [loadingICIR, setLoadingICIR] = useState(false);
  const [resetCheckboxesKey, setResetCheckboxesKey] = useState(Date.now()); // Change to reset checkboxes

  useEffect(() => {
    setEditedRecord(record);
  }, [record]);

  const handleChange = (field, value) => {
    setEditedRecord({
      ...editedRecord,
      [field]: value,
    });
  };

  const handleSaveChanges = async () => {
    try {
      const response = await axios.put(
        `http://localhost:8081/api/update-data/${record.id_no}`,
        editedRecord
      );

      if (response.status === 200) {
        Swal.fire("Success", "Changes saved successfully!", "success");
        if (setShouldRefreshTable) {
          setShouldRefreshTable(true);
        }
        setIsEditing(false);
        handleReload();
      } else {
        Swal.fire("Error", "Failed to save changes", "error");
      }
    } catch (error) {
      Swal.fire("Error", "Failed to save changes", "error");
      console.error("Error updating data:", error);
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
    setResetCheckboxesKey(Date.now()); // Trigger checkbox reset
  };

  const handleModalCancel = () => {
    setIsModalVisible(false);
    setResetCheckboxesKey(Date.now()); // Trigger checkbox reset
  };

  return (
    <div className="modal-container">
      <Tabs defaultActiveKey="1">
        <TabPane tab={<BoldTab>General Information</BoldTab>} key="1">
          <GenInfo
            editedRecord={editedRecord}
            handleChange={handleChange}
            isEditing={isEditing}
          />
        </TabPane>
        <TabPane tab={<BoldTab>Concerned Unit/Focal Person</BoldTab>} key="2">
          <FocalPerson
            editedRecord={editedRecord}
            handleChange={handleChange}
            isEditing={isEditing}
          />
        </TabPane>
        <TabPane tab={<BoldTab>Clearances and Permits</BoldTab>} key="3">
          <Permit
            editedRecord={editedRecord}
            handleChange={handleChange}
            isEditing={isEditing}
          />
        </TabPane>
        <TabPane tab={<BoldTab>Legal Services Unit</BoldTab>} key="4">
          <Legal
            editedRecord={editedRecord}
            handleChange={handleChange}
            isEditing={isEditing}
          />
        </TabPane>
        <TabPane tab={<BoldTab>Manila Bay Unit</BoldTab>} key="5">
          <MBU
            editedRecord={editedRecord}
            handleChange={handleChange}
            isEditing={isEditing}
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
          <Tabs defaultActiveKey="1" tabPosition="left" tabBarGutter={20}>
            <TabPane tab={<span>Generate ICIR</span>} key="1">
              <ICIR
                editedRecord={editedRecord}
                onIncludeChange={() => {}}
                resetCheckboxesKey={resetCheckboxesKey} // Pass reset state as a key
              />
            </TabPane>
            <TabPane tab={<span>Generate CIC</span>} key="2">
              <IC />
            </TabPane>
            <TabPane tab={<span>Generate IC</span>} key="3">
              <CIC />
            </TabPane>
            <TabPane tab={<span>Reports Logs</span>} key="4">
              <Drafts />
            </TabPane>
            
          </Tabs>
        </div>
      </Modal>

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
            >
              Edit
            </Button>
          )}
        </Space>
      </div>
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
