import React, { useState, useMemo, useEffect } from "react";
import {
  Popover,
  Badge,
  List,
  // Spin, // Spin might not be needed if isLoading prop handles it
  Spin, // Import Spin for loading indicator
  Collapse,
  Button,
  Empty,
  Modal,
  Tabs,
  Tag,
  Typography,
} from "antd";
import {
  BellOutlined,
  CaretRightFilled,
  CaretLeftFilled,
  ExclamationCircleOutlined,
  FileExclamationOutlined,
  MailOutlined,
  ReloadOutlined,
  SettingOutlined,
  UserAddOutlined,
  RobotOutlined,
  FileSearchOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
// import { formatDistanceToNow } from "date-fns"; // Removed as dateAdded is not used
// Known boundary debt: a shared notification popover opens a UCDS screen.
// Tracked in docs/UNIFICATION-PLAN.md.
// eslint-disable-next-line no-restricted-imports
import ProvinceModal from "../../modules/ucds/province/ProvinceModal";
import DuplicateNotif from "../DuplicateNotification/DuplicateNotif";
import DeviceNoticesToggle from "../../shared/notifications/DeviceNoticesToggle";
import "./popovernotification.css";

const { Panel } = Collapse;

// An action item's icon and colour, by kind: what it is at a glance, with the
// words beside it so colour never carries the meaning alone.
const ITEM_LOOK = {
  "erms-message": [MailOutlined, "blue"],
  "erms-review": [ExclamationCircleOutlined, "red"],
  "erms-legal-scan": [FileExclamationOutlined, "orange"],
  "erms-lab-scan": [FileExclamationOutlined, "orange"],
  "admin-signup": [UserAddOutlined, "green"],
  "vera-corrections": [RobotOutlined, "purple"],
  "vera-links": [RobotOutlined, "purple"],
  "portal-decide": [FileSearchOutlined, "gold"],
  "portal-chat": [MailOutlined, "blue"],
};

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
  ermsNotifications = [],
  theme,
  isLoading, // Prop from Universe.jsx
  currentUser,
  refreshNotifications,
  domains = [],
}) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [warningsPage, setWarningsPage] = useState(1);
  const [isDuplicateModalVisible, setIsDuplicateModalVisible] = useState(false);
  const [selectedDuplicate, setSelectedDuplicate] = useState(null);
  // Granular state for internal processing and processed data
  const [isProcessingNotifications, setIsProcessingNotifications] =
    useState(false);
  const [isProcessingWarnings, setIsProcessingWarnings] = useState(false);
  const [processedGroupedNotifications, setProcessedGroupedNotifications] =
    useState({});
  const [processedComputedWarnings, setProcessedComputedWarnings] = useState(
    []
  );
  const [refreshTrigger, setRefreshTrigger] = useState("initial"); // 'initial', 'archive'

  const canSeeAllNotifications = ["developer", "admin"].includes(String(currentUser?.role || "").toLowerCase());

  // Determine which province prefixes the user can see. Developers and legacy
  // administrators keep the full notification stream; end users get only the
  // provinces their account can view or edit.
  const allowedNotificationPrefixes = useMemo(() => {
    if (canSeeAllNotifications) return Object.keys(prefixToProvince);
    if (!currentUser?.provinceStringPermissions) return [];
    const prefixes = [];
    for (const [provinceNameKey, permission] of Object.entries(
      currentUser.provinceStringPermissions
    )) {
      if (permission === "readWrite" || permission === "view") {
        for (const [prefix, name] of Object.entries(prefixToProvince)) {
          // Normalize both names for comparison (e.g., "Nueva Ecija" vs "nuevaEcija")
          if (
            name.toLowerCase().replace(/ /g, "").replace(/_/g, "") ===
            provinceNameKey.toLowerCase()
          ) {
            prefixes.push(prefix);
            break;
          }
        }
      }
    }
    return prefixes;
  }, [canSeeAllNotifications, currentUser?.provinceStringPermissions]);

  useEffect(() => {
    if (isLoading) {
      // If parent is loading, don't start internal processing
      setIsProcessingNotifications(false);
      setIsProcessingWarnings(false);
      setProcessedGroupedNotifications({}); // Clear processed data
      setProcessedComputedWarnings([]); // Clear processed data
      setRefreshTrigger("initial"); // Reset trigger
      return;
    }

    if (notifications && notifications.length > 0) {
      if (refreshTrigger === "initial") {
        setIsProcessingNotifications(true);
      }
      setIsProcessingWarnings(true); // Always set warnings to processing initially

      // Defer heavy processing to allow UI to update (e.g., show "Processing..." spinner)
      const timerId = setTimeout(() => {
        if (refreshTrigger === "initial") {
          // Process Notifications (Missing Data Issues). The register check
          // arrives grouped: one entry per establishment with the numbers of
          // the fields it lacks (see Universe.jsx). The labels are looked up
          // only for the page on show, not for all 17,000 records at once.
          // Plain strings ("ID - Missing 'X'") are still understood.
          const localGroupedNotifications = {};
          for (const n of notifications) {
            if (n && typeof n === "object" && n.id_no && Array.isArray(n.missing)) {
              const idPrefix = String(n.id_no).split("-")[0]?.toUpperCase();
              if (!allowedNotificationPrefixes.includes(idPrefix)) continue;
              localGroupedNotifications[n.id_no] = {
                province: prefixToProvince[idPrefix] || "Unknown Province",
                issues: n.missing,
                fields: n.fields,
              };
            } else if (typeof n === "string") {
              const [id_no, issue] = n.split(" - ");
              const idPrefix = id_no.split("-")[0]?.toUpperCase();
              if (!allowedNotificationPrefixes.includes(idPrefix)) continue;
              const entry = (localGroupedNotifications[id_no] ||= {
                province: prefixToProvince[idPrefix] || "Unknown Province",
                issues: [],
              });
              entry.issues.push(issue);
            }
          }
          setProcessedGroupedNotifications(localGroupedNotifications);
          setIsProcessingNotifications(false); // Notifications processing done
        }

        // Process Warnings (Duplicate ECC/CNC)
        // This part always runs if notifications change, as duplicates might have been resolved
        // or new ones appeared.
        const localComputedWarnings = notifications
          .filter(
            (n) => typeof n === "object" && n.ecc_cnc && Array.isArray(n.idNos)
          )
          .filter((dup) => {
            return dup.idNos.some((idNo) => {
              const idPrefix = String(idNo).split("-")[0]?.toUpperCase();
              return allowedNotificationPrefixes.includes(idPrefix);
            });
          })
          .map((dup) => ({
            ecc_cnc: dup.ecc_cnc,
            idNos: [...new Set(dup.idNos)],
            count: dup.count,
          }));
        setProcessedComputedWarnings(localComputedWarnings);
        setIsProcessingWarnings(false); // Warnings processing done

        if (refreshTrigger === "archive") {
          setRefreshTrigger("initial"); // Reset trigger after archive-specific processing
        }
      }, 0); // setTimeout with 0ms delay

      return () => clearTimeout(timerId); // Cleanup timeout
    } else {
      // If no notifications or isLoading is false but notifications are empty
      setProcessedGroupedNotifications({});
      setProcessedComputedWarnings([]);
      setIsProcessingNotifications(false);
      setIsProcessingWarnings(false);
      setRefreshTrigger("initial"); // Reset trigger
    }
  }, [
    notifications,
    isLoading,
    allowedNotificationPrefixes,
    refreshTrigger,
    prefixToProvince,
  ]);

  const groupedKeys = useMemo(
    () => Object.keys(processedGroupedNotifications),
    [processedGroupedNotifications]
  );

  const paginatedKeys = useMemo(
    () =>
      groupedKeys.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
      ),
    [groupedKeys, currentPage, itemsPerPage]
  );

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

  const handleSettingClick = (notificationIdNo) => {
    // notificationIdNo is the ID (e.g., "AU-001") extracted from the notification string.
    // It's assumed that this notificationIdNo is also the 'sort_key'
    // that ProvinceModal will use to fetch detailed data via the API endpoint
    // /api/ucds-data/by-sort-key/:sort_key.
    setSelectedRecord({ id_no: notificationIdNo, sort_key: notificationIdNo });
    setIsModalVisible(true);
    // ProvinceModal will receive this selectedRecord and should use its 'sort_key' property for the API call.
    // The ProvinceModal component will now use the passed 'sort_key' to fetch its own data.
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
    setRefreshTrigger("archive"); // Set trigger before calling refresh
    if (refreshNotifications) {
      await refreshNotifications(); // Trigger refetch in parent
    }
  };

  const screenHeight = window.innerHeight;
  const screenWidth = window.innerWidth;

  // Set dynamic limits based on screen resolution
  const maxPopoverHeight = Math.min(440, screenHeight * 0.5); // Use 50% of screen height or 440px max
  // const popoverWidth = Math.min(360, screenWidth * 0.3); // This is no longer needed.
  
  const notificationsContent = (
    <div style={{ maxHeight: "700px", overflowY: "auto" }}>
      {isLoading || isProcessingNotifications ? (
        <div style={{ textAlign: "center", padding: "20px" }}>
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
              style={{
                textAlign: "right",
                marginTop: "1px",
                marginRight: "10px",
              }}
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
                const entry = processedGroupedNotifications[key];
                return {
                  id_no: key,
                  province: entry?.province || "Unknown",
                  // Field numbers become their labels here, for this page only.
                  issues: (entry?.issues || []).map((i) =>
                    typeof i === "number" ? `Missing '${entry.fields?.[i] ?? i}'` : i
                  ),
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
            renderItem={({ id_no, province, issues }) => (
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
    <div
      className="warnings-popover"
      style={{
        maxHeight: `${maxPopoverHeight}px`,
        overflowY: "auto",
        padding: "10px",
        backgroundColor: theme === "dark" ? "#1e1e1e" : "#ffffff",
        color: theme === "dark" ? "#e0e0e0" : "#333333",
        borderRadius: "8px",
      }}
    >
      {isLoading || isProcessingWarnings ? (
        <div style={{ textAlign: "center", padding: "20px" }}>
          <Spin
            tip={isLoading ? "Fetching data..." : "Processing warnings..."}
          />
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
              style={{
                textAlign: "right",
                marginTop: "1px",
                marginRight: "10px",
              }}
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
                    warningsPage * itemsPerPage <
                    processedComputedWarnings.length
                      ? prevPage + 1
                      : prevPage
                  )
                }
                disabled={
                  warningsPage * itemsPerPage >=
                  processedComputedWarnings.length
                }
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

  // The action items, grouped as the bell shows them.
  const actionGroup = (group) => (
    <div className="notifications-popover-panel">
      {ermsNotifications.filter((i) => i.group === group).length ? (
        <List
          size="small"
          dataSource={ermsNotifications.filter((i) => i.group === group)}
          renderItem={(item) => {
            const [Icon, color] = ITEM_LOOK[item.type] || [BellOutlined, "default"];
            return (
              <List.Item
                className="notification-action-item"
                style={{ cursor: "pointer", padding: "10px 8px", borderRadius: 8 }}
                onClick={() => {
                  setOpen(false);
                  navigate(item.href);
                }}
                actions={[<Tag key="n" color={color} style={{ marginInlineEnd: 0 }}>{item.count > 999 ? "999+" : item.count}</Tag>]}
              >
                <List.Item.Meta
                  avatar={<Icon style={{ fontSize: 18, marginTop: 3 }} />}
                  title={<Typography.Text strong style={{ fontSize: 13 }}>{item.title}</Typography.Text>}
                  description={<Typography.Text type="secondary" style={{ fontSize: 12 }}>{item.description}</Typography.Text>}
                />
              </List.Item>
            );
          }}
        />
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing waiting for you here." />
      )}
    </div>
  );

  // Only the areas this account works in. The Developer holds every domain
  // and unit, so sees every tab; a Legal officer sees ERMS alone; a Planning
  // encoder sees the register.
  const hasUcds = domains.includes("ucds");
  const hasErms = domains.includes("erms");
  const hasAdmin = ermsNotifications.some((i) => i.group === "Admin");
  // The Document Portal is everyone's, so its tab shows whenever it has something.
  const portalCount = ermsNotifications.filter((i) => i.group === "Document Portal").length;
  const registerCount = groupedKeys.length;
  const duplicateCount = processedComputedWarnings.length;
  const ermsCount = ermsNotifications.filter((i) => i.group === "ERMS").length;
  const label = (text, n) => (
    <span>
      {text}
      {n ? <Badge count={n} size="small" overflowCount={99} style={{ marginInlineStart: 6 }} /> : null}
    </span>
  );
  const tabItems = [
    portalCount > 0 && { key: "portal", label: label("Portal", portalCount), children: actionGroup("Document Portal") },
    hasErms && { key: "erms", label: label("ERMS", ermsCount), children: actionGroup("ERMS") },
    hasUcds && { key: "register", label: label("Register", registerCount), children: notificationsContent },
    hasUcds && { key: "duplicates", label: label("Duplicates", duplicateCount), children: warningsContent },
    hasAdmin && { key: "admin", label: label("Admin", ermsNotifications.filter((i) => i.group === "Admin").length), children: actionGroup("Admin") },
  ].filter(Boolean);
  // Open on the first tab with something in it.
  const firstBusy = tabItems.find((t) => (t.key === "erms" ? ermsCount : t.key === "register" ? registerCount : t.key === "duplicates" ? duplicateCount : t.key === "portal" ? portalCount : 1))?.key;
  const activeTab = tabItems.some((t) => t.key === tab) ? tab : firstBusy || tabItems[0]?.key;
  const total = registerCount + duplicateCount + ermsNotifications.length;
  const busy = isLoading || isProcessingNotifications || isProcessingWarnings;

  const popoverContent = (
    <div style={{ width: 380 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, paddingBottom: 6 }}>
        <div>
          <Typography.Text strong style={{ fontSize: 15 }}>Notifications</Typography.Text>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              {canSeeAllNotifications ? "Everything across the system" : "For what your account can act on"}
            </Typography.Text>
          </div>
        </div>
        <Button size="small" type="text" icon={<ReloadOutlined spin={busy} />} onClick={() => refreshNotifications?.()} aria-label="Refresh notifications" />
      </div>
      {tabItems.length ? (
        <Tabs size="small" activeKey={activeTab} onChange={setTab} items={tabItems} />
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No notifications for your account." />
      )}
      <DeviceNoticesToggle />
    </div>
  );

  return (
    <>
      <Popover
        content={popoverContent}
        trigger="click"
        placement="bottomRight"
        open={open}
        onOpenChange={setOpen}
        destroyOnHidden
        getPopupContainer={() => document.body}
      >
        {/* Wrap trigger in a native element so Popover can attach a ref without findDOMNode */}
        <span style={{ display: "inline-flex", alignItems: "center", cursor: "pointer" }}>
          {/* A small count in the button's top-right corner, ringed in the
              header colour so it reads as its own mark, not over the bell;
              99+ past 99, nothing while the counts are still being worked out. */}
          <Badge
            className="header-bell-badge"
            size="small"
            count={busy ? 0 : total}
            overflowCount={99}
            offset={[-3, 3]}
            title={`${total} notification${total === 1 ? "" : "s"}`}
          >
            <button type="button" aria-label="Notifications" className="header-control" style={{ cursor: "pointer" }}>
              <BellOutlined style={{ fontSize: 16 }} />
            </button>
          </Badge>
        </span>
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
