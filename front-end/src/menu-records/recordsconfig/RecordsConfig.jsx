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
  Space,
} from "antd";
import {
  ReloadOutlined,
  DownOutlined,
  SettingOutlined,
  SearchOutlined as AntSearchOutlined,
  ToolFilled,
  TableOutlined, // Added for show/hide columns
  EditOutlined, // Added for Edit button
} from "@ant-design/icons";
import axios from "axios";
import { API_BASE_URL } from "../../config/api";
import dayjs from "dayjs"; // Added missing import for dayjs

const getMonth = (dateStr) => {
  const d = dayjs(dateStr, ["M/D/YYYY", "YYYY-MM-DD"], true);
  return d.isValid() ? d.format("MMMM") : "";
};

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
    case "TCHWMS/MBU": // Handling combined sections
    case "MBU/TCHWMS":
      // For combined, you might want a neutral color or a specific one.
      // Gradient backgrounds are harder with inline styles directly on backgroundColor.
      // You could pick one of the two, or a distinct color.
      return "#8A2BE2"; // Example: BlueViolet for combined
    case "":
    case null:
    case undefined:
      return "transparent"; // Or a light gray for empty sections if preferred
    default:
      // If the section name contains a slash, it might be a combined one not explicitly listed.
      if (normalizedSection.includes("/")) {
        return "#8A2BE2"; // Default for other combined sections
      }
      return "#B0BEC5"; // A neutral default color (blue-grey) for unlisted sections
  }
};

