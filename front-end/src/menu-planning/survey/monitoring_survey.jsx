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
  DatePicker,
  AutoComplete,
  ConfigProvider,
} from "antd";
import { message } from "antd";
import ProvinceAutocomplete from "../../components/Autocomplete/Province";
import MunicipalitiesAutocomplete from "../../components/Autocomplete/Municipalities";
import BarangayAutocomplete from "../../components/Autocomplete/Barangay";
import IndustryClassAutocomplete from "../../components/Autocomplete/IndustryClass";
// Import other relevant Autocomplete components if needed for survey data
// For example, if survey has 'status' or 'type' fields that need autocompletion.

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
import { API_BASE_URL } from "../../config/api";
import { getActiveYear } from "../../context/YearContext";
import Breakdown from "../monitoring/Breakdown"; // Assuming Breakdown component might be reused or adapted
import "./monitoring_survey.css"; // Use the new CSS file

const { TextArea } = Input;


const DashboardTiles = ({
  theme,
  onSurveyStatusSelect, // Renamed for clarity, assuming a survey status filter
  selectedSurveyStatus, // Renamed
  onSomeSurveyFilterSelect, // Placeholder for other potential survey-specific filters
  selectedSomeSurveyFilterValue, // Placeholder
  // Add other props relevant to survey dashboard tiles
  onViewSurveyDetails, // Renamed for clarity
}) => {
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    // Placeholder: Fetch survey-specific dashboard statistics
    const fetchSurveyDashboardStats = async () => {
      setLoadingStats(true);
      try {
        // Assuming survey data is for a specific year, e.g., 2025.
        // Adjust the endpoint year if needed.
        const response = await axios.get(`${API_BASE_URL}/api/survey-dashboard-stats/${getActiveYear()}`);
        setStats(response.data);
      } catch (error) {
        console.error("Error fetching survey dashboard stats:", error);
        setStats({ // Fallback placeholder data on error
          totalSurveys: 0,
          projectTypeBreakdown: [],
          provinceBreakdown: [],
          eiaSurveyCount: 0,
          mbuAreaSurveyCount: 0,
        });
      } finally {
        setLoadingStats(false);
      }
    };
    fetchSurveyDashboardStats();
  }, []);

  const renderStyledSmallStatCard = (
    title,
    value,
    { cardClassName, cardStyle, statisticColorOverride, onClick, isActive } = {}
  ) => (
    <Card
      size="small"
      className={`dashboard-small-stat-card ${cardClassName || ""} ${
        onClick ? "clickable-card" : ""
      } ${isActive ? "active-filter" : ""}`}
      style={cardStyle}
      styles={{ body: { padding: "4px 8px" } }}
      onClick={onClick}
    >
      <Statistic
        title={title}
        value={value}
        valueStyle={{
          fontSize: "11px",
          ...(statisticColorOverride && { color: statisticColorOverride }),
        }}
        titleStyle={{
          fontSize: "10px",
          whiteSpace: "normal",
          lineHeight: "1.1",
          ...(statisticColorOverride && { color: statisticColorOverride }),
          marginBottom: "1px",
        }}
      />
    </Card>
  );

  if (loadingStats) {
    return (
      <div className="loading-stats-container">
        <Spin tip="Loading survey statistics..." />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="failed-stats-message">
        Failed to load survey statistics.
      </div>
    );
  }

  return (
    <div className="dashboard-tiles-container">
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6} lg={4}>
          <Card title="Survey Overview" className="dashboard-tile-card">
            {renderStyledSmallStatCard("Total Surveys", stats.totalSurveys || 0, {
              onClick: () => onViewSurveyDetails({ type: "allSurveys" }),
            })}
            {renderStyledSmallStatCard(
              "EIA Surveys",
              stats.eiaSurveyCount || 0,
              {
                onClick: () => onViewSurveyDetails({ type: "eiaSurveys" }), // Example filter
                // isActive: selectedSurveyStatus === "eia", // Example active state
              }
            )}
            {renderStyledSmallStatCard(
              "MBU Area Surveys",
              stats.mbuAreaSurveyCount || 0,
              {
                onClick: () => onViewSurveyDetails({ type: "mbuAreaSurveys" }), // Example filter
              }
            )}
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6} lg={10}>
          <Card title="Surveys by Project Type" className="dashboard-tile-card">
            <Row gutter={[8,8]}>
              {(stats.projectTypeBreakdown || []).length > 0 ? (
                stats.projectTypeBreakdown.map(item => (
                  <Col xs={12} sm={8} md={6} key={item.type}>
                    {renderStyledSmallStatCard(item.type, item.count, {
                      onClick: () => onViewSurveyDetails({ type: "projectType", value: item.type }),
                    })}
                  </Col>
                ))
              ) : (
                <Col span={24}><div className="no-data-message">No project type data</div></Col>
              )}
            </Row>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6} lg={10}>
          <Card title="Surveys by Province" className="dashboard-tile-card">
             <Row gutter={[8,8]}>
              {(stats.provinceBreakdown || []).length > 0 ? (
                stats.provinceBreakdown.map(item => (
                  <Col xs={12} sm={8} md={6} key={item.province}>
                    {renderStyledSmallStatCard(item.province, item.count, {
                       onClick: () => onViewSurveyDetails({ type: "province", value: item.province }),
                    })}
                  </Col>
                ))
              ) : (
                 <Col span={24}><div className="no-data-message">No province data</div></Col>
              )}
            </Row>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

