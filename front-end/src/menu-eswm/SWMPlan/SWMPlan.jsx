import React, { useEffect, useState, useMemo } from "react";
import {
  Table,
  Input,
  Select,
  Button,
  Pagination as AntPagination,
  Dropdown,
  Menu,
  Checkbox,
  Popover,
  Radio,
  Divider,
  Tooltip,
  Card,
  Row,
  Col,
  Space,
  Statistic,
  Spin,
  Progress,
  Tag,
  InputNumber,
  DatePicker, AutoComplete, ConfigProvider, message
} from "antd";
import ProvinceAutocomplete from "../../components/Autocomplete/Province";
import {
  ReloadOutlined,
  DownOutlined,
  SettingOutlined,
  SearchOutlined as AntSearchOutlined,
  ToolFilled,
  TableOutlined,
  EditOutlined,
  RollbackOutlined,
} from "@ant-design/icons";
import axios from "axios";
import dayjs from "dayjs";
// import Breakdown from "./Breakdown"; // Assuming a similar Breakdown component might be used or adapted
import "./swmplan.css";

const { TextArea } = Input;

// Example: Color coding for plan statuses (adapt as needed)
const planStatusBackgroundColor = (status) => {
  const normalizedStatus = String(status || "").toUpperCase().replace(/ /g, "_");
  switch (normalizedStatus) {
    case "APPROVED": return "#4CAF50"; // Green
    case "SUBMITTED": return "#2196F3"; // Blue
    case "FOR_REVISION": return "#FFC107"; // Amber
    case "EXPIRED": return "#F44336"; // Red
    case "DRAFT": return "#9E9E9E"; // Grey
    default: return "#B0BEC5"; // Default
  }
};

const DashboardTiles = ({
  theme,
  onPlanStatusSelect, // Example: Filter by plan status
  selectedPlanStatus,
  onProvinceFilterSelect, // Example: Filter by province (if applicable to dashboard tiles)
  selectedProvinceFilterValue,
  // Add other relevant props for SWM Plan dashboard interactions
  onViewBreakdownDetails, // For viewing detailed lists
}) => {
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    const fetchDashboardStats = async () => {
      setLoadingStats(true);
      try {
        // Replace with your SWM Plan stats API endpoint
        const response = await axios.get("http://10.14.77.100:8081/api/swm-plan-stats");
        setStats(response.data);
      } catch (error) {
        console.error("Error fetching SWM Plan dashboard stats:", error);
        setStats(null);
      } finally {
        setLoadingStats(false);
      }
    };
    fetchDashboardStats();
  }, []);

  const renderStyledSmallStatCard = (
    title, value, { cardClassName, cardStyle, statisticColorOverride, onClick, isActive } = {}
  ) => (
    <Card
      size="small"
      className={`dashboard-small-stat-card ${cardClassName || ""} ${onClick ? "clickable-card" : ""} ${isActive ? "active-filter" : ""}`}
      style={cardStyle}
      bodyStyle={{ padding: "4px 8px" }}
      onClick={onClick}
    >
      <Statistic
        title={title}
        value={value}
        valueStyle={{ fontSize: "11px", ...(statisticColorOverride && { color: statisticColorOverride }) }}
        titleStyle={{ fontSize: "10px", whiteSpace: "normal", lineHeight: "1.1", marginBottom: "1px", ...(statisticColorOverride && { color: statisticColorOverride })}}
      />
    </Card>
  );

  if (loadingStats) {
    return (
      <div className="loading-stats-container">
        <Progress percent={50} status="active" showInfo={false} strokeColor={{ from: "#108ee9", to: "#87d068" }} />
        <p>Loading SWM Plan dashboard statistics...</p>
      </div>
    );
  }

  if (!stats) {
    return <div className="failed-stats-message">Failed to load SWM Plan dashboard statistics.</div>;
  }

  // Example: Displaying total plans and breakdown by status
  const { totalPlans = 0, statusBreakdown = [], provinceBreakdown = [] } = stats;

  return (
    <div className="dashboard-tiles-container">
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6} lg={6}>
          <Card title="SWM Plan Overview" className="dashboard-tile-card">
            {renderStyledSmallStatCard("Total SWM Plans", totalPlans, {
              onClick: () => onViewBreakdownDetails({ type: "allPlans", label: "All SWM Plans" })
            })}
          </Card>
        </Col>

        <Col xs={24} sm={12} md={10} lg={10}>
          <Card title="Plans by Status" className="dashboard-tile-card">
            <Row gutter={[8,8]}>
              {statusBreakdown.length > 0 ? statusBreakdown.map(item => (
                <Col xs={12} sm={8} md={6} key={item.status}>
                  {renderStyledSmallStatCard(item.status, item.count, {
                    cardStyle: { backgroundColor: planStatusBackgroundColor(item.status), color: theme === 'dark' && planStatusBackgroundColor(item.status) !== "#B0BEC5" ? 'white' : 'black' },
                    onClick: () => onPlanStatusSelect(item.status),
                    isActive: selectedPlanStatus === item.status,
                    statisticColorOverride: theme === 'dark' && planStatusBackgroundColor(item.status) !== "#B0BEC5" ? 'white' : undefined
                  })}
                </Col>
              )) : <Col span={24}><div className="no-data-message">No status data</div></Col>}
            </Row>
          </Card>
        </Col>

        <Col xs={24} sm={24} md={8} lg={8}>
          <Card title="Plans by Province" className="dashboard-tile-card">
             <Row gutter={[8,8]}>
              {provinceBreakdown.length > 0 ? provinceBreakdown.map(item => (
                <Col xs={12} sm={8} md={6} key={item.province}>
                  {renderStyledSmallStatCard(item.province, item.count, {
                    // Add styling/onClick for province tiles if needed
                     onClick: () => onProvinceFilterSelect(item.province), // Example action
                     isActive: selectedProvinceFilterValue === item.province,
                  })}
                </Col>
              )) : <Col span={24}><div className="no-data-message">No province data</div></Col>}
            </Row>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

