import React, { useState, useMemo, useEffect } from "react";
import {
  Popover,
  Badge,
  List,
  // Spin, // Spin might not be needed if isLoading prop handles it
  Spin, // Import Spin for loading indicator
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
// import { formatDistanceToNow } from "date-fns"; // Removed as dateAdded is not used
import ProvinceModal from "../../menu-province/ProvinceModal";
import DuplicateNotif from "../DuplicateNotification/DuplicateNotif";
import "./popovernotification.css";

const { Panel } = Collapse;
const { TabPane } = Tabs;

// Define prefixToProvince outside the component to make it a stable constant
const prefixToProvince = {
  AU: "Aurora",
  BA: "Bataan",
  BU: "Bulacan",
  NE: "Nueva Ecija",
  PA: "Pampanga",
  TA: "Tarlac",
  ZA: "Zambales",
};

const NotificationsPopover = ({
  notifications = [],
  theme,
  isLoading, // Prop from Universe.jsx
  currentUser,
  refreshNotifications, // New prop to trigger data refresh in parent
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [warningsPage, setWarningsPage] = useState(1);
  // const [isRepairModalVisible, setIsRepairModalVisible] = useState(false); // Removed
  const [isDuplicateModalVisible, setIsDuplicateModalVisible] = useState(false);
  const [selectedDuplicate, setSelectedDuplicate] = useState(null);
  
  // Granular state for internal processing and processed data
  const [isProcessingNotifications, setIsProcessingNotifications] = useState(false);
  const [isProcessingWarnings, setIsProcessingWarnings] = useState(false);
  const [processedGroupedNotifications, setProcessedGroupedNotifications] = useState({});
  const [processedComputedWarnings, setProcessedComputedWarnings] = useState([]);
  const [refreshTrigger, setRefreshTrigger] = useState('initial'); // 'initial', 'archive'

  // Determine which province prefixes the user has "readWrite" access to
  const allowedReadWriteProvincesPrefixes = useMemo(() => {
    if (!currentUser?.provinceStringPermissions) return [];
    const prefixes = [];
    for (const [provinceNameKey, permission] of Object.entries(currentUser.provinceStringPermissions)) {
       if (permission === 'readWrite') {
        for (const [prefix, name] of Object.entries(prefixToProvince)) {
          // Normalize both names for comparison (e.g., "Nueva Ecija" vs "nuevaEcija")
          if (name.toLowerCase().replace(/ /g, '').replace(/_/g, '') === provinceNameKey.toLowerCase()) {
            prefixes.push(prefix);
            break;
          }
        }
      }
    }
    return prefixes;
  }, [currentUser?.provinceStringPermissions, prefixToProvince]);

  useEffect(() => {
    if (isLoading) { // If parent is loading, don't start internal processing
      setIsProcessingNotifications(false);
      setIsProcessingWarnings(false);
      setProcessedGroupedNotifications({}); // Clear processed data
      setProcessedComputedWarnings([]);   // Clear processed data
      setRefreshTrigger('initial'); // Reset trigger
      return;
    }

    if (notifications && notifications.length > 0) {
      if (refreshTrigger === 'initial') {
        setIsProcessingNotifications(true);
      }
      setIsProcessingWarnings(true); // Always set warnings to processing initially

      // Defer heavy processing to allow UI to update (e.g., show "Processing..." spinner)
      const timerId = setTimeout(() => {
        if (refreshTrigger === 'initial') {
          // Process Notifications (Missing Data Issues)
          const localProvinceFilteredDataIssues = notifications
            .filter((notification) => typeof notification === "string")
            .filter((notificationString) => {
              const id_no = notificationString.split(" - ")[0];
              const idPrefix = id_no.split("-")[0]?.toUpperCase();
              return allowedReadWriteProvincesPrefixes.includes(idPrefix);
            });

          const localGroupedNotifications = localProvinceFilteredDataIssues.reduce((acc, notificationString) => {
            const parts = notificationString.split(" - ");
            const id_no = parts[0];
            const issue = parts[1];
            const idPrefix = id_no.split("-")[0]?.toUpperCase();
            const province = prefixToProvince[idPrefix] || "Unknown Province";
            if (!acc[id_no]) {
              acc[id_no] = { province, issues: [] };
            }
            acc[id_no].issues.push(issue);
            return acc;
          }, {});
          setProcessedGroupedNotifications(localGroupedNotifications);
          setIsProcessingNotifications(false); // Notifications processing done
        }

        // Process Warnings (Duplicate ECC/CNC)
        // This part always runs if notifications change, as duplicates might have been resolved
        // or new ones appeared.
        const localComputedWarnings = notifications
          .filter((n) => typeof n === "object" && n.ecc_cnc && Array.isArray(n.idNos))
          .filter(dup => {
            return dup.idNos.some(idNo => {
              const idPrefix = String(idNo).split("-")[0]?.toUpperCase();
              return allowedReadWriteProvincesPrefixes.includes(idPrefix);
            });
          })
          .map((dup) => ({
            ecc_cnc: dup.ecc_cnc,
            idNos: [...new Set(dup.idNos)],
            count: dup.count,
          }));
        setProcessedComputedWarnings(localComputedWarnings);
        setIsProcessingWarnings(false); // Warnings processing done

        if (refreshTrigger === 'archive') {
          setRefreshTrigger('initial'); // Reset trigger after archive-specific processing
        }
      }, 0); // setTimeout with 0ms delay

      return () => clearTimeout(timerId); // Cleanup timeout
    } else {
      // If no notifications or isLoading is false but notifications are empty
      setProcessedGroupedNotifications({});
      setProcessedComputedWarnings([]);
      setIsProcessingNotifications(false);
      setIsProcessingWarnings(false);
      setRefreshTrigger('initial'); // Reset trigger
    }
  }, [notifications, isLoading, allowedReadWriteProvincesPrefixes, refreshTrigger, prefixToProvince]);


  const groupedKeys = useMemo(() => Object.keys(processedGroupedNotifications), [processedGroupedNotifications]);

  const paginatedKeys = useMemo(() => groupedKeys.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  ), [groupedKeys, currentPage, itemsPerPage]);

  const paginatedWarnings = useMemo(() => {
    const start = (warningsPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return processedComputedWarnings.slice(start, end);
  }, [processedComputedWarnings, warningsPage, itemsPerPage]);

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
    setSelectedRecord({ id_no });
    setIsModalVisible(true);

    try {
      const response = await fetch(
        `http://localhost:8081/api/ucds-data/${id_no}`
      );
      const data = await response.json();

      if (response.ok) {
        setSelectedRecord((prev) => ({
          ...prev,
          title: data.title,
          ecc_cnc: data.ecc_cnc,
          ...data,
        }));
      } else {
        console.error("Error fetching record:", data.message);
      }
    } catch (error) {
      console.error("Error fetching record:", error);
    }
  };

  const handleCloseModal = () => {
    setIsModalVisible(false);
    setSelectedRecord(null);
  };

  const handleDuplicateClick = (warning) => {
    setSelectedDuplicate(warning);
    setIsDuplicateModalVisible(true);
  };

  const handleCloseDuplicateModal = () => {
    setIsDuplicateModalVisible(false);
    setSelectedDuplicate(null);
  };

  const handleDuplicateResolved = async (resolvedId) => {
    setIsDuplicateModalVisible(false);
    setSelectedDuplicate(null);
    setRefreshTrigger('archive'); // Set trigger before calling refresh
    if (refreshNotifications) {
      await refreshNotifications(); // Trigger refetch in parent
    }
  };

  const notificationsContent = (
    <div style={{ maxHeight: "700px", overflowY: "auto" }}>
      {isLoading || isProcessingNotifications ? (
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <Spin tip={isLoading ? "Fetching data..." : "Processing issues..."} />
        </div>
      ) : (
        <>
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
            <div
              style={{ textAlign: "right", marginTop: "1px", marginRight: "10px" }}
            >
              <Button
                onClick={goToPreviousPage}
                disabled={currentPage === 1}
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
                onClick={goToNextPage}
                disabled={currentPage * itemsPerPage >= groupedKeys.length}
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
            dataSource={[...paginatedKeys]
              .map((key) => {
                return {
                  id_no: key,
                  province: processedGroupedNotifications[key]?.province || "Unknown",
                  issues: processedGroupedNotifications[key]?.issues || [],
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
            renderItem={(
              { id_no, province, issues }
            ) => (
              <div key={id_no}>
                <Collapse
                  bordered={false}
                  expandIcon={({ isActive }) => (
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <SettingOutlined
                        className="icon-hover"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSettingClick(id_no);
                        }}
                        style={{ marginRight: "8px" }}
                      />
                      <CaretRightFilled
                        className="icon-hover"
                        rotate={isActive ? 90 : 0}
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
                          color: theme === "dark" ? "#ffffff" : "#000000",
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          {`Missing data in ${id_no} in ${province}`}
                        </div>
                      </div>
                    }
                    key={id_no}
                    style={{
                      backgroundColor: theme === "dark" ? "#333333" : "#f7f7f7",
                      marginBottom: "5px",
                      borderRadius: "5px",
                    }}
                    className="panel-header"
                  >
                    <List
                      size="small"
                      dataSource={issues}
                      renderItem={(issue) => (
                        <List.Item
                          style={{
                            fontSize: "10px",
                            padding: "2px 0",
                            color: theme === "dark" ? "#ffffff" : "#000000",
                          }}
                        >
                          - {issue}
                        </List.Item>
                      )}
                    />
                  </Collapse.Panel>
                </Collapse>
              </div>
            )}
          />
        </>
      )}
    </div>
  );

  const warningsContent = (
    <div style={{ maxHeight: "700px", overflowY: "auto" }}>
      {isLoading || isProcessingWarnings ? (
         <div style={{ textAlign: 'center', padding: '20px' }}>
          <Spin tip={isLoading ? "Fetching data..." : "Processing warnings..."} />
        </div>
      ) : (
        <>
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
                backgroundColor: theme === "dark" ? "#444444" : "#FFD662",
                padding: "2px 4px",
                borderRadius: "4px",
                color: theme === "dark" ? "#FFD662" : "#000000",
              }}
            >
              {processedComputedWarnings.length > 0
                ? `${processedComputedWarnings.length} references of ECC/CNC found`
                : "No ECC/CNC for repair"}
            </span>
            <div
              style={{ textAlign: "right", marginTop: "1px", marginRight: "10px" }}
            >
              <Button
                onClick={() =>
                  setWarningsPage((prevPage) => Math.max(1, prevPage - 1))
                }
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
                onClick={() =>
                  setWarningsPage((prevPage) =>
                    warningsPage * itemsPerPage < processedComputedWarnings.length
                      ? prevPage + 1
                      : prevPage
                  )
                }
                disabled={warningsPage * itemsPerPage >= processedComputedWarnings.length}
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
                          marginRight: "8px",
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDuplicateClick(warning);
                        }}
                      />
                      <CaretRightFilled
                        className="icon-hover"
                        rotate={isActive ? 90 : 0}
                        style={{
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
                          color: theme === "dark" ? "#ffffff" : "#000000",
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          {`Ref No.: ${warning.ecc_cnc} appeared (${warning.count}) times`}
                        </div>
                      </div>
                    }
                    key={warning.ecc_cnc}
                    style={{
                      backgroundColor: theme === "dark" ? "#333333" : "#f7f7f7",
                      marginBottom: "5px",
                      borderRadius: "5px",
                    }}
                    className="panel-header"
                  >
                    <List
                      size="small"
                      dataSource={[...warning.idNos].sort()}
                      renderItem={(id_no) => (
                        <List.Item
                          style={{
                            fontSize: "10px",
                            padding: "2px 0",
                            color: theme === "dark" ? "#ffffff" : "#000000",
                          }}
                        >
                          - {id_no}
                        </List.Item>
                      )}
                    />
                  </Collapse.Panel>
                </Collapse>
              </div>
            )}
          />
        </>
      )}
    </div>
  );

  const messagesContent = (
    <div style={{ maxHeight: "700px", overflowY: "auto" }}>
      {isLoading ? ( // Messages don't have separate client-side processing for now
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <Spin tip="Fetching data..." />
        </div>
      ) : (
        <p style={{ fontSize: "12px", textAlign: "center" }}>
          No messages available.
        </p>
      )}
    </div>
  );

  const popoverContent = (
    <Tabs defaultActiveKey="1" size="small" style={{width: '330px'}}>
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
        // styles={{ body: { width: "350px" } }} // width is now controlled by Tabs
      >
        <Badge
          count={
            isLoading || isProcessingNotifications || isProcessingWarnings ? ( // Reflect all loading states
              <LoadingOutlined
                style={{
                  fontSize: "8px",
                  color: "white",
                  backgroundColor: "green",
                  borderRadius: "50%",
                  padding: "5px",
                }}
              />
            ) : (
              groupedKeys.length + processedComputedWarnings.length // Use processed data for count
            )
          }
          offset={[1, 0]}
          size="small"
          style={{
            marginRight: "15px",
            fontSize: "8px",
            padding: "1px",
            backgroundColor: isLoading || isProcessingNotifications || isProcessingWarnings // Reflect all for background
              ? theme === "dark"
                ? "#444444"
                : "#d9d9d9"
              : groupedKeys.length + // Use processed data for color logic
                  processedComputedWarnings.length >
                0
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
            // setWarnings prop is removed
          />
        )}
      </Modal>
    </>
  );
};

export default NotificationsPopover;