const MonitoringSurvey = ({ theme = "light" }) => {
  const [data, setData] = useState([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [tableScrollY, setTableScrollY] = useState(0);
  const [frozenColumnKeys, setFrozenColumnKeys] = useState(["id_no", "project_title"]);
  const [currentTableSize, setCurrentTableSize] = useState("small");
  const [isTableBordered, setIsTableBordered] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProvince, setSelectedProvince] = useState(null);
  const [allProvinces, setAllProvinces] = useState([]);
  const [visibleColumnKeys, setVisibleColumnKeys] = useState([]);
  const [selectedSurveyStatus, setSelectedSurveyStatus] = useState(null); // Example filter state
  const [isColumnVisibilityDropdownOpen, setIsColumnVisibilityDropdownOpen] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [inputValue, setInputValue] = useState(searchTerm);
  const [isFreezeDropdownOpen, setIsFreezeDropdownOpen] = useState(false);
  const [editingRowKeys, setEditingRowKeys] = useState([]);
  const [editedData, setEditedData] = useState({});
  const [initialBaseColumnKeys, setInitialBaseColumnKeys] = useState(null);
  const [columnFilters, setColumnFilters] = useState({});

  const [showBreakdownModal, setShowBreakdownModal] = useState(false);
  const [breakdownCriteria, setBreakdownCriteria] = useState(null);
  // const [shouldRefreshTable, setShouldRefreshTable] = useState(false); // If Breakdown component modifies data

  const fetchData = async (
    page = 1,
    pageSize = 20,
    search = "",
    province = null,
    surveyStatus = null, // Example survey-specific filter
    currentColumnFilters = {}
  ) => {
    setLoading(true);
    try {
      // Assuming survey data is for a specific year, e.g., 2025.
      // Adjust the endpoint and parameters as per your server.js implementation.
      const res = await axios.get(
        `${API_BASE_URL}/api/surveys-monitoring-data/${getActiveYear()}`,
        {
          params: {
            page,
            pageSize,
            search,
            province,
            status: surveyStatus, // Pass survey status filter
            ...currentColumnFilters,
          },
        }
      );
      setData(res.data.data);
      setTotal(res.data.total);
      setPagination({ current: page, pageSize });
    } catch (err) {
      console.error("Failed to fetch survey data", err);
      message.error("Failed to fetch survey data.");
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
      selectedSurveyStatus, // Pass survey status
      columnFilters
    );
  }, [
    pagination.current,
    pagination.pageSize,
    searchTerm,
    selectedProvince,
    selectedSurveyStatus,
    columnFilters,
  ]);

  useEffect(() => {
    const staticProvincesList = [
      "Aurora", "Bataan", "Bulacan", "Nueva Ecija",
      "Pampanga", "Tarlac", "Zambales",
    ];
    setAllProvinces(staticProvincesList.sort());
  }, []);

  useEffect(() => {
    const calculateTableHeight = () => {
      const windowHeight = window.innerHeight;
      const fixedInternalHeight = 48 + 48 + 40 + 20;
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

  const handleShowBreakdownDetails = (criteriaForModal) => {
    setBreakdownCriteria(criteriaForModal);
    setShowBreakdownModal(true);
  };

  const handleCloseBreakdownModal = () => {
    setShowBreakdownModal(false);
  };

  // Define baseColumns for Survey Data
  // This is a simplified example. Adjust fields and dataTypes based on your actual survey data.
  const baseColumns = useMemo(
    () => [
      {
        title: "ID No.",
        dataIndex: "id_no", // Assuming 'id_no' is the identifier in survey data
        key: "id_no",
        width: 100,
        align: "center",
        onHeaderCell: () => ({ className: "table-header-center" }),
      },
      {
        title: "Project Title/Name",
        dataIndex: "project_title", // Or 'name' if that's the field
        key: "project_title",
        width: 250,
        dataType: "textarea",
        align: "left",
        onHeaderCell: () => ({ className: "table-header-center" }),
      },
      {
        title: "Industry Class",
        dataIndex: "industry_class",
        key: "industry_class",
        align: "center",
        dataType: "custom_autocomplete_industryclass",
        width: 180,
        onHeaderCell: () => ({ className: "table-header-center" }),
      },
      {
        title: "Address",
        dataIndex: "address",
        key: "address",
        width: 300,
        dataType: "textarea",
        onHeaderCell: () => ({ className: "table-header-center" }),
      },
      {
        title: "Province",
        dataIndex: "province",
        key: "province",
        dataType: "custom_autocomplete_province",
        width: 150,
        onHeaderCell: () => ({ className: "table-header-center" }),
      },
      {
        title: "City/Municipality",
        dataIndex: "city", // Assuming 'city' field exists
        key: "city",
        dataType: "custom_autocomplete_municipalities",
        width: 150,
        onHeaderCell: () => ({ className: "table-header-center" }),
      },
      {
        title: "Barangay",
        dataIndex: "brgy", // Assuming 'brgy' field exists
        key: "brgy",
        dataType: "custom_autocomplete_barangay",
        width: 150,
        onHeaderCell: () => ({ className: "table-header-center" }),
      },
      {
        title: "Latitude",
        dataIndex: "lat",
        key: "lat",
        dataType: "text",
        width: 120,
        onHeaderCell: () => ({ className: "table-header-center" }),
      },
      {
        title: "Longitude",
        dataIndex: "long",
        key: "long",
        dataType: "text",
        width: 120,
        onHeaderCell: () => ({ className: "table-header-center" }),
      },
      {
        title: "Date Surveyed",
        dataIndex: "date_surveyed", // Hypothetical field
        key: "date_surveyed",
        dataType: "date",
        width: 150,
        onHeaderCell: () => ({ className: "table-header-center" }),
        render: (text) => text ? dayjs(text).format("MM/DD/YYYY") : "",
      },
      {
        title: "Survey Status",
        dataIndex: "status_survey", // Hypothetical field
        key: "status_survey",
        dataType: "select", // Assuming a dropdown/select for status
        editorOptions: [ // Example options
          {label: "Pending", value: "Pending"},
          {label: "Ongoing", value: "Ongoing"},
          {label: "Completed", value: "Completed"},
          {label: "Cancelled", value: "Cancelled"},
        ],
        width: 150,
        onHeaderCell: () => ({ className: "table-header-center" }),
      },
      {
        title: "Remarks",
        dataIndex: "remarks_survey", // Hypothetical field
        key: "remarks_survey",
        dataType: "textarea",
        width: 250,
        onHeaderCell: () => ({ className: "table-header-center" }),
      },
      // Add more columns relevant to your survey data
    ],
    [editingRowKeys, editedData, theme] // Add other dependencies if column definitions change dynamically
  );

  const getColumnSearchProps = (dataIndex, columnTitle) => ({
    filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => (
      <div style={{ padding: 8 }} onKeyDown={(e) => e.stopPropagation()}>
        <Input
          placeholder={`Search ${columnTitle}`}
          value={selectedKeys[0]}
          onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
          onPressEnter={() => confirm()}
          style={{ marginBottom: 8, display: "block" }}
        />
        <Space>
          <Button type="primary" onClick={() => confirm()} size="small" style={{ width: 90 }}>
            Search
          </Button>
          <Button
            onClick={() => {
              clearFilters && clearFilters();
              confirm();
            }}
            size="small"
            style={{ width: 90 }}
          >
            Reset
          </Button>
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
        if (newVisible.length === 0 && currentAllBaseKeys.length > 0) {
          return currentAllBaseKeys;
        }
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
    const trimmedValue = value.trim();
    setSearchTerm(trimmedValue);
    setColumnFilters({});
    setSelectedRowKeys([]);
    setPagination((prev) => ({ ...prev, current: 1 }));
  };

  const handleProvinceChange = (value) => {
    setSelectedProvince(value);
    setSelectedRowKeys([]);
    setPagination((prev) => ({ ...prev, current: 1 }));
  };

  const handleSurveyStatusSelect = (statusKey) => { // Renamed handler
    const newStatus = selectedSurveyStatus === statusKey ? null : statusKey;
    setSelectedSurveyStatus(newStatus);
    setSelectedRowKeys([]);
    setPagination((prev) => ({ ...prev, current: 1 }));
  };

  const handleEditClick = () => {
    if (selectedRowKeys.length > 0) {
      setEditingRowKeys([...selectedRowKeys]);
      const initialEdits = {};
      selectedRowKeys.forEach((key) => {
        const record = data.find((item) => item._id === key); // Assuming survey data has _id
        if (record) {
          initialEdits[key] = { ...record };
        }
      });
      setEditedData(initialEdits);
      setSelectedRowKeys([]);
    }
  };

  const handleSaveEdit = async () => {
    setLoading(true);
    const updatesToApi = [];

    for (const row_id of editingRowKeys) {
      const originalRecord = data.find((item) => item._id === row_id);
      const currentEditedState = editedData[row_id];

      if (originalRecord && currentEditedState) {
        // Use _id as the identifier for survey data updates
        const identifierForUrl = originalRecord._id;
        const { _id, ...changes } = currentEditedState; // Exclude _id from payload if it's in URL

        if (!identifierForUrl) {
          message.warn(`Cannot save record without an identifier (ID: ${row_id}).`);
          continue;
        }
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
        // Adjust year or make it dynamic if necessary
        await axios.put(
          `${API_BASE_URL}/api/surveys-monitoring-data/${getActiveYear()}/${update.identifier}`,
          update.payload
        );
      }
      setData((prevData) =>
        prevData.map((row) => {
          if (editingRowKeys.includes(row._id)) {
            const savedUpdate = updatesToApi.find((u) => u.identifier === row._id);
            if (savedUpdate) return { ...row, ...savedUpdate.payload };
            return { ...row, ...editedData[row._id] };
          }
          return row;
        })
      );
      setEditingRowKeys([]);
      setEditedData({});
      message.success("Survey data saved successfully!");
    } catch (error) {
      console.error("Failed to save survey data", error);
      let errorMessage = "Failed to save survey data.";
      if (error.response && error.response.data) {
        errorMessage += ` ${error.response.data.error || error.response.data.message || ""}`;
      } else if (error.message) {
        errorMessage += ` ${error.message}`;
      }
      message.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingRowKeys([]);
    setEditedData({});
  };

  const handleInputChange = React.useCallback(
    async (value, rowKey, dataIndex) => {
      setEditedData((prev) => {
        const currentRowState = prev[rowKey] || {};
        let newFields = { ...currentRowState, [dataIndex]: value };

        if (dataIndex === "industry_class" && value) {
          newFields.industry_type = "Loading..."; // Assuming survey might have these
          newFields.industry_subtype = "Loading...";
          newFields.psic_code = "Loading...";
        } else if (dataIndex === "industry_class" && !value) {
          newFields.industry_type = "";
          newFields.industry_subtype = "";
          newFields.psic_code = "";
        }
        // Remove BOD and UCDS-specific date calculations
        return { ...prev, [rowKey]: newFields };
      });

      if (dataIndex === "industry_class" && value) {
        try {
          const response = await axios.get(
            `${API_BASE_URL}/api/industry-details-by-class`,
            { params: { className: value } }
          );
          const details = response.data;
          setEditedData((prev) => ({
            ...prev,
            [rowKey]: {
              ...prev[rowKey],
              industry_class: value, // Ensure this is set
              industry_type: details.industry_type || "",
              industry_subtype: details.industry_subtype || "",
              psic_code: details.psic_code || "",
            },
          }));
        } catch (error) {
          console.error("Failed to fetch industry details by class", error);
          setEditedData((prev) => ({
            ...prev,
            [rowKey]: {
              ...prev[rowKey],
              industry_class: value, // Ensure this is set
              industry_type: "",
              industry_subtype: "",
              psic_code: "",
            },
          }));
        }
      }
    },
    [] // Removed `data` dependency as originalRecord fallback might not be needed or handled differently
  );

  const handleFreezeColumnChange = (columnKey, checked) => {
    setFrozenColumnKeys((prev) => {
      if (checked) {
        if (prev.length < 5) return [...prev, columnKey];
        return prev;
      } else {
        return prev.filter((key) => key !== columnKey);
      }
    });
  };

  const handleColumnVisibilityChange = (columnKey, checked) => {
    setVisibleColumnKeys((prev) => {
      let newVisibleKeys;
      if (checked) {
        newVisibleKeys = [...prev, columnKey];
      } else {
        if (prev.length === 1 && prev.includes(columnKey)) return prev;
        newVisibleKeys = prev.filter((key) => key !== columnKey);
      }
      if (!checked) {
        setFrozenColumnKeys((fKeys) => fKeys.filter((fKey) => fKey !== columnKey));
      }
      return newVisibleKeys;
    });
  };

  const handleShowAllColumns = () => {
    const allColumnKeys = baseColumns.map((col) => col.key).filter(Boolean);
    setVisibleColumnKeys(allColumnKeys);
  };

  const handleHideAllColumns = () => {
    if (baseColumns.length > 0) {
      const firstColumnKey = baseColumns[0].key;
      if (firstColumnKey) {
        const keysToHide = visibleColumnKeys.filter((key) => key !== firstColumnKey);
        setFrozenColumnKeys((fKeys) => fKeys.filter((fKey) => !keysToHide.includes(fKey) || fKey === firstColumnKey));
        setVisibleColumnKeys([firstColumnKey]);
      }
    } else {
      setVisibleColumnKeys([]);
    }
  };

  // Simplified COLUMN_GROUP_CONFIG for survey data. Adjust as needed.
  const COLUMN_GROUP_CONFIG = {
    GENERAL_INFO: {
      title: "General Survey Info",
      keys: ["id_no", "project_title", "industry_class", "address"],
    },
    LOCATION: {
      title: "Location Details",
      keys: ["province", "city", "brgy", "lat", "long"],
    },
    SURVEY_DETAILS: {
      title: "Survey Specifics",
      keys: ["date_surveyed", "status_survey", "remarks_survey"],
    },
  };

  const CustomDropdownContentWrapper = ({ menuComponent, onOkClick, theme }) => (
    <div
      className={`custom-dropdown-wrapper ${theme === "dark" ? "theme-dark" : "theme-light"}`}
      onClick={(e) => e.stopPropagation()}
    >
      {menuComponent}
      <Divider className="custom-dropdown-divider" />
      <div className="custom-dropdown-footer">
        <Button type="primary" size="small" onClick={(e) => { e.stopPropagation(); onOkClick(); }}>
          OK
        </Button>
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
      if (makeVisible) {
        newVisibleKeys = [...new Set([...currentVisibleKeys, ...groupColumnKeysToToggle])];
      } else {
        const keysAfterHidingGroup = currentVisibleKeys.filter((key) => !groupColumnKeysToToggle.includes(key));
        if (keysAfterHidingGroup.length === 0 && baseColumns.length > 0 && baseColumns[0]?.key) {
          newVisibleKeys = [baseColumns[0].key];
        } else {
          newVisibleKeys = keysAfterHidingGroup;
        }
        const actuallyHiddenKeys = groupColumnKeysToToggle.filter((key) => currentVisibleKeys.includes(key) && !newVisibleKeys.includes(key));
        if (actuallyHiddenKeys.length > 0) {
          setFrozenColumnKeys((fKeys) => fKeys.filter((fKey) => !actuallyHiddenKeys.includes(fKey)));
        }
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
      <Menu.Item key="show-all-columns" onClick={(e) => { e.stopPropagation(); }}>
        <Checkbox
          checked={isAllColumnsVisible}
          onChange={(e) => { e.target.checked ? handleShowAllColumns() : handleHideAllColumns(); }}
          disabled={allBaseColumnKeys.length === 0}
          size="small"
        >
          Show All Columns
        </Checkbox>
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
                    <Checkbox
                      checked={isGroupChecked}
                      indeterminate={isGroupIndeterminate}
                      onChange={(e) => handleToggleGroupVisibility(item.allKeysInGroup, e.target.checked)}
                      disabled={groupColsInBase.length === 0}
                    >
                      Toggle All in {item.title}
                    </Checkbox>
                  </Menu.Item>
                )}
              </Menu.ItemGroup>
            </React.Fragment>
          );
        } else if (item.type === "column") {
          const isVisible = visibleColumnKeys.includes(item.key);
          return (
            <Menu.Item
              key={`vis-${item.key}`}
              onClick={(e) => e.stopPropagation()}
              className={item.parentGroupKey && item.parentGroupKey !== "group-other" ? "column-visibility-menu-item-indented" : "column-visibility-menu-item-default-indent"}
            >
              <Checkbox
                checked={isVisible}
                onChange={(e) => handleColumnVisibilityChange(item.key, e.target.checked)}
                disabled={isVisible && visibleColumnKeys.length === 1 && visibleColumnKeys[0] === item.key}
              >
                {item.title}
              </Checkbox>
            </Menu.Item>
          );
        }
        return null;
      })}
    </Menu>
  );

  const columnsForFreezeMenu = useMemo(() => {
    return baseColumns.filter((col) => visibleColumnKeys.includes(col.key));
  }, [baseColumns, visibleColumnKeys]);

  const freezeMenu = (
    <Menu className="freeze-column-menu">
      {columnsForFreezeMenu.map((col) => {
        const canBeFrozen = !!col.width;
        const isCurrentlyFrozen = frozenColumnKeys.includes(col.key);
        const limitReached = frozenColumnKeys.length >= 5;
        return (
          <Menu.Item key={`freeze-${col.key}`} disabled={!canBeFrozen} onClick={(e) => e.stopPropagation()}>
            <Tooltip
              title={limitReached && !isCurrentlyFrozen && canBeFrozen ? "Maximum of 5 columns can be frozen." : !canBeFrozen ? "Column must have a defined width to be frozen." : ""}
            >
              <Checkbox
                checked={isCurrentlyFrozen}
                onChange={(e) => handleFreezeColumnChange(col.key, e.target.checked)}
                disabled={!canBeFrozen || (limitReached && !isCurrentlyFrozen)}
              >
                {col.title}
              </Checkbox>
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
      <Checkbox checked={isTableBordered} onChange={(e) => setIsTableBordered(e.target.checked)}>
        Show Borders
      </Checkbox>
    </div>
  );

  const finalTableColumns = useMemo(() => {
    let accumulatedWidth = 0;
    const MAX_FROZEN_WIDTH = 700;
    const currentlyVisibleColumns = baseColumns.filter((col) => visibleColumnKeys.includes(col.key));

    return currentlyVisibleColumns
      .map((baseCol) => {
        const col = { ...baseCol };
        const isActuallyFrozen = frozenColumnKeys.includes(baseCol.key) && col.width && baseCol.key !== "actions" && (accumulatedWidth === 0 || accumulatedWidth + baseCol.width <= MAX_FROZEN_WIDTH);
        const originalRender = col.render;

        col.onCell = (record) => {
          const rowKey = record._id; // Assuming survey data has _id
          const cellClasses = [];
          const originalCellProps = baseCol.onCell ? baseCol.onCell(record) : {};
          if (originalCellProps.className) cellClasses.push(originalCellProps.className);

          const isEditable = editingRowKeys.includes(rowKey) && col.dataType && col.dataIndex;
          if (isEditable) cellClasses.push("editable-cell");
          if (isActuallyFrozen) cellClasses.push("table-cell-frozen");

          const finalCellProps = { ...originalCellProps, className: cellClasses.join(" ").trim() };
          if (isEditable) finalCellProps.style = { ...finalCellProps.style, verticalAlign: "top" };
          return finalCellProps;
        };

        col.render = (text, record, index) => {
          const rowKey = record._id; // Assuming survey data has _id
          if (editingRowKeys.includes(rowKey) && col.dataType && col.dataIndex) {
            const currentValue = editedData[rowKey]?.[col.dataIndex] ?? record[col.dataIndex];
            switch (col.dataType) {
              case "text":
                return (
                  <Input
                    value={currentValue}
                    onChange={(e) => handleInputChange(e.target.value, rowKey, col.dataIndex)}
                    className="editable-cell-input"
                    disabled={editingRowKeys.includes(rowKey) && !!editedData[rowKey]?.industry_class && (col.dataIndex === "psic_code" || col.dataIndex === "industry_type" || col.dataIndex === "industry_subtype")}
                  />
                );
              case "number":
                return (
                  <InputNumber
                    value={currentValue}
                    onChange={(value) => handleInputChange(value, rowKey, col.dataIndex)}
                    className="editable-cell-input"
                    style={{ width: "100%", fontSize: "12px" }}
                  />
                );
              case "date":
                const dayjsValue = currentValue ? dayjs(currentValue, ["MM/DD/YYYY", "YYYY-MM-DD", dayjs.ISO_8601], true) : null;
                return (
                  <DatePicker
                    value={dayjsValue && dayjsValue.isValid() ? dayjsValue : null}
                    onChange={(date, dateString) => handleInputChange(dateString, rowKey, col.dataIndex)}
                    format="MM/DD/YYYY"
                    className="editable-cell-input"
                    style={{ width: "100%" }}
                  />
                );
              case "textarea":
                return (
                  <TextArea
                    value={currentValue}
                    onChange={(e) => handleInputChange(e.target.value, rowKey, col.dataIndex)}
                    className="editable-cell-input"
                    autoSize={{ minRows: 1, maxRows: 3 }}
                    disabled={editingRowKeys.includes(rowKey) && !!editedData[rowKey]?.industry_class && (col.dataIndex === "industry_type" || col.dataIndex === "industry_subtype")}
                  />
                );
              case "select":
                return (
                  <Select
                    value={currentValue}
                    onChange={(value) => handleInputChange(value, rowKey, col.dataIndex)}
                    options={col.editorOptions?.map((opt) => typeof opt === "string" ? { label: opt, value: opt } : opt) || []}
                    className="editable-cell-input"
                    style={{ width: "100%" }}
                    showSearch
                    optionFilterProp="children"
                  />
                );
              case "custom_autocomplete_province":
                return <ProvinceAutocomplete value={currentValue} onChange={(value) => handleInputChange(value, rowKey, col.dataIndex)} disabled={loading} />;
              case "custom_autocomplete_municipalities":
                return <MunicipalitiesAutocomplete value={currentValue} onChange={(value) => handleInputChange(value, rowKey, col.dataIndex)} selectedProvince={editedData[rowKey]?.province ?? record.province} disabled={loading} onDistrictChange={(district) => handleInputChange(district, rowKey, "cong_district")} />;
              case "custom_autocomplete_barangay":
                return <BarangayAutocomplete value={currentValue} onChange={(value) => handleInputChange(value, rowKey, col.dataIndex)} selectedProvince={editedData[rowKey]?.province ?? record.province} selectedMunicipality={editedData[rowKey]?.city ?? record.city} disabled={loading} />;
              case "custom_autocomplete_industryclass":
                return <IndustryClassAutocomplete value={currentValue} onChange={(value) => handleInputChange(value, rowKey, col.dataIndex)} theme={theme} isEditing={true} disabled={loading} />;
              // Add other custom autocompletes if needed for survey data
              default:
                return originalRender ? originalRender(text, record, index) : text;
            }
          }
          return originalRender ? originalRender(text, record, index) : text;
        };

        if (isActuallyFrozen) {
          accumulatedWidth += baseCol.width;
          col.fixed = "left";
          col.onHeaderCell = () => ({ className: "table-header-frozen" });
        }
        return col;
      })
      .map((col) => {
        // Apply text input filters to all filterable columns for simplicity
        // Adjust `surveyFilterableFields` on the server-side accordingly.
        if (col.dataIndex || col.key) { // Ensure column has a dataIndex or key to filter on
          return { ...col, ...getColumnSearchProps(col.dataIndex || col.key, col.title) };
        }
        return col;
      });
  }, [baseColumns, frozenColumnKeys, visibleColumnKeys, editingRowKeys, editedData, theme, handleInputChange, data, columnFilters]);

  const onSelectChange = (newSelectedRowKeys) => {
    setSelectedRowKeys(newSelectedRowKeys);
  };

  const rowSelection = {
    selectedRowKeys,
    onChange: onSelectChange,
    getCheckboxProps: (record) => ({
      disabled: editingRowKeys.length > 0,
    }),
  };

  const isAnyFilterActive = selectedSurveyStatus || searchTerm || selectedProvince || (columnFilters && Object.keys(columnFilters).length > 0);

  const getActiveFilterKeyword = () => {
    if (searchTerm) return searchTerm;
    if (columnFilters && Object.keys(columnFilters).length > 0) {
      const firstActiveColumnFilterKey = Object.keys(columnFilters)[0];
      const filterValue = columnFilters[firstActiveColumnFilterKey];
      return Array.isArray(filterValue) ? filterValue[0] : filterValue;
    }
    return null;
  };

  return (
    <div className={`monitoring-page-container ${theme === "dark" ? "theme-dark" : "theme-light"}`}>
      <DashboardTiles
        theme={theme}
        onSurveyStatusSelect={handleSurveyStatusSelect}
        selectedSurveyStatus={selectedSurveyStatus}
        onViewSurveyDetails={handleShowBreakdownDetails} // Or a survey-specific detail handler
      />

      <div style={{ display: "flex", alignItems: "flex-start" }} className="table-controls-header">
        <div className="table-controls-left" style={{ display: "flex", alignItems: "flex-start" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
            <Input.Search
              placeholder="Search survey records..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onSearch={handleSearch}
              style={{ width: 300 }}
              allowClear
              enterButton
            />
            {isAnyFilterActive && (
              <div style={{ marginTop: "8px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
                {selectedSurveyStatus && (
                  <Tag closable onClose={() => handleSurveyStatusSelect(null)} color="cyan">
                    Status: {selectedSurveyStatus}
                  </Tag>
                )}
                {/* Add other active filter tags here */}
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
              <Select.Option key={provinceName} value={provinceName}>
                {provinceName}
              </Select.Option>
            ))}
          </Select>
        </div>
        <div className="table-controls-right">
          {editingRowKeys.length > 0 ? (
            <>
              <Button onClick={handleSaveEdit} type="primary" loading={loading} size="small">
                Save
              </Button>
              <Button onClick={handleCancelEdit} disabled={loading} size="small">
                Cancel
              </Button>
            </>
          ) : (
            <Tooltip title="Edit Selected Survey Data">
              <Button
                type="primary"
                icon={<EditOutlined />}
                disabled={selectedRowKeys.length === 0 || loading}
                onClick={handleEditClick}
                size="small"
              />
            </Tooltip>
          )}
          <Tooltip title="Show/Hide Columns">
            <Dropdown
              disabled={editingRowKeys.length > 0 || loading}
              overlay={<CustomDropdownContentWrapper menuComponent={columnVisibilityMenu} onOkClick={() => setIsColumnVisibilityDropdownOpen(false)} theme={theme} />}
              trigger={["click"]}
              open={isColumnVisibilityDropdownOpen}
              onOpenChange={setIsColumnVisibilityDropdownOpen}
            >
              <Button type="primary" icon={<TableOutlined />} size="small">
                <DownOutlined />
              </Button>
            </Dropdown>
          </Tooltip>
          <Tooltip title="Freeze Columns">
            <Dropdown
              disabled={editingRowKeys.length > 0 || loading}
              overlay={<CustomDropdownContentWrapper menuComponent={freezeMenu} onOkClick={() => setIsFreezeDropdownOpen(false)} theme={theme} />}
              trigger={["click"]}
              open={isFreezeDropdownOpen}
              onOpenChange={setIsFreezeDropdownOpen}
            >
              <Button type="primary" size="small" icon={<SettingOutlined />}>
                <DownOutlined />
              </Button>
            </Dropdown>
          </Tooltip>
          <Tooltip title="Format Table">
            <Popover
              disabled={editingRowKeys.length > 0 || loading}
              content={tableFormatMenuContent}
              title="Table Format"
              trigger="click"
              placement="bottomRight"
            >
              <Button type="primary" icon={<ToolFilled />} size="small" />
            </Popover>
          </Tooltip>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              setSearchTerm("");
              setSelectedProvince(null);
              setSelectedSurveyStatus(null);
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
                if (newPageSize !== pagination.pageSize) {
                  setPagination({ current: 1, pageSize: newPageSize });
                } else {
                  setPagination({ current: newPage, pageSize: newPageSize });
                }
              }}
            />
          )}
        </div>
      </div>

      <Table
        dataSource={data}
        columns={finalTableColumns}
        rowKey={(record) => record._id} // Assuming survey data has _id
        rowSelection={rowSelection}
        pagination={false}
        loading={loading}
        onChange={handleTableChange}
        scroll={{ x: 1500, y: tableScrollY }} // Adjust x scroll as needed
        bordered={isTableBordered}
        size={currentTableSize}
      />

      {/* The Breakdown component might need adaptation for survey data criteria */}
      <Breakdown
        visible={showBreakdownModal}
        onClose={handleCloseBreakdownModal}
        criteria={breakdownCriteria}
        theme={theme}
        currentUser={JSON.parse(localStorage.getItem("currentUser"))}
        // setShouldRefreshTableForParent={setShouldRefreshTable} // If needed
        // handleReloadParentTable={fetchData} // If needed
      />
    </div>
  );
};

export default MonitoringSurvey;