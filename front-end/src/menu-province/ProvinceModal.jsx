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
} from "antd";
import { EditOutlined, SaveOutlined, CloseOutlined } from "@ant-design/icons";
import "./provincemodal.css";
import styled from "styled-components";
import axios from "axios";
import Swal from "sweetalert2";
import PropTypes from "prop-types";
import GenInfo from "./tabpanes/GeneralInfo/GenInfo";
import FocalPerson from "./tabpanes/FocalPerson/FocalPerson";

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

  const dateFormat = "MM/DD/YYYY";

  const [isEditing, setIsEditing] = useState(false);
  const [editedRecord, setEditedRecord] = useState(null);

  const [initialDateMonitored, setInitialDateMonitored] = useState(null);


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
        onClose();
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
    setEditedRecord(record);
    setIsEditing(false);
  };

  const handleMenuClick = async (e) => {
    // Handle menu item click for generating ICIR, CIC, or IC
    try {
      const response = await axios.post(
        `http://localhost:8081/api/generate-${e.key}/${record.id_no}`
      );

      if (response.status === 200) {
        Swal.fire(
          "Success",
          `${e.item.props.children} generated successfully!`,
          "success"
        );
        setShouldRefreshTable(true); // Trigger table refresh after generating
      } else {
        Swal.fire(
          "Error",
          `Failed to generate ${e.item.props.children}`,
          "error"
        );
      }
    } catch (error) {
      Swal.fire(
        "Error",
        `Failed to generate ${e.item.props.children}`,
        "error"
      );
      console.error("Error generating", e.key, ":", error); // Log detailed error
    }
  };

  const menu = (
    <Menu onClick={handleMenuClick}>
      <Menu.Item key="icir">Generate ICIR</Menu.Item>
      <Menu.Item key="cic">Generate CIC</Menu.Item>
      <Menu.Item key="ic">Generate IC</Menu.Item>
    </Menu>
  );

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
      </Tabs>

      <Dropdown overlay={menu} placement="topLeft">
        <Button className="button-generate" type="primary">
          Generate
        </Button>
      </Dropdown>

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
  setShouldRefreshTable: PropTypes.func, // Ensure setShouldRefreshTable is function
  handleReload: PropTypes.func.isRequired,
};

export default ProvinceModal;