const RecordsConfig = ({ theme = "light" }) => {
  const [data, setData] = useState([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [tableScrollY, setTableScrollY] = useState(0);
  const [selectedProjectStatus, setSelectedProjectStatus] = useState(null);
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
  const [isColumnVisibilityDropdownOpen, setIsColumnVisibilityDropdownOpen] =
    useState(false);
  const [isFreezeDropdownOpen, setIsFreezeDropdownOpen] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [initialBaseColumnKeys, setInitialBaseColumnKeys] = useState(null); // Helper for visible keys initialization

  const fetchData = async (
    page = 1,
    pageSize = 20,
    search = "",
    province = null
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
        },
      });

      // Remove leading zeros *after* the dash in sort_key
      const transformedData = res.data.data.map((item) => {
        let newSortKey = item.sort_key || "";
        if (newSortKey.includes("-")) {
          const [prefix, numPart] = newSortKey.split("-");
          newSortKey = `${prefix}-${parseInt(numPart, 10)}`; // e.g., AU-00005 → AU-5
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
      pagination.current,
      pagination.pageSize,
      searchTerm,
      selectedProvince
    );
  }, [pagination.current, pagination.pageSize, searchTerm, selectedProvince]); // Add selectedProvince as a dependency

  useEffect(() => {
    // In a real app, fetch this from an API endpoint:
    // e.g., axios.get(`${API_BASE_URL}/api/distinct-provinces`)
    // For demonstration, using a static list. This list should match the
    // possible values in your data's 'province' field.
    const staticProvincesList = [
      "Aurora",
      "Bataan",
      "Bulacan",
      "Nueva Ecija",
      "Pampanga",
      "Tarlac",
      "Zambales",
      // Add other provinces that exist in your dataset
    ];
    setAllProvinces(staticProvincesList.sort());
  }, []);

  useEffect(() => {
    const calculateTableHeight = () => {
      const windowHeight = window.innerHeight;
      // Estimate height of elements outside the scrollable table body but inside the card:
      // - Card padding (top/bottom): 24px * 2 = 48px
      // - Custom header (Search + Pagination + Reload): approx 32px (input/button height) + 16px (margin-bottom) = 48px
      // - Table header row: approx 40px (for AntD small table)
      // - Some extra buffer for internal margins, borders, etc.: 20px
      const fixedInternalHeight = 48 + 48 + 40 + 20; // Total: 156px

      // Buffer for space outside the card (e.g., page margins, card's own marginBottom)
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

  // Memoize the base columns definition as it depends on 'theme' for one render prop
  // MOVED UP to be defined before useEffect hooks that depend on it.

  const baseColumns = useMemo(
    () => [
      // Checkbox column for selection - will be handled by rowSelection prop of Table
      // The Ant Design <Table rowSelection={...} /> prop automatically adds the checkbox column.
      // Manually defining it here can cause conflicts.
      {
        title: "ID No.",
        dataIndex: "sort_key",
        key: "sort_key",
        width: 80,
        align: "center",
        onHeaderCell: () => ({ style: { textAlign: "center" } }),
      },
      {
        title: "Proponent Name",
        dataIndex: "name",
        key: "name",
        width: 200,
        align: "left",
        onHeaderCell: () => ({ style: { textAlign: "center" } }),
      },
      {
        title: "Project Title",
        dataIndex: "title",
        key: "title",
        align: "left",
        width: 200,
        onHeaderCell: () => ({ style: { textAlign: "center" } }),
      },
      {
        title: "Industry Type",
        dataIndex: "industry_type",
        key: "industry_type",
        align: "left",
        width: 150,
        onHeaderCell: () => ({ style: { textAlign: "center" } }),
      },
      {
        title: "Industry Subtype",
        dataIndex: "industry_subtype",
        key: "industry_subtype",
        align: "left",
        width: 150,
        onHeaderCell: () => ({ style: { textAlign: "center" } }),
      },
      {
        title: "Industry Class",
        dataIndex: "industry_class",
        key: "industry_class",
        align: "center",
        width: 150,
        onHeaderCell: () => ({ style: { textAlign: "center" } }),
      },
      {
        title: "PSIC Code",
        dataIndex: "psic_code",
        key: "psic_code",
        align: "center",
        width: 100,
        onHeaderCell: () => ({ style: { textAlign: "center" } }),
      },
      {
        title: "MBU Area",
        dataIndex: "mbu_area",
        key: "mbu_area",
        align: "center",
        width: 100,
        onHeaderCell: () => ({ style: { textAlign: "center" } }),
      },
      {
        title: "Waterbody",
        dataIndex: "waterbody",
        key: "waterbody",
        width: 150,
        onHeaderCell: () => ({ style: { textAlign: "center" } }),
      },
      {
        title: "Total Employees",
        dataIndex: "emp_total",
        key: "emp_total",
        width: 100,
        onHeaderCell: () => ({ style: { textAlign: "center" } }),
      },
      {
        title: "Wastewater Facility Type",
        dataIndex: "wwtf_type",
        key: "wwtf_type",
        width: 100,
        onHeaderCell: () => ({ style: { textAlign: "center" } }),
      },
      {
        title: "BOD",
        dataIndex: "bod",
        key: "bod",
        width: 100,
        onHeaderCell: () => ({ style: { textAlign: "center" } }),
      },
      {
        title: "Geo-Coordinates",
        key: "geo_coordinates",
        width: 180,
        onHeaderCell: () => ({ style: { textAlign: "center" } }),
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
        width: 100,
        onHeaderCell: () => ({ style: { textAlign: "center" } }),
      },
      {
        title: "Address",
        dataIndex: "address",
        key: "address",
        width: 250,
        onHeaderCell: () => ({ style: { textAlign: "center" } }),
      },
      {
        title: "Street",
        dataIndex: "street",
        key: "street",
        width: 150,
        onHeaderCell: () => ({ style: { textAlign: "center" } }),
      },
      {
        title: "Barangay",
        dataIndex: "brgy",
        key: "brgy",
        width: 200,
        onHeaderCell: () => ({ style: { textAlign: "center" } }),
      },
      {
        title: "City",
        dataIndex: "city",
        key: "city",
        width: 100,
        onHeaderCell: () => ({ style: { textAlign: "center" } }),
      },
      {
        title: "Province",
        dataIndex: "province",
        key: "province",
        width: 100,
        onHeaderCell: () => ({ style: { textAlign: "center" } }),
      },
      {
        title: "IIS Transaction No.",
        key: "iis_nos",
        width: 150, // Adjust width as needed
        onHeaderCell: () => ({ style: { textAlign: "center" } }),
        render: (record) => (
          <span style={{ textAlign: "left", display: "block" }}>
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
        width: 200, // Adjust as needed
        onHeaderCell: () => ({ style: { textAlign: "center" } }),
        render: (text, record) => {
          const sectionStrings = String(record.section_incharged || "")
            .split(",")
            .map((section) => section.trim())
            .filter((section) => section); // Remove empty strings if any

          const handlerName = record.handler;
          const elements = [];

          if (sectionStrings.length === 0 && !handlerName) {
            return (
              <span
                style={{ color: theme === "dark" ? "#888" : "#777" }}
              ></span>
            );
          }

          // Case 1: Handler and section(s) exist
          if (handlerName && sectionStrings.length > 0) {
            const firstSection = sectionStrings[0];
            const bgColor = sectionBackgroundColor(firstSection);
            const textColor = bgColor === "#B0BEC5" ? "#263238" : "white";

            elements.push(
              <div
                key={`${record._id}-${firstSection}-handler`}
                style={{
                  backgroundColor: bgColor,
                  color: textColor,
                  padding: "3px 8px",
                  borderRadius: "4px",
                  fontSize: "11px", // Standardized font size to match other elements
                  textAlign: "center",
                  minWidth: "140px", // Added minimum width for better layout
                  display: "inline-block", // Allows it to flow with other items if parent is flex
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
                  style={{
                    backgroundColor: sectionBgColor,
                    color: sectionTextColor,
                    padding: "3px 8px",
                    borderRadius: "4px",
                    fontSize: "11px",
                    textAlign: "center",
                    display: "inline-block",
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
                  style={{
                    backgroundColor: bgColor,
                    color: textColor,
                    padding: "3px 8px",
                    borderRadius: "4px",
                    fontSize: "11px",
                    textAlign: "center",
                    display: "inline-block",
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
                  style={{
                    backgroundColor: bgColor,
                    color: textColor,
                    padding: "3px 8px",
                    borderRadius: "4px",
                    fontSize: "11px",
                    textAlign: "center",
                    display: "inline-block",
                  }}
                >
                  {handlerName} {/* No "Handler:" prefix */}
                </span>
              );
            }
          }

          if (elements.length === 0) {
            return (
              <span style={{ color: theme === "dark" ? "#888" : "#777" }}>
                N/A
              </span>
            );
          }

          return (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "center",
                gap: "4px",
              }}
            >
              {elements}
            </div>
          );
        },
      },
      {
        title: "Monitoring Schedule",
        dataIndex: "monitoring_sched",
        key: "monitoring_sched",
        width: 150,
        onHeaderCell: () => ({ style: { textAlign: "center" } }),
      },
      {
        title: "Inspection Type",
        dataIndex: "insp_type",
        key: "insp_type",
        width: 200,
        onHeaderCell: () => ({ style: { textAlign: "center" } }),
      },
      {
        title: "Transaction and Submission Date",
        key: "transaction_submission_dates",
        width: 220,
        align: "left",
        onHeaderCell: () => ({ style: { textAlign: "center" } }),
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
        width: 150,
        key: "days_dmds",
        onHeaderCell: () => ({ style: { textAlign: "center" } }),
      },
      {
        title: "Total Days (Date Routed vs. Date Signed)",
        dataIndex: "days_drds",
        width: 150,
        key: "days_drds",
        onHeaderCell: () => ({ style: { textAlign: "center" } }),
      },
      {
        title: "Planning Staff Incharged",
        dataIndex: "pismu_tracking",
        key: "pismu_tracking",
        width: 150,
        onHeaderCell: () => ({ style: { textAlign: "center" } }),
      },
      {
        title: "Project Status",
        dataIndex: "title_status",
        key: "title_status",
        width: 200,
        onHeaderCell: () => ({ style: { textAlign: "center" } }),
      },
      {
        title: "Remarks/Recommendations",
        width: 200,
        dataIndex: "remarks",
        key: "remarks",
        onHeaderCell: () => ({ style: { textAlign: "center" } }),
      },
      {
        title: "With NOV",
        dataIndex: "with_nov",
        key: "with_nov",
        width: 150,
        onHeaderCell: () => ({ style: { textAlign: "center" } }),
      },
      {
        title: "Accomplishment Count (Month received by PISMU)",
        dataIndex: "pismu_count_month",
        key: "pismu_count_month",
        width: 150,
        onHeaderCell: () => ({ style: { textAlign: "center" } }),
      },
      // Grouped: ECC/CNC
      {
        title: "ECC/CNC",
        key: "ecc_group",
        width: 250,
        align: "left",
        onHeaderCell: () => ({
          style: {
            textAlign: "center",
            backgroundColor: "#0b5f74",
            color: "white",
          },
        }), // ECC color from Province.jsx
        render: (record) => {
          if (
            !record.ecc_cnc &&
            !record.permit_process &&
            !record.date_amended &&
            !record.date_approved
          ) {
            return null;
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
                <strong>Amended:</strong> {record.date_amended || ""}
              </div>
              <div>
                <strong>Approved:</strong> {record.date_approved || ""}
              </div>
            </>
          );
        },
      },

      // Grouped: PTO
      {
        title: "PTO",
        key: "pto_group",
        width: 250,
        align: "left",
        onHeaderCell: () => ({
          style: {
            textAlign: "center",
            backgroundColor: "#643c6a",
            color: "white",
          },
        }), // PTO color
        render: (record) => {
          if (
            !record.pto_code &&
            !record.pto_issued &&
            !record.pto_expiration
          ) {
            return null;
          }
          return (
            <>
              <div>
                <strong>Code:</strong> {record.pto_code || ""}
              </div>
              <div>
                <strong>Issued:</strong> {record.pto_issued || ""}
              </div>
              <div>
                <strong>Expiry:</strong> {record.pto_expiration || ""}
              </div>
            </>
          );
        },
      },

      // Grouped: WWDP
      {
        title: "WWDP",
        key: "wwdp_group",
        width: 250,
        align: "left",
        onHeaderCell: () => ({
          style: {
            textAlign: "center",
            backgroundColor: "#b45248",
            color: "white",
          },
        }), // WWDP color
        render: (record) => {
          if (
            !record.wwdp_code &&
            !record.wwdp_issued &&
            !record.wwdp_expiration
          ) {
            return null;
          }
          return (
            <>
              <div>
                <strong>Code:</strong> {record.wwdp_code || ""}
              </div>
              <div>
                <strong>Issued:</strong> {record.wwdp_issued || ""}
              </div>
              <div>
                <strong>Expiry:</strong> {record.wwdp_expiration || ""}
              </div>
            </>
          );
        },
      },

      // Grouped: HWG ID
      {
        title: "HWG ID",
        key: "hwg_id_group",
        width: 250,
        align: "left",
        onHeaderCell: () => ({
          style: {
            textAlign: "center",
            backgroundColor: "#415e20",
            color: "white",
          },
        }), // HAZ color
        render: (record) => {
          if (!record.haz_id && !record.haz_issued) {
            return null;
          }
          return (
            <>
              <div>
                <strong>ID:</strong> {record.haz_id || ""}
              </div>
              <div>
                <strong>Issued:</strong> {record.haz_issued || ""}
              </div>
            </>
          );
        },
      },

      // Grouped: PCO
      {
        title: "PCO",
        key: "pco_group",
        width: 250,
        align: "left",
        onHeaderCell: () => ({
          style: {
            textAlign: "center",
            backgroundColor: "#242726",
            color: "white",
          },
        }), // PCO color
        render: (record) => {
          if (!record.pco_no && !record.pco_name && !record.pco_validity) {
            return null;
          }
          return (
            <>
              <div>
                <strong>No:</strong> {record.pco_no || ""}
              </div>
              <div>
                <strong>Name:</strong> {record.pco_name || ""}
              </div>
              <div>
                <strong>Validity:</strong> {record.pco_validity || ""}
              </div>
            </>
          );
        },
      },
      {
        title: "NOV Information",
        key: "legal_case_numbers",
        width: 200,
        align: "left",
        onHeaderCell: () => ({ style: { textAlign: "center" } }),
        render: (record) => (
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
        width: 250, // Adjust as needed
        onHeaderCell: () => ({ style: { textAlign: "center" } }),
        render: (record) => {
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
        width: 300, // Adjust as needed
        align: "left",
        onHeaderCell: () => ({ style: { textAlign: "center" } }),
        render: (record) => (
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
                  style={{
                    color: record.tc_compliance_link.startsWith("http")
                      ? undefined
                      : "inherit",
                    textDecoration: record.tc_compliance_link.startsWith("http")
                      ? undefined
                      : "none",
                  }}
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
        width: 200, // Adjust as needed
        onHeaderCell: () => ({ style: { textAlign: "center" } }),
        render: (record) => (
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
        width: 250, // Adjust as needed
        onHeaderCell: () => ({ style: { textAlign: "center" } }),
        render: (record) => (
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
    [theme]
  );

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

  const handleTableChange = (pagination) => {
    setSelectedRowKeys([]);
    setPagination(pagination);
  };

  const handleSearch = (value) => {
    const trimmedValue = value.trim();
    setSearchTerm(trimmedValue);
    setSelectedRowKeys([]);
    setPagination((prev) => ({ ...prev, current: 1 }));
  };

  const handleProvinceChange = (value) => {
    // Normalize empty string to null to avoid Select null value warnings
    const normalized = value === "" ? null : value;
    setSelectedProvince(normalized);
    setSelectedRowKeys([]);
    setPagination((prev) => ({ ...prev, current: 1 }));
  };

  const handleProjectStatusSelect = (statusKey) => {
    const newStatus = selectedProjectStatus === statusKey ? null : statusKey;
    setSelectedProjectStatus(newStatus);
    setSelectedRowKeys([]); // Clear selection on project status filter change
    setPagination((prev) => ({ ...prev, current: 1 })); // Reset to page 1 when filter changes
  };

  const handleFreezeColumnChange = (columnKey, checked) => {
    setFrozenColumnKeys((prev) => {
      if (checked) {
        // Trying to freeze a column
        if (prev.length < 5) {
          // Max 5 columns
          return [...prev, columnKey];
        }
        return prev; // Limit reached, do not add
      } else {
        // Trying to unfreeze a column
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
        // This check is also handled by disabling the checkbox, but good for safety
        if (prev.length === 1 && prev.includes(columnKey)) {
          return prev; // Don't allow hiding the last column
        }
        newVisibleKeys = prev.filter((key) => key !== columnKey);
      }
      // If a column is hidden, also unfreeze it
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

        // Unfreeze columns that are about to be hidden
        setFrozenColumnKeys((fKeys) =>
          fKeys.filter(
            (fKey) => !keysToHide.includes(fKey) || fKey === firstColumnKey
          )
        );

        setVisibleColumnKeys([firstColumnKey]);
      }
    } else {
      setVisibleColumnKeys([]); // Should not happen if baseColumns is always populated
    }
  };

  const COLUMN_GROUP_CONFIG = {
    PERMITS: {
      title: "Permits",
      keys: [
        "ecc_group",
        "pto_group",
        "wwdp_group",
        "hwg_id_group",
        "pco_group",
      ],
    },
    LEGAL: {
      title: "Legal Unit Info",
      keys: [
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
    // Add more groups here as needed, e.g.:
    // GENERAL_INFO: { title: "General Project Info", keys: ["sort_key", "name", "title", ...] },
    // LOCATION_INFO: { title: "Location Info", keys: ["geo_coordinates", "address", ...] },
  };

  const frozenHeaderStyle = {
    textAlign: "center",
    backgroundColor: theme === "dark" ? "#003a8c" : "#e6f4ff",
    color:
      theme === "dark" ? "rgba(255, 255, 255, 0.85)" : "rgba(0, 0, 0, 0.88)",
  };

  const frozenCellStyle = {
    backgroundColor: theme === "dark" ? "#00275c" : "#d9eaff", // Darker than header
  };

  const defaultHeaderStyle = {
    textAlign: "center",
  };

  const CustomDropdownContentWrapper = ({
    menuComponent,
    onOkClick,
    theme,
  }) => (
    <div
      style={{
        backgroundColor: theme === "dark" ? "#1f1f1f" : "#ffffff", // AntD popover/menu background
        boxShadow:
          "0 3px 6px -4px rgba(0,0,0,.12), 0 6px 16px 0 rgba(0,0,0,.08), 0 9px 28px 8px rgba(0,0,0,.05)", // AntD shadow
        borderRadius: "4px",
      }}
      onClick={(e) => e.stopPropagation()} // Prevent clicks on the wrapper itself from closing dropdown
    >
      {menuComponent}
      <Divider style={{ margin: "0" }} />
      <div style={{ padding: "8px", textAlign: "right" }}>
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
    <Menu
      style={{
        maxHeight: 400,
        overflowY: "auto",
        maxWidth: "300px",
        fontSize: "11px",
      }}
    >
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
              style={{
                fontSize: "10px",
                paddingLeft:
                  item.parentGroupKey && item.parentGroupKey !== "group-other"
                    ? "35px"
                    : "20px",
              }} // Indent grouped items
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
    <Menu style={{ maxHeight: 300, overflowY: "auto", maxWidth: 275 }}>
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
                style={{ width: "100%" }} // Ensure checkbox takes full width for better clickability
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
    <div style={{ width: 200, padding: 8 }}>
      <p style={{ fontWeight: "bold", marginBottom: 8 }}>Table Density:</p>
      <Radio.Group
        onChange={(e) => setCurrentTableSize(e.target.value)}
        value={currentTableSize}
        style={{ marginBottom: 12 }}
      >
        <Radio value="small">Small</Radio>
        <Radio value="middle">Middle</Radio>
        <Radio value="large">Large</Radio>
      </Radio.Group>
      <Divider style={{ margin: "12px 0" }} />
      <Checkbox
        checked={isTableBordered}
        onChange={(e) => setIsTableBordered(e.target.checked)}
      >
        Show Borders
      </Checkbox>
    </div>
  );

  const cardStyle = {
    padding: "24px",
    borderRadius: "8px",
    marginBottom: "20px",
    transition: "background-color 0.3s, border-color 0.3s, color 0.3s",
    backgroundColor: theme === "dark" ? "#1e1e1e" : "#ffffff", // AntD dark/light card background
    border: `1px solid ${theme === "dark" ? "#303030" : "#f0f0f0"}`, // AntD dark/light card border
    color:
      theme === "dark" ? "rgba(255, 255, 255, 0.85)" : "rgba(0, 0, 0, 0.88)", // AntD dark/light text color
  };

  const finalTableColumns = useMemo(() => {
    let accumulatedWidth = 0;
    const MAX_FROZEN_WIDTH = 700;

    // Filter baseColumns by visibility first
    const currentlyVisibleColumns = baseColumns.filter((col) =>
      visibleColumnKeys.includes(col.key)
    );

    return currentlyVisibleColumns.map((col) => {
      const isActuallyFrozen =
        frozenColumnKeys.includes(col.key) &&
        col.width &&
        (accumulatedWidth === 0 ||
          accumulatedWidth + col.width <= MAX_FROZEN_WIDTH);

      if (isActuallyFrozen) {
        accumulatedWidth += col.width;
        return {
          ...col,
          fixed: "left",
          onHeaderCell: () => ({ style: frozenHeaderStyle }),
          onCell: () => ({ style: frozenCellStyle }), // Apply frozen cell style
        };
      }
      // For special colored headers (ECC, PTO, etc.) that are NOT frozen
      if (
        col.onHeaderCell &&
        typeof col.onHeaderCell === "function" &&
        col.onHeaderCell().style &&
        col.onHeaderCell().style.backgroundColor &&
        !isActuallyFrozen
      ) {
        return { ...col, fixed: undefined }; // Keep existing onHeaderCell if it has a background
      }
      // Default for non-frozen or unfreezable columns
      return {
        ...col,
        fixed: undefined,
        onHeaderCell: () => ({ style: defaultHeaderStyle }),
      };
    });
  }, [
    baseColumns,
    frozenColumnKeys,
    theme,
    frozenHeaderStyle,
    defaultHeaderStyle,
    frozenCellStyle,
    visibleColumnKeys,
  ]); // Add visibleColumnKeys and styles as dependencies

  const onSelectChange = (newSelectedRowKeys) => {
    // console.log("selectedRowKeys changed: ", newSelectedRowKeys);
    setSelectedRowKeys(newSelectedRowKeys);
  };

  const rowSelection = {
    selectedRowKeys,
    onChange: onSelectChange,
    // You can add more configurations here, like custom selection column rendering
    getCheckboxProps: (record) => ({
      disabled: record.name === "Disabled User", // Example: disable checkbox for some rows
      name: record.name,
    }),
  };

  return (
    <div style={cardStyle}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {" "}
          {/* Added a wrapper div for search and results */}
          <Input.Search
            placeholder="Search records..."
            value={searchTerm} // Controlled component
            onSearch={handleSearch} // Triggers on Enter or search icon click
            style={{ width: 300 }}
            allowClear // Allows user to clear the input
            enterButton // Adds a search button
          />
          <Select
            allowClear
            placeholder="Filter by Province"
            style={{ width: 200 }}
            onChange={handleProvinceChange}
            value={selectedProvince ?? ""}
            loading={loading} // Disable while data is loading
          >
            <Select.Option value="">All Provinces</Select.Option>
            {allProvinces.map((provinceName) => (
              <Select.Option key={provinceName} value={provinceName}>
                {provinceName}
              </Select.Option>
            ))}
          </Select>
          {(searchTerm || selectedProvince) && ( // Show message if search term or province is active
            <span
              style={{
                fontSize: "0.85em",
                color:
                  theme === "dark"
                    ? "rgba(255,255,255,0.65)"
                    : "rgba(0,0,0,0.65)",
                marginLeft: "8px", // Add some space
              }}
            >
              {
                loading
                  ? "Filtering..."
                  : total > 0
                  ? `${total} result${total === 1 ? "" : "s"} found`
                  : `No results found`
                // More detailed "no results" message could be:
                // : `No results for ${searchTerm ? `"${searchTerm}"` : ''}${searchTerm && selectedProvince ? ' and ' : ''}${selectedProvince ? `province "${selectedProvince}"` : ''}`
              }
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
          <Tooltip title="Edit Selected">
            <Button
              type="primary"
              icon={<EditOutlined />}
              disabled={selectedRowKeys.length === 0} // Disable if no rows are selected
              onClick={() =>
                console.log("Edit clicked for rows:", selectedRowKeys)
              } // Placeholder action
            />
          </Tooltip>
          <Tooltip title="Show/Hide Columns">
            <Popover
              content={
                <CustomDropdownContentWrapper
                  menuComponent={columnVisibilityMenu}
                  onOkClick={() => setIsColumnVisibilityDropdownOpen(false)}
                  theme={theme}
                />
              }
              trigger="click"
              open={isColumnVisibilityDropdownOpen}
              onOpenChange={setIsColumnVisibilityDropdownOpen}
              placement="bottomRight"
            >
              <Button type="primary" icon={<TableOutlined />}>
                <DownOutlined />
              </Button>
            </Popover>
          </Tooltip>
          <Tooltip title="Freeze Columns">
            <Popover
              content={
                <CustomDropdownContentWrapper
                  menuComponent={freezeMenu}
                  onOkClick={() => setIsFreezeDropdownOpen(false)}
                  theme={theme}
                />
              }
              trigger="click"
              open={isFreezeDropdownOpen}
              onOpenChange={setIsFreezeDropdownOpen}
              placement="bottomRight"
            >
              <Button
                type="primary"
                icon={
                  <SettingOutlined /> /* Or a more specific icon like LockOutlined if you prefer */
                }
              >
                <DownOutlined />
              </Button>
            </Popover>
          </Tooltip>
          <Tooltip title="Format Table">
            <Popover
              content={tableFormatMenuContent}
              title="Table Format"
              trigger="click"
              placement="bottomRight"
            >
              <Button type="primary" icon={<ToolFilled />} />
            </Popover>
          </Tooltip>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              setSearchTerm(""); // Clear search term
              setSelectedProvince(null); // Clear province filter
              setPagination({ current: 1, pageSize: 20 }); // Reset pagination to first page and default size
              // The useEffect hook will automatically call fetchData with these reset states
            }}
            loading={loading}
            type="primary"
          />
          <AntPagination
            current={pagination.current}
            pageSize={pagination.pageSize}
            total={total}
            simple={true}
            className="ant-pagination"
            showSizeChanger={true} // Enable page size changer
            pageSizeOptions={["10", "20", "50", "100"]} // Provide page size options
            onChange={(newPage, newPageSize) => {
              if (newPageSize !== pagination.pageSize) {
                // If pageSize changes, reset to page 1
                setPagination({ current: 1, pageSize: newPageSize });
              } else {
                // If only page number changes
                setPagination({ current: newPage, pageSize: newPageSize });
              }
            }}
          />
        </div>
      </div>

      <Table
        rowSelection={rowSelection} // Added rowSelection prop
        dataSource={data}
        columns={finalTableColumns} // Use the new finalTableColumns
        rowKey={(record) => record._id}
        pagination={false} // We are using a custom pagination control above
        loading={loading}
        onChange={handleTableChange}
        scroll={{ x: 3000, y: tableScrollY }}
        bordered={isTableBordered}
        size={currentTableSize}
      />
    </div>
  );
};

export default RecordsConfig;
