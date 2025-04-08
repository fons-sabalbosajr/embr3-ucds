import React, { useState, useMemo } from "react";
import {
  Popover,
  Badge,
  List,
  Spin,
  Collapse,
  Button,
  Modal,
  Tabs,
} from "antd";
import {
  BellOutlined,
  CaretRightFilled,
  CaretLeftFilled,
  SettingOutlined,
  LoadingOutlined,
} from "@ant-design/icons";
import ProvinceModal from "../../menu-province/ProvinceModal";
import "./popovernotification.css";

const { Panel } = Collapse;
const { TabPane } = Tabs;

const NotificationsPopover = ({ notifications = [], theme, isLoading }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [warningsPage, setWarningsPage] = useState(1);
  const [isRepairModalVisible, setIsRepairModalVisible] = useState(false);
  const [selectedWarning, setSelectedWarning] = useState(null);

  // Mapping of prefixes to provinces
  const prefixToProvince = {
    AU: "Aurora",
    BA: "Bataan",
    BU: "Bulacan",
    NE: "Nueva Ecija",
    PA: "Pampanga",
    TA: "Tarlac",
    ZA: "Zambales",
  };

  const groupedNotifications = useMemo(() => {
    return notifications.reduce((acc, notification) => {
      if (typeof notification === "string") {
        // Handle string notifications (e.g., general issues)
        const parts = notification.split(" - ");
        const id_no = parts[0]; // Extract id_no
        const issue = parts[1]; // Extract issue
        const prefix = id_no.split("-")[0]; // Extract prefix from id_no
        const province = prefixToProvince[prefix] || "Unknown Province"; // Map prefix to province

        if (!acc[id_no]) {
          acc[id_no] = { province, issues: [] };
        }
        acc[id_no].issues.push(issue); // Push the issue into the corresponding id_no group
      }
      // Skip objects (e.g., duplicate ECC/CNC issues) since they are not relevant for Notifications
      return acc;
    }, {});
  }, [notifications]);

  const warnings = useMemo(() => {
    const eccCncMap = {};

    notifications.forEach((notification) => {
      if (typeof notification === "object" && notification.ecc_cnc) {
        // If the notification is an object with ecc_cnc
        const { ecc_cnc, idNos, count } = notification;

        if (!eccCncMap[ecc_cnc]) {
          eccCncMap[ecc_cnc] = { idNos: [], count: 0 };
        }

        eccCncMap[ecc_cnc].idNos.push(...idNos); // Collect all idNos
        eccCncMap[ecc_cnc].count += count; // Increment the count
      }
    });

    // Return an array of warnings with ecc_cnc, idNos, and count
    return Object.entries(eccCncMap).map(([ecc_cnc, data]) => ({
      ecc_cnc,
      idNos: [...new Set(data.idNos)], // Remove duplicate idNos
      count: data.count,
    }));
  }, [notifications]);

  // Get the keys (id_no values) for pagination
  const groupedKeys = Object.keys(groupedNotifications);

  // Calculate which notification groups to display based on the current page
  const paginatedKeys = groupedKeys.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const paginatedWarnings = warnings.slice(
    (warningsPage - 1) * itemsPerPage,
    warningsPage * itemsPerPage
  );

  // Handle page changes
  const goToNextPage = () => {
    if (currentPage * itemsPerPage < groupedKeys.length) {
      setCurrentPage((prevPage) => prevPage + 1);
    }
  };

  const goToPreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage((prevPage) => prevPage - 1);
    }
  };

  const handleSettingClick = (id_no) => {
    const record = {
      id_no,
      title: groupedNotifications[id_no]?.province || "Unknown Title",
      ecc_cnc: "ECC/CNC Placeholder", // Replace with actual data if available
    };
    setSelectedRecord(record); // Set the selected record
    setIsModalVisible(true); // Open the modal
  };

  // Close the modal
  const handleCloseModal = () => {
    setIsModalVisible(false);
    setSelectedRecord(null); // Clear the selected record
  };

  const handleRepairClick = (warning) => {
    setSelectedWarning(warning); // Set the selected warning
    setIsRepairModalVisible(true); // Open the repair modal
  };

  const handleCloseRepairModal = () => {
    setIsRepairModalVisible(false); // Close the repair modal
    setSelectedWarning(null); // Clear the selected warning
  };

  const notificationsContent = (
    <div style={{ maxHeight: "300px", overflowY: "auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "5px", // Add spacing between buttons and the list
        }}
      >
        <span style={{ fontSize: "10px" }}>
        {groupedKeys.length > 0
          ? `${groupedKeys.length} ID(s) for repair`
          : "No IDs for repair"}
      </span>
        <div style={{ textAlign: "right", marginTop: "1px" }}>
          <Button
            onClick={goToPreviousPage}
            disabled={currentPage === 1}
            style={{
              marginRight: "4px", // Reduce margin for smaller spacing
              padding: "0 6px", // Smaller padding for a compact button
              fontSize: "10px", // Smaller font size
              height: "20px", // Reduce height
              lineHeight: "22px", // Align text vertically
            }}
            size="small"
            type="primary"
          >
            <CaretLeftFilled />
          </Button>
          <Button
            onClick={goToNextPage}
            disabled={currentPage * itemsPerPage >= groupedKeys.length}
            style={{
              padding: "0 6px", // Smaller padding for a compact button
              fontSize: "10px", // Smaller font size
              height: "20px", // Reduce height
              lineHeight: "22px", // Align text vertically
            }}
            size="small"
            type="primary"
          >
            <CaretRightFilled />
          </Button>
        </div>
      </div>
      <List
         dataSource={paginatedKeys.sort((a, b) => {
          // Custom sorting function for natural order
          const matchA = a.match(/^([A-Za-z]+)-(\d+)$/);
          const matchB = b.match(/^([A-Za-z]+)-(\d+)$/);
      
          if (matchA && matchB) {
            const [_, prefixA, numA] = matchA;
            const [__, prefixB, numB] = matchB;
      
            if (prefixA === prefixB) {
              return parseInt(numA, 10) - parseInt(numB, 10); // Sort numerically if prefixes are the same
            }
            return prefixA.localeCompare(prefixB); // Sort alphabetically by prefix
          }
      
          // Fallback to string comparison if format doesn't match
          return a.localeCompare(b)
        })}
        renderItem={(key) => {
          const { province, issues } = groupedNotifications[key];
          return (
            <div key={key}>
              <Collapse
                bordered={false}
                expandIcon={({ isActive }) => (
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <SettingOutlined
                      className="icon-hover"
                      style={{
                        fontSize: "14px",
                        cursor: "pointer",
                        marginRight: "8px",
                      }}
                      onClick={() => handleSettingClick(key)}
                    />
                    <CaretRightFilled
                      className="icon-hover"
                      rotate={isActive ? 90 : 0}
                      style={{
                        fontSize: "14px",
                        cursor: "pointer",
                      }}
                    />
                  </div>
                )}
              >
                <Collapse.Panel
                  header={
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        padding: "2px 0",
                        fontSize: "10px",
                      }}
                    >
                      <div
                        style={{ flex: 1 }}
                      >{`Missing data in ${key} in ${province}`}</div>
                    </div>
                  }
                  key={key}
                  style={{
                    backgroundColor: "#f7f7f7",
                    padding: "5px",
                    marginBottom: "5px",
                    borderRadius: "5px",
                  }}
                  className="panel-header"
                >
                  <List
                    size="small"
                    dataSource={issues}
                    renderItem={(issue) => (
                      <List.Item style={{ fontSize: "10px", padding: "2px 0" }}>
                        - {issue}
                      </List.Item>
                    )}
                  />
                </Collapse.Panel>
              </Collapse>
            </div>
          );
        }}
      />
    </div>
  );

  const warningsContent = (
    <div style={{ maxHeight: "300px", overflowY: "auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "5px", // Add spacing between buttons and the list
        }}
      >
        <span style={{ fontSize: "10px" }}>
          {warnings.length > 0
            ? `${warnings.length} referrences of ECC/CNC found`
            : "No ECC/CNC for repair"}
        </span>
        <div style={{ textAlign: "right", marginTop: "1px" }}>
          <Button
            onClick={() => setWarningsPage((prevPage) => prevPage - 1)}
            disabled={warningsPage === 1}
            style={{
              marginRight: "4px", // Reduce margin for smaller spacing
              padding: "0 6px", // Smaller padding for a compact button
              fontSize: "10px", // Smaller font size
              height: "20px", // Reduce height
              lineHeight: "22px", // Align text vertically
            }}
            size="small"
            type="primary"
          >
            <CaretLeftFilled />
          </Button>
          <Button
            onClick={() => setWarningsPage((prevPage) => prevPage + 1)}
            disabled={warningsPage * itemsPerPage >= warnings.length}
            style={{
              padding: "0 6px", // Smaller padding for a compact button
              fontSize: "10px", // Smaller font size
              height: "20px", // Reduce height
              lineHeight: "22px", // Align text vertically
            }}
            size="small"
            type="primary"
          >
            <CaretRightFilled />
          </Button>
        </div>
      </div>
      <List
        dataSource={paginatedWarnings}
        renderItem={(warning, index) => (
          <div key={index}>
            <Collapse
              bordered={false}
              expandIcon={({ isActive }) => (
                <div style={{ display: "flex", alignItems: "center" }}>
                  <SettingOutlined
                    className="icon-hover"
                    style={{
                      fontSize: "14px",
                      cursor: "pointer",
                      marginRight: "8px",
                    }}
                    onClick={() => handleRepairClick(warning)}
                  />
                  <CaretRightFilled
                    className="icon-hover"
                    rotate={isActive ? 90 : 0}
                    style={{
                      fontSize: "14px",
                      cursor: "pointer",
                    }}
                  />
                </div>
              )}
            >
              <Collapse.Panel
                header={
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      padding: "2px 0",
                      fontSize: "10px", // Match font size with notificationsContent
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      {`Ref No.: ${warning.ecc_cnc} appeared (${warning.count}) times`}
                    </div>
                  </div>
                }
                key={warning.ecc_cnc}
                style={{
                  backgroundColor: "#f7f7f7",
                  padding: "5px",
                  marginBottom: "5px",
                  borderRadius: "5px",
                }}
                className="panel-header"
              >
                <List
                  size="small"
                  dataSource={[...warning.idNos].sort()}
                  renderItem={(id_no) => (
                    <List.Item style={{ fontSize: "10px", padding: "2px 0" }}>
                      - {id_no}
                    </List.Item>
                  )}
                />
              </Collapse.Panel>
            </Collapse>
          </div>
        )}
      />
    </div>
  );

  // Render messages content (placeholder for future use)
  const messagesContent = (
    <div style={{ maxHeight: "300px", overflowY: "auto" }}>
      <p style={{ fontSize: "12px", textAlign: "center" }}>
        No messages available.
      </p>
    </div>
  );

  // Render the popover content with tabs
  const popoverContent = (
    <Tabs defaultActiveKey="1" size="small">
      <TabPane tab="Notifications" key="1">
        {notificationsContent}
      </TabPane>
      <TabPane tab="Warnings" key="2">
        {warningsContent}
      </TabPane>
      <TabPane tab="Messages" key="3">
        {messagesContent}
      </TabPane>
    </Tabs>
  );

  return (
    <>
      <Popover
        content={popoverContent}
        trigger="click"
        placement="bottomRight"
        overlayStyle={{ width: "300px" }}
      >
        <Badge
          count={
            isLoading ? (
              <LoadingOutlined
                style={{
                  fontSize: "11px",
                  color: "white", // Optional: Customize the color
                  backgroundColor: "green", // White background for visibility
                  borderRadius: "50%", // Circular background
                  padding: "5px",
                }}
              />
            ) : (
              notifications.length
            )
          }
          offset={[1, 0]}
          size="small"
          style={{
            marginRight: "15px",
            fontSize: "8px",
            padding: "1px",
            backgroundColor: isLoading
              ? "#d9d9d9" // Gray background while loading
              : notifications.length > 0
              ? "green"
              : "#d9d9d9",
          }}
        >
          <BellOutlined
            className={`notification-icon ${
              theme === "dark" ? "dark-theme" : "light-theme"
            }`}
          />
        </Badge>
      </Popover>

      {/* ProvinceModal styled as a modal */}
      <Modal
        open={isModalVisible}
        title={
          <div className="modal-title-container">
            <span className="modal-title" style={{ whiteSpace: "normal" }}>
              Record ID: {selectedRecord?.id_no || "Unknown"}
            </span>
            <span
              className="modal-title"
              style={{
                whiteSpace: "normal",
                textAlign: "center",
                width: "50%",
              }}
            >
              {selectedRecord?.title || ""}
            </span>
            <span
              className="modal-title"
              style={{
                whiteSpace: "normal",
                textAlign: "right",
                marginRight: "20px",
              }}
            >
              {selectedRecord?.ecc_cnc || ""}
            </span>
          </div>
        }
        onCancel={handleCloseModal}
        width={1100}
        footer={null}
      >
        {selectedRecord && (
          <ProvinceModal record={selectedRecord} onClose={handleCloseModal} />
        )}
      </Modal>

      <Modal
        open={isRepairModalVisible}
        title={`Repair Warning for ${selectedWarning?.ecc_cnc || "Unknown"}`}
        onCancel={handleCloseRepairModal}
        footer={null}
        width={600}
      >
        {selectedWarning && (
          <div>
            <h4 style={{ fontSize: "12px", marginBottom: "10px" }}>
              ECC/CNC: {selectedWarning.ecc_cnc}
            </h4>
            <List
              size="small"
              header={<div style={{ fontWeight: "bold" }}>ID Numbers</div>}
              dataSource={[...selectedWarning.idNos].sort()} // Sort the id_no values
              renderItem={(id_no) => (
                <List.Item style={{ fontSize: "12px", padding: "2px 0" }}>
                  - {id_no}
                </List.Item>
              )}
            />
          </div>
        )}
      </Modal>
    </>
  );
};

export default NotificationsPopover;
