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
  Modal,
  ConfigProvider,
  Collapse,
  message,
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
  DashboardOutlined,
  ClockCircleFilled,
  TagsOutlined,
  CheckOutlined,
  CloseOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";
import {
  fetchSWMPlanDashboardStats,
  fetchSWMPlanData,
  updateSWMPlanRecord,
} from "../../api/eswm/swmplanService";
import dayjs from "dayjs";
// import Breakdown from "./Breakdown"; // Assuming a similar Breakdown component might be used or adapted
import "./swmplan.css";

const { Panel } = Collapse;
const { TextArea } = Input;

// Constant for the IIS base URL
const IIS_BASE_URL = "https://iis.emb.gov.ph/embis/dms/documents/tracker/";

// Helper component for rendering IIS links
const IISLink = ({ iisNo, color, year }) => {
  if (!iisNo || iisNo.trim() === "" || iisNo.trim() === "N/A") {
    return null; // Don't render if no valid IIS number
  }

  const trimmedIisNo = iisNo.trim();
  const linkUrl = `${IIS_BASE_URL}?trn_no=${encodeURIComponent(trimmedIisNo)}`;

  return (
    <span style={{ display: "block", lineHeight: "1.2" }}>
      <TagsOutlined style={{ color: color, marginRight: 4 }} />
      <a
        href={linkUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: color, textDecoration: "none" }}
      >
        {trimmedIisNo} {year ? `(${year})` : ""}
      </a>
    </span>
  );
};

// Helper function for province background colors (adapted from Monitoring.jsx's section colors)
const provinceBackgroundColor = (province) => {
  const normalizedProvince = String(province || "")
    .toUpperCase()
    .replace(/ /g, "_");

  switch (normalizedProvince) {
    case "AURORA":
      return "#A4B465";
    case "BATAAN":
      return "#D2D0A0";
    case "BULACAN":
      return "#7A73D1";
    case "NUEVA_ECIJA":
      return "#DDA853";
    case "PAMPANGA":
      return "#DF9755";
    case "TARLAC":
      return "#39C665";
    case "ZAMBALES":
      return "#161A30";
    default:
      return "#B0BEC5"; // Default color for other provinces or if not matched
  }
};

// Helper function to determine text color based on background for provinces
const getProvinceTextColor = (bgColorString, theme) => {
  if (!bgColorString || bgColorString === "transparent") {
    return theme === "dark"
      ? "rgba(255, 255, 255, 0.85)"
      : "rgba(0, 0, 0, 0.88)"; // Default antd text color
  }
  // List of lighter background colors that need dark text
  const lightBgColorsForDarkText = [
    "#A4B465",
    "#D2D0A0",
    "#DDA853",
    "#DF9755",
    "#B0BEC5",
  ];

  if (lightBgColorsForDarkText.includes(bgColorString.toUpperCase())) {
    return "#263238"; // Dark text color
  }
  return "white"; // Default to white text for other (darker) backgrounds
};

// New: WasteDetailsModal component
const WasteDetailsModal = ({ visible, onClose, record }) => {
  if (!record) return null;

  const columns = [
    {
      dataIndex: "metric",
      key: "metric",
      width: "40%",
      render: (text) => <span style={{ fontWeight: "bold" }}>{text}:</span>,
    },
    {
      dataIndex: "value",
      key: "value",
      width: "60%",
    },
  ];

  const wasteSections = [
    {
      title: "General Waste Summary",
      items: [
        { label: "PCG", dataIndex: "pcg", unit: "kg/day" },
        {
          label: "Total Waste Generated",
          dataIndex: "waste_gen_total",
          unit: "kg/day",
        },
        {
          label: "Total Diversion Rate",
          dataIndex: "div_rate_total",
          unit: "%",
        },
      ],
    },
    {
      title: "LGU Specific Waste Data",
      items: [
        {
          label: "LGU Total Waste Generation",
          dataIndex: "lgu_waste_gen_total",
          unit: "kg/day",
        },
        {
          label: "LGU Per Capita",
          dataIndex: "lgu_per_capita",
          unit: "kg/capita/day",
        },
      ],
    },
    {
      title: "Waste Composition",
      items: [
        { label: "LGU Bio Waste", dataIndex: "lgu_bio_waste", unit: "kg/day" },
        { label: "LGU Bio %", dataIndex: "lgu_bio_percent", unit: "%" },
        {
          label: "LGU Recyclable Waste",
          dataIndex: "lgu_recycle_waste",
          unit: "kg/day",
        },
        {
          label: "LGU Recyclable %",
          dataIndex: "lgu_recycle_percent",
          unit: "%",
        },
        { label: "LGU Residual", dataIndex: "lgu_residual", unit: "kg/day" },
        {
          label: "LGU Residual %",
          dataIndex: "lgu_residual_percent",
          unit: "%",
        },
        {
          label: "LGU Special Waste",
          dataIndex: "lgu_waste_special",
          unit: "kg/day",
        },
        {
          label: "LGU Special Waste %",
          dataIndex: "lgu_waste_special_percent",
          unit: "%",
        },
      ],
    },
    {
      title: "Rates",
      items: [
        {
          label: "LGU Diversion Rate",
          dataIndex: "lgu_waste_div_rate",
          unit: "%",
        },
        {
          label: "LGU Disposal Rate",
          dataIndex: "lgu_disposal_rate",
          unit: "%",
        },
        {
          label: "LGU Residual Disposal",
          dataIndex: "lgu_residual_disposal",
          unit: "kg/day",
        },
        {
          label: "LGU Residual Disposal %",
          dataIndex: "lgu_residual_disposal_percent",
          unit: "%",
        },
      ],
    },
  ];

  const createDataSource = (record, items) => {
    return items
      .map((item) => {
        const value = record[item.dataIndex];
        if (value === null || value === undefined || value === "") return null;
        return {
          key: item.dataIndex,
          metric: item.label,
          value: `${value} ${item.unit || ""}`.trim(),
        };
      })
      .filter(Boolean);
  };

  return (
    <Modal
      title={`Waste Generation Details for ${record.city}, ${record.province}`}
      open={visible}
      onCancel={onClose}
      footer={null} // No footer buttons needed for display-only modal
      width={600}
    >
      <div style={{ marginTop: "20px" }}>
        {wasteSections.map((section, index) => {
          const dataSource = createDataSource(record, section.items);
          if (dataSource.length === 0) return null;
          return (
            <div
              key={section.title}
              style={{
                marginBottom: index < wasteSections.length - 1 ? 24 : 0,
              }}
            >
              <Table
                columns={columns}
                dataSource={dataSource}
                pagination={false}
                title={() => <h4 style={{ margin: 0 }}>{section.title}</h4>}
                size="small"
                bordered
                showHeader={false}
              />
            </div>
          );
        })}
      </div>
    </Modal>
  );
};

