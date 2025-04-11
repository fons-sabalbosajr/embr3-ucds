import React, { useState, useMemo, useEffect } from "react";
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
import { formatDistanceToNow } from "date-fns";
import ProvinceModal from "../../menu-province/ProvinceModal";
import DuplicateNotif from "../DuplicateNotification/DuplicateNotif";
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
  const [isDuplicateModalVisible, setIsDuplicateModalVisible] = useState(false);
  const [selectedDuplicate, setSelectedDuplicate] = useState(null);
  const [updatedNotifications, setUpdatedNotifications] =
    useState(notifications); // Store updated notifications
  const [issues, setIssues] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [loading, setLoading] = useState(true); // Loading state

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
    return updatedNotifications.reduce((acc, notification) => {
      if (typeof notification === "string") {
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
      return acc;
    }, {});
  }, [updatedNotifications]);

  useEffect(() => {
    const fetchIssues = async () => {
      try {
        const res = await fetch("http://localhost:8081/api/check-data", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        });

        const data = await res.json();

        if (!data || !data.issues) {
          console.error("Invalid response format", data);
          return;
        }

        setIssues(data.issues); // Optional: if you're still using this
        setUpdatedNotifications(data.issues); // ✅ Drive the memoized groupedNotifications
        setLoading(false); // ✅ Done loading
      } catch (error) {
        console.error("Error fetching issues:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchIssues();

    const interval = setInterval(() => {
      fetchIssues();
    }, 10000); // 10 seconds
  
    return () => clearInterval(interval); // Cleanup on unmount
  }, []);



  const computedWarnings = useMemo(() => {
    const eccCncMap = {};

    notifications.forEach((notification) => {
      if (typeof notification === "object" && notification.ecc_cnc) {
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

  const paginatedWarnings = useMemo(() => {
    const start = (warningsPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return computedWarnings.slice(start, end);
  }, [computedWarnings, warningsPage]);

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

  const handleSettingClick = async (id_no) => {
    try {
      // Fetch the full record data from the correct API endpoint
      const response = await fetch(
        `http://localhost:8081/api/ucds-data/${id_no}`
      );
      const data = await response.json();

      if (response.ok) {
        // Set the selected record with the full data
        setSelectedRecord({
          id_no: data.id_no,
          title: data.title,
          ecc_cnc: data.ecc_cnc,
        });
        setIsModalVisible(true); // Open the modal
      } else {
        console.error("Error fetching record:", data.message);
      }
    } catch (error) {
      console.error("Error fetching record:", error);
    }
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

  const handleDuplicateClick = (warning) => {
    setSelectedDuplicate(warning); // Set the selected duplicate warning
    setIsDuplicateModalVisible(true); // Open the duplicate modal
  };

  const handleCloseDuplicateModal = () => {
    if (selectedDuplicate) {
      setWarnings((prevWarnings) =>
        prevWarnings.filter(
          (warning) => warning.ecc_cnc !== selectedDuplicate.ecc_cnc
        )
      ); // Remove the resolved warning
    }
    setIsDuplicateModalVisible(false); // Close the duplicate modal
    setSelectedDuplicate(null); // Clear the selected duplicate
  };

  const handleDuplicateResolved = (resolvedId) => {
    setWarnings((prevWarnings) =>
      prevWarnings.filter((warning) =>
        !warning.idNos.includes(resolvedId)
      )
    );
  
    // Optionally close the modal if needed
    setIsDuplicateModalVisible(false);
    setSelectedDuplicate(null);
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
        <span
          style={{
            fontSize: "10px",
            backgroundColor: "green",
            padding: "2px 4px",
            borderRadius: "4px",
            color: "white",
          }}
        >
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
        dataSource={[...paginatedKeys]
          .map((key) => {
            const doc = notifications.find((n) => n.id_no === key);
            return {
              id_no: key,
              doc,
              province: groupedNotifications[key]?.province || "Unknown",
              issues: groupedNotifications[key]?.issues || [],
              dateAdded: doc?._id
                ? new Date(
                    parseInt(doc._id.toString().substring(0, 8), 16) * 1000
                  )
                : null,
            };
          })
          .sort((a, b) => {
            const extract = (val) => {
              const match = val.match(/^([A-Za-z]+)[-]?(\d+)$/);
              return match ? [match[1], parseInt(match[2], 10)] : [val, 0];
            };
            const [prefixA, numA] = extract(a.id_no);
            const [prefixB, numB] = extract(b.id_no);
            return prefixA === prefixB
              ? numA - numB
              : prefixA.localeCompare(prefixB);
          })}
        renderItem={({ id_no, province, issues, dateAdded }) => (
          <div key={id_no}>
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
                    onClick={() => handleSettingClick(id_no)}
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
                      flexDirection: "column",
                      padding: "2px 0",
                      fontSize: "10px",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      {`Missing data in ${id_no} in ${province}`}
                    </div>
                    {dateAdded && (
                      <div
                        style={{
                          fontSize: "8px",
                          color: "#888",
                          marginTop: "2px",
                          textAlign: "left",
                        }}
                      >
                        {`${formatDistanceToNow(dateAdded, {
                          addSuffix: true,
                        })}`}
                      </div>
                    )}
                  </div>
                }
                key={id_no}
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
        )}
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
          marginBottom: "5px",
        }}
      >
        <span
          style={{
            fontSize: "10px",
            backgroundColor: "#FFD662",
            padding: "2px 4px",
            borderRadius: "4px",
          }}
        >
          {computedWarnings.length > 0
            ? `${computedWarnings.length} references of ECC/CNC found`
            : "No ECC/CNC for repair"}
        </span>
        <div style={{ textAlign: "right", marginTop: "1px" }}>
          <Button
            onClick={() => setWarningsPage((prevPage) => prevPage - 1)}
            disabled={warningsPage === 1}
            style={{
              marginRight: "4px",
              padding: "0 6px",
              fontSize: "10px",
              height: "20px",
              lineHeight: "22px",
            }}
            size="small"
            type="primary"
          >
            <CaretLeftFilled />
          </Button>
          <Button
            onClick={() => setWarningsPage((prevPage) => prevPage + 1)}
            disabled={warningsPage * itemsPerPage >= computedWarnings.length}
            style={{
              padding: "0 6px",
              fontSize: "10px",
              height: "20px",
              lineHeight: "22px",
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
                    onClick={() => handleDuplicateClick(warning)}
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
        open={isDuplicateModalVisible}
        title={`Duplicate Records for ${
          selectedDuplicate?.ecc_cnc || "Unknown"
        }`}
        onCancel={handleCloseDuplicateModal}
        footer={null}
        width={1000}
      >
        {selectedDuplicate && (
          <DuplicateNotif
            duplicateData={selectedDuplicate}
            onDuplicateResolved={(resolvedId) =>
              handleDuplicateResolved(resolvedId)
            }
            setWarnings={setWarnings}
          />
        )}
      </Modal>
    </>
  );
};

export default NotificationsPopover;
