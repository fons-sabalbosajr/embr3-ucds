import React, { useEffect, useState, useMemo } from "react";
import { API_BASE, API_BASE_URL } from "../../config/api";
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
  InputNumber, // Keep InputNumber
  DatePicker, AutoComplete, ConfigProvider // Added ConfigProvider
} from "antd";
import { message } from "antd"; // Import message for notifications
import ProvinceAutocomplete from "../../components/Autocomplete/Province";
import MunicipalitiesAutocomplete from "../../components/Autocomplete/Municipalities";
import BarangayAutocomplete from "../../components/Autocomplete/Barangay";
import IndustryClassAutocomplete from "../../components/Autocomplete/IndustryClass";
import SectionInChargeAutocomplete from "../../components/Autocomplete/SectionInCharge";
import PermitSourceAutocomplete from "../../components/Autocomplete/PermitSource";
import ReportTypeAutocomplete from "../../components/Autocomplete/ReportType";
import WWTFTypeAutocomplete from "../../components/Autocomplete/WWTFType";
import InspectionTypeAutocomplete from "../../components/Autocomplete/InspectionType";
import ProjectStatusAutocomplete from "../../components/Autocomplete/ProjectStatus";
import LegalOfficersAutocomplete from "../../components/Autocomplete/LegalOfficers"; // Import LegalOfficers
import InspectorsAutocomplete from "../../components/Autocomplete/Inspectors";
import {
  ReloadOutlined,
  DownOutlined,
  SettingOutlined,
  SearchOutlined as AntSearchOutlined,
  ToolFilled, // Keep AntSearchOutlined for filter icons
  TableOutlined,
  EditOutlined,
  RollbackOutlined,
} from "@ant-design/icons";
import axios from "axios";
import dayjs from "dayjs"; // Ensure React is imported if not already
import Breakdown from "./Breakdown"; // Import the new Breakdown component
import "./monitoring.css";

const { TextArea } = Input;

const sectionBackgroundColor = (section) => {
  // Normalize section name for consistent matching (optional, but good practice)
  const normalizedSection = String(section || "")
    .toUpperCase()
    .replace(/ /g, "_");

  switch (normalizedSection) {
    case "PEMU_AURORA":
      return "#A4B465";
    case "PEMU_BATAAN":
      return "#D2D0A0";
    case "PEMU_BULACAN":
      return "#7A73D1";
    case "PEMU_NUEVA_ECIJA":
      return "#DDA853";
    case "PEMU_PAMPANGA":
      return "#DF9755";
    case "PEMU_TARLAC":
      return "#39C665";
    case "PEMU_ZAMBALES":
      return "#161A30";
    case "MBU":
      return "#FF9B3E";
    case "TCHWMS":
      return "#936DDF";
    case "AWECMES":
      return "#626F47";
    case "TCHWMS/MBU":
    case "MBU/TCHWMS":
      return "#8A2BE2";
    case "":
    case null:
    case undefined:
      return "transparent";
    default:
      if (normalizedSection.includes("/")) {
        return "#8A2BE2";
      }
      return "#B0BEC5";
  }
};