const DashboardTiles = ({
  theme,
  onPlanStatusSelect, // Example: Filter by plan status
  selectedPlanStatus,
  onProvinceFilterSelect, // Example: Filter by province (if applicable to dashboard tiles)
  selectedProvinceFilterValue,
  onViewBreakdownDetails, // For viewing detailed lists
}) => {
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    const fetchDashboardStats = async () => {
      setLoadingStats(true);
      try {
        const response = await fetchSWMPlanDashboardStats();
        setStats(response);
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
          marginBottom: "1px",
          ...(statisticColorOverride && { color: statisticColorOverride }),
        }}
      />
    </Card>
  );

  if (loadingStats) {
    return (
      <div className="loading-stats-container">
        <Progress
          percent={50}
          status="active"
          showInfo={false}
          strokeColor={{ from: "#108ee9", to: "#87d068" }}
        />
        <p>Loading SWM Plan dashboard statistics...</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="failed-stats-message">
        Failed to load SWM Plan dashboard statistics.
      </div>
    );
  }

  // Example: Displaying total plans and breakdown by status
  const {
    totalPlans = 0,
    statusBreakdown = [],
    provinceBreakdown = [],
    remarksBreakdown = {},
  } = stats || {};

  return (
    <div className="dashboard-tiles-container">
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6} lg={6}>
          <Card title="SWM Plan Overview" className="dashboard-tile-card">
            {renderStyledSmallStatCard("Total LGU Count", totalPlans, {
              cardClassName: "overview-total-lgu",
              onClick: () =>
                onViewBreakdownDetails({
                  type: "allPlans",
                  label: "All SWM Plans",
                }),
            })}

            <Row gutter={[8, 8]} style={{ marginTop: "16px" }}>
              {Object.keys(remarksBreakdown).length > 0 ? (
                Object.entries(remarksBreakdown).map(([remarkType, count]) => (
                  <Col xs={12} sm={12} md={12} key={remarkType}>
                    {renderStyledSmallStatCard(remarkType, count, {
                      cardClassName:
                        remarkType === "Compliant"
                          ? "remark-compliant"
                          : remarkType === "Not Compliant"
                          ? "remark-non-compliant"
                          : "",
                    })}
                  </Col>
                ))
              ) : (
                <Col span={24}>
                  <div className="no-data-message">No remarks data</div>
                </Col>
              )}
            </Row>
          </Card>
        </Col>

        <Col xs={24} sm={24} md={8} lg={8}>
          <Card title="Plans by Province" className="dashboard-tile-card">
            <Row gutter={[8, 8]}>
              {provinceBreakdown.length > 0 ? (
                provinceBreakdown.map((item) => (
                  <Col xs={12} sm={8} md={6} key={item.province}>
                    {renderStyledSmallStatCard(item.province, item.count, {
                      // Pass theme to renderStyledSmallStatCard
                      cardStyle: {
                        backgroundColor: provinceBackgroundColor(item.province),
                      },
                      statisticColorOverride: getProvinceTextColor(
                        provinceBackgroundColor(item.province),
                        theme
                      ),
                      // Add styling/onClick for province tiles if needed
                      onClick: () => onProvinceFilterSelect(item.province), // Example action
                      isActive: selectedProvinceFilterValue === item.province,
                    })}
                  </Col>
                ))
              ) : (
                <Col span={24}>
                  <div className="no-data-message">No province data</div>
                </Col>
              )}
            </Row>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