const SWMPlan = ({ theme = "light" }) => {
  const [data, setData] = useState([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [tableScrollY, setTableScrollY] = useState(0);
  const [frozenColumnKeys, setFrozenColumnKeys] = useState(["planId", "lguName"]); // Example default frozen
  const [currentTableSize, setCurrentTableSize] = useState("small");
  const [isTableBordered, setIsTableBordered] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProvince, setSelectedProvince] = useState(null);
  const [allProvinces, setAllProvinces] = useState([]);
  const [visibleColumnKeys, setVisibleColumnKeys] = useState([]);
  const [selectedPlanStatus, setSelectedPlanStatus] = useState(null); // For SWM Plan status filter
  // Add other SWM-specific filters here, e.g., selectedLGULevel

  const [isColumnVisibilityDropdownOpen, setIsColumnVisibilityDropdownOpen] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [inputValue, setInputValue] = useState(searchTerm);
  const [isFreezeDropdownOpen, setIsFreezeDropdownOpen] = useState(false);
  const [editingRowKeys, setEditingRowKeys] = useState([]);
  const [editedData, setEditedData] = useState({});
  const [initialBaseColumnKeys, setInitialBaseColumnKeys] = useState(null);
  const [columnFilters, setColumnFilters] = useState({});

  // State for Breakdown modal (if used)
  const [showBreakdownModal, setShowBreakdownModal] = useState(false);
  const [breakdownCriteria, setBreakdownCriteria] = useState({ type: null, label: null });

  const fetchData = async (
    page = 1,
    pageSize = 20,
    search = "",
    province = null,
    planStatus = null, // SWM Plan status filter
    // Add other SWM-specific filter params
    currentColumnFilters = {}
  ) => {
    setLoading(true);
    try {
      const res = await axios.get("http://10.14.77.100:8081/api/swm-plan-data", {
        params: {
          page,
          pageSize,
          search,
          province,
          planStatus, // Pass SWM Plan status
          // Pass other SWM-specific filters
          ...currentColumnFilters,
        },
      });
      setData(res.data.data.map(item => ({ ...item, key: item._id || item.planId }))); // Ensure unique key
      setTotal(res.data.total);
      setPagination({ current: page, pageSize });
    } catch (err) {
      console.error("Failed to fetch SWM Plan data", err);
      message.error("Failed to fetch SWM Plan data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(
      pagination.current,
      pagination.pageSize,
      searchTerm,
      selectedProvince,
      selectedPlanStatus,
      // Pass other SWM-specific filter states
      columnFilters
    );
  }, [
    pagination.current,
    pagination.pageSize,
    searchTerm,
    selectedProvince,
    selectedPlanStatus,
    // Add other SWM-specific filter states
    columnFilters,
  ]);

  useEffect(() => {
    const staticProvincesList = ["Aurora", "Bataan", "Bulacan", "Nueva Ecija", "Pampanga", "Tarlac", "Zambales"];
    setAllProvinces(staticProvincesList.sort());
  }, []);

  useEffect(() => {
    const calculateTableHeight = () => {
      const windowHeight = window.innerHeight;
      const fixedInternalHeight = 48 + 48 + 40 + 20 + 150; // Adjusted for dashboard height
      const externalBuffer = 115;
      const dynamicHeight = windowHeight - fixedInternalHeight - externalBuffer;
      setTableScrollY(Math.max(200, dynamicHeight));
    };
    calculateTableHeight();
    window.addEventListener("resize", calculateTableHeight);
    return () => window.removeEventListener("resize", calculateTableHeight);
  }, []);

  useEffect(() => {
    setInputValue(searchTerm);
  }, [searchTerm]);

  const handleShowBreakdownDetails = (criteria) => {
    setBreakdownCriteria(criteria);
    setShowBreakdownModal(true);
  };

  const handleCloseBreakdownModal = () => {
    setShowBreakdownModal(false);
  };

  // Define baseColumns for SWMPlan
  // These are examples and need to be adjusted based on your swmplanCollection schema
  const baseColumns = useMemo(
    () => [
      { title: "Plan ID", dataIndex: "planId", key: "planId", width: 100, sorter: (a, b) => String(a.planId).localeCompare(String(b.planId)), onHeaderCell: () => ({ className: "table-header-center" }) },
      { title: "LGU Name", dataIndex: "lguName", key: "lguName", width: 200, dataType: "textarea", sorter: (a, b) => String(a.lguName).localeCompare(String(b.lguName)), onHeaderCell: () => ({ className: "table-header-center" }) },
      { title: "Province", dataIndex: "province", key: "province", width: 150, dataType: "custom_autocomplete_province", sorter: (a, b) => String(a.province).localeCompare(String(b.province)), onHeaderCell: () => ({ className: "table-header-center" }) },
      { title: "Plan Status", dataIndex: "status", key: "status", width: 150, dataType: "text", sorter: (a, b) => String(a.status).localeCompare(String(b.status)), onHeaderCell: () => ({ className: "table-header-center" }) },
      { title: "Year Submitted", dataIndex: "yearSubmitted", key: "yearSubmitted", width: 120, dataType: "number", onHeaderCell: () => ({ className: "table-header-center" }) },
      { title: "Date Approved", dataIndex: "dateApproved", key: "dateApproved", width: 150, dataType: "date", onHeaderCell: () => ({ className: "table-header-center" }) },
      { title: "Type of LGU", dataIndex: "typeOfLGU", key: "typeOfLGU", width: 120, dataType: "text", onHeaderCell: () => ({ className: "table-header-center" }) },
      { title: "Date of Submission", dataIndex: "submissionDate", key: "submissionDate", width: 150, dataType: "date", onHeaderCell: () => ({ className: "table-header-center" }) },
      { title: "Remarks", dataIndex: "remarks", key: "remarks", width: 250, dataType: "textarea", onHeaderCell: () => ({ className: "table-header-center" }) },
      // Add more columns as needed for SWM Plan data
    ],
    [editingRowKeys, editedData] // Add other dependencies if column definitions change dynamically
  );

  // Server-side column filtering setup
  const getColumnSearchProps = (dataIndex, columnTitle) => ({
    filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => (
      <div style={{ padding: 8 }} onKeyDown={(e) => e.stopPropagation()}>
        <Input
          placeholder={`Search ${columnTitle}`}
          value={selectedKeys[0]}
          onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
          onPressEnter={confirm}
          style={{ marginBottom: 8, display: "block" }}
        />
        <Space>
          <Button type="primary" onClick={confirm} size="small" style={{ width: 90 }}>Search</Button>
          <Button onClick={() => { clearFilters && clearFilters(); confirm(); }} size="small" style={{ width: 90 }}>Reset</Button>
        </Space>
      </div>
    ),
    filterIcon: (filtered) => <AntSearchOutlined style={{ color: filtered ? "#1890ff" : undefined }} />,
  });

  useEffect(() => {
    const currentAllBaseKeys = baseColumns.map((col) => col.key).filter(Boolean);
    if (!initialBaseColumnKeys && currentAllBaseKeys.length > 0) {
      setInitialBaseColumnKeys(currentAllBaseKeys);
      setVisibleColumnKeys(currentAllBaseKeys);
    } else if (initialBaseColumnKeys) {
      setVisibleColumnKeys((prevVisibleKeys) => {
        const newVisible = prevVisibleKeys.filter((key) => currentAllBaseKeys.includes(key));
        return newVisible.length > 0 ? newVisible : currentAllBaseKeys.length > 0 ? [currentAllBaseKeys[0]] : [];
      });
    }
  }, [baseColumns, initialBaseColumnKeys]);

  const handleTableChange = (tablePagination, newFilters, sorter) => {
    setSelectedRowKeys([]);
    setPagination((prev) => ({ ...prev, current: 1 }));
    const apiFilters = {};
    for (const key in newFilters) {
      if (newFilters[key] && newFilters[key].length > 0) {
        apiFilters[key] = newFilters[key];
      }
    }
    setColumnFilters(apiFilters);
  };

  const handleSearch = (value) => {
    setSearchTerm(value.trim());
    setColumnFilters({});
    setSelectedRowKeys([]);
    setPagination((prev) => ({ ...prev, current: 1 }));
  };

  const handleProvinceChange = (value) => {
    setSelectedProvince(value);
    setSelectedRowKeys([]);
    setPagination((prev) => ({ ...prev, current: 1 }));
  };

  const handlePlanStatusSelect = (statusKey) => {
    const newStatus = selectedPlanStatus === statusKey ? null : statusKey;
    setSelectedPlanStatus(newStatus);
    setSelectedRowKeys([]);
    setPagination((prev) => ({ ...prev, current: 1 }));
  };

  // Add handlers for other SWM-specific filters if any

  const handleEditClick = () => {
    if (selectedRowKeys.length > 0) {
      setEditingRowKeys([...selectedRowKeys]);
      const initialEdits = {};
      selectedRowKeys.forEach((key) => {
        const record = data.find((item) => (item._id || item.planId) === key);
        if (record) initialEdits[key] = { ...record };
      });
      setEditedData(initialEdits);
      setSelectedRowKeys([]);
    }
  };

  const handleSaveEdit = async () => {
    setLoading(true);
    const updatesToApi = [];
    for (const rowKey of editingRowKeys) {
      const originalRecord = data.find((item) => (item._id || item.planId) === rowKey);
      const currentEditedState = editedData[rowKey];
      if (originalRecord && currentEditedState) {
        // Assuming SWM Plans are identified by _id for updates
        const identifierForUrl = originalRecord._id; 
        if (!identifierForUrl) {
          message.warn(`Cannot save record without a valid ID (key: ${rowKey}).`);
          continue;
        }
        const { _id, key, ...changes } = currentEditedState; // Exclude _id and key from payload
        updatesToApi.push({ identifier: identifierForUrl, payload: changes });
      }
    }

    if (updatesToApi.length === 0) {
      message.info("No valid changes to save.");
      setLoading(false);
      setEditingRowKeys([]);
      setEditedData({});
      return;
    }

    try {
      for (const update of updatesToApi) {
        await axios.put(`http://10.14.77.100:8081/api/update-swm-plan-data/${update.identifier}`, update.payload);
      }
      setData((prevData) =>
        prevData.map((row) => {
          if (editingRowKeys.includes(row._id || row.planId)) {
            const savedUpdate = updatesToApi.find(u => u.identifier === (row._id));
            return savedUpdate ? { ...row, ...savedUpdate.payload } : { ...row, ...editedData[row._id || row.planId] };
          }
          return row;
        })
      );
      setEditingRowKeys([]);
      setEditedData({});
      message.success("SWM Plan data saved successfully!");
    } catch (error) {
      console.error("Failed to save SWM Plan data", error);
      message.error(`Failed to save SWM Plan data: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingRowKeys([]);
    setEditedData({});
  };

  const handleInputChange = React.useCallback( (value, rowKey, dataIndex) => {
      setEditedData((prev) => ({
        ...prev,
        [rowKey]: { ...prev[rowKey], [dataIndex]: value },
      }));
      // Add any SWM-specific derived field calculations here if needed
    },
    [] // Add dependencies if they affect input change logic
  );

  const handleFreezeColumnChange = (columnKey, checked) => {
    setFrozenColumnKeys((prev) => {
      if (checked) return prev.length < 5 ? [...prev, columnKey] : prev;
      return prev.filter((key) => key !== columnKey);
    });
  };

  const handleColumnVisibilityChange = (columnKey, checked) => {
    setVisibleColumnKeys((prev) => {
      let newVisibleKeys;
      if (checked) newVisibleKeys = [...prev, columnKey];
      else {
        if (prev.length === 1 && prev.includes(columnKey)) return prev;
        newVisibleKeys = prev.filter((key) => key !== columnKey);
      }
      if (!checked) setFrozenColumnKeys((fKeys) => fKeys.filter((fKey) => fKey !== columnKey));
      return newVisibleKeys;
    });
  };

  const handleShowAllColumns = () => setVisibleColumnKeys(baseColumns.map((col) => col.key).filter(Boolean));
  const handleHideAllColumns = () => {
    if (baseColumns.length > 0 && baseColumns[0].key) {
      setVisibleColumnKeys([baseColumns[0].key]);
      setFrozenColumnKeys(fKeys => fKeys.filter(fKey => fKey === baseColumns[0].key));
    } else {
      setVisibleColumnKeys([]);
    }
  };

  // Column groups for visibility menu (adapt for SWM Plan fields)
  const COLUMN_GROUP_CONFIG = {
    GENERAL_INFO: { title: "General Plan Info", keys: ["planId", "lguName", "province", "typeOfLGU"] },
    DATES_STATUS: { title: "Dates & Status", keys: ["status", "yearSubmitted", "submissionDate", "dateApproved"] },
    // Add more groups as relevant for SWM Plans
  };

  const CustomDropdownContentWrapper = ({ menuComponent, onOkClick, theme }) => (
    <div className={`custom-dropdown-wrapper ${theme === "dark" ? "theme-dark" : "theme-light"}`} onClick={(e) => e.stopPropagation()}>
      {menuComponent}
      <Divider className="custom-dropdown-divider" />
      <div className="custom-dropdown-footer">
        <Button type="primary" size="small" onClick={(e) => { e.stopPropagation(); onOkClick(); }}>OK</Button>
      </div>
    </div>
  );

  const allBaseColumnKeys = useMemo(() => baseColumns.map((col) => col.key).filter(Boolean), [baseColumns]);
  const isAllColumnsVisible = useMemo(() => {
    if (allBaseColumnKeys.length === 0) return false;
    return allBaseColumnKeys.every((key) => visibleColumnKeys.includes(key)) && visibleColumnKeys.length === allBaseColumnKeys.length;
  }, [visibleColumnKeys, allBaseColumnKeys]);

  const handleToggleGroupVisibility = (groupColumnKeysToToggle, makeVisible) => {
    setVisibleColumnKeys((currentVisibleKeys) => {
      let newVisibleKeys;
      if (makeVisible) newVisibleKeys = [...new Set([...currentVisibleKeys, ...groupColumnKeysToToggle])];
      else {
        const keysAfterHidingGroup = currentVisibleKeys.filter((key) => !groupColumnKeysToToggle.includes(key));
        if (keysAfterHidingGroup.length === 0 && baseColumns.length > 0 && baseColumns[0]?.key) newVisibleKeys = [baseColumns[0].key];
        else newVisibleKeys = keysAfterHidingGroup;
        const actuallyHiddenKeys = groupColumnKeysToToggle.filter((key) => currentVisibleKeys.includes(key) && !newVisibleKeys.includes(key));
        if (actuallyHiddenKeys.length > 0) setFrozenColumnKeys((fKeys) => fKeys.filter((fKey) => !actuallyHiddenKeys.includes(fKey)));
      }
      return newVisibleKeys;
    });
  };

  const groupedColumnMenuItems = useMemo(() => {
    const menuItems = [];
    const allGroupedKeys = new Set(Object.values(COLUMN_GROUP_CONFIG).flatMap((g) => g.keys));
    Object.entries(COLUMN_GROUP_CONFIG).forEach(([groupKey, groupDetails]) => {
      const columnsInGroup = baseColumns.filter((col) => groupDetails.keys.includes(col.key));
      if (columnsInGroup.length === 0) return;
      menuItems.push({ type: "groupHeader", key: `group-${groupKey}`, title: groupDetails.title, columns: columnsInGroup, allKeysInGroup: groupDetails.keys });
      columnsInGroup.forEach((col) => menuItems.push({ type: "column", key: col.key, title: col.title, parentGroupKey: `group-${groupKey}` }));
    });
    const otherColumns = baseColumns.filter((col) => col.key && !allGroupedKeys.has(col.key));
    if (otherColumns.length > 0) {
      menuItems.push({ type: "groupHeader", key: "group-other", title: "Other Columns", columns: otherColumns, isOtherGroup: true });
      otherColumns.forEach((col) => menuItems.push({ type: "column", key: col.key, title: col.title, parentGroupKey: "group-other" }));
    }
    return menuItems;
  }, [baseColumns, visibleColumnKeys]);

  const columnVisibilityMenu = (
    <Menu className="column-visibility-menu">
      <Menu.Item key="show-all-columns" onClick={(e) => { e.stopPropagation(); handleShowAllColumns(); }}>
        <Checkbox checked={isAllColumnsVisible} onChange={(e) => e.target.checked ? handleShowAllColumns() : handleHideAllColumns()} disabled={allBaseColumnKeys.length === 0} size="small">Show All Columns</Checkbox>
      </Menu.Item>
      {allBaseColumnKeys.length > 0 && <Menu.Divider />}
      {groupedColumnMenuItems.map((item, index) => {
        if (item.type === "groupHeader") {
          const groupColsInBase = item.columns;
          const visibleInGroupCount = groupColsInBase.filter((col) => visibleColumnKeys.includes(col.key)).length;
          const isGroupChecked = groupColsInBase.length > 0 && visibleInGroupCount === groupColsInBase.length;
          const isGroupIndeterminate = visibleInGroupCount > 0 && visibleInGroupCount < groupColsInBase.length;
          return (
            <React.Fragment key={item.key}>
              {index > 0 && !groupedColumnMenuItems[index - 1].parentGroupKey && <Menu.Divider />}
              <Menu.ItemGroup title={item.title}>
                {!item.isOtherGroup && (
                  <Menu.Item key={`${item.key}-master`} onClick={(e) => e.stopPropagation()} style={{ fontWeight: "500" }}>
                    <Checkbox checked={isGroupChecked} indeterminate={isGroupIndeterminate} onChange={(e) => handleToggleGroupVisibility(item.allKeysInGroup, e.target.checked)} disabled={groupColsInBase.length === 0}>Toggle All in {item.title}</Checkbox>
                  </Menu.Item>
                )}
              </Menu.ItemGroup>
            </React.Fragment>
          );
        } else if (item.type === "column") {
          const isVisible = visibleColumnKeys.includes(item.key);
          return (
            <Menu.Item key={`vis-${item.key}`} onClick={(e) => e.stopPropagation()} className={item.parentGroupKey && item.parentGroupKey !== "group-other" ? "column-visibility-menu-item-indented" : "column-visibility-menu-item-default-indent"}>
              <Checkbox checked={isVisible} onChange={(e) => handleColumnVisibilityChange(item.key, e.target.checked)} disabled={isVisible && visibleColumnKeys.length === 1 && visibleColumnKeys[0] === item.key}>{item.title}</Checkbox>
            </Menu.Item>
          );
        }
        return null;
      })}
    </Menu>
  );

  const columnsForFreezeMenu = useMemo(() => baseColumns.filter((col) => visibleColumnKeys.includes(col.key)), [baseColumns, visibleColumnKeys]);

  const freezeMenu = (
    <Menu className="freeze-column-menu">
      {columnsForFreezeMenu.map((col) => {
        const canBeFrozen = !!col.width;
        const isCurrentlyFrozen = frozenColumnKeys.includes(col.key);
        const limitReached = frozenColumnKeys.length >= 5;
        return (
          <Menu.Item key={`freeze-${col.key}`} disabled={!canBeFrozen} onClick={(e) => e.stopPropagation()}>
            <Tooltip title={limitReached && !isCurrentlyFrozen && canBeFrozen ? "Max 5 columns frozen." : !canBeFrozen ? "Column needs width to be frozen." : ""}>
              <Checkbox checked={isCurrentlyFrozen} onChange={(e) => handleFreezeColumnChange(col.key, e.target.checked)} disabled={!canBeFrozen || (limitReached && !isCurrentlyFrozen)}>{col.title}</Checkbox>
            </Tooltip>
          </Menu.Item>
        );
      })}
    </Menu>
  );

  const tableFormatMenuContent = (
    <div className="table-format-popover-content">
      <p>Table Density:</p>
      <Radio.Group onChange={(e) => setCurrentTableSize(e.target.value)} value={currentTableSize}>
        <Radio value="small">Small</Radio>
        <Radio value="middle">Middle</Radio>
        <Radio value="large">Large</Radio>
      </Radio.Group>
      <Divider />
      <Checkbox checked={isTableBordered} onChange={(e) => setIsTableBordered(e.target.checked)}>Show Borders</Checkbox>
    </div>
  );

  const finalTableColumns = useMemo(() => {
    let accumulatedWidth = 0;
    const MAX_FROZEN_WIDTH = 700;
    const currentlyVisibleColumns = baseColumns.filter((col) => visibleColumnKeys.includes(col.key));

    return currentlyVisibleColumns.map((baseCol) => {
      const col = { ...baseCol };
      const isActuallyFrozen = frozenColumnKeys.includes(baseCol.key) && col.width && (accumulatedWidth === 0 || accumulatedWidth + baseCol.width <= MAX_FROZEN_WIDTH);
      const originalRender = col.render;

      col.onCell = (record) => {
        const rowKey = record._id || record.planId; // Use _id or planId as key
        const cellClasses = [];
        const originalCellProps = baseCol.onCell ? baseCol.onCell(record) : {};
        if (originalCellProps.className) cellClasses.push(originalCellProps.className);

        const isEditable = editingRowKeys.includes(rowKey) && col.dataType && col.dataIndex; // Simplified editable check
        if (isEditable) cellClasses.push("editable-cell");
        if (isActuallyFrozen) cellClasses.push("table-cell-frozen");

        const finalCellProps = { ...originalCellProps, className: cellClasses.join(" ").trim() };
        if (isEditable) finalCellProps.style = { ...finalCellProps.style, verticalAlign: "top" };
        return finalCellProps;
      };

      col.render = (text, record, index) => {
        const rowKey = record._id || record.planId;
        if (editingRowKeys.includes(rowKey) && col.dataType && col.dataIndex) {
          const currentValue = editedData[rowKey]?.[col.dataIndex] ?? record[col.dataIndex];
          switch (col.dataType) {
            case "text": return <Input value={currentValue} onChange={(e) => handleInputChange(e.target.value, rowKey, col.dataIndex)} className="editable-cell-input" />;
            case "number": return <InputNumber value={currentValue} onChange={(value) => handleInputChange(value, rowKey, col.dataIndex)} className="editable-cell-input" style={{ width: "100%" }} />;
            case "date":
              const dayjsValue = currentValue && typeof currentValue === 'string' ? dayjs(currentValue, ["YYYY-MM-DD", "M/D/YYYY", dayjs.ISO_8601], true) : null;
              return <DatePicker value={dayjsValue && dayjsValue.isValid() ? dayjsValue : null} onChange={(date, dateString) => handleInputChange(dateString, rowKey, col.dataIndex)} format="YYYY-MM-DD" className="editable-cell-input" style={{ width: "100%" }} />;
            case "textarea": return <TextArea value={currentValue} onChange={(e) => handleInputChange(e.target.value, rowKey, col.dataIndex)} className="editable-cell-input" autoSize={{ minRows: 1, maxRows: 3 }} />;
            case "custom_autocomplete_province": return <ProvinceAutocomplete value={currentValue} onChange={(value) => handleInputChange(value, rowKey, col.dataIndex)} disabled={loading} />;
            // Add other custom autocomplete cases for SWM Plan if needed
            default: return originalRender ? originalRender(text, record, index) : text;
          }
        }
        return originalRender ? originalRender(text, record, index) : text;
      };

      if (isActuallyFrozen) {
        accumulatedWidth += baseCol.width;
        col.fixed = "left";
        col.onHeaderCell = () => ({ className: "table-header-frozen" });
      }

      // Apply column search props
      // Define which SWM Plan fields are text-filterable from the column header
      const swmTextFilterableFields = ["planId", "lguName", "province", "status", "remarks"]; // Example
      if (col.dataIndex && swmTextFilterableFields.includes(col.dataIndex)) {
        return { ...col, ...getColumnSearchProps(col.dataIndex, col.title) };
      }
      return col;
    });
  }, [baseColumns, frozenColumnKeys, visibleColumnKeys, editingRowKeys, editedData, theme, handleInputChange, data, columnFilters]);

  const onSelectChange = (newSelectedRowKeys) => setSelectedRowKeys(newSelectedRowKeys);
  const rowSelection = { selectedRowKeys, onChange: onSelectChange, getCheckboxProps: (record) => ({ disabled: editingRowKeys.length > 0 }) };

  const isAnyFilterActive = selectedPlanStatus || searchTerm || selectedProvince || (columnFilters && Object.keys(columnFilters).length > 0);

  const getActiveFilterKeyword = () => {
    if (searchTerm) return searchTerm;
    if (columnFilters && Object.keys(columnFilters).length > 0) {
      const firstKey = Object.keys(columnFilters)[0];
      const val = columnFilters[firstKey];
      return Array.isArray(val) ? val[0] : val;
    }
    return null;
  };

  return (
    <div className={`swmplan-page-container ${theme === "dark" ? "theme-dark" : "theme-light"}`}>
      <DashboardTiles
        theme={theme}
        onPlanStatusSelect={handlePlanStatusSelect}
        selectedPlanStatus={selectedPlanStatus}
        onProvinceFilterSelect={setSelectedProvince} // Example, adapt if province filter is on dashboard
        selectedProvinceFilterValue={selectedProvince}
        onViewBreakdownDetails={handleShowBreakdownDetails}
      />

      <div className="table-controls-header">
        <div className="table-controls-left">
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
            <Input.Search
              placeholder="Search SWM Plans..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onSearch={handleSearch}
              style={{ width: 300 }}
              allowClear
              enterButton
            />
            {isAnyFilterActive && (
              <div style={{ marginTop: "8px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
                {selectedPlanStatus && (
                  <Tag closable onClose={() => handlePlanStatusSelect(null)} color="blue">Status: {selectedPlanStatus}</Tag>
                )}
                {selectedProvince && (
                  <Tag closable onClose={() => handleProvinceChange(null)} color="green">Province: {selectedProvince}</Tag>
                )}
                {/* Add tags for other active SWM filters */}
                <span className="search-results-message">
                  {loading ? "Filtering..." : `${total} result${total === 1 ? "" : "s"} found ${getActiveFilterKeyword() ? `for "${getActiveFilterKeyword()}..."` : ""}`}
                </span>
              </div>
            )}
          </div>
          <Select
            allowClear
            placeholder="Filter by Province"
            style={{ width: 200, marginLeft: "8px" }}
            onChange={handleProvinceChange}
            value={selectedProvince}
            loading={loading}
          >
            <Select.Option value={null}>All Provinces</Select.Option>
            {allProvinces.map((provinceName) => (
              <Select.Option key={provinceName} value={provinceName}>{provinceName}</Select.Option>
            ))}
          </Select>
          {/* Add other global filters for SWM Plan if needed */}
        </div>

        <div className="table-controls-right">
          {editingRowKeys.length > 0 ? (
            <>
              <Button onClick={handleSaveEdit} type="primary" loading={loading} size="small">Save</Button>
              <Button onClick={handleCancelEdit} disabled={loading} size="small">Cancel</Button>
            </>
          ) : (
            <Tooltip title="Edit Selected SWM Plan(s)">
              <Button type="primary" icon={<EditOutlined />} disabled={selectedRowKeys.length === 0 || loading} onClick={handleEditClick} size="small" />
            </Tooltip>
          )}

          <Tooltip title="Show/Hide Columns">
            <Dropdown disabled={editingRowKeys.length > 0 || loading} overlay={<CustomDropdownContentWrapper menuComponent={columnVisibilityMenu} onOkClick={() => setIsColumnVisibilityDropdownOpen(false)} theme={theme} />} trigger={["click"]} open={isColumnVisibilityDropdownOpen} onOpenChange={setIsColumnVisibilityDropdownOpen}>
              <Button type="primary" icon={<TableOutlined />} size="small"><DownOutlined /></Button>
            </Dropdown>
          </Tooltip>
          <Tooltip title="Freeze Columns">
            <Dropdown disabled={editingRowKeys.length > 0 || loading} overlay={<CustomDropdownContentWrapper menuComponent={freezeMenu} onOkClick={() => setIsFreezeDropdownOpen(false)} theme={theme} />} trigger={["click"]} open={isFreezeDropdownOpen} onOpenChange={setIsFreezeDropdownOpen}>
              <Button type="primary" size="small" icon={<SettingOutlined />}><DownOutlined /></Button>
            </Dropdown>
          </Tooltip>
          <Tooltip title="Format Table">
            <Popover disabled={editingRowKeys.length > 0 || loading} content={tableFormatMenuContent} title="Table Format" trigger="click" placement="bottomRight">
              <Button type="primary" icon={<ToolFilled />} size="small" />
            </Popover>
          </Tooltip>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              setSearchTerm("");
              setSelectedProvince(null);
              setSelectedPlanStatus(null);
              // Reset other SWM-specific filters
              setPagination({ current: 1, pageSize: 20 });
              setSelectedRowKeys([]);
              setEditingRowKeys([]);
              setEditedData({});
              setColumnFilters({});
            }}
            loading={loading && editingRowKeys.length === 0}
            type="primary"
            size="small"
          />
          {editingRowKeys.length === 0 && (
            <AntPagination
              current={pagination.current}
              pageSize={pagination.pageSize}
              total={total}
              simple={true}
              size="small"
              className="ant-pagination"
              showSizeChanger={true}
              pageSizeOptions={["10", "20", "50", "100"]}
              onChange={(newPage, newPageSize) => {
                if (newPageSize !== pagination.pageSize) setPagination({ current: 1, pageSize: newPageSize });
                else setPagination({ current: newPage, pageSize: newPageSize });
              }}
            />
          )}
        </div>
      </div>

      <Table
        dataSource={data}
        columns={finalTableColumns}
        rowKey={(record) => record._id || record.planId} // Use _id or planId
        rowSelection={rowSelection}
        pagination={false}
        loading={loading}
        onChange={handleTableChange}
        scroll={{ x: 1500, y: tableScrollY }} // Adjust scroll x as needed
        bordered={isTableBordered}
        size={currentTableSize}
      />

      {/*
      <Breakdown
        visible={showBreakdownModal}
        onClose={handleCloseBreakdownModal}
        criteria={breakdownCriteria}
        theme={theme}
        // Pass necessary props for SWM Plan breakdown
        // currentUser={JSON.parse(localStorage.getItem("currentUser"))}
        // handleReloadParentTable={fetchData}
      />
      */}
    </div>
  );
};

export default SWMPlan;