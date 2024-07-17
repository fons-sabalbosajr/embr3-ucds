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
import Permit from "./tabpanes/PermitsInfo/Permits";
import Legal from "./tabpanes/LegalInfo/LegalUnit";
import MBU from "./tabpanes/MBUInfo/MBUnit";

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
  const [loadingPDF, setLoadingPDF] = useState(false); // State to track PDF generation loading state

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

  const handleMenuClick = async (e) => {
    try {
      setLoadingPDF(true);

      // Show loading cursor
      document.body.style.cursor = "wait";

      // Show processing alert
      Swal.fire({
        title: "Generating PDF...",
        allowOutsideClick: false,
        allowEscapeKey: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });

      const response = await axios.get(
        `http://localhost:8081/generate-icir/${record.id_no}`,
        {
          responseType: "blob",
        }
      );

      setLoadingPDF(false);

      // Reset cursor
      document.body.style.cursor = "default";

      // Close Swal alert after PDF generation
      Swal.close();

      if (response.status === 200) {
        const blob = new Blob([response.data], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);

        // Create a temporary anchor element
        const a = document.createElement("a");
        a.href = url;
        a.target = "_blank"; // Open in new tab
        a.download = `ICIR-${record.title}.pdf`; // Set the file name for download
        a.click();

        window.open(url, "_blank");

        // Clean up
        URL.revokeObjectURL(url);

        // Optional: Inform user if needed
        Swal.fire(
          "PDF Generated",
          "The PDF has been generated successfully!",
          "success"
        );
      } else {
        Swal.fire(
          "Error",
          `Failed to generate ${e.item.props.children}`,
          "error"
        );
      }
    } catch (error) {
      setLoadingPDF(false);
      document.body.style.cursor = "default";
      Swal.close();
      Swal.fire(
        "Error",
        `Failed to generate ${e.item.props.children}`,
        "error"
      );
      console.error(`Error generating ${e.key}:`, error);
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

      <Dropdown overlay={menu} placement="topLeft">
        <Button
          className="button-generate"
          type="primary"
          disabled={loadingPDF}
        >
          {loadingPDF ? "Generating PDF..." : "Generate"}
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
  setShouldRefreshTable: PropTypes.func,
  handleReload: PropTypes.func.isRequired,
};

export default ProvinceModal;