const SWMPlan = ({ theme = "light" }) => {
  const [messageApi, contextHolder] = message.useMessage();
  const [data, setData] = useState([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [tableScrollY, setTableScrollY] = useState(0);
  const [frozenColumnKeys, setFrozenColumnKeys] = useState(["id_no", "city"]);
  const [currentTableSize, setCurrentTableSize] = useState("small");
  const [isTableBordered, setIsTableBordered] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProvince, setSelectedProvince] = useState(null);
  const [allProvinces, setAllProvinces] = useState([]);
  const [visibleColumnKeys, setVisibleColumnKeys] = useState([]);
  const [selectedPlanStatus, setSelectedPlanStatus] = useState(null);
  const [isColumnVisibilityDropdownOpen, setIsColumnVisibilityDropdownOpen] =
    useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [inputValue, setInputValue] = useState(searchTerm);
  const [isFreezeDropdownOpen, setIsFreezeDropdownOpen] = useState(false);
  const [editingRowKeys, setEditingRowKeys] = useState([]);
  const [editedData, setEditedData] = useState({});
  const [initialBaseColumnKeys, setInitialBaseColumnKeys] = useState(null);
  const [columnFilters, setColumnFilters] = useState({});
  const [showWasteDetailsModal, setShowWasteDetailsModal] = useState(false);
  const [selectedWasteRecord, setSelectedWasteRecord] = useState(null);

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
      const result = await fetchSWMPlanData(
        page,
        pageSize,
        search,
        province,
        planStatus,
        currentColumnFilters
      );
      setData(result.data);
      setTotal(result.total);
      setPagination({ current: page, pageSize });
    } catch (err) {
      console.error("Failed to fetch SWM Plan data", err);
      messageApi.error("Failed to fetch SWM Plan data.");
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
    const staticProvincesList = [
      "Aurora",
      "Bataan",
      "Bulacan",
      "Nueva Ecija",
      "Pampanga",
      "Tarlac",
      "Zambales",
    ];
    setAllProvinces(staticProvincesList.sort());
  }, []);

  useEffect(() => {
    const calculateTableHeight = () => {
      const windowHeight = window.innerHeight;
      // This offset accounts for the height of elements outside the scrollable table area,
      // such as the main app header, dashboard, table controls, and various paddings/margins.
      // It's an estimation to dynamically size the table based on the current layout.
      const totalOffset = 540;
      const dynamicHeight = windowHeight - totalOffset;

      // Set a minimum height to ensure at least ~10 rows are visible.
      // A 'small' antd table row is ~39px high, so 10 rows need ~390px.
      // We use 400px as a safe minimum.
      setTableScrollY(Math.max(900, dynamicHeight));
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

  const parseIdNo = (idNo) => {
    const parts = String(idNo).split("-");
    const prefix = parts[0];
    const number = parseInt(parts[1], 10);
    return { prefix, number };
  };

  const getWorkingDays = (start, end) => {
    if (!start || !end) return "";
    const startDate = dayjs(
      start,
      ["YYYY-MM-DD", "M/D/YYYY", dayjs.ISO_8601],
      true
    );
    const endDate = dayjs(
      end,
      ["YYYY-MM-DD", "M/D/YYYY", dayjs.ISO_8601],
      true
    );
    if (!startDate.isValid() || !endDate.isValid()) return "";
    if (startDate.isSame(endDate, "day")) return 1;
    let days = 0;
    let current = startDate.startOf("day");
    const last = endDate.startOf("day");
    while (current.isBefore(last) || current.isSame(last, "day")) {
      const day = current.day();
      if (day !== 0 && day !== 6) days++;
      current = current.add(1, "day");
    }
    return days === 0 ? 1 : days;
  };

  // Define baseColumns for SWMPlan
  const baseColumns = useMemo(
    () => [
      // LGU & Plan Info
      {
        title: "ID No.",
        dataIndex: "id_no",
        key: "id_no",
        width: 100,
        sorter: (a, b) => {
          const aParsed = parseIdNo(a.id_no);
          const bParsed = parseIdNo(b.id_no);
          const prefixComparison = aParsed.prefix.localeCompare(bParsed.prefix);
          if (prefixComparison !== 0) return prefixComparison;
          return aParsed.number - bParsed.number;
        },
        onHeaderCell: () => ({ className: "table-header-center" }),
      },

      {
        title: "Province",
        dataIndex: "province",
        key: "province",
        width: 150,
        dataType: "custom_autocomplete_province",
        sorter: (a, b) => String(a.province).localeCompare(String(b.province)),
        onHeaderCell: () => ({ className: "table-header-center" }),
      },
      {
        title: "City/Municipality",
        dataIndex: "city",
        key: "city",
        width: 180,
        dataType: "text",
        onHeaderCell: () => ({ className: "table-header-center left-align" }),
      },
      {
        title: "Remarks & Compliance Remarks",
        key: "remarks_and_compliance",
        width: 180,
        dataType: "custom_remarks_compliance",
        onHeaderCell: () => ({ className: "table-header-center" }),
        render: (_, record) => {
          // Style for the Remarks/Recommendations value (keep your original design)
          let bg = "#fff";

          let color = "#222";
          if (record.remarks_recommendations === "Compliant") {
            bg = "#237804";
            color = "#f6ffed";
          } else if (record.remarks_recommendations === "Not Compliant") {
            bg = "#a8071a";
            color = "#fff1f0";
          }
          return (
            <div>
              <div
                style={{
                  background: bg,
                  borderRadius: 4,
                  padding: "4px 8px",
                  fontSize: "12px",
                  color,
                  wordBreak: "break-word",
                  minHeight: 28,
                  textAlign: "center",
                  marginBottom: 10,
                }}
              >
                {record.remarks_recommendations &&
                record.remarks_recommendations.trim() !== ""
                  ? record.remarks_recommendations
                  : ""}
              </div>

              <div
                style={{
                  padding: "4px 8px",
                  fontSize: "10px",

                  wordBreak: "break-word",
                  minHeight: 28,
                  textAlign: "left",
                }}
              >
                
                {record.compliance_remarks &&
                record.compliance_remarks.trim() !== ""
                  ? record.compliance_remarks
                  : ""}
              </div>
            </div>
          );
        },
      },
      {
        title: "MBA Jurisdiction",
        dataIndex: "mba_juris",
        key: "mba_juris",
        width: 160,
        dataType: "custom_mba_juris",
        onHeaderCell: () => ({ className: "table-header-center" }),
        render: (text) => {
          if (text === "MBA") {
            return (
              <Tag icon={<CheckOutlined />} color="success">
                MBA
              </Tag>
            );
          }
          if (text === "OUTSIDE MBA") {
            return (
              <Tag icon={<CloseOutlined />} color="error">
                OUTSIDE MBA
              </Tag>
            );
          }
          return text;
        },
      },
      {
        title: "Cong. District",
        dataIndex: "cong_district",
        key: "cong_district",
        width: 150,
        dataType: "custom_cong_district",
        onHeaderCell: () => ({ className: "table-header-center" }),
      },
      {
        title: "Coordinates",
        dataIndex: "coordinates",
        key: "coordinates",
        width: 200,
        dataType: "custom_coordinates",
        onHeaderCell: () => ({ className: "table-header-center" }),
        render: (_, record) => (
          <div>
            <div>Lat: {record.lat ?? "N/A"}</div>
            <div>Long: {record.long ?? "N/A"}</div>
          </div>
        ),
      },
      {
        title: "SWM Plan Type",
        dataIndex: "swm_plan_type",
        key: "swm_plan_type",
        width: 150,
        dataType: "text",
        onHeaderCell: () => ({ className: "table-header-center" }),
      },

      // Resolution & Approval
      {
        title: "Resolution No.",
        dataIndex: "resolution_no",
        key: "resolution_no",
        width: 150,
        dataType: "text",
        onHeaderCell: () => ({ className: "table-header-center" }),
        render: (_, record) => (
          <div>
            <div className="left-align">{record.resolution_no ?? "N/A"}</div>
          </div>
        ),
      },
      {
        title: "Issued Resolution",
        dataIndex: "issued_resolution",
        key: "issued_resolution",
        width: 200,
        dataType: "custom_issued_resolution",
        render: (_, record) => (
          <div>
            <div className="left-align reso">
              Covered: {record.resolution_covered ?? "N/A"}
            </div>
            <div className="left-align reso">
              Type: {record.resolution_type ?? ""}
            </div>
          </div>
        ),
      },
      {
        title: "Approval Validity",
        key: "approval_validity",
        width: 160,
        dataType: "custom_approval_validity",
        onHeaderCell: () => ({ className: "table-header-center" }),
        render: (_, record) => (
          <div style={{ textAlign: "left", paddingLeft: "10px" }}>
            <div style={{ marginBottom: "4px" }}>
              <Tooltip title="Date Approved">
                <CalendarOutlined
                  style={{ marginRight: 8, color: "#52c41a" }}
                />
              </Tooltip>
              Date Approved: {record.year_approved ?? "N/A"}
            </div>
            <div>
              <Tooltip title="Valid Until">
                <ClockCircleOutlined
                  style={{ marginRight: 8, color: "#faad14" }}
                />
              </Tooltip>
              Valid Until: {record.year_end ?? "N/A"}
            </div>
          </div>
        ),
      },
      // Personnel & Tracking
      {
        title: "Target Month",
        dataIndex: "target_month",
        key: "target_month",
        width: 120,
        dataType: "text",
        onHeaderCell: () => ({ className: "table-header-center" }),
      },
      {
        title: "EWSM Personnel",
        dataIndex: "ewsm_personnel",
        key: "ewsm_personnel",
        width: 200,
        dataType: "custom_ewsm_personnel",
        onHeaderCell: () => ({ className: "table-header-center" }),
        render: (_, record) => (
          <div>
            <div className="left-align">
              ENMO Staff: {record.enmo_staff ?? ""}
            </div>
            <div className="left-align">
              ESWM Staff: {record.eswm_staff ?? ""}
            </div>
          </div>
        ),
      },
      {
        title: "Focal Person",
        dataIndex: "focal_person",
        key: "focal_person",
        width: 150,
        dataType: "text",
        onHeaderCell: () => ({ className: "table-header-center" }),
      },
      {
        title: "IIS No.",
        dataIndex: "iis_no",
        key: "iis_no",
        width: 150,
        dataType: "text",
        onHeaderCell: () => ({ className: "table-header-center" }),
        render: (_, record) => (
          <div className="left-align">
            {String(record.iis_no || "")
              .split(/\s+/) // Split by one or more spaces
              .filter((iis) => iis && iis.trim() !== "" && iis.trim() !== "N/A")
              .map((iis, index) => (
                <IISLink
                  key={index}
                  iisNo={iis}
                  color="#1890ff" // Default color, can be adapted
                  year={null} // No specific year for SWMPlan's iis_no column
                />
              ))}
          </div>
        ),
      },
      {
        title: "PISMU Tracking",
        dataIndex: "pismu_tracking",
        key: "pismu_tracking",
        width: 180,
        dataType: "text",
        onHeaderCell: () => ({ className: "table-header-center" }),
        render: (_, record) => (
          <div>
            <div className="left-align">{record.pismu_tracking ?? ""}</div>
          </div>
        ),
      },

      // Dates & Timelines
      {
        title: "Monitoring Date",
        dataIndex: "monitoring_date",
        key: "monitoring_date",
        width: 180,
        onHeaderCell: () => ({ className: "table-header-center" }),
        render: (_, record) => {
          const rowKey = record._id || record.planId;
          const isEditing = editingRowKeys.includes(rowKey);

          if (isEditing) {
            const editedMonitored =
              editedData[rowKey]?.date_monitored ?? record.date_monitored;
            const editedPrepared =
              editedData[rowKey]?.date_report_prepared ??
              record.date_report_prepared;
            const monitoredDayjs = editedMonitored
              ? dayjs(
                  editedMonitored,
                  ["YYYY-MM-DD", "M/D/YYYY", dayjs.ISO_8601],
                  true
                )
              : null;
            const preparedDayjs = editedPrepared
              ? dayjs(
                  editedPrepared,
                  ["YYYY-MM-DD", "M/D/YYYY", dayjs.ISO_8601],
                  true
                )
              : null;
            const totalDays = getWorkingDays(editedMonitored, editedPrepared);

            return (
              <div>
                <div
                  className="left-align"
                  style={{ marginBottom: 8, marginTop: -17 }}
                >
                  Date Monitored:{" "}
                  <DatePicker
                    value={
                      monitoredDayjs && monitoredDayjs.isValid()
                        ? monitoredDayjs
                        : null
                    }
                    onChange={(date, dateString) =>
                      handleInputChange(dateString, rowKey, "date_monitored")
                    }
                    format="MM/DD/YYYY"
                    size="small"
                    style={{ width: "100%" }}
                  />
                </div>
                <div className="left-align" style={{ marginBottom: 8 }}>
                  Date Prepared:{" "}
                  <DatePicker
                    value={
                      preparedDayjs && preparedDayjs.isValid()
                        ? preparedDayjs
                        : null
                    }
                    onChange={(date, dateString) =>
                      handleInputChange(
                        dateString,
                        rowKey,
                        "date_report_prepared"
                      )
                    }
                    format="MM/DD/YYYY"
                    size="small"
                    style={{ width: "100%" }}
                  />
                </div>
                <div className="left-align total-days">
                  <ClockCircleFilled /> Total Days:{" "}
                  {totalDays !== ""
                    ? `${totalDays} ${totalDays === 1 ? "day" : "days"}`
                    : ""}
                </div>
              </div>
            );
          }

          // Not editing: show as before
          return (
            <div>
              <div className="left-align">
                Date Monitored:{" "}
                {record.date_monitored
                  ? dayjs(record.date_monitored).format("MM/DD/YYYY")
                  : ""}
              </div>
              <div className="left-align">
                Date Prepared:{" "}
                {record.date_report_prepared
                  ? dayjs(record.date_report_prepared).format("MM/DD/YYYY")
                  : ""}
              </div>
              <br />
              <br />
              <div className="left-align total-days">
                <ClockCircleFilled /> Total Days:
                {(() => {
                  const totalDays = getWorkingDays(
                    record.date_monitored,
                    record.date_report_prepared
                  );
                  return totalDays !== ""
                    ? ` ${totalDays} ${totalDays === 1 ? "day" : "days"}`
                    : "";
                })()}
              </div>
            </div>
          );
        },
      },
      {
        title: "Reviewing Date",
        dataIndex: "reviewing_date",
        key: "reviewing_date",
        width: 180,
        onHeaderCell: () => ({ className: "table-header-center" }),
        render: (_, record) => {
          const rowKey = record._id || record.planId;
          const isEditing = editingRowKeys.includes(rowKey);

          if (isEditing) {
            const editedEswm =
              editedData[rowKey]?.date_review_eswm ?? record.date_review_eswm;
            const editedFocal =
              editedData[rowKey]?.date_review_focal ?? record.date_review_focal;
            const eswmDayjs = editedEswm
              ? dayjs(
                  editedEswm,
                  ["YYYY-MM-DD", "M/D/YYYY", dayjs.ISO_8601],
                  true
                )
              : null;
            const focalDayjs = editedFocal
              ? dayjs(
                  editedFocal,
                  ["YYYY-MM-DD", "M/D/YYYY", dayjs.ISO_8601],
                  true
                )
              : null;
            const totalDaysEswm = getWorkingDays(
              record.date_report_prepared,
              editedEswm
            );
            const totalDaysFocal = getWorkingDays(
              record.date_report_prepared,
              editedFocal
            );

            return (
              <div>
                <div className="left-align" style={{ marginBottom: 8 }}>
                  ESWM Staff:{" "}
                  <DatePicker
                    value={eswmDayjs && eswmDayjs.isValid() ? eswmDayjs : null}
                    onChange={(date, dateString) =>
                      handleInputChange(dateString, rowKey, "date_review_eswm")
                    }
                    format="MM/DD/YYYY"
                    size="small"
                    style={{ width: "100%" }}
                  />
                </div>
                <div className="left-align" style={{ marginBottom: 8 }}>
                  ESWM Focal:{" "}
                  <DatePicker
                    value={
                      focalDayjs && focalDayjs.isValid() ? focalDayjs : null
                    }
                    onChange={(date, dateString) =>
                      handleInputChange(dateString, rowKey, "date_review_focal")
                    }
                    format="MM/DD/YYYY"
                    size="small"
                    style={{ width: "100%" }}
                  />
                </div>
                <div className="left-align total-days green">
                  <ClockCircleFilled /> Staff:{" "}
                  {totalDaysEswm !== ""
                    ? `${totalDaysEswm} ${totalDaysEswm === 1 ? "day" : "days"}`
                    : ""}
                </div>
                <div className="left-align total-days green">
                  <ClockCircleFilled /> Focal:{" "}
                  {totalDaysFocal !== ""
                    ? `${totalDaysFocal} ${
                        totalDaysFocal === 1 ? "day" : "days"
                      }`
                    : ""}
                </div>
              </div>
            );
          }

          // Not editing: show as before
          return (
            <div>
              <div className="left-align">
                ESWM Staff:{" "}
                {record.date_review_eswm
                  ? dayjs(record.date_review_eswm).format("MM/DD/YYYY")
                  : ""}
              </div>
              <div className="left-align">
                ESWM Focal:{" "}
                {record.date_review_focal
                  ? dayjs(record.date_review_focal).format("MM/DD/YYYY")
                  : ""}
              </div>
              <br />
              <div className="left-align total-days green">
                <ClockCircleFilled /> Staff:
                {record.days_dpdr_eswm
                  ? ` ${record.days_dpdr_eswm} ${
                      record.days_dpdr_eswm === 1 ? "day" : "days"
                    }`
                  : ""}
              </div>
              <div className="left-align total-days green">
                <ClockCircleFilled /> Focal:
                {record.days_dpdr_focal
                  ? ` ${record.days_dpdr_focal} ${
                      record.days_dpdr_focal === 1 ? "day" : "days"
                    }`
                  : ""}
              </div>
            </div>
          );
        },
      },
      {
        title: "Date Report Approved",
        dataIndex: "date_report_approved",
        key: "date_report_approved",
        width: 180,
        onHeaderCell: () => ({ className: "table-header-center" }),
        render: (_, record) => {
          const rowKey = record._id || record.planId;
          const isEditing = editingRowKeys.includes(rowKey);

          if (isEditing) {
            const editedApproved =
              editedData[rowKey]?.date_report_approved ??
              record.date_report_approved;
            const approvedDayjs = editedApproved
              ? dayjs(
                  editedApproved,
                  ["YYYY-MM-DD", "M/D/YYYY", dayjs.ISO_8601],
                  true
                )
              : null;

            // Use edited value if present, else fallback to record
            const reviewEswm =
              editedData[rowKey]?.date_review_eswm !== undefined
                ? editedData[rowKey]?.date_review_eswm
                : record.date_review_eswm;
            const reviewEswmDayjs = reviewEswm
              ? dayjs(
                  reviewEswm,
                  ["YYYY-MM-DD", "M/D/YYYY", dayjs.ISO_8601],
                  true
                )
              : null;
            const totalDays = getWorkingDays(reviewEswm, editedApproved);

            return (
              <div>
                <div
                  className="left-align"
                  style={{ marginBottom: 8, marginTop: -5 }}
                >
                  <div style={{ marginBottom: 4 }}>
                    <span style={{ minWidth: 80, display: "inline-block" }}>
                      Reviewed:
                    </span>
                    <DatePicker
                      value={
                        reviewEswmDayjs && reviewEswmDayjs.isValid()
                          ? reviewEswmDayjs
                          : null
                      }
                      onChange={(date, dateString) =>
                        handleInputChange(
                          dateString,
                          rowKey,
                          "date_review_eswm"
                        )
                      }
                      format="MM/DD/YYYY"
                      size="small"
                      style={{ width: "100%" }}
                    />
                  </div>
                </div>
                <br />
                <br />
                <br />
                <div
                  className="left-align total-days blue"
                  style={{ marginTop: 8 }}
                >
                  <ClockCircleFilled /> Reviewed:{" "}
                  {totalDays !== ""
                    ? `${totalDays} ${totalDays === 1 ? "day" : "days"}`
                    : ""}
                </div>
              </div>
            );
          }

          // Not editing: show as before
          return (
            <div>
              <div className="left-align">
                Reviewed:{" "}
                {record.date_review_eswm
                  ? dayjs(record.date_review_eswm).format("MM/DD/YYYY")
                  : ""}
              </div>
              <br />
              <div className="left-align total-days blue">
                <ClockCircleFilled /> Reviewed:
                {record.days_dpdr_dra
                  ? ` ${record.days_dpdr_dra} ${
                      record.days_dpdr_dra === 1 ? "day" : "days"
                    }`
                  : ""}
              </div>
            </div>
          );
        },
      },

      // Waste Data
      {
        title: "Waste Generation Summary",
        dataIndex: "waste_gen_summary",
        key: "waste_gen_summary",
        width: 200,
        onHeaderCell: () => ({ className: "table-header-center" }),
        render: (_, record) => {
          const hasPcg = record.pcg != null && record.pcg !== "";
          const hasWasteGen =
            record.waste_gen_total != null && record.waste_gen_total !== "";
          const hasDivRate =
            record.div_rate_total != null && record.div_rate_total !== "";

          // Per the request, the "View Details" button is hidden if the main summary values are not present.
          const showDetailsButton = hasPcg || hasWasteGen || hasDivRate;

          return (
            <div>
              <h5 style={{ margin: 0, fontSize: "12px", marginTop: -20 }}>
                Summary
              </h5>
              <div>
                <div className="left-align">
                  PCG: {record.pcg ? `${record.pcg} kg/day` : ""}
                </div>
                <div className="left-align">
                  Total Waste Gen.:{" "}
                  {record.waste_gen_total
                    ? `${record.waste_gen_total} kg/day`
                    : ""}
                </div>
                <div className="left-align">
                  Total Diversion Rate:{" "}
                  {record.div_rate_total ? `${record.div_rate_total} %` : ""}
                </div>
              </div>
              {showDetailsButton && (
                <Button
                  type="primary"
                  size="small"
                  className="view-summary-button"
                  onClick={() => {
                    setSelectedWasteRecord(record);
                    setShowWasteDetailsModal(true);
                  }}
                >
                  View Details
                </Button>
              )}
            </div>
          );
        },
      },
      {
        title: "LGU Disposal",
        dataIndex: "lgu_disposal",
        key: "lgu_disposal",
        width: 150,
        dataType: "text",
        onHeaderCell: () => ({ className: "table-header-center" }),
      },

      // Compliance
      {
        title: "Compliances",
        key: "compliances",
        width: 350,
        dataType: "custom_compliance",
        onHeaderCell: () => ({ className: "table-header-center" }),
        render: (_, record) => {
          const rowKey = record._id || record.planId;
          const isEditing = editingRowKeys.includes(rowKey); // Ensure isEditing is checked for each row
          const complianceItems = [
            {
              label: "A",
              key: "compliance_a",
              description: "Source Reduction Activities at source are present",
            },
            {
              label: "B",
              key: "compliance_b",
              description: "Collection segregated collection",
            },
            {
              label: "C",
              key: "compliance_c",
              description: "Storage and setout (Segregation at source)",
            },
            { label: "D", key: "compliance_d", description: "Processing MRF" },
            {
              label: "E",
              key: "compliance_e",
              description: "Transfer Station",
            },
            {
              label: "F",
              key: "compliance_f",
              description: "Disposal Facilities",
            },
          ];

          return (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
              }}
            >
              {complianceItems.map((item) => {
                const currentValue = isEditing // Get current value, prioritizing editedData
                  ? editedData[rowKey]?.[item.key] ?? record[item.key]
                  : record[item.key];

                let displayLabel = item.description;
                let isChecked = currentValue === "YES";
                let isCheckboxDisabled = !isEditing; // Default: disabled if not editing

                // If the value is "N/A", it should be displayed as unchecked and potentially with "(Not Applicable)"
                if (currentValue === "N/A") {
                  displayLabel = `${item.description} (Not Applicable)`;
                  isChecked = false; // N/A is not a "checked" state
                  // The checkbox should be disabled if not in editing mode.
                  // If in editing mode, it should be enabled so user can change N/A to YES/NO.
                  isCheckboxDisabled = !isEditing;
                }

                return (
                  <div
                    key={item.key}
                    style={{ marginBottom: "4px", fontSize: "10px" }}
                  >
                    <Checkbox
                      checked={isChecked}
                      onChange={(e) =>
                        handleInputChange(
                          e.target.checked ? "YES" : "NO", // Always set to YES or NO
                          rowKey,
                          item.key
                        )
                      }
                      style={{ marginLeft: 0, fontSize: "10px" }}
                    >
                      {displayLabel}
                    </Checkbox>
                  </div>
                );
              })}
            </div>
          );
        },
      },
      {
        title: "Compliance Dates",
        key: "compliance_dates",
        width: 220,
        dataType: "custom_compliance_dates", // Custom type to prevent default render
        onHeaderCell: () => ({ className: "table-header-center" }),
        render: (_, record) => {
          const rowKey = record._id || record.planId;
          const isEditing = editingRowKeys.includes(rowKey);

          if (isEditing) {
            const editedLetterDate =
              editedData[rowKey]?.letter_date_issued ??
              record.letter_date_issued;
            const editedComplianceDate =
              editedData[rowKey]?.compliance_date_issued ??
              record.compliance_date_issued;

            const letterDayjs = editedLetterDate
              ? dayjs(
                  editedLetterDate,
                  ["YYYY-MM-DD", "M/D/YYYY", dayjs.ISO_8601],
                  true
                )
              : null;
            const complianceDayjs = editedComplianceDate
              ? dayjs(
                  editedComplianceDate,
                  ["YYYY-MM-DD", "M/D/YYYY", dayjs.ISO_8601],
                  true
                )
              : null;

            return (
              <div>
                <div
                  style={{
                    marginBottom: "8px",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <span style={{ marginRight: "8px", minWidth: "55px" }}>
                    Letter:
                  </span>
                  <DatePicker
                    value={
                      letterDayjs && letterDayjs.isValid() ? letterDayjs : null
                    }
                    onChange={(date, dateString) =>
                      handleInputChange(
                        dateString,
                        rowKey,
                        "letter_date_issued"
                      )
                    }
                    format="YYYY-MM-DD"
                    style={{ width: "100%" }}
                    size="small"
                  />
                </div>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <span style={{ marginRight: "8px", minWidth: "55px" }}>
                    Issued:
                  </span>
                  <DatePicker
                    value={
                      complianceDayjs && complianceDayjs.isValid()
                        ? complianceDayjs
                        : null
                    }
                    onChange={(date, dateString) =>
                      handleInputChange(
                        dateString,
                        rowKey,
                        "compliance_date_issued"
                      )
                    }
                    format="YYYY-MM-DD"
                    style={{ width: "100%" }}
                    size="small"
                  />
                </div>
              </div>
            );
          }

          return (
            <div>
              <div className="left-align">
                Letter:{" "}
                {record.letter_date_issued
                  ? dayjs(record.letter_date_issued).format("MM/DD/YYYY")
                  : ""}
              </div>
              <div className="left-align">
                Issued:{" "}
                {record.compliance_date_issued
                  ? dayjs(record.compliance_date_issued).format("MM/DD/YYYY")
                  : ""}
              </div>
            </div>
          );
        },
      },
      {
        title: "Compliance Remarks",
        dataIndex: "compliance_remarks",
        key: "compliance_remarks",
        width: 250,
        dataType: "textarea",
        onHeaderCell: () => ({ className: "table-header-center" }),
      },
    ],
    [editingRowKeys, editedData]
  );

  // Server-side column filtering setup
  const getColumnSearchProps = (dataIndex, columnTitle) => ({
    filterDropdown: ({
      setSelectedKeys,
      selectedKeys,
      confirm,
      clearFilters,
    }) => (
      <div style={{ padding: 8 }} onKeyDown={(e) => e.stopPropagation()}>
        <Input
          placeholder={`Search ${columnTitle}`}
          value={selectedKeys[0]}
          onChange={(e) =>
            setSelectedKeys(e.target.value ? [e.target.value] : [])
          }
          onPressEnter={confirm}
          style={{ marginBottom: 8, display: "block" }}
        />
        <Space>
          <Button
            type="primary"
            onClick={confirm}
            size="small"
            style={{ width: 90 }}
          >
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
    filterIcon: (filtered) => (
      <AntSearchOutlined style={{ color: filtered ? "#1890ff" : undefined }} />
    ),
  });

  useEffect(() => {
    const currentAllBaseKeys = baseColumns
      .map((col) => col.key)
      .filter(Boolean);
    if (!initialBaseColumnKeys && currentAllBaseKeys.length > 0) {
      setInitialBaseColumnKeys(currentAllBaseKeys);
      setVisibleColumnKeys(currentAllBaseKeys);
    } else if (initialBaseColumnKeys) {
      setVisibleColumnKeys((prevVisibleKeys) => {
        const newVisible = prevVisibleKeys.filter((key) =>
          currentAllBaseKeys.includes(key)
        );
        return newVisible.length > 0
          ? newVisible
          : currentAllBaseKeys.length > 0
          ? [currentAllBaseKeys[0]]
          : [];
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
    const normalized = value === "" ? null : value;
    setSelectedProvince(normalized);
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
      const originalRecord = data.find(
        (item) => (item._id || item.planId) === rowKey
      );
      const currentEditedState = editedData[rowKey];
      if (originalRecord && currentEditedState) {
        // Assuming SWM Plans are identified by _id for updates
        const identifierForUrl = originalRecord._id;
        if (!identifierForUrl) {
          messageApi.warn(
            `Cannot save record without a valid ID (key: ${rowKey}).`
          );
          continue;
        }
        const { _id, key, ...changes } = currentEditedState; // Exclude _id and key from payload
        updatesToApi.push({ identifier: identifierForUrl, payload: changes });
      }
    }

    if (updatesToApi.length === 0) {
      messageApi.info("No valid changes to save.");
      setLoading(false);
      setEditingRowKeys([]);
      setEditedData({});
      return;
    }

    try {
      for (const update of updatesToApi) {
        await updateSWMPlanRecord(update.identifier, update.payload);
      }
      setData((prevData) =>
        prevData.map((row) => {
          if (editingRowKeys.includes(row._id || row.planId)) {
            const savedUpdate = updatesToApi.find(
              (u) => u.identifier === row._id
            );
            return savedUpdate
              ? { ...row, ...savedUpdate.payload }
              : { ...row, ...editedData[row._id || row.planId] };
          }
          return row;
        })
      );
      setEditingRowKeys([]);
      setEditedData({});
      messageApi.success("SWM Plan data saved successfully!");
    } catch (error) {
      console.error("Failed to save SWM Plan data", error);
      messageApi.error(
        `Failed to save SWM Plan data: ${
          error.response?.data?.error || error.message
        }`
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingRowKeys([]);
    setEditedData({});
  };

  const handleInputChange = React.useCallback(
    (value, rowKey, dataIndex) => {
      setEditedData((prev) => {
        const updatedRow = { ...prev[rowKey], [dataIndex]: value };

        // Auto-compute days_dpdr_dra if date_report_approved is changed
        if (dataIndex === "date_report_approved") {
          // Use edited value if present, else fallback to record
          const reviewEswm =
            updatedRow.date_review_eswm !== undefined
              ? updatedRow.date_review_eswm
              : data.find((item) => (item._id || item.planId) === rowKey)
                  ?.date_review_eswm ?? "";
          const days = getWorkingDays(reviewEswm, value);
          updatedRow.days_dpdr_dra = days;
        }

        return {
          ...prev,
          [rowKey]: updatedRow,
        };
      });
      // Add any SWM-specific derived field calculations here if needed
    },
    [data] // Add dependencies if they affect input change logic
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
      if (!checked)
        setFrozenColumnKeys((fKeys) =>
          fKeys.filter((fKey) => fKey !== columnKey)
        );
      return newVisibleKeys;
    });
  };

  const handleShowAllColumns = () =>
    setVisibleColumnKeys(baseColumns.map((col) => col.key).filter(Boolean));
  const handleHideAllColumns = () => {
    if (baseColumns.length > 0 && baseColumns[0].key) {
      setVisibleColumnKeys([baseColumns[0].key]);
      setFrozenColumnKeys((fKeys) =>
        fKeys.filter((fKey) => fKey === baseColumns[0].key)
      );
    } else {
      setVisibleColumnKeys([]);
    }
  };

  // Column groups for visibility menu (adapt for SWM Plan fields)
  const COLUMN_GROUP_CONFIG = {
    LGU_PLAN_INFO: {
      title: "LGU & Plan Info",
      keys: [
        "id_no",
        "province",
        "city",
        "address",
        "mba_juris",
        "cong_district",
        "coordinates",
        "swm_plan_type",
      ],
    },
    RESOLUTION: {
      title: "Resolution & Approval",
      keys: ["resolution_no", "issued_resolution", "approval_validity"],
    },
    PERSONNEL: {
      title: "Personnel & Tracking",
      keys: [
        "target_month",
        "ewsm_personnel",
        "focal_person",
        "iis_no",
        "pismu_tracking",
      ],
    },
    TIMELINES: {
      title: "Dates & Timelines",
      keys: [
        "monitoring_date",
        "reviewing_date",
        "date_report_approved",
        "days_dmdp",
        "days_dpdr_eswm",
        "days_dpdr_focal",
        "days_dpdr_dra",
      ],
    },
    WASTE_DATA: {
      title: "Waste Data",
      keys: [
        "waste_gen_summary",
        // Detailed waste fields are now in the modal
      ],
    },
    COMPLIANCE: {
      title: "Compliance",
      keys: ["compliances", "compliance_dates", "compliance_remarks"],
    },
    REMARKS: {
      title: "Remarks",
      keys: ["remarks_recommendations"],
    },
  };

  const CustomDropdownContentWrapper = ({
    menuComponent,
    onOkClick,
    theme,
  }) => (
    <div
      className={`custom-dropdown-wrapper ${
        theme === "dark" ? "theme-dark" : "theme-light"
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      {menuComponent}
      <Divider className="custom-dropdown-divider" />
      <div className="custom-dropdown-footer">
        <Button
          type="primary"
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            onOkClick();
          }}
        >
          OK
        </Button>
      </div>
    </div>
  );

  const allBaseColumnKeys = useMemo(
    () => baseColumns.map((col) => col.key).filter(Boolean),
    [baseColumns]
  );
  const isAllColumnsVisible = useMemo(() => {
    if (allBaseColumnKeys.length === 0) return false;
    return (
      allBaseColumnKeys.every((key) => visibleColumnKeys.includes(key)) &&
      visibleColumnKeys.length === allBaseColumnKeys.length
    );
  }, [visibleColumnKeys, allBaseColumnKeys]);

  const handleToggleGroupVisibility = (
    groupColumnKeysToToggle,
    makeVisible
  ) => {
    setVisibleColumnKeys((currentVisibleKeys) => {
      let newVisibleKeys;
      if (makeVisible)
        newVisibleKeys = [
          ...new Set([...currentVisibleKeys, ...groupColumnKeysToToggle]),
        ];
      else {
        const keysAfterHidingGroup = currentVisibleKeys.filter(
          (key) => !groupColumnKeysToToggle.includes(key)
        );
        if (
          keysAfterHidingGroup.length === 0 &&
          baseColumns.length > 0 &&
          baseColumns[0]?.key
        )
          newVisibleKeys = [baseColumns[0].key];
        else newVisibleKeys = keysAfterHidingGroup;
        const actuallyHiddenKeys = groupColumnKeysToToggle.filter(
          (key) =>
            currentVisibleKeys.includes(key) && !newVisibleKeys.includes(key)
        );
        if (actuallyHiddenKeys.length > 0)
          setFrozenColumnKeys((fKeys) =>
            fKeys.filter((fKey) => !actuallyHiddenKeys.includes(fKey))
          );
      }
      return newVisibleKeys;
    });
  };

  const groupedColumnMenuItems = useMemo(() => {
    const menuItems = [];
    const allGroupedKeys = new Set(
      Object.values(COLUMN_GROUP_CONFIG).flatMap((g) => g.keys)
    );
    Object.entries(COLUMN_GROUP_CONFIG).forEach(([groupKey, groupDetails]) => {
      const columnsInGroup = baseColumns.filter((col) =>
        groupDetails.keys.includes(col.key)
      );
      if (columnsInGroup.length === 0) return;
      menuItems.push({
        type: "groupHeader",
        key: `group-${groupKey}`,
        title: groupDetails.title,
        columns: columnsInGroup,
        allKeysInGroup: groupDetails.keys,
      });
      columnsInGroup.forEach((col) =>
        menuItems.push({
          type: "column",
          key: col.key,
          title: col.title,
          parentGroupKey: `group-${groupKey}`,
        })
      );
    });
    const otherColumns = baseColumns.filter(
      (col) => col.key && !allGroupedKeys.has(col.key)
    );
    if (otherColumns.length > 0) {
      menuItems.push({
        type: "groupHeader",
        key: "group-other",
        title: "Other Columns",
        columns: otherColumns,
        isOtherGroup: true,
      });
      otherColumns.forEach((col) =>
        menuItems.push({
          type: "column",
          key: col.key,
          title: col.title,
          parentGroupKey: "group-other",
        })
      );
    }
    return menuItems;
  }, [baseColumns, visibleColumnKeys]);

  const columnVisibilityMenu = (
    <Menu className="column-visibility-menu">
      <Menu.Item
        key="show-all-columns"
        onClick={(e) => {
          e.stopPropagation();
          handleShowAllColumns();
        }}
      >
        <Checkbox
          checked={isAllColumnsVisible}
          onChange={(e) =>
            e.target.checked ? handleShowAllColumns() : handleHideAllColumns()
          }
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
          const visibleInGroupCount = groupColsInBase.filter((col) =>
            visibleColumnKeys.includes(col.key)
          ).length;
          const isGroupChecked =
            groupColsInBase.length > 0 &&
            visibleInGroupCount === groupColsInBase.length;
          const isGroupIndeterminate =
            visibleInGroupCount > 0 &&
            visibleInGroupCount < groupColsInBase.length;
          return (
            <React.Fragment key={item.key}>
              {index > 0 &&
                !groupedColumnMenuItems[index - 1].parentGroupKey && (
                  <Menu.Divider />
                )}
              <Menu.ItemGroup title={item.title}>
                {!item.isOtherGroup && (
                  <Menu.Item
                    key={`${item.key}-master`}
                    onClick={(e) => e.stopPropagation()}
                    style={{ fontWeight: "500" }}
                  >
                    <Checkbox
                      checked={isGroupChecked}
                      indeterminate={isGroupIndeterminate}
                      onChange={(e) =>
                        handleToggleGroupVisibility(
                          item.allKeysInGroup,
                          e.target.checked
                        )
                      }
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
              className={
                item.parentGroupKey && item.parentGroupKey !== "group-other"
                  ? "column-visibility-menu-item-indented"
                  : "column-visibility-menu-item-default-indent"
              }
            >
              <Checkbox
                checked={isVisible}
                onChange={(e) =>
                  handleColumnVisibilityChange(item.key, e.target.checked)
                }
                disabled={
                  isVisible &&
                  visibleColumnKeys.length === 1 &&
                  visibleColumnKeys[0] === item.key
                }
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

  const columnsForFreezeMenu = useMemo(
    () => baseColumns.filter((col) => visibleColumnKeys.includes(col.key)),
    [baseColumns, visibleColumnKeys]
  );

  const freezeMenu = (
    <Menu className="freeze-column-menu">
      {columnsForFreezeMenu.map((col) => {
        const canBeFrozen = !!col.width;
        const isCurrentlyFrozen = frozenColumnKeys.includes(col.key);
        const limitReached = frozenColumnKeys.length >= 5;
        return (
          <Menu.Item
            key={`freeze-${col.key}`}
            disabled={!canBeFrozen}
            onClick={(e) => e.stopPropagation()}
          >
            <Tooltip
              title={
                limitReached && !isCurrentlyFrozen && canBeFrozen
                  ? "Max 5 columns frozen."
                  : !canBeFrozen
                  ? "Column needs width to be frozen."
                  : ""
              }
            >
              <Checkbox
                checked={isCurrentlyFrozen}
                onChange={(e) =>
                  handleFreezeColumnChange(col.key, e.target.checked)
                }
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
      <Radio.Group
        onChange={(e) => setCurrentTableSize(e.target.value)}
        value={currentTableSize}
      >
        <Radio value="small">Small</Radio>
        <Radio value="middle">Middle</Radio>
        <Radio value="large">Large</Radio>
      </Radio.Group>
      <Divider />
      <Checkbox
        checked={isTableBordered}
        onChange={(e) => setIsTableBordered(e.target.checked)}
      >
        Show Borders
      </Checkbox>
    </div>
  );

  const finalTableColumns = useMemo(() => {
    let accumulatedWidth = 0;
    const MAX_FROZEN_WIDTH = 700;
    const currentlyVisibleColumns = baseColumns.filter((col) =>
      visibleColumnKeys.includes(col.key)
    );

    return currentlyVisibleColumns.map((baseCol) => {
      const col = { ...baseCol };
      const isActuallyFrozen =
        frozenColumnKeys.includes(baseCol.key) &&
        col.width &&
        (accumulatedWidth === 0 ||
          accumulatedWidth + baseCol.width <= MAX_FROZEN_WIDTH);
      const originalRender = col.render;

      col.onCell = (record) => {
        const rowKey = record._id || record.planId; // Use _id or planId as key
        const cellClasses = [];
        const originalCellProps = baseCol.onCell ? baseCol.onCell(record) : {};
        if (originalCellProps.className)
          cellClasses.push(originalCellProps.className);

        const isEditable = editingRowKeys.includes(rowKey) && col.dataType;
        if (isEditable) cellClasses.push("editable-cell");
        if (isActuallyFrozen) cellClasses.push("table-cell-frozen");

        const finalCellProps = {
          ...originalCellProps,
          className: cellClasses.join(" ").trim(),
        };
        if (isEditable)
          finalCellProps.style = {
            ...finalCellProps.style,
            verticalAlign: "top",
            // Apply word wrap for all editable cells to prevent overflow
            whiteSpace: "normal",
            wordWrap: "break-word",
          };
        return finalCellProps;
      };

      col.render = (text, record, index) => {
        const rowKey = record._id || record.planId;
        if (editingRowKeys.includes(rowKey) && col.dataType) {
          const currentValue = col.dataIndex
            ? editedData[rowKey]?.[col.dataIndex] ?? record[col.dataIndex]
            : null;
          switch (col.dataType) {
            case "text":
            case "textarea":
              return (
                <TextArea
                  value={currentValue}
                  onChange={(e) =>
                    handleInputChange(e.target.value, rowKey, col.dataIndex)
                  }
                  className="editable-cell-input"
                  autoSize={{ minRows: 1, maxRows: 4 }}
                />
              );
            case "number":
              return (
                <InputNumber
                  value={currentValue}
                  onChange={(value) =>
                    handleInputChange(value, rowKey, col.dataIndex)
                  }
                  className="editable-cell-input"
                  style={{ width: "100%" }}
                />
              );
            case "date":
              const dayjsValue =
                currentValue && typeof currentValue === "string"
                  ? dayjs(
                      currentValue,
                      ["YYYY-MM-DD", "M/D/YYYY", dayjs.ISO_8601],
                      true
                    )
                  : null;
              return (
                <DatePicker
                  value={dayjsValue && dayjsValue.isValid() ? dayjsValue : null}
                  onChange={(date, dateString) =>
                    handleInputChange(dateString, rowKey, col.dataIndex)
                  }
                  format="YYYY-MM-DD"
                  className="editable-cell-input"
                  style={{ width: "100%" }}
                />
              );
            case "custom_autocomplete_province":
              return (
                <ProvinceAutocomplete
                  value={currentValue}
                  onChange={(value) =>
                    handleInputChange(value, rowKey, col.dataIndex)
                  }
                  disabled={loading}
                />
              );
            case "custom_mba_juris":
              return (
                <div style={{ textAlign: "left" }}>
                  <Radio.Group
                    value={currentValue}
                    onChange={(e) =>
                      handleInputChange(e.target.value, rowKey, col.dataIndex)
                    }
                    size="small"
                    optionType="radio"
                    buttonStyle="solid"
                  >
                    <Radio.Button value="MBA" className="custom-radio-button">
                      MBA
                    </Radio.Button>
                    <Radio.Button
                      value="OUTSIDE MBA"
                      className="custom-radio-button"
                    >
                      OUTSIDE MBA
                    </Radio.Button>
                  </Radio.Group>
                </div>
              );
            case "custom_cong_district":
              return (
                <Select
                  value={currentValue}
                  onChange={(value) =>
                    handleInputChange(value, rowKey, col.dataIndex)
                  }
                  style={{ width: "100%", fontSize: "11px" }}
                  size="small"
                  allowClear
                >
                  <Select.Option value="Lone District">
                    Lone District
                  </Select.Option>
                  <Select.Option value="District I">District I</Select.Option>
                  <Select.Option value="District II">District II</Select.Option>
                  <Select.Option value="District III">
                    District III
                  </Select.Option>
                  <Select.Option value="District IV">District IV</Select.Option>
                </Select>
              );
            case "custom_issued_resolution": {
              const coveredValue =
                editedData[rowKey]?.resolution_covered ??
                record.resolution_covered;
              const typeValue =
                editedData[rowKey]?.resolution_type ?? record.resolution_type;
              return (
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      marginBottom: "4px",
                    }}
                  >
                    <span style={{ marginRight: "8px", minWidth: "55px" }}>
                      Covered:
                    </span>
                    <Input
                      value={coveredValue}
                      onChange={(e) =>
                        handleInputChange(
                          e.target.value,
                          rowKey,
                          "resolution_covered"
                        )
                      }
                      style={{ width: "100%" }}
                      size="small"
                    />
                  </div>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <span style={{ marginRight: "8px", minWidth: "55px" }}>
                      Type:
                    </span>
                    <Select
                      value={typeValue}
                      onChange={(value) =>
                        handleInputChange(value, rowKey, "resolution_type")
                      }
                      style={{ width: "100%" }}
                      size="small"
                      allowClear
                    >
                      <Select.Option value="For Renewal">
                        For Renewal
                      </Select.Option>
                      <Select.Option value="Approved">Approved</Select.Option>
                    </Select>
                  </div>
                </div>
              );
            }
            case "custom_approval_validity": {
              const approvedValue =
                editedData[rowKey]?.year_approved ?? record.year_approved;
              const endValue = editedData[rowKey]?.year_end ?? record.year_end;
              return (
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      marginBottom: "4px",
                    }}
                  >
                    <span style={{ marginRight: "8px", minWidth: "60px" }}>
                      Approved:
                    </span>
                    <Input
                      placeholder="Approved Year"
                      value={approvedValue}
                      onChange={(e) =>
                        handleInputChange(
                          e.target.value,
                          rowKey,
                          "year_approved"
                        )
                      }
                      style={{ width: "100%" }}
                      size="small"
                    />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    <span style={{ marginRight: "8px", minWidth: "60px" }}>
                      Valid Until:
                    </span>
                    <Input
                      placeholder="Valid Until Year"
                      value={endValue}
                      onChange={(e) =>
                        handleInputChange(e.target.value, rowKey, "year_end")
                      }
                      style={{ width: "100%" }}
                      size="small"
                    />
                  </div>
                </div>
              );
            }
            case "custom_ewsm_personnel": {
              const enmoStaffValue =
                editedData[rowKey]?.enmo_staff ?? record.enmo_staff;
              const eswmStaffValue =
                editedData[rowKey]?.eswm_staff ?? record.eswm_staff;
              return (
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      marginBottom: "4px",
                    }}
                  >
                    <span style={{ marginRight: "8px", minWidth: "70px" }}>
                      ENMO Staff:
                    </span>
                    <TextArea
                      value={enmoStaffValue}
                      onChange={(e) =>
                        handleInputChange(e.target.value, rowKey, "enmo_staff")
                      }
                      style={{ width: "100%" }}
                      autoSize={{ minRows: 2 }}
                    />
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-start" }}>
                    <span style={{ marginRight: "8px", minWidth: "70px" }}>
                      ESWM Staff:
                    </span>
                    <TextArea
                      value={eswmStaffValue}
                      onChange={(e) =>
                        handleInputChange(e.target.value, rowKey, "eswm_staff")
                      }
                      style={{ width: "100%" }}
                      autoSize={{ minRows: 2 }}
                    />
                  </div>
                </div>
              );
            }
            case "custom_coordinates": {
              const latValue = editedData[rowKey]?.lat ?? record.lat;
              const longValue = editedData[rowKey]?.long ?? record.long;
              return (
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      marginBottom: "4px",
                    }}
                  >
                    <span style={{ marginRight: "8px", minWidth: "40px" }}>
                      Lat:
                    </span>
                    <Input
                      value={latValue}
                      onChange={(value) =>
                        handleInputChange(value, rowKey, "lat")
                      }
                      style={{ width: "100%" }}
                      size="small"
                    />
                  </div>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <span style={{ marginRight: "8px", minWidth: "40px" }}>
                      Long:
                    </span>
                    <Input
                      value={longValue}
                      onChange={(
                        value // InputNumber's onChange provides the value directly
                      ) => handleInputChange(value, rowKey, "long")}
                      style={{ width: "100%" }}
                      size="small"
                    />
                  </div>
                </div>
              );
            }
            // Add other custom autocomplete cases for SWM Plan if needed
            default:
              return originalRender
                ? originalRender(text, record, index)
                : text;
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
      const swmTextFilterableFields = [
        "id_no",
        "city",
        "province",
        "address",
        "mba_juris",
        "cong_district",
        "swm_plan_type",
        "resolution_no",
        "focal_person",
        "iis_no",
        "pismu_tracking",
        "compliance_remarks",
        "remarks_recommendations",
      ]; // Merged columns are not included as they are not directly searchable
      if (col.dataIndex && swmTextFilterableFields.includes(col.dataIndex)) {
        return { ...col, ...getColumnSearchProps(col.dataIndex, col.title) };
      }
      return col;
    });
  }, [
    baseColumns,
    frozenColumnKeys,
    visibleColumnKeys,
    editingRowKeys,
    editedData,
    theme,
    handleInputChange,
    data,
    columnFilters,
  ]);

  const onSelectChange = (newSelectedRowKeys) =>
    setSelectedRowKeys(newSelectedRowKeys);
  const rowSelection = {
    selectedRowKeys,
    onChange: onSelectChange,
    getCheckboxProps: (record) => ({ disabled: editingRowKeys.length > 0 }),
  };

  const isAnyFilterActive =
    selectedPlanStatus ||
    searchTerm ||
    selectedProvince ||
    (columnFilters && Object.keys(columnFilters).length > 0);

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
    <div
      className={`swmplan-page-container ${
        theme === "dark" ? "theme-dark" : "theme-light"
      }`}
    >
      {contextHolder}
      <div>
        <h2 className="swmplan-page-title">
          10-Year Solid Waste Management Plan
        </h2>
      </div>

      <Collapse
        defaultActiveKey={["1"]}
        className="dashboard-collapse"
        expandIconPosition="start"
      >
        <Panel
          header={
            <div className="dashboard-panel-header">
              <DashboardOutlined /> SWM Plan Dashboard
            </div>
          }
          key="1"
        >
          <DashboardTiles
            theme={theme}
            onPlanStatusSelect={handlePlanStatusSelect}
            selectedPlanStatus={selectedPlanStatus}
            onProvinceFilterSelect={setSelectedProvince}
            selectedProvinceFilterValue={selectedProvince}
            onViewBreakdownDetails={handleShowBreakdownDetails}
          />
        </Panel>
      </Collapse>

      <div className="table-controls-header">
        <div className="table-controls-left">
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
            }}
          >
            <Input.Search
              placeholder="Search LGU..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onSearch={handleSearch}
              style={{ width: 300 }}
              allowClear
              enterButton
            />
            {isAnyFilterActive && (
              <div
                style={{
                  marginTop: "8px",
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                {selectedPlanStatus && (
                  <Tag
                    closable
                    onClose={() => handlePlanStatusSelect(null)}
                    color="blue"
                  >
                    Status: {selectedPlanStatus}
                  </Tag>
                )}
                {selectedProvince && (
                  <Tag
                    closable
                    onClose={() => handleProvinceChange(null)}
                    color="green"
                  >
                    Province: {selectedProvince}
                  </Tag>
                )}
                {/* Add tags for other active SWM filters */}
                <span className="search-results-message">
                  {loading
                    ? "Filtering..."
                    : `${total} result${total === 1 ? "" : "s"} found ${
                        getActiveFilterKeyword()
                          ? `for "${getActiveFilterKeyword()}..."`
                          : ""
                      }`}
                </span>
              </div>
            )}
          </div>
          <Select
            allowClear
            placeholder="Filter by Province"
            style={{ width: 200, marginLeft: "8px" }}
            onChange={handleProvinceChange}
            value={selectedProvince ?? ""}
            loading={loading}
          >
            <Select.Option value="">All Provinces</Select.Option>
            {allProvinces.map((provinceName) => (
              <Select.Option key={provinceName} value={provinceName}>
                {provinceName}
              </Select.Option>
            ))}
          </Select>
          {/* Add other global filters for SWM Plan if needed */}
        </div>

        <div className="table-controls-right">
          {editingRowKeys.length > 0 ? (
            <>
              <Button
                onClick={handleSaveEdit}
                type="primary"
                loading={loading}
                size="small"
              >
                Save
              </Button>
              <Button
                onClick={handleCancelEdit}
                disabled={loading}
                size="small"
              >
                Cancel
              </Button>
            </>
          ) : (
            <Tooltip title="Edit Selected SWM Plan(s)">
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
              overlay={
                <CustomDropdownContentWrapper
                  menuComponent={columnVisibilityMenu}
                  onOkClick={() => setIsColumnVisibilityDropdownOpen(false)}
                  theme={theme}
                />
              }
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
              overlay={
                <CustomDropdownContentWrapper
                  menuComponent={freezeMenu}
                  onOkClick={() => setIsFreezeDropdownOpen(false)}
                  theme={theme}
                />
              }
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
                if (newPageSize !== pagination.pageSize)
                  setPagination({ current: 1, pageSize: newPageSize });
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
        scroll={{ x: 1500, y: tableScrollY }}
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
      <WasteDetailsModal
        visible={showWasteDetailsModal}
        onClose={() => setShowWasteDetailsModal(false)}
        record={selectedWasteRecord}
      />
    </div>
  );
};

export default SWMPlan;