const DashboardTiles = ({
  theme,
  onProjectStatusSelect,
  selectedProjectStatus,
  onSectionFilterSelect,
  selectedSectionFilterValue,
  onPermitTypeSelect,
  selectedPermitTypeKey,
  onFilterByExpiredSelect, // New prop for expired filter
  breakdownCriteria, // Add this prop
  filterByExpired, // New prop to indicate if expired filter is active
  onViewEccCncSubtypeDetails, // New prop to handle ECC/CNC subtype clicks for breakdown
}) => {
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [initialStats, setInitialStats] = useState(null); // Store initial full stats
  const [selectedPermitExpiryDetails, setSelectedPermitExpiryDetails] =
    useState(null);
  const [loadingExpiryDetails, setLoadingExpiryDetails] = useState(false);
  const [detailedEccCncSubtypeCounts, setDetailedEccCncSubtypeCounts] =
    useState(null);
  const [loadingSectionAndProjectStatus, setLoadingSectionAndProjectStatus] = // New loading state
    useState(null);
  const [showEccCncSubtypesView, setShowEccCncSubtypesView] = useState(false);

  useEffect(() => {
    // Fetch all initial dashboard statistics ONCE on component mount
    const fetchDashboardStats = async () => {
      setLoadingStats(true);
      try {
        const response = await axios.get(
          `${API_BASE}/ucds/dashboard-stats` // No params for initial full load
        );
        setStats(response.data);
        setInitialStats(response.data); // Save the full initial stats
      } catch (error) {
        console.error("Error fetching dashboard stats:", error);
        setStats(null);
        setInitialStats(null);
      } finally {
        setLoadingStats(false);
      }
    };
    fetchDashboardStats();
  }, []); // Empty dependency array: runs only once on mount

  // Effect to update sectionBreakdown AND projectStatusBreakdown when selectedPermitTypeKey changes
  useEffect(() => {
    if (!initialStats) {
      // Don't run if initial stats haven't loaded yet or failed to load
      return;
    }

    const updateFilteredStats = async () => {
      setLoadingSectionAndProjectStatus(true);
      try {
        if (selectedPermitTypeKey === null) {
          // Restore unfiltered sections and project status from initialStats if the filter is cleared
          setStats((prevStats) => ({
            ...prevStats,
            sectionBreakdown: initialStats.sectionBreakdown,
            projectStatusBreakdown: initialStats.projectStatusBreakdown, // Restore project status
          }));
        } else {
          // Fetch stats again, filtered by permitTypeKey
          const response = await axios.get(`${API_BASE}/ucds/dashboard-stats`, {
            params: { permitTypeFilterKey: selectedPermitTypeKey },
          });
          if (response.data) {
            setStats((prevStats) => ({
              ...prevStats,
              sectionBreakdown: response.data.sectionBreakdown || [], // Update sections
              projectStatusBreakdown:
                response.data.projectStatusBreakdown || {}, // Update project status
            }));
          }
        }
      } catch (error) {
        console.error(
          `Error updating filtered stats for ${selectedPermitTypeKey}:`,
          error
        );
        // On error, revert to initial (unfiltered) data or empty structures
        setStats((prevStats) => ({
          ...prevStats,
          sectionBreakdown: initialStats?.sectionBreakdown || [],
          projectStatusBreakdown: initialStats?.projectStatusBreakdown || {},
        }));
      } finally {
        setLoadingSectionAndProjectStatus(false);
      }
    };
    updateFilteredStats();
  }, [selectedPermitTypeKey, initialStats]); // Re-run when selectedPermitTypeKey or initialStats changes

  useEffect(() => {
    if (!selectedPermitTypeKey) {
      // Clear all detailed views if no permit type is selected
      setSelectedPermitExpiryDetails(null);
      setDetailedEccCncSubtypeCounts(null);
      setShowEccCncSubtypesView(false);
      return;
    }

    if (selectedPermitTypeKey === "ecc_cnc") {
      // Fetch ECC/CNC Subtypes
      const fetchEccCncSubtypes = async () => {
        setLoadingExpiryDetails(true); // Use same loading flag for simplicity or add a new one
        setShowEccCncSubtypesView(true); // Indicate we want to show this view
        setSelectedPermitExpiryDetails(null);
        try {
          const response = await axios.get(
            `${API_BASE_URL}/api/ucds/ecc-cnc-subtypes-breakdown`
          );
          setDetailedEccCncSubtypeCounts(response.data);
        } catch (error) {
          console.error("Error fetching ECC/CNC subtypes breakdown:", error);
          setDetailedEccCncSubtypeCounts(null);
        } finally {
          setLoadingExpiryDetails(false);
        }
      };
      fetchEccCncSubtypes();
    } else {
      // Fetch Expiry Details for other permit types (PTO, WWDP, etc.)
      const fetchPermitExpiryDetails = async () => {
        setLoadingExpiryDetails(true);
        setShowEccCncSubtypesView(false); // Not showing ECC/CNC subtypes
        setDetailedEccCncSubtypeCounts(null);
        try {
          const response = await axios.get(
            `${API_BASE_URL}/api/ucds/permit-expiry-breakdown/${selectedPermitTypeKey}`
          );
          setSelectedPermitExpiryDetails(response.data);
        } catch (error) {
          console.error(
            `Error fetching expiry details for ${selectedPermitTypeKey}:`,
            error
          );
          setSelectedPermitExpiryDetails(null);
        } finally {
          setLoadingExpiryDetails(false);
        }
      };
      fetchPermitExpiryDetails();
    }
  }, [selectedPermitTypeKey]);

  const totalIndustries = stats?.totalIndustries ?? 0;
  const industriesWithAnyPermit = stats?.industriesWithAnyPermit ?? 0;
  const industriesWithExpiredPermit =
    stats?.industriesWithAtLeastOneExpiredPermit ?? 0;

  const permitBreakdown = stats?.permitBreakdown ?? {
    ecc: 0, // Now a single count for all ECC/CNC
    pto: 0,
    wwdp: 0,
    hwg: 0,
    pco: 0,
  };

  const projectStatusCounts = stats?.projectStatusBreakdown ?? {};

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
      bodyStyle={{ padding: "4px 8px" }} // Reduced internal padding of the card
      onClick={onClick}
    >
      <Statistic
        title={title}
        value={value}
        valueStyle={
          typeof title === "string"
            ? {
                fontSize: "11px", // Reduced font size for the value
                ...(statisticColorOverride && {
                  color: statisticColorOverride,
                }),
              }
            : {
                fontSize: "11px",
                ...(statisticColorOverride && {
                  color: statisticColorOverride,
                }),
              }
        }
        titleStyle={
          typeof title === "string"
            ? {
                fontSize: "10px",
                whiteSpace: "normal",
                lineHeight: "1.1",
                ...(statisticColorOverride && {
                  color: statisticColorOverride,
                }),
                marginBottom: "1px",
              }
            : {
                fontSize: "10px",
                whiteSpace: "normal",
                lineHeight: "1.1",
                ...(statisticColorOverride && {
                  color: statisticColorOverride,
                }),
              }
        }
      />
    </Card>
  );

  // Normalize and aggregate section counts
  const aggregatedSectionData = useMemo(() => {
    if (!stats?.sectionBreakdown) return [];

    const normalizeNameForAggregation = (sectionName) => {
      if (!sectionName || typeof sectionName !== "string") return "";
      return sectionName
        .trim()
        .toUpperCase()
        .replace(/[\s-/]+/g, "_") // Replace spaces, hyphens, slashes with a single underscore
        .replace(/_+/g, "_"); // Consolidate multiple underscores
    };

    const aggregationMap = {}; // Stores { aggregationKey: { displayName: string, count: number } }

    stats.sectionBreakdown.forEach((item) => {
      const originalDisplayName = item.section;
      const count = item.count;
      const aggregationKey = normalizeNameForAggregation(originalDisplayName);

      if (aggregationKey) {
        if (aggregationMap[aggregationKey]) {
          aggregationMap[aggregationKey].count += count;
        } else {
          aggregationMap[aggregationKey] = {
            displayName: originalDisplayName, // Use first encountered original name for display/color
            count: count,
          };
        }
      }
    });

    const finalCounts = Object.entries(aggregationMap).map(([key, data]) => ({
      keyForReact: key, // The normalized key for React's key prop
      sectionForDisplayAndColor: data.displayName,
      count: data.count,
    }));

    // Sort by count descending, then by display name alphabetically
    finalCounts.sort(
      (a, b) =>
        b.count - a.count ||
        a.sectionForDisplayAndColor.localeCompare(b.sectionForDisplayAndColor)
    );
    return finalCounts;
  }, [stats?.sectionBreakdown]);

  // Helper function to determine text color based on background for sections
  const getSectionTextColor = (bgColorString) => {
    if (!bgColorString || bgColorString === "transparent") {
      return theme === "dark"
        ? "rgba(255, 255, 255, 0.85)"
        : "rgba(0, 0, 0, 0.88)"; // Default antd text color
    }
    // Normalize to uppercase for reliable comparison
    const upperBgColor = bgColorString.toUpperCase();
    // List of lighter background colors from sectionBackgroundColor that need dark text
    const lightBgColorsForDarkText = [
      "#A4B465",
      "#D2D0A0",
      "#DDA853",
      "#DF9755",
      "#FF9B3E",
      "#B0BEC5",
    ];

    if (lightBgColorsForDarkText.includes(upperBgColor)) {
      return "#263238"; // Dark text color
    }
    return "white"; // Default to white text for other (darker) backgrounds
  };

  const formatStatusLabel = (key) => {
    if (key === "") return "Not Yet Monitored";
    if (!key && key !== "") return "Unknown";
    let result = key.replace(/([A-Z])/g, " $1");
    result = result.charAt(0).toUpperCase() + result.slice(1);
    return result;
  };

  const projectStatusTiles = useMemo(() => {
    const orderedStatuses = [];
    const preferredOrder = [
      "operational",
      "nonOperational",
      "notOperational",
      // Add other specific keys if they exist and need to be prioritized
    ];
    const otherKey = "other"; // Assuming 'other' is a distinct key from backend

    const remainingStatuses = { ...projectStatusCounts };

    preferredOrder.forEach((statusKey) => {
      if (
        remainingStatuses[statusKey] !== undefined &&
        remainingStatuses[statusKey] > 0
      ) {
        orderedStatuses.push({
          key: statusKey,
          value: remainingStatuses[statusKey],
          isPreferred: true,
        });
        delete remainingStatuses[statusKey];
      }
    });

    if (
      remainingStatuses[otherKey] !== undefined &&
      remainingStatuses[otherKey] > 0
    ) {
      orderedStatuses.push({
        key: otherKey,
        value: remainingStatuses[otherKey],
        isOther: true,
      });
      delete remainingStatuses[otherKey];
    }

    Object.entries(remainingStatuses).forEach(([key, value]) => {
      if (value > 0) {
        orderedStatuses.push({ key, value, isRemaining: true });
      }
    });

    return orderedStatuses.map((status) => (
      <Col xs={24} sm={12} md={12} key={status.key}>
        {" "}
        {/* Layout for stacked/prominent display */}
        {renderStyledSmallStatCard(
          formatStatusLabel(status.key) + (status.isOther ? " (Various)" : ""), // Changed "Specific" to "Various"
          status.value,
          {
            cardClassName: "",
            onClick: () => onProjectStatusSelect(status.key),
            isActive: selectedProjectStatus === status.key,
          }
        )}
      </Col>
    ));
  }, [
    projectStatusCounts,
    onProjectStatusSelect,
    selectedProjectStatus,
    renderStyledSmallStatCard,
  ]);

  if (loadingStats) {
    return (
      <div className="loading-stats-container">
        <div className="loading-stats-progress-wrapper">
          <p>Loading dashboard statistics...</p>
          <Progress
            percent={50}
            status="active"
            showInfo={false}
            strokeColor={{ from: "#108ee9", to: "#87d068" }}
          />
        </div>
      </div>
    );
  }
  if (!stats) {
    return (
      <div className="failed-stats-message">
        Failed to load dashboard statistics.
      </div>
    );
  }

  let permitCardTitle = "Permit Breakdown";
  if (showEccCncSubtypesView && selectedPermitTypeKey === "ecc_cnc") {
    permitCardTitle = "ECC/CNC Subtypes";
  } else if (
    selectedPermitExpiryDetails &&
    selectedPermitTypeKey &&
    selectedPermitTypeKey !== "ecc_cnc"
  ) {
    permitCardTitle = `Breakdown of ${selectedPermitExpiryDetails.displayName}`;
  }

  const showClearPermitFilterButton =
    showEccCncSubtypesView ||
    (selectedPermitExpiryDetails && selectedPermitTypeKey !== "ecc_cnc");

  return (
    <div className="dashboard-tiles-container">
      <Row gutter={[16, 16]}>
        {/* Merged Card: Industry & Permit Overview */}
        <Col xs={24} sm={12} md={5} lg={5} xl={5}>
          {" "}
          {/* Reduced width */}
          <Card
            title="Industry & Permit Overview"
            className="dashboard-tile-card"
          >
            <div className="permit-status-card-body">
              <Row gutter={[8, 8]}>
                <Col span={24}>
                  {renderStyledSmallStatCard(
                    "Total Industry Count",
                    totalIndustries,
                    {
                      onClick: () =>
                        onViewEccCncSubtypeDetails({
                          // Use the existing handler
                          type: "allIndustries", // New type for fetching all
                          label: "All Industries", // Label for the modal title
                        }),
                    }
                  )}
                </Col>
                <Col span={24}>
                  {renderStyledSmallStatCard(
                    "Industries w/ Active Permits",
                    industriesWithAnyPermit
                    // No specific cardClassName, onClick, or isActive needed here
                  )}
                </Col>
                <Col span={24}>
                  {renderStyledSmallStatCard(
                    "Industries w/ Expired Permits",
                    industriesWithExpiredPermit,
                    {
                      // The renderStyledSmallStatCard will apply this color to both title and value
                      statisticColorOverride:
                        industriesWithExpiredPermit > 0 ? "red" : undefined,
                      onClick: () => onFilterByExpiredSelect(), // Make it clickable
                      isActive: filterByExpired, // Set active state based on prop
                    }
                  )}
                </Col>
              </Row>
            </div>
          </Card>
        </Col>

        {/* Permit Breakdown Card - Adjusted Col spans */}
        <Col xs={24} sm={12} md={5} lg={5} xl={5}>
          {" "}
          <Card
            title={permitCardTitle}
            className="dashboard-tile-card"
            extra={
              showClearPermitFilterButton ? (
                <Button
                  size="small"
                  type="primary"
                  onClick={() => onPermitTypeSelect(null)}
                  icon={<RollbackOutlined />}
                />
              ) : null
            }
          >
            <div className="permit-breakdown-card-body">
              <Row gutter={[8, 8]}>
                {loadingExpiryDetails ? ( // Combined loading state for simplicity
                  <Col span={24} style={{ textAlign: "center" }}>
                    <Spin tip="Loading details..." />
                  </Col>
                ) : showEccCncSubtypesView &&
                  detailedEccCncSubtypeCounts &&
                  selectedPermitTypeKey === "ecc_cnc" ? (
                  // ECC/CNC Subtypes View
                  <>
                    <Col xs={12} sm={8} md={12} lg={8}>
                      {renderStyledSmallStatCard(
                        "ECC Manual",
                        detailedEccCncSubtypeCounts.eccManual,
                        {
                          cardClassName: "permit-card-ecc-subtype",
                          onClick: () =>
                            onViewEccCncSubtypeDetails({
                              type: "eccCncSubtype",
                              mainType: "ECC",
                              process: "Manual",
                              label: "ECC Manual",
                            }),
                          isActive: selectedPermitTypeKey === "ecc_cnc",
                        }
                      )}
                    </Col>
                    {/* ... other ECC/CNC subtype cards ... */}
                    <Col xs={12} sm={8} md={12} lg={8}>
                      {renderStyledSmallStatCard(
                        "ECC Online",
                        detailedEccCncSubtypeCounts.eccOnline,
                        {
                          cardClassName: "permit-card-ecc-subtype",
                          onClick: () => {
                            onViewEccCncSubtypeDetails({
                              type: "eccCncSubtype",
                              mainType: "ECC",
                              process: "Online",
                              label: "ECC Online",
                            });
                          },
                          isActive: selectedPermitTypeKey === "ecc_cnc",
                        }
                      )}
                    </Col>
                    <Col xs={12} sm={8} md={12} lg={8}>
                      {renderStyledSmallStatCard(
                        "ECC CO",
                        detailedEccCncSubtypeCounts.eccCO,
                        {
                          cardClassName: "permit-card-ecc-subtype",
                          onClick: () =>
                            onViewEccCncSubtypeDetails({
                              type: "eccCncSubtype",
                              mainType: "ECC",
                              process: "CO",
                              label: "ECC CO",
                            }),
                          isActive: selectedPermitTypeKey === "ecc_cnc",
                        }
                      )}
                    </Col>
                    <Col xs={12} sm={8} md={12} lg={8}>
                      {renderStyledSmallStatCard(
                        "CNC Manual",
                        detailedEccCncSubtypeCounts.cncManual,
                        {
                          cardClassName: "permit-card-cnc-subtype",
                          onClick: () =>
                            onViewEccCncSubtypeDetails({
                              type: "eccCncSubtype",
                              mainType: "CNC",
                              process: "Manual",
                              label: "CNC Manual",
                            }),
                          isActive: selectedPermitTypeKey === "ecc_cnc",
                        }
                      )}
                    </Col>
                    <Col xs={12} sm={8} md={12} lg={8}>
                      {renderStyledSmallStatCard(
                        "CNC Online",
                        detailedEccCncSubtypeCounts.cncOnline,
                        {
                          cardClassName: "permit-card-cnc-subtype",
                          onClick: () =>
                            onViewEccCncSubtypeDetails({
                              type: "eccCncSubtype",
                              mainType: "CNC",
                              process: "Online",
                              label: "CNC Online",
                            }),
                          isActive: selectedPermitTypeKey === "ecc_cnc",
                        }
                      )}
                    </Col>
                    <Col xs={12} sm={8} md={12} lg={8}>
                      {renderStyledSmallStatCard(
                        "CNC CO",
                        detailedEccCncSubtypeCounts.cncCO,
                        {
                          cardClassName: "permit-card-cnc-subtype",
                          onClick: () =>
                            onViewEccCncSubtypeDetails({
                              type: "eccCncSubtype",
                              mainType: "CNC",
                              process: "CO",
                              label: "CNC CO",
                            }),
                          isActive: selectedPermitTypeKey === "ecc_cnc",
                        }
                      )}
                    </Col>
                    <Col xs={12} sm={8} md={24} lg={24}>
                      {renderStyledSmallStatCard(
                        "No data encoded",
                        detailedEccCncSubtypeCounts.blankEccCnc,
                        {
                          cardClassName: "permit-card-blank-subtype", // Optional: for specific styling
                          onClick: () =>
                            onViewEccCncSubtypeDetails({
                              type: "eccCncSubtype",
                              mainType: "ECC/CNC", // General type
                              process: "Blank", // Specific status
                              label: "Blank ECC/CNC", // Label for Breakdown modal and API
                            }),
                          isActive: selectedPermitTypeKey === "ecc_cnc", // Keep active state consistent
                        }
                      )}
                    </Col>
                  </>
                ) : selectedPermitExpiryDetails &&
                  selectedPermitTypeKey &&
                  selectedPermitTypeKey !== "ecc_cnc" ? (
                  // Expiry View for PTO, WWDP, etc.
                  <>
                    <Col span={24}>
                      {renderStyledSmallStatCard(
                        "Total with this Permit",
                        selectedPermitExpiryDetails.totalWithPermit,
                        {
                          cardStyle: {
                            backgroundColor:
                              theme === "dark" ? "#393939" : "#e8e8e8", // Darker neutral
                          },
                          onClick:
                            selectedPermitExpiryDetails.permitKey === "pto_code"
                              ? () =>
                                  onViewEccCncSubtypeDetails({
                                    type: "permitStatus",
                                    permitKey:
                                      selectedPermitExpiryDetails.permitKey,
                                    status: "All", // New status to fetch all for this permit type
                                    label: `All ${selectedPermitExpiryDetails.displayName} Records`,
                                  })
                              : undefined, // Only clickable for PTO for now, can be expanded
                          cardClassName:
                            selectedPermitExpiryDetails.permitKey === "pto_code"
                              ? "clickable-card"
                              : "",
                          isActive:
                            selectedPermitExpiryDetails.permitKey ===
                              "pto_code" &&
                            breakdownCriteria?.status === "All" &&
                            breakdownCriteria?.permitKey === "pto_code", // Highlight if this view is active

                          statisticColorOverride:
                            theme === "dark"
                              ? "rgba(255, 255, 255, 0.85)"
                              : "rgba(0, 0, 0, 0.88)", // Default text
                        }
                      )}
                    </Col>
                    <Col xs={24} sm={8}>
                      {renderStyledSmallStatCard(
                        "Expired",
                        selectedPermitExpiryDetails.expired,
                        {
                          cardStyle: {
                            backgroundColor:
                              theme === "dark" ? "#6e1a1a" : "#d32f2f", // Darker Red
                          },
                          onClick: () =>
                            onViewEccCncSubtypeDetails({
                              type: "permitStatus",
                              permitKey: selectedPermitExpiryDetails.permitKey,
                              status: "Expired",
                              label: `${selectedPermitExpiryDetails.displayName}: Expired`,
                            }),
                          statisticColorOverride: "#fff", // White text
                        }
                      )}
                    </Col>
                    <Col xs={24} sm={8}>
                      {renderStyledSmallStatCard(
                        "Near Expiry",
                        selectedPermitExpiryDetails.nearExpiry,
                        {
                          cardStyle: {
                            backgroundColor:
                              theme === "dark" ? "#7a4d00" : "#f57c00", // Darker Orange/Amber
                          },
                          onClick: () =>
                            onViewEccCncSubtypeDetails({
                              type: "permitStatus",
                              permitKey: selectedPermitExpiryDetails.permitKey,
                              status: "Near Expiry",
                              label: `${selectedPermitExpiryDetails.displayName}: Near Expiry`,
                            }),
                          statisticColorOverride: "#fff", // White text
                        }
                      )}
                    </Col>
                    <Col xs={24} sm={8}>
                      {renderStyledSmallStatCard(
                        "Not Expired",
                        selectedPermitExpiryDetails.notExpired,
                        {
                          cardStyle: {
                            backgroundColor:
                              theme === "dark" ? "#275c29" : "#388e3c", // Darker Green
                          },
                          onClick: () =>
                            onViewEccCncSubtypeDetails({
                              type: "permitStatus",
                              permitKey: selectedPermitExpiryDetails.permitKey,
                              status: "Not Expired",
                              label: `${selectedPermitExpiryDetails.displayName}: Not Expired`,
                            }),
                          statisticColorOverride: "#fff", // White text
                        }
                      )}
                    </Col>
                    {/* Combined Application Stages Card for PTO, WWDP, HAZ_ID */}
                    {["pto_code", "wwdp_code", "haz_id"].includes(
                      selectedPermitTypeKey
                    ) &&
                      selectedPermitExpiryDetails?.applicationStages !==
                        undefined && (
                        <Col xs={24} sm={12}>
                          {renderStyledSmallStatCard(
                            "For Application", // New combined title
                            selectedPermitExpiryDetails.applicationStages, // Use the combined count
                            {
                              cardStyle: {
                                backgroundColor:
                                  theme === "dark" ? "#003a8c" : "#91d5ff", // Adjusted color
                              },
                              onClick: () =>
                                onViewEccCncSubtypeDetails({
                                  type: "permitStatus",
                                  permitKey: selectedPermitTypeKey, // Use the currently selected permit key
                                  status: "Application Stages", // New combined status for API
                                  label: `${selectedPermitExpiryDetails.displayName}: Application Stages`, // New label
                                }),
                              statisticColorOverride:
                                theme === "dark" ? "#fff" : "#000",
                            }
                          )}
                        </Col>
                      )}
                    {/* End of Combined Application Stages Card */}

                    {selectedPermitExpiryDetails.blank !== undefined && (
                      <Col xs={24} sm={12}>
                        {renderStyledSmallStatCard(
                          `No ${selectedPermitExpiryDetails.displayName} Code`,
                          selectedPermitExpiryDetails.blank,
                          {
                            cardStyle: {
                              backgroundColor:
                                theme === "dark" ? "#424242" : "#f0f0f0",
                            },
                            onClick: () =>
                              onViewEccCncSubtypeDetails({
                                type: "permitStatus",
                                permitKey:
                                  selectedPermitExpiryDetails.permitKey,
                                status: "Blank",
                                label: `No ${selectedPermitExpiryDetails.displayName} Code`,
                              }),
                            statisticColorOverride:
                              theme === "dark"
                                ? "rgba(255, 255, 255, 0.65)"
                                : "rgba(0, 0, 0, 0.65)",
                          }
                        )}
                      </Col>
                    )}
                  </>
                ) : (
                  // Default View: General Permit Tiles
                  <Row gutter={[8, 8]}>
                    <Col xs={12} sm={8} md={12} lg={8}>
                      {renderStyledSmallStatCard(
                        "ECC/CNC",
                        permitBreakdown.ecc,
                        {
                          cardClassName: "permit-card-ecc",
                          onClick: () => onPermitTypeSelect("ecc_cnc"),
                          isActive:
                            selectedPermitTypeKey === "ecc_cnc" &&
                            showEccCncSubtypesView, // Active if showing subtypes
                        }
                      )}
                    </Col>
                    <Col xs={12} sm={8} md={12} lg={8}>
                      {renderStyledSmallStatCard("PTO", permitBreakdown.pto, {
                        cardClassName: "permit-card-pto",
                        onClick: () => onPermitTypeSelect("pto_code"),
                        isActive: selectedPermitTypeKey === "pto_code",
                      })}
                    </Col>
                    <Col xs={12} sm={8} md={12} lg={8}>
                      {renderStyledSmallStatCard("WWDP", permitBreakdown.wwdp, {
                        cardClassName: "permit-card-wwdp",
                        onClick: () => onPermitTypeSelect("wwdp_code"),
                        isActive: selectedPermitTypeKey === "wwdp_code",
                      })}
                    </Col>
                    <Col xs={12} sm={8} md={12} lg={8}>
                      {renderStyledSmallStatCard(
                        "HWG ID",
                        permitBreakdown.hwg,
                        {
                          cardClassName: "permit-card-hwg",
                          onClick: () => onPermitTypeSelect("haz_id"),
                          isActive: selectedPermitTypeKey === "haz_id",
                        }
                      )}
                    </Col>
                    <Col xs={12} sm={8} md={12} lg={8}>
                      {renderStyledSmallStatCard("PCO", permitBreakdown.pco, {
                        cardClassName: "permit-card-pco",
                        onClick: () => onPermitTypeSelect("pco_no"),
                        isActive: selectedPermitTypeKey === "pco_no",
                      })}
                    </Col>
                  </Row>
                )}
              </Row>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} md={7} lg={7} xl={7}>
          {" "}
          <Card title="Industries by Section" className="dashboard-tile-card">
            {loadingSectionAndProjectStatus ? (
              <div style={{ textAlign: "center", padding: "20px" }}>
                <Spin tip="Loading sections..." />
              </div>
            ) : (
              <div className="dashboard-section-card-body">
                <Row gutter={[8, 8]}>
                  {aggregatedSectionData.length > 0 ? (
                    aggregatedSectionData.map((item) => {
                      const bgColor = sectionBackgroundColor(
                        item.sectionForDisplayAndColor
                      );
                      const textColor = getSectionTextColor(bgColor);
                      return (
                        <Col
                          xs={24}
                          sm={12}
                          md={12}
                          lg={8}
                          key={item.keyForReact}
                        >
                          {" "}
                          {/* Adjusted inner Col for section items */}
                          {renderStyledSmallStatCard(
                            item.sectionForDisplayAndColor.replace(/_/g, " "), // Display formatted name
                            item.count,
                            {
                              cardStyle: {
                                backgroundColor:
                                  bgColor === "transparent"
                                    ? undefined
                                    : bgColor,
                              },
                              onClick: () =>
                                onSectionFilterSelect(
                                  item.sectionForDisplayAndColor
                                ),
                              isActive:
                                selectedSectionFilterValue ===
                                item.sectionForDisplayAndColor,
                              statisticColorOverride: textColor,
                            }
                          )}
                        </Col>
                      );
                    })
                  ) : (
                    <Col span={24}>
                      <div className="no-data-message">No section data</div>
                    </Col>
                  )}
                </Row>
              </div>
            )}
          </Card>
        </Col>

        {/* Project Status Card - Moved into the same row and spans adjusted */}
        <Col xs={24} sm={12} md={7} lg={7} xl={7}>
          {" "}
          {/* Adjusted width */}
          <Card title="Project Status" className="dashboard-tile-card">
            {loadingSectionAndProjectStatus ? (
              <div style={{ textAlign: "center", padding: "20px" }}>
                <Spin tip="Loading statuses..." />
              </div>
            ) : (
              <div className="dashboard-project-status-card-body">
                <Row gutter={[8, 8]} justify="center">
                  {projectStatusTiles.length > 0 ? (
                    projectStatusTiles
                  ) : (
                    <Col span={24}>
                      <div className="no-data-message">
                        No project status data available.
                      </div>
                    </Col>
                  )}
                </Row>
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

// BOD Calculation Logic (adapted from FocalPerson.jsx)
const calculateBOD = (empNoTotal, wwtfType) => {
  const numEmp = Number(empNoTotal);

  if (
    isNaN(numEmp) ||
    numEmp <= 0 ||
    !wwtfType ||
    typeof wwtfType !== "string"
  ) {
    return ""; // Return empty string if inputs are invalid or insufficient
  }

  const upperWwtfType = wwtfType.toUpperCase();

  // These values represent the 'v1' factor from the original formula structure
  const wwtfTypeReductionFactors = {
    WWTF: 0.6,
    "SEPTIC TANK": 0.25,
    // "DIRECT DISCHARGE" is a special case, handled below
    "N/A": 0.0,
  };

  let bodValue;

  if (upperWwtfType === "DIRECT DISCHARGE" || upperWwtfType === "N/A") {
    // Assuming N/A implies no treatment, similar to direct discharge for BOD load calc
    bodValue = numEmp * 0.0378;
  } else {
    const reductionFactor = wwtfTypeReductionFactors[upperWwtfType];
    if (reductionFactor === undefined) {
      // console.warn(`Unknown WWTF Type for BOD calculation: ${wwtfType}`);
      return ""; // Unknown type, cannot calculate
    }
    bodValue = numEmp * 0.0378 * (1 - reductionFactor);
  }

  return `${bodValue.toFixed(4)}`;
};

// Helper function to calculate business days (Mon-Fri) between two dates
const calculateBusinessDays = (startDate, endDate) => {
  if (!startDate.isValid() || !endDate.isValid()) {
    return 0; // Return 0 if dates are invalid
  }

  let start = startDate.startOf('day');
  let end = endDate.startOf('day');

  if (start.isSame(end)) {
    return 0; // No difference if dates are the same
  }

  let businessDays = 0;
  let currentDate = start.clone();

  if (end.isBefore(start)) {
    // Iterate backwards: count business days in (end, start] and make negative
    currentDate = end.clone(); // Start from the earlier date
    while (currentDate.isBefore(start)) {
      const dayOfWeek = currentDate.day(); // 0 (Sun) to 6 (Sat)
      if (dayOfWeek !== 0 && dayOfWeek !== 6) { // If it's a weekday
        businessDays--;
      }
      currentDate = currentDate.add(1, 'day');
    }
  } else {
    // Iterate forwards: count business days in [start, end)
    while (currentDate.isBefore(end)) {
      const dayOfWeek = currentDate.day();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        businessDays++;
      }
      currentDate = currentDate.add(1, 'day');
    }
  }
  return businessDays;
};

const pismuStaffOptions = [
  { value: "Ms. Alyanna Y. Patdu" },
  { value: "Mr. Christian M. Abad" },
  { value: "Mr. Marshalle Julluice V. Catua" },
];


const Monitoring = ({ theme = "light" }) => {
  const [data, setData] = useState([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [tableScrollY, setTableScrollY] = useState(0);
  const [frozenColumnKeys, setFrozenColumnKeys] = useState([
    "sort_key",
    "name",
    "title", // Default frozen columns
  ]);
  const [currentTableSize, setCurrentTableSize] = useState("small");
  const [isTableBordered, setIsTableBordered] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProvince, setSelectedProvince] = useState(null); // null for "All Provinces"
  const [allProvinces, setAllProvinces] = useState([]); // For province filter dropdown
  const [visibleColumnKeys, setVisibleColumnKeys] = useState([]);
  const [selectedProjectStatus, setSelectedProjectStatus] = useState(null);
  const [selectedSectionFilter, setSelectedSectionFilter] = useState(null);
  const [selectedPermitTypeKey, setSelectedPermitTypeKey] = useState(null); // For permit type filter
  const [filterByExpired, setFilterByExpired] = useState(false); // New state for expired permits filter
  const [isColumnVisibilityDropdownOpen, setIsColumnVisibilityDropdownOpen] =
    useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [inputValue, setInputValue] = useState(searchTerm); // Local state for search input
  const [isFreezeDropdownOpen, setIsFreezeDropdownOpen] = useState(false);
  const [editingRowKeys, setEditingRowKeys] = useState([]);
  const [editedData, setEditedData] = useState({}); // { rowKey: { dataIndex: newValue, ... } }
  const [initialBaseColumnKeys, setInitialBaseColumnKeys] = useState(null); // Helper for visible keys initialization

  const [columnFilters, setColumnFilters] = useState({}); // New state for server-side column filters
  // State for Breakdown modal
  const [showBreakdownModal, setShowBreakdownModal] = useState(false);
  const [breakdownCriteria, setBreakdownCriteria] = useState({
    mainType: null,
    process: null,
    label: null,
  });

  const [shouldRefreshTable, setShouldRefreshTable] = useState(false);

  const fetchData = async (
    sectionFilter = null, // Added sectionFilter parameter
    page = 1,
    pageSize = 20,
    search = "",
    province = null,
    projectStatus = null,
    permitTypeKey = null, // Added permitTypeKey parameter
    filterExpired = false, // New parameter for expired filter
    currentColumnFilters = {} // New parameter for column filters from table state
  ) => {
    setLoading(true);
    // console.log("Fetching data for page:", page, "pageSize:", pageSize, "search:", search);
    try {
      const res = await axios.get(`${API_BASE_URL}/api/ucds-data`, {
        params: {
          page,
          pageSize,
          search, // Send search term to API
          province, // Send selected province to API
          sectionFilter, // Send selected section to API
          projectStatus, // Send selected project status
          filterExpired, // Send expired filter status
          permitTypeKey, // Send selected permit type key
          ...currentColumnFilters, // Send column-specific filters
        },
      });

      // Remove leading zeros *after* the dash in sort_key
      let transformedData = res.data.data.map((item) => {
        let newSortKey = String(item.sort_key || ""); // Ensure newSortKey is a string for .includes() and .split()

        if (newSortKey.includes("-")) {
          const parts = newSortKey.split("-");
          const prefix = parts[0];
          // Assuming the numeric part is always parts[1] for keys like "AU-1", "AU-005"
          if (parts.length > 1) {
            // Ensure there's a part after the hyphen
            newSortKey = `${prefix}-${parseInt(parts[1], 10)}`; // e.g., AU-00005 → AU-5, AU-FOO -> AU-NaN
          }
        }
        return {
          ...item,
          sort_key: newSortKey,
        };
      });

      setData(transformedData);
      setTotal(res.data.total);
      setPagination({ current: page, pageSize });
    } catch (err) {
      console.error("Failed to fetch data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(
      selectedSectionFilter,
      pagination.current,
      pagination.pageSize,
      searchTerm,
      selectedProvince,
      selectedProjectStatus,
      selectedPermitTypeKey, // Add dependency
      filterByExpired, // Add new filter state as dependency
      columnFilters // Add new columnFilters state as dependency
    );
  }, [
    pagination.current,
    pagination.pageSize,
    searchTerm,
    selectedProvince,
    selectedProjectStatus,
    selectedSectionFilter,
    selectedPermitTypeKey, // Add dependency
    filterByExpired, // Add new filter state as dependency
    columnFilters, // Add new columnFilters state as dependency
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

  // Define these arrays once, to be used for fetching distinct options and for column definitions
  const previouslyMonthFilterFields = useMemo(
    () => [
      "date_monitored",
      "date_routed",
      "date_signed",
      "date_amended",
      "date_approved",
      "pto_issued",
      "pto_expiration",
      "wwdp_issued",
      "wwdp_expiration",
      "haz_issued",
      "nov_issued",
      "penalty_date",
      "resolution_issued",
    ],
    []
  );
  const previouslyYearFilterFields = useMemo(() => ["pco_validity"], []); // Renamed
  const previouslyGeneralDropdownFields = useMemo(
    // Renamed
    () => [
      // Renamed for clarity in this scope
      "industry_type",
      "industry_subtype",
      "industry_class",
      "psic_code",
      "mbu_area",
      "waterbody",
      "emp_total",
      "wwtf_type",
      "cong_district",
      "street",
      "brgy",
      "city",
      "section_incharged",
      "handler",
      "monitoring_sched",
      "insp_type",
      "pismu_tracking",
      "title_status",
      "with_nov",
      "pismu_count_month",
      "permit_process",
      "denr_pab_case_no",
      "legal_officer",
      "tc_commitment",
      "province",
    ],
    []
  );

  useEffect(() => {
    const calculateTableHeight = () => {
      const windowHeight = window.innerHeight;
      const fixedInternalHeight = 48 + 48 + 40 + 20; // Total: 156px

      const externalBuffer = 115; // Increased from 40 to provide more buffer

      const dynamicHeight = windowHeight - fixedInternalHeight - externalBuffer;
      setTableScrollY(Math.max(200, dynamicHeight)); // Ensure a minimum height of 200px
    };

    calculateTableHeight();
    window.addEventListener("resize", calculateTableHeight);
    return () => {
      window.removeEventListener("resize", calculateTableHeight);
    };
  }, []);

  // Sync inputValue with searchTerm when searchTerm changes externally
  useEffect(() => {
    setInputValue(searchTerm);
  }, [searchTerm]);

  const handleFilterByExpiredSelect = () => {
    const newFilterState = !filterByExpired;
    setFilterByExpired(newFilterState);
    setSelectedRowKeys([]);
    setPagination((prev) => ({ ...prev, current: 1 }));
  };

  const handleShowBreakdownDetails = (criteriaForModal) => {
    setBreakdownCriteria(criteriaForModal);
    setShowBreakdownModal(true);
  };

  const handleCloseBreakdownModal = () => {
    setShowBreakdownModal(false);
    // Optionally reset criteria:
    // setBreakdownCriteria({ mainType: null, process: null, label: null });
  };

  const baseColumns = useMemo(
    () => [
      {
        title: "ID No.",
        dataIndex: "sort_key",
        key: "sort_key",
        width: 70,
        align: "center",
        onHeaderCell: () => ({ className: "table-header-center" }),
      },
      {
        title: "Proponent Name",
        dataIndex: "name",
        key: "name",
        width: 180,
        dataType: "textarea",
        align: "left",
        onHeaderCell: () => ({ className: "table-header-center" }),
      },
      {
        title: "Project Title",
        dataIndex: "title",
        key: "title",
        align: "left",
        dataType: "textarea",
        width: 180,
        onHeaderCell: () => ({ className: "table-header-center" }),
      },
      {
        title: "Industry Type",
        dataIndex: "industry_type",
        key: "industry_type",
        align: "left",
        dataType: "custom_autocomplete_industrytype",
        width: 150,
        onHeaderCell: () => ({ className: "table-header-center" }),
      },
      {
        title: "Industry Subtype",
        dataIndex: "industry_subtype",
        key: "industry_subtype",
        align: "left",
        dataType: "custom_autocomplete_industrysubtype",
        width: 150,
        onHeaderCell: () => ({ className: "table-header-center" }),
      },
      {
        title: "Industry Class",
        dataIndex: "industry_class",
        key: "industry_class",
        align: "center",
        dataType: "custom_autocomplete_industryclass",
        width: 150,
        onHeaderCell: () => ({ className: "table-header-center" }),
      },
      {
        title: "PSIC Code",
        dataIndex: "psic_code",
        key: "psic_code",
        align: "center",
        dataType: "text",
        width: 100,
        onHeaderCell: () => ({ className: "table-header-center" }),
      },
      {
        title: "MBU Area",
        dataIndex: "mbu_area",
        key: "mbu_area",
        align: "center",
        dataType: "checkbox_mbu", // Changed dataType for MBU Area
        width: 70,
        onHeaderCell: () => ({ className: "table-header-center" }),
      },
      {
        title: "Waterbody",
        dataIndex: "waterbody",
        key: "waterbody",
        dataType: "text",
        width: 180,
        onHeaderCell: () => ({ className: "table-header-center" }),
      },
      {
        title: "Total Employees",
        dataIndex: "emp_total",
        key: "emp_total",
        dataType: "number",
        width: 120,
        onHeaderCell: () => ({ className: "table-header-center" }),
      },
      {
        title: "Wastewater Facility Type",
        dataIndex: "wwtf_type",
        key: "wwtf_type",
        dataType: "custom_autocomplete_wwtftype",
        width: 150,
        onHeaderCell: () => ({ className: "table-header-center" }),
      },
      {
        title: "BOD",
        dataIndex: "bod",
        key: "bod",
        dataType: "number", // Or 'number' if it's always numeric
        width: 120,
        onHeaderCell: () => ({ className: "table-header-center" }),
      },
      {
        title: "Geo-Coordinates",
        key: "geo_coordinates",
        width: 175,
        dataType: "geo_group", // Custom group type for editing lat/long
        editorFields: [
          { label: "Latitude", dataIndex: "lat", type: "textarea" },
          { label: "Longitude", dataIndex: "long", type: "textarea" },
        ],
        onHeaderCell: () => ({ className: "table-header-center" }),
        render: (record) => (
          <span>
            {record.lat && record.long ? `${record.lat}, ${record.long}` : ""}
          </span>
        ),
      },
      {
        title: "Congressional District",
        dataIndex: "cong_district",
        key: "cong_district",
        dataType: "text",
        width: 150,
        onHeaderCell: () => ({ className: "table-header-center" }),
      },
      {
        title: "Address",
        dataIndex: "address",
        key: "address",
        width: 200,
        onHeaderCell: () => ({ className: "table-header-center" }),
      },
      {
        title: "Street",
        dataIndex: "street",
        key: "street",
        dataType: "text",
        width: 150,
        onHeaderCell: () => ({ className: "table-header-center" }),
      },
      {
        title: "Barangay",
        dataIndex: "brgy",
        key: "brgy",
        dataType: "custom_autocomplete_barangay",
        width: 150,
        onHeaderCell: () => ({ className: "table-header-center" }),
      },
      {
        title: "City",
        dataIndex: "city",
        key: "city",
        dataType: "custom_autocomplete_municipalities",
        width: 150,
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
        title: "IIS Transaction No.",
        key: "iis_nos",
        width: 175, // Adjusted for inline editors
        align: "left",
        dataType: "iis_group",
        editorFields: [
          //{ label: "IIS No. 2024", dataIndex: "iis_no_2024", type: "textarea" },
          { label: "IIS No.", dataIndex: "iis_no_2025", type: "textarea" },
        ],
        onHeaderCell: () => ({ className: "table-header-center" }),
        render: (record) => (
          <span className="iis-link-container">
            {record.iis_no_2024 && (
              <div>
                2024:{" "}
                <a
                  href={`https://iis.emb.gov.ph/embis/dms/documents/tracker/?trn_no=${encodeURIComponent(
                    record.iis_no_2024
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {record.iis_no_2024}
                </a>
              </div>
            )}
            {record.iis_no_2025 && (
              <div>
                2025:{" "}
                <a
                  href={`https://iis.emb.gov.ph/embis/dms/documents/tracker/?trn_no=${encodeURIComponent(
                    record.iis_no_2025
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {record.iis_no_2025}
                </a>
              </div>
            )}
            {!record.iis_no_2024 && !record.iis_no_2025 && ""}
          </span>
        ),
      },
      {
        title: "Section & Handler Info",
        key: "section_handler_info",
        width: 200,
        dataType: "section_handler_group",
        editorFields: [
          {
            label: "Section(s) Incharged",
            dataIndex: "section_incharged",
            type: "custom_autocomplete_sectionincharge",
          },
          {
            label: "Handler",
            dataIndex: "handler",
            type: "custom_autocomplete_inspectors",
          },
        ],
        onHeaderCell: () => ({ className: "table-header-center" }),
        render: (text, record) => {
          const sectionStrings = String(record.section_incharged || "")
            .split(",")
            .map((section) => section.trim())
            .filter((section) => section); // Remove empty strings if any

          const handlerName = record.handler;
          const elements = [];

          if (sectionStrings.length === 0 && !handlerName) {
            return <span className="section-handler-empty-text"></span>;
          }

          // Case 1: Handler and section(s) exist
          if (handlerName && sectionStrings.length > 0) {
            const firstSection = sectionStrings[0];
            const bgColor = sectionBackgroundColor(firstSection);
            const textColor = bgColor === "#B0BEC5" ? "#263238" : "white";

            elements.push(
              <div
                key={`${record._id}-${firstSection}-handler`}
                className="section-handler-badge section-handler-badge-combined"
                style={{
                  backgroundColor: bgColor,
                  color: textColor,
                }}
              >
                {firstSection}
                <br />
                {handlerName}
              </div>
            );

            // Add remaining sections separately
            for (let i = 1; i < sectionStrings.length; i++) {
              const section = sectionStrings[i];
              const sectionBgColor = sectionBackgroundColor(section);
              const sectionTextColor =
                sectionBgColor === "#B0BEC5" ? "#263238" : "white";
              elements.push(
                <span
                  key={`${record._id}-${section}-${i}`}
                  className="section-handler-badge"
                  style={{
                    backgroundColor: sectionBgColor,
                    color: sectionTextColor,
                  }}
                >
                  {section}
                </span>
              );
            }
          } else {
            // Case 2: Only sections, no handler
            sectionStrings.forEach((section, index) => {
              const bgColor = sectionBackgroundColor(section);
              const textColor = bgColor === "#B0BEC5" ? "#263238" : "white";
              elements.push(
                <span
                  key={`${record._id}-${section}-${index}`}
                  className="section-handler-badge"
                  style={{
                    backgroundColor: bgColor,
                    color: textColor,
                  }}
                >
                  {section}
                </span>
              );
            });

            // Case 3: Only handler, no sections (edge case for this column)
            if (handlerName && sectionStrings.length === 0) {
              const bgColor = sectionBackgroundColor(handlerName); // Color based on handler's name
              const textColor = bgColor === "#B0BEC5" ? "#263238" : "white";
              elements.push(
                <span
                  key={`${record._id}-handler-only`}
                  className="section-handler-badge"
                  style={{
                    backgroundColor: bgColor,
                    color: textColor,
                  }}
                >
                  {handlerName} {/* No "Handler:" prefix */}
                </span>
              );
            }
          }

          if (elements.length === 0) {
            return <span className="section-handler-empty-text"></span>;
          }

          return (
            <div className="section-handler-badge-container">{elements}</div>
          );
        },
      },
      {
        title: "Monitoring Schedule",
        dataIndex: "monitoring_sched",
        key: "monitoring_sched",
        dataType: "date", // Assuming this is a single date string
        width: 150,
        onHeaderCell: () => ({ className: "table-header-center" }),
      },
      {
        title: "Inspection Type",
        dataIndex: "insp_type",
        key: "insp_type",
        dataType: "custom_autocomplete_inspectiontype",
        width: 200,
        onHeaderCell: () => ({ className: "table-header-center" }),
      },
      {
        title: "Transaction and Submission Date",
        key: "transaction_submission_dates",
        width: 180, // Adjusted for inline editors
        align: "left",
        dataType: "submission_dates_group",
        editorFields: [
          {
            label: "Date Monitored",
            dataIndex: "date_monitored",
            type: "date",
          },
          { label: "Date Routed", dataIndex: "date_routed", type: "date" },
          { label: "Date Signed", dataIndex: "date_signed", type: "date" },
        ],
        onHeaderCell: () => ({ className: "table-header-center" }),
        render: (record) => (
          <>
            {record.date_monitored && (
              <div>
                <strong>Monitored:</strong> {record.date_monitored}
              </div>
            )}
            {record.date_routed && (
              <div>
                <strong>Routed:</strong> {record.date_routed}
              </div>
            )}
            {record.date_signed && (
              <div>
                <strong>Signed:</strong> {record.date_signed}
              </div>
            )}
            {!record.date_monitored &&
              !record.date_routed &&
              !record.date_signed &&
              ""}
          </>
        ),
      },
      {
        title: "Total Days (Date Monitored vs. Date Routed)",
        dataIndex: "days_dmds",
        width: 120,
        // dataType: "number", // Disabled for editing
        key: "days_dmds",
        onHeaderCell: () => ({ className: "table-header-center" }),
        render: (text, record) => {
          const rowKey = record._id;
          if (
            editingRowKeys.includes(rowKey) &&
            editedData[rowKey]?.hasOwnProperty("days_dmds")
          ) {
            return editedData[rowKey].days_dmds;
          }
          return record.days_dmds;
        },
      },
      {
        title: "Total Days (Date Routed vs. Date Signed)",
        dataIndex: "days_drds",
        width: 120,
        key: "days_drds",
        onHeaderCell: () => ({ className: "table-header-center" }),
        render: (text, record) => {
          const rowKey = record._id;
          if (
            editingRowKeys.includes(rowKey) &&
            editedData[rowKey]?.hasOwnProperty("days_drds") // Corrected to check for days_drds
          ) {
            return editedData[rowKey].days_drds; // Corrected to return days_drds
          }
          return record.days_drds;
        },
      },
      {
        title: "Planning Staff Incharged",
        dataIndex: "pismu_tracking",
        key: "pismu_tracking",
        dataType: "custom_autocomplete_pismu_staff", // Changed dataType for specific PISMU staff
        width: 175,
        onHeaderCell: () => ({ className: "table-header-center" }),
      },
      {
        title: "Project Status",
        dataIndex: "title_status",
        key: "title_status",
        dataType: "custom_autocomplete_projectstatus",
        width: 175,
        onHeaderCell: () => ({ className: "table-header-center" }),
      },
      {
        title: "Remarks/Recommendations",
        width: 200,
        dataIndex: "remarks",
        key: "remarks",
        dataType: "textarea", // Changed to use TextArea for editing
        onHeaderCell: () => ({ className: "table-header-center" }),
      },
      {
        title: "With NOV",
        dataIndex: "with_nov",
        key: "with_nov",
        width: 100, // Adjusted width for checkbox
        dataType: "checkbox_yes_no", // New dataType for Yes/No checkbox
        onHeaderCell: () => ({ className: "table-header-center" }),
        align: "center", // Center the checkbox/text
        render: (text) => {
          if (text === "✔") return "Yes";
          if (text === "✘") return "No";
          return ""; // Or handle other values/empty string as needed
        },
      },
      {
        title: "Accomplishment Count (Month received by PISMU)",
        dataIndex: "pismu_count_month",
        key: "pismu_count_month",
        width: 150,
        dataType: "text", // This is derived, might not be directly editable
        onHeaderCell: () => ({ className: "table-header-center" }),
      },

      // Grouped: ECC/CNC
      {
        title: "ECC/CNC",
        key: "ecc_group",
        width: 250, // Adjusted width for inline editors
        align: "left",
        dataType: "permit_group",
        editorFields: [
          { label: "ECC/CNC No.", dataIndex: "ecc_cnc", type: "textarea" },
          {
            label: "Process",
            dataIndex: "permit_process",
            type: "custom_autocomplete_permitsource",
          },
          { label: "Amended Date", dataIndex: "date_amended", type: "date" },
          { label: "Approved Date", dataIndex: "date_approved", type: "date" },
        ],
        onHeaderCell: () => ({
          className:
            "table-header-center table-header-group-ecc table-header-group-ecc-dark",
        }),
        render: (record) => {
          if (
            !record.ecc_cnc &&
            !record.permit_process &&
            !record.date_amended &&
            !record.date_approved
          ) {
            return ""; // Return empty string for consistency if not editing and no data
          }
          return (
            <>
              <div>
                <strong>ECC/CNC:</strong> {record.ecc_cnc || ""}
              </div>
              <div>
                <strong>Process:</strong> {record.permit_process || ""}
              </div>
              <div>
                <strong>Amended:</strong>
                {record.date_amended || ""}
              </div>
              <div>
                <strong>Approved:</strong>
                {record.date_approved || ""}
              </div>
            </>
          );
        },
      },
      // Grouped: PTO
      {
        title: "PTO",
        key: "pto_group",
        width: 250, // Adjusted width
        align: "left",
        dataType: "permit_group",
        editorFields: [
          { label: "PTO Code", dataIndex: "pto_code", type: "textarea" },
          { label: "PTO Issued Date", dataIndex: "pto_issued", type: "date" },
          {
            label: "PTO Expiry Date",
            dataIndex: "pto_expiration",
            type: "date",
          },
        ],
        onHeaderCell: () => ({
          className:
            "table-header-center table-header-group-pto table-header-group-pto-dark",
        }),
        render: (record) => {
          // Display view
          if (
            !record.pto_code &&
            !record.pto_issued &&
            !record.pto_expiration
          ) {
            return "";
          }
          const valueStyle = filterByExpired ? { color: "red" } : {};

          return (
            <>
              <div>
                <strong>Code:</strong>{" "}
                <span style={valueStyle}>{record.pto_code || ""}</span>
              </div>
              <div>
                <strong>Issued:</strong>{" "}
                <span style={valueStyle}>{record.pto_issued || ""}</span>
              </div>
              <div>
                <strong>Expiry:</strong>{" "}
                <span style={valueStyle}>{record.pto_expiration || ""}</span>
              </div>
            </>
          );
        },
      },
      // Grouped: WWDP
      {
        title: "WWDP",
        key: "wwdp_group",
        width: 250, // Adjusted width
        align: "left",
        dataType: "permit_group",
        editorFields: [
          { label: "WWDP Code", dataIndex: "wwdp_code", type: "textarea" },
          { label: "WWDP Issued Date", dataIndex: "wwdp_issued", type: "date" },
          {
            label: "WWDP Expiry Date",
            dataIndex: "wwdp_expiration",
            type: "date",
          },
        ],
        onHeaderCell: () => ({
          className:
            "table-header-center table-header-group-wwdp table-header-group-wwdp-dark",
        }),
        render: (record) => {
          // Display view
          if (
            !record.wwdp_code &&
            !record.wwdp_issued &&
            !record.wwdp_expiration
          ) {
            return "";
          }
          const valueStyle = filterByExpired ? { color: "red" } : {};

          return (
            <>
              <div>
                <strong>Code:</strong>{" "}
                <span style={valueStyle}>{record.wwdp_code || ""}</span>
              </div>
              <div>
                <strong>Issued:</strong>{" "}
                <span style={valueStyle}>{record.wwdp_issued || ""}</span>
              </div>
              <div>
                <strong>Expiry:</strong>{" "}
                <span style={valueStyle}>{record.wwdp_expiration || ""}</span>
              </div>
            </>
          );
        },
      },
      // Grouped: HWG ID
      {
        title: "HWG ID",
        key: "hwg_id_group",
        width: 250, // Adjusted width
        align: "left",
        dataType: "permit_group",
        editorFields: [
          { label: "HWG ID No.", dataIndex: "haz_id", type: "textarea" },
          { label: "HWG Issued Date", dataIndex: "haz_issued", type: "date" },
        ],
        onHeaderCell: () => ({
          className:
            "table-header-center table-header-group-hwg_id table-header-group-hwg_id-dark",
        }),
        render: (record) => {
          // Display view
          if (!record.haz_id && !record.haz_issued) {
            return "";
          }
          const valueStyle = filterByExpired ? { color: "red" } : {};
          return (
            <>
              <div>
                <strong>ID:</strong>{" "}
                <span style={valueStyle}>{record.haz_id || ""}</span>
              </div>
              <div>
                <strong>Issued:</strong>{" "}
                <span style={valueStyle}>{record.haz_issued || ""}</span>
              </div>
            </>
          );
        },
      },
      // Grouped: PCO
      {
        title: "PCO",
        key: "pco_group",
        width: 250, // Adjusted width, PCO name can be long
        align: "left",
        dataType: "permit_group",
        editorFields: [
          {
            label: "PCO Accreditation No.",
            dataIndex: "pco_no",
            type: "textarea",
          },
          { label: "PCO Name", dataIndex: "pco_name", type: "textarea" },
          {
            label: "PCO Validity Date",
            dataIndex: "pco_validity",
            type: "date",
          },
        ],
        onHeaderCell: () => ({
          className:
            "table-header-center table-header-group-pco table-header-group-pco-dark",
        }),
        render: (record) => {
          if (!record.pco_no && !record.pco_name && !record.pco_validity) {
            return "";
          }
          const valueStyle = filterByExpired ? { color: "red" } : {};
          return (
            <>
              <div>
                <strong>No:</strong>{" "}
                <span style={valueStyle}>{record.pco_no || ""}</span>
              </div>
              <div>
                <strong>Name:</strong> {record.pco_name || ""}{" "}
                {/* PCO Name not typically styled red for expiry */}
              </div>
              <div>
                <strong>Validity:</strong>{" "}
                <span style={valueStyle}>{record.pco_validity || ""}</span>
              </div>
            </>
          );
        },
      },
      {
        title: "NOV Information",
        key: "legal_case_numbers",
        width: 250, // Adjusted for inline editors
        align: "left",
        dataType: "legal_group",
        editorFields: [
          { label: "Docket No.", dataIndex: "docket_no", type: "textarea" },
          {
            label: "DENR PAB Case No.",
            dataIndex: "denr_pab_case_no",
            type: "textarea",
          },
          { label: "NOV Date Issued", dataIndex: "nov_issued", type: "date" },
        ],
        onHeaderCell: () => ({ className: "table-header-center" }),
        render: (record) => (
          // Display view
          <>
            {record.docket_no && (
              <div>
                <strong>Docket:</strong> {record.docket_no || ""}
              </div>
            )}
            {record.denr_pab_case_no && (
              <div>
                <strong>DENR PAB Case:</strong> {record.denr_pab_case_no || ""}
              </div>
            )}
            {record.nov_issued && (
              <div>
                <strong>NOV Date Issued:</strong> {record.nov_issued || ""}
              </div>
            )}
            {!record.docket_no &&
              !record.denr_pab_case_no &&
              !record.nov_issued &&
              ""}
          </>
        ),
      },
      {
        title: "Environmental Law Violations",
        key: "env_law_violations",
        align: "left",
        width: 300, // Adjusted for inline editors
        dataType: "legal_group",
        editorFields: [
          {
            label: "PD 1586 Violation",
            dataIndex: "v_pd1586",
            type: "textarea",
          },
          {
            label: "RA 9275 Violation",
            dataIndex: "v_ra9275",
            type: "textarea",
          },
          {
            label: "RA 8749 Violation",
            dataIndex: "v_ra8749",
            type: "textarea",
          },
          {
            label: "RA 6969 (Haz) Violation",
            dataIndex: "v_ra6969_haz",
            type: "textarea",
          },
          {
            label: "RA 6969 (T-Chem) Violation",
            dataIndex: "v_ra6969_tchem",
            type: "textarea",
          },
        ],
        onHeaderCell: () => ({ className: "table-header-center" }),
        render: (record) => {
          // Display view
          const violations = [];
          if (record.v_pd1586)
            violations.push(
              <div>
                <strong>PD 1586:</strong> {record.v_pd1586}
              </div>
            );
          if (record.v_ra9275)
            violations.push(
              <div>
                <strong>RA 9275:</strong> {record.v_ra9275}
              </div>
            );
          if (record.v_ra8749)
            violations.push(
              <div>
                <strong>RA 8749:</strong> {record.v_ra8749}
              </div>
            );
          if (record.v_ra6969_haz)
            violations.push(
              <div>
                <strong>RA 6969 (Haz):</strong> {record.v_ra6969_haz}
              </div>
            );
          if (record.v_ra6969_tchem)
            violations.push(
              <div>
                <strong>RA 6969 (T-Chem):</strong> {record.v_ra6969_tchem}
              </div>
            );

          return violations.length > 0 ? <>{violations}</> : "";
        },
      },
      {
        title: "Technical Conference Information",
        key: "tc_information",
        width: 300,
        align: "left",
        dataType: "legal_group",
        editorFields: [
          {
            label: "TC Date Actual",
            dataIndex: "tc_date_actual",
            type: "date",
          },
          {
            label: "Legal Officer",
            dataIndex: "legal_officer",
            type: "custom_autocomplete_legalofficer", // New custom type
          },
          {
            label: "Compliance Link",
            dataIndex: "tc_compliance_link",
            type: "text",
          },
          { label: "Position Paper", dataIndex: "pos_paper", type: "textarea" },
          {
            label: "TC Commitment",
            dataIndex: "tc_commitment",
            type: "checkbox_yes_no_boolean", // New type for boolean checkbox
          },
          {
            label: "Other TC Remarks",
            dataIndex: "other_tc_remarks",
            type: "textarea",
          },
        ],
        onHeaderCell: () => ({ className: "table-header-center" }),
        render: (record) => (
          // Display view
          <>
            {record.tc_date_actual && (
              <div>
                <strong>TC Date Actual:</strong> {record.tc_date_actual || ""}
              </div>
            )}
            {record.legal_officer && (
              <div>
                <strong>Legal Officer:</strong> {record.legal_officer || ""}
              </div>
            )}
            {record.tc_compliance_link && (
              <div>
                <strong>Compliance Link:</strong>{" "}
                <a
                  href={record.tc_compliance_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  // Basic check if it looks like a URL, otherwise don't make it a link
                  onClick={(e) =>
                    !record.tc_compliance_link.startsWith("http") &&
                    e.preventDefault()
                  }
                  className={`tc-compliance-link ${
                    record.tc_compliance_link &&
                    record.tc_compliance_link.startsWith("http")
                      ? "external-link"
                      : "text-link"
                  }`}
                >
                  {record.tc_compliance_link || ""}
                </a>
              </div>
            )}
            {record.pos_paper && (
              <div>
                <strong>Position Paper:</strong> {record.pos_paper || ""}
              </div>
            )}
            {record.tc_commitment !== undefined && ( // Check if the field exists
              <div>
                <strong>TC Commitment:</strong>{" "}
                {record.tc_commitment ? "Yes" : "No"}
              </div>
            )}
            {record.other_tc_remarks && (
              <div>
                <strong>Other TC Remarks:</strong>{" "}
                {record.other_tc_remarks || ""}
              </div>
            )}
            {!record.tc_date_actual &&
              !record.legal_officer &&
              !record.tc_compliance_link &&
              !record.pos_paper &&
              record.tc_commitment === undefined && // Also check if tc_commitment is not defined
              !record.other_tc_remarks &&
              ""}
          </>
        ),
      },
      {
        title: "Penalty Details",
        key: "penalty_details",
        width: 280, // Adjusted for inline editors
        dataType: "legal_group",
        editorFields: [
          { label: "Penalty Date", dataIndex: "penalty_date", type: "date" },
          { label: "Amount", dataIndex: "amount", type: "number" }, // Assuming numeric input
          { label: "OR No.", dataIndex: "or_number", type: "text" },
        ],
        onHeaderCell: () => ({ className: "table-header-center" }),
        render: (record) => (
          // Display view
          <>
            {record.penalty_date && (
              <div>
                <strong>Date:</strong> {record.penalty_date || ""}
              </div>
            )}
            {record.amount && (
              <div>
                <strong>Amount:</strong> {record.amount || ""}
              </div>
            )}
            {record.or_number && (
              <div>
                <strong>OR No.:</strong> {record.or_number || ""}
              </div>
            )}
            {!record.penalty_date && !record.amount && !record.or_number && ""}
          </>
        ),
      },
      {
        title: "For Resolution and Order",
        key: "resolution_order_info",
        width: 300, // Adjusted for inline editors
        dataType: "legal_group",
        editorFields: [
          {
            label: "Resolution Issued",
            dataIndex: "resolution_issued",
            type: "textarea",
          },
          {
            label: "Order Issued",
            dataIndex: "order_issued",
            type: "textarea",
          },
          { label: "Order Status", dataIndex: "order_status", type: "text" }, // Could be a select if statuses are predefined
        ],
        onHeaderCell: () => ({ className: "table-header-center" }),
        render: (record) => (
          // Display view
          <>
            {record.resolution_issued && (
              <div>
                <strong>Resolution Issued:</strong>{" "}
                {record.resolution_issued || ""}
              </div>
            )}
            {record.order_issued && (
              <div>
                <strong>Order Issued:</strong> {record.order_issued || ""}
              </div>
            )}
            {record.order_status && (
              <div>
                <strong>Order Status:</strong> {record.order_status || ""}
              </div>
            )}
            {!record.resolution_issued &&
              !record.order_issued &&
              !record.order_status &&
              ""}
          </>
        ),
      },
    ],
    [editingRowKeys, editedData]
  );

  // Helper function for text input filters - for server-side filtering
  const getColumnSearchProps = (dataIndex, columnTitle) => ({
    filterDropdown: ({
      setSelectedKeys,
      selectedKeys,
      confirm,
      clearFilters,
      close,
    }) => (
      <div style={{ padding: 8 }} onKeyDown={(e) => e.stopPropagation()}>
        <Input
          // ref={searchInput} // If you need to focus it
          placeholder={`Search ${columnTitle}`}
          value={selectedKeys[0]}
          onChange={(e) =>
            setSelectedKeys(e.target.value ? [e.target.value] : [])
          }
          onPressEnter={() => confirm()}
          style={{ marginBottom: 8, display: "block" }}
        />
        <Space>
          <Button
            type="primary"
            onClick={() => confirm()}
            size="small"
            style={{ width: 90 }}
          >
            Search
          </Button>
          <Button
            onClick={() => {
              clearFilters && clearFilters(); // Clears selectedKeys
              confirm(); // This will trigger handleTableChange with empty/null filter for this column
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
    // Crucially, onFilter is REMOVED to enable server-side filtering via handleTableChange
  });

  useEffect(() => {
    const currentAllBaseKeys = baseColumns
      .map((col) => col.key)
      .filter(Boolean);

    if (!initialBaseColumnKeys && currentAllBaseKeys.length > 0) {
      // First time initialization
      setInitialBaseColumnKeys(currentAllBaseKeys);
      setVisibleColumnKeys(currentAllBaseKeys);
    } else if (initialBaseColumnKeys) {
      // Subsequent updates: baseColumns might have changed (e.g. theme change, or actual column definition change)
      // Ensure visibleColumnKeys only contains keys that are still valid in currentAllBaseKeys.
      setVisibleColumnKeys((prevVisibleKeys) => {
        const newVisible = prevVisibleKeys.filter((key) =>
          currentAllBaseKeys.includes(key)
        );
        // If all previously visible columns are now gone, but there are new columns,
        // reset to show all current columns as a fallback.
        if (newVisible.length === 0 && currentAllBaseKeys.length > 0) {
          return currentAllBaseKeys;
        }
        return newVisible.length > 0
          ? newVisible
          : currentAllBaseKeys.length > 0
          ? [currentAllBaseKeys[0]]
          : []; // Ensure at least one if possible
      });
    }
  }, [baseColumns, initialBaseColumnKeys]);

  const handleTableChange = (tablePagination, newFilters, sorter) => {
    // Renamed for clarity
    setSelectedRowKeys([]);
    // When Table's pagination prop is false, tablePagination is an empty object {}.
    // We should reset to page 1 when filters change, but preserve the pageSize
    // which is controlled by the external AntPagination component.
    setPagination((prev) => ({ ...prev, current: 1 }));

    const apiFilters = {};
    for (const key in newFilters) {
      // Only include filters that have a value (i.e., not null or empty array)
      if (newFilters[key] && newFilters[key].length > 0) {
        // Pass the array of selected values. Server will handle if it's single or multiple.
        apiFilters[key] = newFilters[key];
      }
    }
    setColumnFilters(apiFilters); // This will trigger the useEffect to call fetchData
  };

  const handleSearch = (value) => {
    const trimmedValue = value.trim();
    setSearchTerm(trimmedValue);
    setColumnFilters({}); // Clear column-specific filters when a global search is performed
    setSelectedRowKeys([]);
    setPagination((prev) => ({ ...prev, current: 1 }));
  };

  const handleProvinceChange = (value) => {
    setSelectedProvince(value);
    setSelectedRowKeys([]);
    // It's good practice to reset column filters if a global filter like province changes,
    // or decide if they should persist. For now, let's keep them.
    // setColumnFilters({});
    setPagination((prev) => ({ ...prev, current: 1 }));
  };

  const handleProjectStatusSelect = (statusKey) => {
    const newStatus = selectedProjectStatus === statusKey ? null : statusKey;
    setSelectedProjectStatus(newStatus);
    setSelectedRowKeys([]);
    setPagination((prev) => ({ ...prev, current: 1 }));
  };

  const handleSectionFilterSelect = (sectionKey) => {
    const newSectionFilter =
      selectedSectionFilter === sectionKey ? null : sectionKey;
    setSelectedSectionFilter(newSectionFilter);
    setSelectedRowKeys([]);
    setPagination((prev) => ({ ...prev, current: 1 }));
  };

  const handlePermitTypeSelect = (permitKey) => {
    const newPermitFilter =
      selectedPermitTypeKey === permitKey ? null : permitKey;
    setSelectedPermitTypeKey(newPermitFilter);
    setSelectedRowKeys([]);
    setPagination((prev) => ({ ...prev, current: 1 }));
  };

  const handleEditClick = () => {
    if (selectedRowKeys.length > 0) {
      setEditingRowKeys([...selectedRowKeys]);
      const initialEdits = {};
      selectedRowKeys.forEach((key) => {
        const record = data.find((item) => item._id === key);
        if (record) {
          initialEdits[key] = { ...record }; // Store a copy for editing
        }
      });
      setEditedData(initialEdits);
      setSelectedRowKeys([]); // Clear selection after moving to edit mode
    }
  };

  const handleSaveEdit = async () => {
    setLoading(true);
    const updatesToApi = [];

    for (const row_id of editingRowKeys) {
      // row_id is the original MongoDB _id
      const originalRecord = data.find((item) => item._id === row_id);
      const currentEditedState = editedData[row_id];

      if (originalRecord && currentEditedState) {
        // Prepare payload: exclude _id. Also exclude sort_key from the payload
        // as it's used in the URL as an identifier and typically not changed this way.
        const {
          _id,
          sort_key: currentSortKeyInEditedData,
          ...changes
        } = currentEditedState;

        // Use the original sort_key for the URL identifier
        const identifierForUrl = originalRecord.sort_key;

        if (!identifierForUrl) {
          console.warn(
            `Record with _id ${row_id} is missing sort_key. Skipping update for this record.`
          );
          message.warn(
            `Cannot save record without a sort_key (ID: ${row_id}).`
          );
          continue;
        }

        updatesToApi.push({
          identifier: identifierForUrl,
          payload: changes,
        });
      }
    }

    if (updatesToApi.length === 0 && editingRowKeys.length > 0) {
      // This case might happen if all records intended for update were skipped due to missing sort_key
      setLoading(false);
      // Optionally keep editingRowKeys and editedData if some edits were valid but couldn't be sent
      // For now, let's clear them as if an attempt was made.
      // setEditingRowKeys([]);
      // setEditedData({});
      return;
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
        // Ensure this matches your server route. server.js has /api/update-data/:id
        await axios.put(
          `${API_BASE_URL}/api/update-data/${update.identifier}`, // Use sort_key as identifier
          update.payload // Send only the changes
        );
      }

      // Update local data state
      setData((prevData) =>
        prevData.map((row) => {
          if (editingRowKeys.includes(row._id)) {
            // Merge the successfully saved changes (payload) back into the row
            // Find the payload that corresponds to this row's original sort_key
            const savedUpdate = updatesToApi.find(
              (u) => u.identifier === row.sort_key
            );
            if (savedUpdate) {
              return { ...row, ...savedUpdate.payload };
            }
            // Fallback: if sort_key changed or something unexpected, merge with the full editedData for this row
            // This ensures UI consistency with what was being edited.
            return { ...row, ...editedData[row._id] };
          }
          return row;
        })
      );
      setEditingRowKeys([]);
      setEditedData({});
      message.success("Data saved successfully!"); // Confirmation message
    } catch (error) {
      console.error("Failed to save data", error);
      let errorMessage = "Failed to save data.";
      if (error.response && error.response.data) {
        errorMessage += ` ${
          error.response.data.error || error.response.data.message || ""
        }`;
      } else if (error.message) {
        errorMessage += ` ${error.message}`;
      }
      message.error(errorMessage); // Display error message
    } finally {
      setLoading(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingRowKeys([]);
    setEditedData({}); // Discard changes
  };

  const handleInputChange = React.useCallback(
    async (value, rowKey, dataIndex) => {
      // Synchronous update part
      setEditedData((prev) => {
        const currentRowState = prev[rowKey] || {};
        const originalRecord = data.find((item) => item._id === rowKey) || {};

        let newFields = { ...currentRowState, [dataIndex]: value };

        // If industry_class is changing, set loading states for dependent fields
        if (dataIndex === "industry_class" && value) {
          newFields.industry_type = "Loading...";
          newFields.industry_subtype = "Loading...";
          newFields.psic_code = "Loading...";
        } else if (dataIndex === "industry_class" && !value) {
          // If industry_class is cleared
          newFields.industry_type = "";
          newFields.industry_subtype = "";
          newFields.psic_code = "";
        }

        // BOD Calculation
        const empTotalForBod =
          dataIndex === "emp_total"
            ? value
            : newFields.emp_total ?? originalRecord.emp_total;

        const wwtfTypeForBod =
          dataIndex === "wwtf_type"
            ? value
            : newFields.wwtf_type ?? originalRecord.wwtf_type;

        if (dataIndex === "emp_total" || dataIndex === "wwtf_type") {
          if (empTotalForBod !== undefined && wwtfTypeForBod !== undefined) {
            const calculatedBod = calculateBOD(empTotalForBod, wwtfTypeForBod);
            newFields.bod = calculatedBod;
          } else {
            newFields.bod = ""; // Clear BOD if inputs are incomplete
          }
        }

        // Calculate days_dmds (Date Monitored vs Date Routed)
        if (dataIndex === "date_monitored" || dataIndex === "date_routed") {
          const monitoredDateStr =
            dataIndex === "date_monitored"
              ? value
              : newFields.date_monitored ?? originalRecord.date_monitored;
          const routedDateStr =
            dataIndex === "date_routed"
              ? value
              : newFields.date_routed ?? originalRecord.date_routed;

          if (monitoredDateStr && routedDateStr) {
            const monitoredDate = dayjs(
              monitoredDateStr,
              ["MM/DD/YYYY", "YYYY-MM-DD", "M/D/YYYY", dayjs.ISO_8601],
              true
            );
            const routedDate = dayjs(
              routedDateStr,
              ["MM/DD/YYYY", "YYYY-MM-DD", "M/D/YYYY", dayjs.ISO_8601],
              true
            );

            if (monitoredDate.isValid() && routedDate.isValid()) {
              newFields.days_dmds = calculateBusinessDays(monitoredDate, routedDate);
            } else {
              newFields.days_dmds = ""; // Clear if dates are invalid
            }
          } else {
            newFields.days_dmds = ""; // Clear if one or both dates are missing
          }
        }

        // Calculate days_drds (Date Routed vs Date Signed)
        if (dataIndex === "date_routed" || dataIndex === "date_signed") {
          const routedDateStr =
            dataIndex === "date_routed"
              ? String(value) // Ensure value is string
              : newFields.date_routed ?? originalRecord.date_routed;
          const signedDateStr =
            dataIndex === "date_signed"
              ? String(value) // Ensure value is string
              : newFields.date_signed ?? originalRecord.date_signed;

          if (routedDateStr && signedDateStr) {
            const routedDate = dayjs(
              routedDateStr,
              ["MM/DD/YYYY", "YYYY-MM-DD", "M/D/YYYY", dayjs.ISO_8601],
              true
            );
            const signedDate = dayjs(
              signedDateStr,
              ["MM/DD/YYYY", "YYYY-MM-DD", "M/D/YYYY", dayjs.ISO_8601],
              true
            );

            if (routedDate.isValid() && signedDate.isValid()) {
              newFields.days_drds = calculateBusinessDays(routedDate, signedDate);
            } else {
              newFields.days_drds = "";
            }
          } else {
            newFields.days_drds = "";
          }
        }

        return {
          ...prev,
          [rowKey]: newFields,
        };
      });

      // Asynchronous update part (only for industry_class)
      if (dataIndex === "industry_class") {
        if (value) {
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
                industry_class: value,
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
                industry_class: value,
                industry_type: "",
                industry_subtype: "",
                psic_code: "",
              },
            }));
          }
        }
        // No 'else' needed here for clearing industry_class dependents,
        // as it's handled in the synchronous part above.
      }
    },
    [data] // `data` is a dependency for originalRecord fallback.
  );

  const handleFreezeColumnChange = (columnKey, checked) => {
    setFrozenColumnKeys((prev) => {
      if (checked) {
        if (prev.length < 5) {
          return [...prev, columnKey];
        }
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
        if (prev.length === 1 && prev.includes(columnKey)) {
          return prev;
        }
        newVisibleKeys = prev.filter((key) => key !== columnKey);
      }
      if (!checked) {
        setFrozenColumnKeys((fKeys) =>
          fKeys.filter((fKey) => fKey !== columnKey)
        );
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
        const keysToHide = visibleColumnKeys.filter(
          (key) => key !== firstColumnKey
        );

        setFrozenColumnKeys((fKeys) =>
          fKeys.filter(
            (fKey) => !keysToHide.includes(fKey) || fKey === firstColumnKey
          )
        );

        setVisibleColumnKeys([firstColumnKey]);
      }
    } else {
      setVisibleColumnKeys([]);
    }
  };

  const COLUMN_GROUP_CONFIG = {
    PERMITS: {
      title: "Permits",
      keys: [
        "ecc_group", // Group key
        "pto_group", // Group key
        "wwdp_group", // Group key
        "hwg_id_group", // Group key
        "pco_group", // Group key
      ],
    },
    LEGAL: {
      title: "Legal Unit Info",
      keys: [
        // To make these editable, define individual columns in baseColumns
        // with dataIndex and dataType, then list their keys here.
        // Example: "docket_no_val", "nov_issued_val", etc.
        "legal_case_numbers",
        "env_law_violations",
        "tc_information",
        "penalty_details",
        "resolution_order_info",
      ],
    },
    PLANNING_UNIT: {
      title: "Planning Unit Fields",
      keys: [
        "pismu_tracking", // Planning Staff Incharged
        "title_status", // Project Status
        "remarks", // Remarks/Recommendations
        "with_nov", // With NOV
        "pismu_count_month", // Accomplishment Count (Month received by PISMU)
      ],
    },
    FOCAL_PERSON: {
      title: "Focal Person Fields",
      keys: [
        "iis_nos", // IIS Transaction No.
        "section_handler_info", // Section & Handler Info
        "monitoring_sched", // Monitoring Schedule
        "insp_type", // Inspection Type
        "transaction_submission_dates", // Transaction and Submission Date
        "days_dmds", // Total Days (Date Monitored vs. Date Routed)
        "days_drds", // Total Days (Date Routed vs. Date Signed)
      ],
    },
    PROJECT_TYPE: {
      title: "Project Type Fields",
      keys: [
        "industry_type", // Industry Type
        "industry_subtype", // Industry Subtype
        "industry_classs",
        "psic_code", // PSIC Code
      ],
    },
    // Add more groups here as needed, e.g.:
    // GENERAL_INFO: { title: "General Project Info", keys: ["sort_key", "name", "title", ...] },
    // LOCATION_INFO: { title: "Location Info", keys: ["geo_coordinates", "address", ...] },
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
      onClick={(e) => e.stopPropagation()} // Prevent clicks on the wrapper itself from closing dropdown
    >
      {menuComponent}
      <Divider className="custom-dropdown-divider" />
      <div className="custom-dropdown-footer">
        <Button
          type="primary"
          size="small"
          onClick={(e) => {
            e.stopPropagation(); // Prevent this button click from propagating further
            onOkClick(); // Call the handler to close the dropdown
          }}
        >
          OK
        </Button>
      </div>
    </div>
  );

  // Memoized calculation for all base column keys
  const allBaseColumnKeys = useMemo(
    () => baseColumns.map((col) => col.key).filter(Boolean),
    [baseColumns]
  );

  // Memoized calculation to determine if all columns are currently visible
  const isAllColumnsVisible = useMemo(() => {
    if (allBaseColumnKeys.length === 0) return false; // No columns to be "all visible"
    // Check if every base key is visible AND visible keys count matches base keys count
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
      if (makeVisible) {
        newVisibleKeys = [
          ...new Set([...currentVisibleKeys, ...groupColumnKeysToToggle]),
        ];
      } else {
        const keysAfterHidingGroup = currentVisibleKeys.filter(
          (key) => !groupColumnKeysToToggle.includes(key)
        );

        if (
          keysAfterHidingGroup.length === 0 &&
          baseColumns.length > 0 &&
          baseColumns[0]?.key
        ) {
          newVisibleKeys = [baseColumns[0].key]; // Keep first base column if all would be hidden
        } else {
          newVisibleKeys = keysAfterHidingGroup;
        }

        const actuallyHiddenKeys = groupColumnKeysToToggle.filter(
          (key) =>
            currentVisibleKeys.includes(key) && !newVisibleKeys.includes(key)
        );
        if (actuallyHiddenKeys.length > 0) {
          setFrozenColumnKeys((fKeys) =>
            fKeys.filter((fKey) => !actuallyHiddenKeys.includes(fKey))
          );
        }
      }
      return newVisibleKeys;
    });
  };

  const groupedColumnMenuItems = useMemo(() => {
    const menuItems = [];
    const allGroupedKeys = new Set(
      Object.values(COLUMN_GROUP_CONFIG).flatMap((g) => g.keys)
    );

    // Add defined groups
    Object.entries(COLUMN_GROUP_CONFIG).forEach(([groupKey, groupDetails]) => {
      const columnsInGroup = baseColumns.filter((col) =>
        groupDetails.keys.includes(col.key)
      );
      if (columnsInGroup.length === 0) return; // Skip group if no relevant columns exist in baseColumns

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

    // Add "Other Columns"
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
  }, [baseColumns, visibleColumnKeys]); // visibleColumnKeys needed for re-calc of group checkbox states

  const columnVisibilityMenu = (
    <Menu className="column-visibility-menu">
      <Menu.Item
        key="show-all-columns"
        onClick={(e) => {
          e.stopPropagation();
          handleShowAllColumns();
          // Checkbox onChange will handle the logic
        }}
      >
        <Checkbox
          checked={isAllColumnsVisible}
          onChange={(e) => {
            if (e.target.checked) {
              // If user checks it (wants to show all)
              handleShowAllColumns();
            } else {
              // If user unchecks it (wants to hide all but first)
              handleHideAllColumns();
            }
          }}
          disabled={allBaseColumnKeys.length === 0}
          size="small"
        >
          Show All Columns
        </Checkbox>
      </Menu.Item>
      {allBaseColumnKeys.length > 0 && <Menu.Divider />}{" "}
      {/* Use allBaseColumnKeys for consistency */}
      {groupedColumnMenuItems.map((item, index) => {
        if (item.type === "groupHeader") {
          const groupColsInBase = item.columns; // Columns from baseColumns that are in this group
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
              {/* Divider before new top-level group, not for first group after global checkbox */}
              <Menu.ItemGroup title={item.title}>
                {!item.isOtherGroup && ( // "Other Columns" doesn't need a master toggle
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
                onChange={(e) => {
                  handleColumnVisibilityChange(item.key, e.target.checked);
                }}
                // Disable unchecking if it's the last visible column overall
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

  // Columns available for the freeze menu are only those currently visible
  const columnsForFreezeMenu = useMemo(() => {
    return baseColumns.filter((col) => visibleColumnKeys.includes(col.key));
  }, [baseColumns, visibleColumnKeys]);

  const freezeMenu = (
    <Menu className="freeze-column-menu">
      {columnsForFreezeMenu.map((col) => {
        // Iterate over visible columns only
        const canBeFrozen = !!col.width;
        const isCurrentlyFrozen = frozenColumnKeys.includes(col.key);
        const limitReached = frozenColumnKeys.length >= 5;
        return (
          <Menu.Item
            key={`freeze-${col.key}`}
            disabled={!canBeFrozen}
            onClick={(e) => {
              e.stopPropagation(); // Stop propagation to prevent menu from closing dropdown
            }}
          >
            <Tooltip
              title={
                limitReached && !isCurrentlyFrozen && canBeFrozen
                  ? "Maximum of 5 columns can be frozen." // Updated message
                  : !canBeFrozen
                  ? "Column must have a defined width to be frozen."
                  : ""
              }
            >
              <Checkbox
                checked={isCurrentlyFrozen}
                onChange={(e) => {
                  handleFreezeColumnChange(col.key, e.target.checked);
                }}
                disabled={!canBeFrozen || (limitReached && !isCurrentlyFrozen)}
                // width: 100% is handled by .freeze-column-menu .ant-checkbox-wrapper in CSS
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
      <p>Table Density:</p> {/* fontWeight and marginBottom handled by CSS */}
      <Radio.Group
        onChange={(e) => setCurrentTableSize(e.target.value)}
        value={currentTableSize}
        // marginBottom handled by CSS
      >
        <Radio value="small">Small</Radio>
        <Radio value="middle">Middle</Radio>
        <Radio value="large">Large</Radio>
      </Radio.Group>
      <Divider /> {/* margin handled by CSS */}
      <Checkbox
        checked={isTableBordered}
        onChange={(e) => setIsTableBordered(e.target.checked)}
      >
        Show Borders
      </Checkbox>
    </div>
  );

  // cardStyle object removed, styles are in .monitoring-page-container and its theme variants
  const finalTableColumns = useMemo(() => {
    let accumulatedWidth = 0;
    const MAX_FROZEN_WIDTH = 700;

    // Filter baseColumns by visibility first
    const currentlyVisibleColumns = baseColumns.filter((col) =>
      visibleColumnKeys.includes(col.key)
    );

    return currentlyVisibleColumns
      .map((baseCol) => {
        const col = { ...baseCol }; // Clone to avoid mutating baseColumns
        const isActuallyFrozen =
          frozenColumnKeys.includes(baseCol.key) &&
          col.width &&
          baseCol.key !== "actions" &&
          (accumulatedWidth === 0 ||
            accumulatedWidth + baseCol.width <= MAX_FROZEN_WIDTH);

        // Store original render for fallback or if not editing
        const originalRender = col.render;

        col.onCell = (record) => {
          const rowKey = record._id;
          const cellClasses = [];

          // Retrieve original cell props and classes, if any
          const originalCellProps = baseCol.onCell
            ? baseCol.onCell(record)
            : {};
          if (originalCellProps.className) {
            cellClasses.push(originalCellProps.className);
          }

          // Add specific class for permit group cells
          let permitGroupClass = "";
          switch (baseCol.key) {
            case "ecc_group":
              permitGroupClass = "table-cell-group-ecc-dark";
              break;
            case "pto_group":
              permitGroupClass = "table-cell-group-pto-dark";
              break;
            case "wwdp_group":
              permitGroupClass = "table-cell-group-wwdp-dark";
              break;
            case "hwg_id_group":
              permitGroupClass = "table-cell-group-hwg_id-dark";
              break;
            case "pco_group":
              permitGroupClass = "table-cell-group-pco-dark";
              break;
          }
          if (permitGroupClass) {
            cellClasses.push(permitGroupClass);
          }

          // Determine if cell is editable
          const isEditable =
            editingRowKeys.includes(rowKey) &&
            ((col.dataType &&
              col.dataIndex &&
              ![
                "permit_group",
                "legal_group",
                "geo_group",
                "iis_group",
                "geo-group",
                "section_handler_group",
                "submission_dates_group",
              ].includes(col.dataType)) || // Standard editable field
              (col.dataType === "permit_group" && col.editorFields) || // Permit group
              (col.dataType === "legal_group" && col.editorFields) || // Legal group
              (col.dataType === "iis_group" && col.editorFields) || // IIS group
              (col.dataType === "geo_group" && col.editorFields) || // IIS group
              (col.dataType === "section_handler_group" && col.editorFields) || // Section/Handler group
              (col.dataType === "submission_dates_group" && col.editorFields)); // Submission Dates group

          if (isEditable) {
            cellClasses.push("editable-cell");
          }

          if (isActuallyFrozen) {
            cellClasses.push("table-cell-frozen");
          }

          const finalCellProps = { ...originalCellProps };
          finalCellProps.className = cellClasses.join(" ").trim();

          if (isEditable) {
            finalCellProps.style = {
              ...finalCellProps.style,
              verticalAlign: "top",
            };
          }
          return finalCellProps;
        };

        col.render = (text, record, index) => {
          const rowKey = record._id;

          // Handle grouped field editing (permit_group, legal_group)
          if (
            [
              "permit_group",
              "legal_group",
              "geo_group",
              "iis_group",
              "section_handler_group",
              "submission_dates_group",
            ].includes(col.dataType) &&
            editingRowKeys.includes(rowKey) &&
            col.editorFields
          ) {
            return (
              <div className="editable-permit-group" style={{ padding: "2px" }}>
                {col.editorFields.map((field) => {
                  const currentValue =
                    editedData[rowKey]?.[field.dataIndex] ??
                    record[field.dataIndex];
                  let inputElement;

                  switch (field.type) {
                    case "textarea":
                      inputElement = (
                        <TextArea
                          value={currentValue}
                          onChange={(e) =>
                            handleInputChange(
                              e.target.value,
                              rowKey,
                              field.dataIndex
                            )
                          }
                          placeholder={field.label}
                          autoSize={{ minRows: 1, maxRows: 3 }}
                          className="editable-cell-input"
                        />
                      );
                      break;
                    case "date":
                      // For grouped fields, assuming field.type === "date" implies a single date
                      const currentGroupedDateValue =
                        editedData[rowKey]?.[field.dataIndex] ??
                        record[field.dataIndex];

                      // Ensure currentGroupedDateValue is a string before parsing, then parse
                      const dayjsGroupedValue =
                        currentGroupedDateValue &&
                        typeof currentGroupedDateValue === "string"
                          ? dayjs(
                              currentGroupedDateValue,
                              [
                                "MM/DD/YYYY",
                                "YYYY-MM-DD",
                                "M/D/YYYY",
                                dayjs.ISO_8601,
                              ],
                              true
                            )
                          : null;

                      inputElement = (
                        <DatePicker
                          value={
                            dayjsGroupedValue && dayjsGroupedValue.isValid()
                              ? dayjsGroupedValue
                              : null
                          }
                          onChange={(
                            date,
                            dateString // date is dayjs obj or null, dateString is string or ""
                          ) =>
                            handleInputChange(
                              dateString, // Store single date string
                              rowKey,
                              field.dataIndex
                            )
                          }
                          placeholder={field.label}
                          format="MM/DD/YYYY"
                          className="editable-cell-input"
                          style={{ width: "100%" }}
                        />
                      );
                      break;
                    case "select":
                      inputElement = (
                        <Select
                          value={currentValue}
                          onChange={(value) =>
                            handleInputChange(value, rowKey, field.dataIndex)
                          }
                          placeholder={field.label}
                          options={
                            field.editorOptions?.map((opt) =>
                              typeof opt === "string"
                                ? { label: opt, value: opt }
                                : opt
                            ) || []
                          }
                          className="editable-cell-input"
                          style={{ width: "100%" }}
                        />
                      );
                      break;
                    case "checkbox_yes_no_boolean": // Handle TC Commitment
                      inputElement = (
                        <Checkbox
                          checked={currentValue === true}
                          onChange={(e) =>
                            handleInputChange(
                              e.target.checked, // Send boolean true/false
                              rowKey,
                              field.dataIndex
                            )
                          }
                          style={{ marginTop: "5px" }} // Add some spacing if needed
                        >
                          {field.label}
                        </Checkbox>
                      );
                      break;



                    case "custom_autocomplete_sectionincharge":
                      inputElement = (
                        <SectionInChargeAutocomplete
                          value={currentValue}
                          onChange={(value) =>
                            handleInputChange(value, rowKey, field.dataIndex)
                          }
                          placeholder={field.label}
                          isEditing={true} // Pass isEditing if the component uses it
                          theme={theme} // Pass theme if the component uses it
                          disabled={loading}
                        />
                      );
                      break;
                    case "custom_autocomplete_inspectors": // For Handler in section_handler_group
                      inputElement = (
                        <InspectorsAutocomplete
                          value={currentValue}
                          onChange={(value) =>
                            handleInputChange(value, rowKey, field.dataIndex)
                          }
                          placeholder={field.label}
                          isEditing={true}
                          // theme={theme} // If needed by InspectorsAutocomplete
                          disabled={loading}
                        />
                      );
                      break;
                    case "custom_autocomplete_permitsource": // For Process in ecc_group
                      inputElement = (
                        <PermitSourceAutocomplete
                          value={currentValue}
                          onChange={(value) =>
                            handleInputChange(value, rowKey, field.dataIndex)
                          }
                          placeholder={field.label}
                          disabled={loading}
                        />
                      );
                      break;
                    // Add other types like "number" if needed for legal/permit groups
                    case "text":
                    default:
                      inputElement = (
                        <Input
                          value={currentValue}
                          onChange={(e) =>
                            handleInputChange(
                              e.target.value,
                              rowKey,
                              field.dataIndex
                            )
                          }
                          placeholder={field.label}
                          className="editable-cell-input"
                        />
                      );
                      break;
                  }
                  return (
                    <div
                      key={field.dataIndex}
                      className="permit-group-field-editor"
                      style={{ marginBottom: "8px" }} // Increased bottom margin
                    >
                      {inputElement}
                    </div>
                  );
                })}
              </div>
            );
          } else if (
            editingRowKeys.includes(rowKey) &&
            col.dataType &&
            col.dataIndex
          ) {
            // Handle other standard editable types
            const currentValue =
              editedData[rowKey]?.[col.dataIndex] ?? record[col.dataIndex];
            switch (col.dataType) {
              case "text":
                return (
                  <Input
                    value={currentValue}
                    onChange={(e) =>
                      handleInputChange(e.target.value, rowKey, col.dataIndex)
                    }
                    className="editable-cell-input"
                    disabled={
                      editingRowKeys.includes(rowKey) &&
                      !!editedData[rowKey]?.industry_class &&
                      col.dataIndex === "psic_code"
                    }
                  />
                );
              case "number":
                return (
                  <InputNumber
                    value={currentValue}
                    onChange={(value) =>
                      handleInputChange(value, rowKey, col.dataIndex)
                    }
                    className="editable-cell-input" // Keep existing class
                    style={{ width: "100%", fontSize: "12px" }} // Reduced font size
                  />
                );
              case "date":
                const currentStandaloneDateValue =
                  editedData[rowKey]?.[col.dataIndex] ?? record[col.dataIndex];

                const dayjsStandaloneValue =
                  currentStandaloneDateValue &&
                  typeof currentStandaloneDateValue === "string"
                    ? dayjs(
                        currentStandaloneDateValue,
                        ["YYYY-MM-DD", "M/D/YYYY", dayjs.ISO_8601],
                        true
                      )
                    : null;

                return (
                  <DatePicker
                    value={
                      dayjsStandaloneValue && dayjsStandaloneValue.isValid()
                        ? dayjsStandaloneValue
                        : null
                    }
                    picker="month" // Set picker to month
                    onChange={(date, dateString) =>
                      handleInputChange(dateString, rowKey, col.dataIndex)
                    }
                    format="MMMM YYYY" // Display full month name and year
                    className="editable-cell-input"
                    style={{ width: "100%" }}
                  />
                );
              case "textarea":
                return (
                  <TextArea
                    value={currentValue}
                    onChange={(e) =>
                      handleInputChange(e.target.value, rowKey, col.dataIndex)
                    }
                    className="editable-cell-input"
                    autoSize={{ minRows: 5, maxRows: 6 }} // Adjusted auto-resize
                    style={{ width: "100%" }}
                  />
                );
              case "select":
                return (
                  <Select
                    value={currentValue}
                    onChange={(value) =>
                      handleInputChange(value, rowKey, col.dataIndex)
                    }
                    options={
                      col.editorOptions?.map((opt) =>
                        typeof opt === "string"
                          ? { label: opt, value: opt }
                          : opt
                      ) || []
                    }
                    className="editable-cell-input"
                    style={{ width: "100%" }}
                    showSearch
                    optionFilterProp="children"
                  />
                );
              case "checkbox_mbu": // <<< CRITICAL: This must exactly match the dataType above
                return (
                  <Checkbox
                    checked={currentValue === "✔"}
                    onChange={(e) =>
                      handleInputChange(
                        e.target.checked ? "✔" : "✘",
                        rowKey,
                        col.dataIndex // Should be "mbu_area"
                      )
                    }
                    style={{
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      height: "100%",
                    }}
                  />
                );
              case "checkbox_yes_no": // For "With NOV"
                return (
                  <Checkbox
                    checked={currentValue === "✔"}
                    onChange={(e) =>
                      handleInputChange(
                        e.target.checked ? "✔" : "✘",
                        rowKey,
                        col.dataIndex
                      )
                    }
                    style={{
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      height: "100%",
                    }}
                    disabled={loading}
                  />
                );

              // Cases for custom autocompletes for standalone fields
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
              case "custom_autocomplete_municipalities":
                return (
                  <MunicipalitiesAutocomplete
                    value={currentValue}
                    onChange={(value) =>
                      handleInputChange(value, rowKey, col.dataIndex)
                    }
                    selectedProvince={
                      editedData[rowKey]?.province ?? record.province
                    }
                    disabled={loading}
                    onDistrictChange={
                      (district) =>
                        handleInputChange(district, rowKey, "cong_district") // Ensure this is correct
                    }
                  />
                );
              case "custom_autocomplete_barangay":
                return (
                  <BarangayAutocomplete
                    value={currentValue}
                    onChange={(value) =>
                      handleInputChange(value, rowKey, col.dataIndex)
                    }
                    selectedProvince={
                      editedData[rowKey]?.province ?? record.province
                    }
                    selectedMunicipality={
                      editedData[rowKey]?.city ?? record.city
                    }
                    disabled={loading}
                  />
                );
              case "custom_autocomplete_industrytype": // Temporarily using Input for diagnosis
                return (
                  <TextArea
                    value={currentValue}
                    disabled={
                      loading ||
                      (editingRowKeys.includes(rowKey) &&
                        !!editedData[rowKey]?.industry_class)
                    }
                    placeholder="Industry Type"
                    className="editable-cell-input"
                    autoSize={{ minRows: 1, maxRows: 5 }}
                  />
                );
              case "custom_autocomplete_industrysubtype": // Temporarily using Input for diagnosis
                return (
                  <TextArea
                    value={currentValue}
                    onChange={(
                      e // Added onChange
                    ) =>
                      handleInputChange(e.target.value, rowKey, col.dataIndex)
                    }
                    disabled={
                      loading ||
                      (editingRowKeys.includes(rowKey) &&
                        !!editedData[rowKey]?.industry_class)
                    }
                    placeholder="Industry Subtype"
                    className="editable-cell-input"
                    autoSize={{ minRows: 1, maxRows: 5 }}
                  />
                );
              case "custom_autocomplete_industryclass":
                return (
                  <IndustryClassAutocomplete
                    value={currentValue}
                    onChange={(value) =>
                      handleInputChange(value, rowKey, col.dataIndex)
                    }
                    theme={theme}
                    isEditing={true} // Since this is in an editing context
                    disabled={loading} // IndustryClass itself is not disabled by its own selection
                  />
                );
              case "custom_autocomplete_inspectiontype":
                return (
                  <InspectionTypeAutocomplete
                    value={currentValue}
                    onChange={(value) =>
                      handleInputChange(value, rowKey, col.dataIndex)
                    }
                    theme={theme}
                    readOnly={false} // Equivalent to isEditing=true for this component
                    disabled={loading}
                  />
                );
              case "custom_autocomplete_projectstatus":
                return (
                  <ProjectStatusAutocomplete
                    value={currentValue}
                    onChange={(value) =>
                      handleInputChange(value, rowKey, col.dataIndex)
                    }
                    readOnly={false}
                    disabled={loading}
                  />
                );
              case "custom_autocomplete_wwtftype":
                return (
                  <WWTFTypeAutocomplete
                    value={currentValue}
                    onChange={(value) =>
                      handleInputChange(value, rowKey, col.dataIndex)
                    }
                    isEditing={true}
                    disabled={loading}
                  />
                );
              case "custom_autocomplete_inspectors": // For pismu_tracking
                return (
                  <InspectorsAutocomplete
                    value={currentValue}
                    onChange={(value) =>
                      handleInputChange(value, rowKey, col.dataIndex)
                    }
                    isEditing={true}
                    // theme={theme} // If needed
                    disabled={loading}
                  />
                );
              case "custom_autocomplete_pismu_staff": // For pismu_tracking
                return (
                  <ConfigProvider
                    theme={{
                      components: {
                        AutoComplete: {
                          optionFontSize: 10,
                          colorTextPlaceholder: theme === 'dark' ? "rgba(255,255,255,0.45)" : "#555", // Adjusted placeholder for dark theme
                          fontSize: "11px", // Font size for the dropdown options and input text
                          boxShadow: "none",
                        },
                      },
                    }}
                  >
                    <AutoComplete
                      style={{ width: "100%" }} // Removed direct font size, handled by ConfigProvider/Input
                      options={loading ? [] : pismuStaffOptions}
                      value={currentValue}
                      onChange={(value) =>
                        handleInputChange(value, rowKey, col.dataIndex)
                      }
                      filterOption={(inputValue, option) =>
                        option.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
                      }
                      disabled={loading}
                      allowClear
                    >
                      <Input
                        style={{
                          fontSize: "11px", // Consistent font size
                          height: "29px", // Consistent height
                          padding: "4px 8px", // Consistent padding
                          cursor: loading ? "not-allowed" : "text",
                          color: loading && theme === 'dark' ? "rgba(255,255,255,0.3)" : loading ? "#aaa" : "inherit",
                        }}
                        placeholder="Select PISMU Staff"
                        // placeholderStyle is not a standard AntD prop, colorTextPlaceholder in ConfigProvider handles this
                        disabled={loading} // Ensure Input is also disabled
                      />
                    </AutoComplete>
                  </ConfigProvider>
                );
              case "custom_autocomplete_reporttype":
                return (
                  <ReportTypeAutocomplete
                    value={currentValue}
                    onChange={(value) =>
                      handleInputChange(value, rowKey, col.dataIndex)
                    }
                    theme={theme}
                    readOnly={false}
                    disabled={loading}
                  />
                );
              default:
                return originalRender
                  ? originalRender(text, record, index)
                  : text;
            }
          }
          // Fallback to originalRender for display view or non-editable columns
          return originalRender ? originalRender(text, record, index) : text;
        };

        if (isActuallyFrozen) {
          accumulatedWidth += baseCol.width;
          col.fixed = "left";
          col.onHeaderCell = () => ({ className: "table-header-frozen" });
          // onCell for frozen is handled above to combine with editable-cell
        } // This closing brace was missing in the thought process, but should be here.
        return col;
      })
      .map((col) => {
        // Apply filters based on user request
        // Input filters
        const inputFilterFields = [
          "sort_key",
          "name",
          "title",
          "long",
          "lat",
          "bod",
          "address",
          "iis_no_2024",
          "iis_no_2025",
          "days_dmds",
          "days_drds",
          "remarks",
          "ecc_cnc",
          "pco_no",
          "pto_code",
          "wwdp_code",
          "haz_id",
          "pco_name", // Permit codes are part of groups
          "docket_no",
          "v_pd1586",
          "v_ra9275",
          "v_ra8749",
          "v_ra6969_haz",
          "v_ra6969_tchem",
          "tc_date_actual",
          "tc_compliance_link",
          "pos_paper",
          "amount",
          "or_number",
          "other_tc_remarks",
          "order_issued",
          "order_status",
        ];

        // Dropdown (Month) filters
        const monthFilterFields = [
          "date_monitored",
          "date_routed",
          "date_signed",
          "date_amended",
          "date_approved",
          "pto_issued",
          "pto_expiration",
          "wwdp_issued",
          "wwdp_expiration",
          "haz_issued",
          "nov_issued",
          "penalty_date",
          "resolution_issued",
        ];

        // Dropdown (Year) filters
        const yearFilterFields = ["pco_validity"];

        const generalDropdownFields = previouslyGeneralDropdownFields;

        // Combine all fields that should now use text input filters
        const allTextFilterableFields = [
          ...inputFilterFields,
          ...previouslyMonthFilterFields, // Renamed from monthFilterFields
          ...previouslyYearFilterFields, // Renamed from yearFilterFields
          ...previouslyGeneralDropdownFields, // Renamed from generalDropdownFieldsForFetch
        ];

        let filterableDataIndex = col.dataIndex;

        // Determine the correct dataIndex for filtering, especially for group columns
        if (col.key === "geo_coordinates") filterableDataIndex = "lat"; // As per thought process, primary field for group
        if (col.key === "iis_nos") filterableDataIndex = "iis_no_2024";
        if (col.key === "section_handler_info")
          filterableDataIndex = "section_incharged";
        if (col.key === "transaction_submission_dates")
          filterableDataIndex = "date_monitored";
        if (col.key === "ecc_group") filterableDataIndex = "ecc_cnc";
        if (col.key === "pto_group") filterableDataIndex = "pto_code";
        if (col.key === "wwdp_group") filterableDataIndex = "wwdp_code";
        if (col.key === "hwg_id_group") filterableDataIndex = "haz_id";
        if (col.key === "pco_group") filterableDataIndex = "pco_no";
        if (col.key === "legal_case_numbers") filterableDataIndex = "docket_no";
        if (col.key === "env_law_violations") filterableDataIndex = "v_pd1586";
        if (col.key === "tc_information")
          filterableDataIndex = "tc_date_actual";
        if (col.key === "penalty_details") filterableDataIndex = "penalty_date"; // This is month, but user listed 'amount' and 'or_number' as input for this group. Prioritizing 'penalty_date' (month) for the group header.
        if (col.key === "resolution_order_info")
          filterableDataIndex = "resolution_issued";

        if (
          filterableDataIndex &&
          allTextFilterableFields.includes(filterableDataIndex)
        ) {
          return {
            ...col,
            ...getColumnSearchProps(filterableDataIndex, col.title),
          };
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
    filterByExpired,
    data, // data is used for generating uniqueMonth/Year/Values for dropdowns
    columnFilters,
    previouslyMonthFilterFields, // Updated dependency
    previouslyYearFilterFields, // Updated dependency
    previouslyGeneralDropdownFields, // Updated dependency
  ]); // Dependencies updated

  const onSelectChange = (newSelectedRowKeys) => {
    // console.log("selectedRowKeys changed in Monitoring: ", newSelectedRowKeys);
    setSelectedRowKeys(newSelectedRowKeys);
  };

  const rowSelection = {
    selectedRowKeys,
    onChange: onSelectChange,
    getCheckboxProps: (record) => ({
      disabled: editingRowKeys.length > 0 || record.name === "Disabled User",
    }),
  };

  const isAnyFilterActive =
    selectedProjectStatus ||
    selectedSectionFilter ||
    selectedPermitTypeKey ||
    filterByExpired ||
    searchTerm ||
    selectedProvince ||
    (columnFilters && Object.keys(columnFilters).length > 0);

  const getActiveFilterKeyword = () => {
    if (searchTerm) {
      return searchTerm;
    }
    if (columnFilters && Object.keys(columnFilters).length > 0) {
      // Get the first active column filter's value
      const firstActiveColumnFilterKey = Object.keys(columnFilters)[0];
      const filterValue = columnFilters[firstActiveColumnFilterKey];
      // If the filter value is an array (from AntD filter), take the first element
      return Array.isArray(filterValue) ? filterValue[0] : filterValue;
    }
    return null;
  };

  return (
    <div
      className={`monitoring-page-container ${
        theme === "dark" ? "theme-dark" : "theme-light"
      }`}
    >
      <DashboardTiles
        theme={theme}
        onProjectStatusSelect={handleProjectStatusSelect}
        onSectionFilterSelect={handleSectionFilterSelect}
        selectedSectionFilterValue={selectedSectionFilter}
        selectedProjectStatus={selectedProjectStatus}
        onPermitTypeSelect={handlePermitTypeSelect}
        selectedPermitTypeKey={selectedPermitTypeKey}
        onFilterByExpiredSelect={handleFilterByExpiredSelect} // Pass handler
        filterByExpired={filterByExpired} // Pass state
        breakdownCriteria={breakdownCriteria} // Pass the breakdownCriteria state
        onViewEccCncSubtypeDetails={handleShowBreakdownDetails} // Pass handler for breakdown
      />

      {/* Existing Controls and Table Section */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start", // Align children (left and right controls) to the top
        }}
        className="table-controls-header"
      >
        <div
          className="table-controls-left"
          style={{ display: "flex", alignItems: "flex-start" }}
        >
          {/* Wrapper for Search input and its associated tags/results message */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
            }}
          >
            <Input.Search
              placeholder="Search records..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)} // Update local inputValue as user types
              onSearch={handleSearch}
              style={{ width: 300 }}
              allowClear
              enterButton
            />
            {/* Container for tags and results message, shown if any filter/search is active */}
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
                {selectedProjectStatus && (
                  <Tag
                    closable
                    onClose={() => handleProjectStatusSelect(null)} // Clear filter
                    color="blue"
                  >
                    Status:{" "}
                    {selectedProjectStatus.charAt(0).toUpperCase() +
                      selectedProjectStatus.slice(1).replace(/([A-Z])/g, " $1")}
                  </Tag>
                )}
                {selectedSectionFilter && (
                  <Tag
                    closable
                    onClose={() => handleSectionFilterSelect(null)} // Clear filter
                    color="green" // Or another distinct color
                  >
                    Section: {selectedSectionFilter.replace(/_/g, " ")}
                  </Tag>
                )}
                {selectedPermitTypeKey && (
                  <Tag
                    // Define colors for permit type tags
                    color={
                      {
                        ecc_cnc: "#0b5f74", // Dark Teal from .pd1586
                        pto_code: "#4a2250", // Dark Purple from .ra8749
                        wwdp_code: "#b45248", // Dark Red from .ra9275
                        haz_id: "#415e20", // Dark Green from .ra6969
                        pco_no: "#242726",
                      }[selectedPermitTypeKey] || "purple" // Default color
                    }
                    onClose={() => handlePermitTypeSelect(null)} // Clear filter
                  >
                    Permit:{" "}
                    {{
                      ecc_cnc: "ECC/CNC",
                      pto_code: "PTO",
                      wwdp_code: "WWDP",
                      haz_id: "HWG ID",
                      pco_no: "PCO",
                    }[selectedPermitTypeKey] || selectedPermitTypeKey}
                  </Tag>
                )}
                {filterByExpired && (
                  <Tag
                    closable
                    onClose={() => handleFilterByExpiredSelect()} // Toggles the filter off
                    color="orange" // Or another distinct color for expired filter
                  >
                    Filtering: Expired Permits
                  </Tag>
                )}

                <span className="search-results-message">
                  {loading
                    ? "Filtering..."
                    : total > 0
                    ? `${total} result${total === 1 ? "" : "s"} found ${
                        getActiveFilterKeyword()
                          ? `for "${getActiveFilterKeyword()}..."`
                          : ""
                      }`
                    : `No results found ${
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
            style={{ width: 200, marginLeft: "8px" }} // Added marginLeft for spacing
            onChange={handleProvinceChange}
            value={selectedProvince}
            loading={loading} // Disable while data is loading
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
              <Button
                onClick={handleSaveEdit}
                type="primary"
                //style={{ marginRight: 8 }}
                loading={loading}
                size="small"
              >
                Save
              </Button>
              <Button
                onClick={handleCancelEdit}
                //style={{ marginRight: 8 }}
                disabled={loading}
                size="small"
              >
                Cancel
              </Button>
            </>
          ) : (
            <Tooltip title="Edit Selected Data">
              <Button
                type="primary"
                icon={<EditOutlined />}
                disabled={selectedRowKeys.length === 0 || loading}
                onClick={handleEditClick}
                //style={{ marginRight: 8 }}
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
              <Button
                type="primary"
                size="small"
                icon={
                  <SettingOutlined /> /* Or a more specific icon like LockOutlined if you prefer */
                }
              >
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
              setSelectedProjectStatus(null);
              setSelectedSectionFilter(null);
              setSelectedPermitTypeKey(null);
              setFilterByExpired(false); // Reset expired filter
              setPagination({ current: 1, pageSize: 20 });
              setSelectedRowKeys([]);
              setEditingRowKeys([]);
              setEditedData({});
            }}
            loading={loading && editingRowKeys.length === 0}
            type="primary"
            size="small"
          />
          {editingRowKeys.length === 0 && (
            <AntPagination // Hide pagination when editing
              current={pagination.current}
              pageSize={pagination.pageSize}
              total={total}
              simple={true}
              size="small"
              className="ant-pagination"
              showSizeChanger={true} // Enable page size changer
              pageSizeOptions={["10", "20", "50", "100"]} // Provide page size options
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
        rowKey={(record) => record._id}
        rowSelection={rowSelection}
        pagination={false}
        loading={loading}
        onChange={handleTableChange}
        scroll={{ x: 3000, y: tableScrollY }}
        bordered={isTableBordered}
        size={currentTableSize}
      />

      <Breakdown
        visible={showBreakdownModal}
        onClose={handleCloseBreakdownModal}
        criteria={breakdownCriteria}
        theme={theme}
        // Pass currentUser and necessary refresh handlers to Breakdown
        currentUser={JSON.parse(localStorage.getItem("currentUser"))}
        setShouldRefreshTableForParent={setShouldRefreshTable}
        handleReloadParentTable={fetchData}
      />
    </div>
  );
};

export default Monitoring;
