import MonitoringPlanFilters, { EMPTY_FILTERS, matchesFilters } from "./MonitoringPlanFilters";
import React, {
  lazy,
  Suspense,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
} from "react";
import { useParams } from "react-router-dom";
import { ROUTES } from "../../../config/routes";
import { isRawLayout } from "./tabpanes/registerLayout";
import {
  Table,
  Button,
  Spin,
  Input,
  Space,
  Tooltip,
  Tag,
  Modal,
  Pagination,
  Popover,
  DatePicker,
  Select as AntSelect,
  Progress,
  Card,
} from "antd";
import {
  ReloadOutlined,
  SearchOutlined,
  EyeOutlined,
  PlusOutlined,
  MonitorOutlined,
  GlobalOutlined,
  CheckCircleFilled,
  InfoCircleOutlined,
  ClockCircleFilled,
  TagsOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
  TableOutlined,
  EnvironmentOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { DataContext } from "./DataContext";
import { useUcdsSettings } from "../../../context/UcdsSettingsContext";
import ProvinceModal from "./ProvinceModal";
import Highlighter from "react-highlight-words";
import Swal from "sweetalert2";
import jsPDF from "jspdf";
import "jspdf-autotable";
import { sectionColor, sectionLabel, splitSections } from "./sectionColors";
import AddProvinceModal from "./actions/AddProvinceModal";
import moment from "moment"; // Import moment for date calculations
import { io } from "socket.io-client";
import "./province.css";
// The shared look (ERMS's page header, cards, tables and type sizes) over the legacy styles.
import "./ucds-modern.css";
import { UcdsHeader } from "../ucdsTheme";
import FloatingModal from "../../../shared/components/FloatingModal";
// The spreadsheet view, in its own chunk: loaded when opened.
const SpreadsheetView = lazy(() => import("./spreadsheet/SpreadsheetView"));
// An establishment on the map (Industry Details' Map button), with Leaflet: loaded on first use.
const EstablishmentMap = lazy(() => import("./EstablishmentMap"));

/** A province's key in the account's permissions ("Nueva_Ecija" -> "nuevaEcija"), as the record view reads it. */
const provincePermissionKey = (name) =>
  ({ AURORA: "aurora", BATAAN: "bataan", BULACAN: "bulacan", "NUEVA ECIJA": "nuevaEcija", PAMPANGA: "pampanga", TARLAC: "tarlac", ZAMBALES: "zambales" })[String(name || "").toUpperCase().replace(/_/g, " ")] || null;
import { downloadMonitoringPlan, fetchErmsAnchors, fetchRawIis } from "../ucdsService";
import { message as notify } from "../../../shared/feedback";
import { SOCKET_URL } from "../../../config/api";
import { getSocket, initializeSocket } from "../../../api/socketService";

// Helper function to format province name for display (e.g., "Nueva_Ecija" to "Nueva Ecija")
const formatProvinceNameForDisplay = (str) => {
  if (!str) return "";
  return str.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
};
const { RangePicker } = DatePicker;

const tourContent = (
  <div style={{ maxWidth: "300px" }}>
    <h4>Delisting Instructions</h4>
    <p>To delist a record, select any duplicate record from the table below.</p>
    <p>
      Click the "Delist" button to proceed. If you wish to cancel, click
      "Cancel."
    </p>
  </div>
);

const Province = ({ theme, currentUser }) => {
  const { provinceName } = useParams();
  const { data, error, fetchData, setCurrentProvince } =
    useContext(DataContext);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  // The page size the register opens with comes from Universe Central DB
  // settings and follows a change the moment it is saved; the selector on
  // the screen still changes it for this visit.
  const { settings: ucdsSettings } = useUcdsSettings();
  const registerPageSize = ucdsSettings?.register?.pageSize;
  useEffect(() => {
    if (registerPageSize) {
      setPageSize(registerPageSize);
      setCurrentPage(1);
    }
  }, [registerPageSize]);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]); // For table row selection
  const displayProvinceName = formatProvinceNameForDisplay(provinceName);
  const searchInput = useRef(null);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isModalVisibleAdd, setIsModalVisibleAdd] = useState(false);
  const [isModalDuplicateVisible, setIsModalDuplicateVisible] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  // The establishment shown on the map (Industry Details' Map button), or null.
  const [mapRecord, setMapRecord] = useState(null);
  const [isEditing, setIsEditing] = useState(false); // For ProvinceModal
  const [originalData, setOriginalData] = useState([]);
  // Each establishment's permit against the ERMS Document Library: sort_key →
  // { status: "found" | "missing" | "none", serials }. Validation only — the
  // scans stay behind the Document Portal's request.
  const [anchors, setAnchors] = useState({});
  const anchorKey = originalData.length ? `${provinceName}:${originalData.length}` : "";
  useEffect(() => {
    if (!anchorKey) return undefined;
    let cancelled = false;
    fetchErmsAnchors(originalData.map((r) => r.sort_key).filter(Boolean))
      .then((a) => !cancelled && setAnchors(a || {}))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorKey]);
  // The 2026 IIS reference numbers, which the register does not hold yet:
  // read from the RAW data files (the Progress Tracker's), by serial. Read
  // again whenever the tracker says a RAW file changed.
  const [rawIis, setRawIis] = useState({});
  useEffect(() => {
    if (!provinceName) return undefined;
    let cancelled = false;
    const load = () =>
      fetchRawIis(provinceName)
        .then((m) => !cancelled && setRawIis(m || {}))
        .catch(() => {});
    load();
    // The app's shared socket: the tracker announces each RAW save on it.
    const socket = getSocket() || initializeSocket();
    socket?.on("progress-tracker:update", load);
    return () => {
      cancelled = true;
      socket?.off("progress-tracker:update", load);
    };
  }, [provinceName]);
  // The register as a spreadsheet (spreadsheet/SpreadsheetView.jsx).
  const [spreadsheetOpen, setSpreadsheetOpen] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);
  const exportXlsx = async () => {
    setExportingXlsx(true);
    try {
      const n = await downloadMonitoringPlan(displayProvinceName);
      notify.success(`Exported ${n} establishments of ${displayProvinceName}.`);
    } catch {
      notify.error("The Monitoring Plan could not be exported.");
    } finally {
      setExportingXlsx(false);
    }
  };
  const [duplicates, setDuplicates] = useState({});
  const [selectedDuplicate, setSelectedDuplicate] = useState(null);
  const [duplicateRecords, setDuplicateRecords] = useState([]);
  const [selectedDuplicateRowKeys, setSelectedDuplicateRowKeys] = useState([]);
  const [searchedColumn, setSearchedColumn] = useState("");
  const [searchText, setSearchText] = useState("");
  const [dateRange, setDateRange] = useState(null); // Initialize as null for clarity
  // Structured filters (industry, municipality, permits, NOV, …), evaluated
  // client-side over the province rows.
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [filteredData, setFilteredData] = useState(originalData);
  const [progress, setProgress] = useState(0); // Progress state
  const socketRef = useRef(null);

  // Named capability flags from GET /api/auth/me
  const capabilities = currentUser?.capabilities || {};
  const canGenerateData = capabilities.canGenerateData === true;
  const canManageData = capabilities.canManageData === true;
  const canViewAdminPanel = capabilities.canViewAdminPanel === true;
  const canAccessRangePicker = capabilities.canAccessRangePicker === true;

  useEffect(() => {
    if (provinceName) {
      setCurrentProvince(provinceName);
      handleReload(provinceName);
    }
  }, [provinceName, setCurrentProvince]); // Removed fetchData from deps as handleReload calls it

  const filterData = useCallback(() => {
    if (!originalData || originalData.length === 0) return [];

    return originalData.filter((record) => {

      // 1. Date Range Filter
      const recordDateSigned = record.date_signed
        ? new Date(record.date_signed)
        : null;
      const matchesDateRange =
        !dateRange || // If dateRange is null (cleared), consider it a match
        !dateRange[0] ||
        !dateRange[1] ||
        (recordDateSigned &&
          recordDateSigned >= dateRange[0] &&
          recordDateSigned <= dateRange[1]);

      if (!matchesDateRange) {
        return false;
      }

      // 1b. Structured filters, all of which must hold.
      if (!matchesFilters(record, filters)) return false;

      return true;
    });
  }, [originalData, dateRange, filters]);

  useEffect(() => {
    // This useEffect is responsible for updating filteredData
    // whenever the source data or any primary filter criteria change.
    setFilteredData(filterData());
  }, [filterData]); // Depends on the memoized filterData function

  // A reload with rows already on screen refreshes them in place — a thin
  // bar above the table — instead of blanking the table for a loader. The
  // bar eases toward 90% (smaller steps as it nears) and runs to 100% when
  // the rows arrive, never jumping back.
  const [refreshing, setRefreshing] = useState(false);
  const hasRows = originalData.length > 0;
  const handleReload = async (provinceNameForReload, updatedRecord = null) => {
    const inPlace = hasRows || Boolean(updatedRecord);
    if (inPlace) setRefreshing(true);
    else setLoading(true);
    setProgress(0);
    let intervalId = null;

    try {
      intervalId = setInterval(() => {
        setProgress((prev) => Math.min(90, Math.round((prev + Math.max(1, (90 - prev) * 0.12)) * 10) / 10));
      }, 120);

      if (updatedRecord) {
        setOriginalData((prevData) =>
          prevData.map((item) =>
            item.sort_key === updatedRecord.sort_key
              ? { ...item, ...updatedRecord }
              : item
          )
        );
      } else {
        // Fallback: fetch full province data
       const fetchedData = await fetchData(provinceNameForReload, true);
        if (fetchedData) {
          setOriginalData(fetchedData);
        }
      }

      setProgress(100);
    } catch (error) {
      console.error("Error fetching data in handleReload:", error);
      if (intervalId) clearInterval(intervalId);
      setProgress(100);
    } finally {
      if (intervalId) clearInterval(intervalId);
      setTimeout(() => {
        setLoading(false);
        setRefreshing(false);
        setProgress(0);
      }, 450);
    }
  };

  // VERA repaired the register (her check's fixes applied or undone, or "Let
  // VERA fix it"): the rows on screen are read again, in place, so the fixed
  // values show without leaving the page. Settled for a moment, as fixes
  // come in batches.
  const reloadAfterRepair = useRef(null);
  reloadAfterRepair.current = () => provinceName && handleReload(provinceName);
  useEffect(() => {
    const socket = getSocket() || initializeSocket();
    let t = null;
    const onRepaired = () => {
      clearTimeout(t);
      t = setTimeout(() => reloadAfterRepair.current?.(), 1000);
    };
    socket?.on("vera:repaired", onRepaired);
    return () => {
      clearTimeout(t);
      socket?.off("vera:repaired", onRepaired);
    };
  }, []);

  const findDuplicateECC = (records) => {
    const eccCount = {};
    const duplicates = {};

    // Count occurrences of each `ecc_cnc`
    records.forEach((record) => {
      if (record.ecc_cnc) {
        eccCount[record.ecc_cnc] = (eccCount[record.ecc_cnc] || 0) + 1;
      }
    });

    // Identify duplicates
    records.forEach((record) => {
      if (eccCount[record.ecc_cnc] > 1) {
        duplicates[record.ecc_cnc] = eccCount[record.ecc_cnc];
      }
    });

    return duplicates;
  };

  // Update duplicates whenever the data changes
  useEffect(() => {
    if (data && data.length > 0) {
      const duplicateECC = findDuplicateECC(data);
      setDuplicates(duplicateECC);
    }
  }, [data]);

  useEffect(() => {
    if (!socketRef.current) {
      socketRef.current = io(SOCKET_URL, {
        withCredentials: true,
      });
    }
    const socket = socketRef.current;

    const handleConnect = () => {
      if (currentUser?.username && displayProvinceName) {
        socket.emit("joinProvince", {
          province: displayProvinceName,
          user: {
            username: currentUser.username,
            avatar: currentUser.avatar || currentUser.avatarUrl,
            name: currentUser.name,
          },
        });
      }
    };

    if (socket.connected) {
      // If already connected, join immediately
      handleConnect();
    }
    socket.on("connect", handleConnect);

    return () => {
      socket.off("connect", handleConnect);
    };
  }, [currentUser, displayProvinceName]);

  const onRowClick = (record) => {
    const selectedIndex = selectedRowKeys.indexOf(record.sort_key);
    const newSelectedRowKeys = [...selectedRowKeys];
    if (selectedIndex >= 0) {
      newSelectedRowKeys.splice(selectedIndex, 1);
    } else {
      newSelectedRowKeys.push(record.sort_key);
    }

    setSelectedRowKeys(newSelectedRowKeys);
  };

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  const handlePageSizeChange = (value) => {
    setPageSize(value);
    setCurrentPage(1); // Reset to the first page when page size changes
  };

  const startIndex = (currentPage - 1) * pageSize;
  const paginatedData = filteredData.slice(startIndex, startIndex + pageSize);

  const getColumnSearchProps = (dataIndex) => ({
    filterDropdown: ({
      setSelectedKeys,
      selectedKeys,
      confirm,
      clearFilters,
    }) => (
      <div style={{ padding: 8 }}>
        <Input
          ref={searchInput}
          placeholder={`Search ${dataIndex}`}
          value={selectedKeys[0]}
          onChange={(e) =>
            setSelectedKeys(e.target.value ? [e.target.value] : [])
          }
          onPressEnter={() => handleSearch(selectedKeys, confirm, dataIndex)}
          style={{ marginBottom: 8, display: "block" }}
        />
        <Space>
          <Button
            type="primary"
            onClick={() => handleSearch(selectedKeys, confirm, dataIndex)}
            icon={<SearchOutlined />}
            size="small"
            style={{ width: 90 }}
          >
            Search
          </Button>
          <Button
            onClick={() => handleReset(clearFilters)}
            size="small"
            style={{ width: 90 }}
          >
            Reset
          </Button>
        </Space>
      </div>
    ),
    filterIcon: (filtered) => (
      <SearchOutlined style={{ color: filtered ? "#1890ff" : undefined }} />
    ),
    onFilter: (value, record) => {
      const lowerValue = value.toLowerCase();

      // Check if the record is in the filtered data
      const isInFilteredData = filteredData.includes(record);

      if (dataIndex === "sort_key") {
        // Directly compare the filter value with the sort_key field
        return String(record.sort_key || "")
          .toLowerCase()
          .includes(lowerValue);
      }

      if (dataIndex === "remarks") {
        // Directly compare the filter value with the sort_key field
        return (
          record.remarks && record.remarks.toLowerCase().includes(lowerValue)
        );
      }

      if (dataIndex === "section_incharged") {
        return (
          isInFilteredData &&
          record.section_incharged &&
          record.section_incharged.toLowerCase().includes(lowerValue)
        );
      }

      // Handle filtering for "pismu_tracking"
      if (dataIndex === "pismu_tracking") {
        return (
          isInFilteredData &&
          ((record.pismu_tracking === "✔" &&
            (lowerValue.includes("received") ||
              lowerValue.includes("pismu"))) ||
            (record.pismu_tracking !== "✔" && !lowerValue.includes("received")))
        );
      }

      // Handle filtering for date fields (partial match)
      if (
        ["date_monitored", "date_routed", "date_signed"].includes(dataIndex)
      ) {
        return (
          isInFilteredData &&
          record[dataIndex] &&
          record[dataIndex].toLowerCase().includes(lowerValue)
        );
      }

      // Handle other simple text columns
      return isInFilteredData && record[dataIndex]
        ? record[dataIndex].toString().toLowerCase().includes(lowerValue)
        : false;
    },
    filterDropdownProps: {
      onOpenChange: (open) => {
        if (open) {
          setTimeout(() => searchInput.current?.select(), 100);
        }
      },
    },
    render: (text) =>
      searchedColumn === dataIndex ? (
        <Highlighter
          highlightStyle={{ backgroundColor: "#ffc069", padding: 0 }}
          searchWords={[searchText]}
          autoEscape
          textToHighlight={text ? text.toString() : ""}
        />
      ) : (
        text
      ),
  });

  const handleSearch = (selectedKeys, confirm, dataIndex) => {
    confirm();
    setSearchedColumn(dataIndex);
    setSearchText(selectedKeys[0] || "");

    // Apply filtering logic based on selectedKeys
    const lowerValue = selectedKeys[0].toLowerCase();

    // Filter the data using the existing filterData logic
    const filtered = data.filter((record) => {
      const searchableFields = [
        record.id_no,
        record.sort_key,
        record.title,
        record.name,
        record.address,
        record.ecc_cnc,
        record.industry_class,
        record.remarks_recommendations,
        record.industry_type,
        record.industry_subtype,
        record.psic_code,
        record.proj_type,
        record.mbu_area,
        record.waterbody,
        record.long,
        record.lat,
        record.cong_district,
        record.street,
        record.brgy,
        record.city,
        record.province,
        record.emp_no_total,
        record.wwtftype,
        record.bod,
        record.section_incharged,
        record.handler,
        record.monitoring_sched,
        record.iis_no_2024,
        record.iis_no_2025,
        record.insp_type,
        record.report_type,
        record.date_monitored,
        record.date_routed,
        record.date_signed,
        record.days_dmds,
        record.days_dsdrs,
        record.pismu_tracking,
        record.with_nov,
        record.pismu_count_month,
        record.pd1586,
        record.permit_process,
        record.date_amend,
        record.date_approved,
        record.ra8749,
        record.pto_code,
        record.pto_issued,
        record.pto_expiration,
        record.ra9275,
        record.wwdp_code,
        record.wwdp_issued,
        record.wwdp_expiration,
        record.ra6969,
        record.haz_id,
        record.haz_issued,
        record.tsd_required,
        record.tsd,
        record.tp_trc_required,
        record.tsd_ref_no,
        record.tsd_expiration,
        record.tp_trc,
        record.tp_trc_ref_no,
        record.tp_trc_expiration,
        record.chemical_permit_required,
        record.chemical_permit,
        record.chemical_permit_type,
        record.chemical_permit_sub_type,
        record.chem_permit_issued,
        record.chem_permit_exp,
        record.pco,
        record.pco_no,
        record.pco_name,
        record.pco_tel_no,
        record.pco_validity,
        record.docket_no,
        record.denr_pab_case_no,
        record.date_forwarded,
        record.date_approved_clegal,
        record.days_dfda,
        record.service_mode,
        record.nov_released,
        record.v_pd1586,
        record.v_ra9275,
        record.v_ra8749,
        record.v_haz,
        record.v_tchem,
        record.tc_date_sched,
        record.tc_date_actual,
        record.time,
        record.legal_officer,
        record.tc_commitment,
        record.pos_paper,
        record.penalty,
        record.amount,
        record.or_number,
        record.tc_order_compliance,
        record.remarks,
        record.resolution,
        record.order,
        record.order_status,
        record.mbu_priority,
        record.mbu_survey,
        record.mbu_survey_request,
        record.dp_universe,
        record.color,
      ].map((field) => (typeof field === "string" ? field : "").toLowerCase());

      // Check if input value matches any record detail cumulatively
      const isMatchingInput = searchableFields.some((field) =>
        field.includes(lowerValue)
      );

      const isMatchingPismuTracking =
        (lowerValue.includes("received") ||
          lowerValue.includes("pismu") ||
          lowerValue.includes("planning")) &&
        record.pismu_tracking === "✔";

      const isMatchingDateSigned =
        lowerValue === "date signed" && record.date_signed;

      return isMatchingInput || isMatchingPismuTracking || isMatchingDateSigned;
    });

    // Update filteredData state
    setFilteredData(filtered);
    setSearchedColumn(dataIndex);
  };

  const handleReset = (clearFilters) => {
    clearFilters();
    setSearchText("");
    setSearchedColumn("");
    // This reset is for the AntD column filter.
    // If it needs to affect global filters, this logic would need to change.
    // For now, it resets the column's specific filter.
  };

  /** A section's chip: its colour tinted behind, firmer at the edge, a deep shade as ink. */
  const sectionChip = (hex, dark) => {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ""));
    const [r, g, b] = m ? m.slice(1).map((x) => parseInt(x, 16)) : [140, 140, 140];
    const mix = (t, to) => `rgb(${[r, g, b].map((c) => Math.round(c + (to - c) * t)).join(", ")})`;
    return {
      background: `rgba(${r}, ${g}, ${b}, ${dark ? 0.22 : 0.14})`,
      borderColor: `rgba(${r}, ${g}, ${b}, ${dark ? 0.7 : 0.55})`,
      color: dark ? mix(0.55, 255) : mix(0.55, 0),
    };
  };

  const handleToggleEdit = () => {
    setIsEditing(!isEditing);
  };

  const showModal = (record) => {
    setSelectedRecord(record); // Set the selected record
    setIsModalVisible(true); // Show the modal
  };

  const handleCloseModal = () => {
    setIsModalVisible(false);
    setSelectedRecord(null);
  };

  // Function to format industry details
  const formatIndustryDetails = (record) => {
    return `${record.title} - ${record.name} - ${record.address}`;
  };

  const formatPermitsClearances = (record) => {
    const permits = [];

    if (record.ecc_cnc) {
      permits.push(`ECC: ${record.ecc_cnc}`);
    }

    if (record.pto_code) {
      permits.push(`PTO: ${record.pto_code}`);
    }

    if (record.wwdp_code) {
      permits.push(`WWDP: ${record.wwdp_code}`);
    }

    if (record.haz_id) {
      permits.push(`HWG ID: ${record.haz_id}`);
    }

    if (record.pco_no) {
      permits.push(`PCO: ${record.pco_no}`);
    }

    return permits.join(", ");
  };

  // Function to export selected data
  const exportSelectedData = (provinceName) => {
    Swal.fire({
      title: "Export Selected Data",
      text: "Are you sure you want to export the selected data?",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, Export",
      cancelButtonText: "Cancel",
    }).then((result) => {
      if (result.isConfirmed) {
        const doc = new jsPDF({ orientation: "landscape", format: "a4" });

        // Customize title with province name
        doc.setFontSize(12);
        doc.text(`Province Data (${provinceName})`, 20, 20);

        // Define columns and data for the PDF
        const columns = [
          { title: "ID No.", dataKey: "sort_key" },
          { title: "Industry Details", dataKey: "industryDetails" },
          { title: "Industry Classification", dataKey: "industry_class" },
          { title: "Permits/Clearances", dataKey: "permits_clearances"},
          { title: "Section/Unit Incharged", dataKey: "section_incharged" },
          {
            title: "Remarks/Recommendations",
            dataKey: "remarks",
          },
          { title: "IIS Transaction No.", dataKey: "iis_no" },
        ];

        // Filter data based on selected checkboxes
        const data = paginatedData
          .filter((record) => selectedRowKeys.includes(record.sort_key))
          .map((record) => ({
            sort_key: record.sort_key || "",
            industryDetails: formatIndustryDetails(record),
            industry_class: record.industry_class || "",
            permits_clearances: formatPermitsClearances(record),
            section_incharge: record.section_incharged || "",
            remarks: record.remarks || "",
            iis_no: record.iis_no || "",
          }));

        // Add autoTable to PDF
        doc.autoTable({
          startY: 30,
          columns: columns,
          body: data,
          theme: "striped",
          styles: { fontSize: 8, cellPadding: 2 },
          columnStyles: {
            sort_key: { cellWidth: 15 },
            industryDetails: { cellWidth: 80 },
            industry_class: { cellWidth: 30 },
            permits_clearances: { cellWidth: 60 },
            section_incharged: { cellWidth: 25 },
            remarks: { cellWidth: 30 },
            iis_no: { cellWidth: 20 },
          },
        });

        // Save the PDF
        doc.save(`Province Data (${provinceName}).pdf`);
      }
    });
  };

  // Function to export all data
  const exportAllData = (provinceName) => {
    const doc = new jsPDF({ orientation: "landscape", format: "a4" });

    // Customize title with province name
    doc.setFontSize(12);
    doc.text(`Province Data (${provinceName})`, 20, 20);

    // Define columns and data for the PDF
    const columns = [
      { title: "ID No.", dataKey: "sort_key" },
      { title: "Industry Details", dataKey: "industryDetails" },
      { title: "Industry Classification", dataKey: "industry_class" },
      { title: "Permits/Clearances", dataKey: "permits_clearances" },
      { title: "Section/Unit Incharged", dataKey: "section_incharge" },
      { title: "Remarks/Recommendations", dataKey: "remarks_recommendations" },
      { title: "IIS Transaction No.", dataKey: "iis_no" },
    ];

    // Use the original data source, not just the paginated data
    const data = originalData.map((record) => ({
      sort_key: record.isort_key || "",
      industryDetails: formatIndustryDetails(record),
      industry_class: record.industry_class || "",
      permits_clearances: formatPermitsClearances(record),
      section_incharge: record.section_incharge || "",
      remarks_recommendations: record.remarks_recommendations || "",
      iis_no: record.iis_no || "",
    }));

    // Add autoTable to PDF
    doc.autoTable({
      startY: 30,
      columns: columns,
      body: data,
      theme: "striped",
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: {
        sort_key: { cellWidth: 15 },
        industryDetails: { cellWidth: 80 },
        industry_class: { cellWidth: 30 },
        permits_clearances: { cellWidth: 60 },
        section_incharge: { cellWidth: 25 },
        remarks_recommendations: { cellWidth: 30 },
        iis_no: { cellWidth: 20 },
      },
    });

    // Save the PDF
    doc.save(`Province Data (${provinceName}).pdf`);
  };

  // Function to export the PDF
  const handleExportPDF = (province) => {
    const provinceName =
      typeof province === "object"
        ? province.name || "Unknown Province"
        : province;

    // Check if any checkboxes are selected
    if (selectedRowKeys.length === 0) {
      Swal.fire({
        title: "No Selections Made",
        text: "No data is selected. Do you want to export all data?",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Yes, Export All",
        cancelButtonText: "Cancel",
      }).then((result) => {
        if (result.isConfirmed) {
          exportAllData(provinceName);
        }
      });
      return;
    }

    exportSelectedData(provinceName);
  };

  // Utility function to darken a given color
  const darkenColor = (color, percent) => {
    const num = parseInt(color.slice(1), 16),
      amt = Math.round(2.55 * percent),
      R = (num >> 16) + amt,
      G = ((num >> 8) & 0x00ff) + amt,
      B = (num & 0x0000ff) + amt;

    return `#${(
      0x1000000 +
      (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
      (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
      (B < 255 ? (B < 1 ? 0 : B) : 255)
    )
      .toString(16)
      .slice(1)}`;
  };

  const showModalDuplicate = (record) => {
    setSelectedDuplicate(record); // Set the selected record
    const duplicates = data.filter((item) => item.ecc_cnc === record.ecc_cnc);
    setDuplicateRecords(duplicates);
    setIsModalDuplicateVisible(true); // Show the modal
  };

  const handleModalOk = () => {
    setIsModalDuplicateVisible(false); // Hide modal
    setSelectedDuplicate(null); // Clear selected record
    setDuplicateRecords([]);
  };

  const handleModalCancel = () => {
    setIsModalDuplicateVisible(false); // Hide modal
    setSelectedDuplicate(null); // Clear selected record
    setDuplicateRecords([]);
  };

  const handleDelist = () => {
    // Perform the delisting action with selectedRowKeys

    // Implement your delist logic here
    // For example, call an API to delist the selected records

    // Reset the selectedRowKeys after delisting
    setSelectedDuplicateRowKeys([]);
  };

  const showModalAdd = () => {
    setIsModalVisibleAdd(true);
  };

  const handleCancelAdd = () => {
    setIsModalVisibleAdd(false);
  };

  // Helper function to get permit status
  const checkPendingStatus = (value) => {
    const strValue = String(value || "").toLowerCase();
    return (
      strValue.includes("app. no") ||
      strValue.includes("in process") ||
      strValue.includes("In process") ||
      strValue.includes("In Process") ||
      strValue.includes("in-process") ||
      strValue.includes("In-process") ||
      strValue.includes("on process") ||
      strValue.includes("application no")
    );
  };

  const duplicateColumns = [
    {
      title: "Gen. Information",
      dataIndex: "genInfo",
      width: 500,
      align: "left",
      render: (_, record) => (
        <>
          <strong>ID No.: {record.sort_key}</strong> <br />
          Project Title: {record.title} <br />
          <br />
          Proponent Name: {record.name} <br />
          Address: {record.street}, {record.brgy}, {record.city},{" "}
          {record.province}
          <br />
          <br />
          {record.section_incharged} <br />
          Handler: {record.handler} <br />
          Monitoring Schedule: {record.monitoring_sched} <br />
          IIS No: {record.iis_no} <br />
          Inspection Type: {record.insp_type} <br />
          Report Type: {record.report_type} <br />
          Date Monitored: {record.date_monitored} <br />
          Date Routed: {record.date_routed} <br />
          Date Signed: {record.date_signed}
        </>
      ),
    },
    {
      title: "Available Permit Information",
      dataIndex: "eccInfo",
      align: "left",
      width: 300,
      render: (_, record) => (
        <>
          ECC/CNC: {record.ecc_cnc} <br />
          Date Amend: {record.date_amended} <br />
          Date Approved: {record.date_approved} <br /> <br />
          PTO Code: {record.pto_code} <br />
          PTO Issued: {record.pto_issued} <br />
          Expiration: {record.pto_expiration} <br />
          <br />
          WWDP Code: {record.wwdp_code} <br />
          WWDP Issued: {record.wwdp_issued} <br />
          WWDP Expiration: {record.wwdp_expiration} <br />
          <br />
          Haz ID: {record.haz_id} <br />
          Haz Issued: {record.haz_issued} <br />
          <br />
          PCO: {record.pco} <br />
          PCO No: {record.pco_no} <br />
          PCO Name:{record.pco_name} <br />
          PCO Validity:{record.pco_validity}
        </>
      ),
    },
  ];

  // Widths are shares of the table, not pixels, so the register fits the
  // card at any screen width (tableLayout="fixed" on the Table, text wraps).
  const columns = [
    {
      title: "ID No.",
      dataIndex: "sort_key",
      key: "sort_key",
      align: "left",
      width: "7%",
      ...getColumnSearchProps("sort_key"),
      // "AU-00002" shows as AU-2; a two-part prefix ("HCCP-NE-00001", the
      // healthcare and chemical universes) keeps both parts.
      render: (text) => {
        if (typeof text !== "string") return text;
        const m = /^(.*)-0*(\d+)$/.exec(text);
        return <div>{m ? `${m[1]}-${m[2]}` : text}</div>;
      },
    },
    {
      title: (
        <div style={{ textAlign: "center", width: "100%" }}>
          Industry Details
        </div>
      ),
      key: "industryDetails",
      ...getColumnSearchProps("industryDetails"),
      render: (text, record) => {
        const isDuplicate = duplicates[record.ecc_cnc]; // Check if the current record's `ecc_cnc` is a duplicate

        // The ECC/CNC is in Permits/Clearances beside it; here, where the
        // establishment is — and a small button to see it on the map.
        return (
          <div>
            <strong>{record.title}</strong>
            <br />
            Proponent Name: <i>{record.name}</i>
            <br />
            Address: {record.address}
            <div className="ucds-details-actions">
              <Button
                size="small"
                type="text"
                icon={<EnvironmentOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  setMapRecord(record);
                }}
                onDoubleClick={(e) => e.stopPropagation()}
              >
                Map
              </Button>
              {isDuplicate && (
                <Tooltip title="Another establishment has the same ECC/CNC — open to compare or delist">
                  <Button
                    size="small"
                    type="text"
                    danger
                    icon={<WarningOutlined />}
                    onClick={(e) => {
                      e.stopPropagation();
                      showModalDuplicate(record);
                    }}
                    onDoubleClick={(e) => e.stopPropagation()}
                  >
                    Shared ECC
                  </Button>
                </Tooltip>
              )}
            </div>
          </div>
        );
      },
      align: "left",
      width: "21%",
    },
    {
      title: "Industry Classification",
      key: "industry_class",
      ...getColumnSearchProps("industry_class"),
      render: (text, record) => <div>{record.industry_class}</div>,
      align: "center",
      width: "10%",
    },
    {
      // Five fixed lines, in the same order on every row — ECC/CNC, PTO,
      // WWDP, HWG ID, PCO — each its reference number or a dash. Colour
      // says the state: green, the ECC is on file in ERMS; red, expired;
      // orange, expires within a month. The details on hover.
      title: (
        <Tooltip
          title={
            <div style={{ fontSize: 12 }}>
              <div><span className="ucds-pc-key is-erms">Green</span> ECC/CNC on file in ERMS</div>
              <div><span className="ucds-pc-key is-expired">Red</span> expired</div>
              <div><span className="ucds-pc-key is-soon">Orange</span> expires within a month</div>
              <div>— not encoded</div>
            </div>
          }
        >
          <span>Permits/Clearances</span>
        </Tooltip>
      ),
      key: "permits_clearances",
      width: "17%",
      align: "left",
      render: (text, record) => {
        const expiryOf = (v) => {
          const m = moment(String(v || ""), ["MM/DD/YYYY", "M/D/YYYY", "YYYY-MM-DD", "MMM D, YYYY", "MMMM D, YYYY"], true);
          if (!m.isValid()) return null;
          const days = m.diff(moment().startOf("day"), "days");
          return { days, state: days < 0 ? "is-expired" : days <= 30 ? "is-soon" : "" };
        };
        const anchor = anchors[record.sort_key];
        const onErms = anchor?.status === "found";
        const ecc = String(record.ecc_cnc || "").trim();
        const lines = [
          {
            key: "ecc",
            label: ecc.includes("CNC") ? "CNC" : "ECC",
            value: record.ecc_cnc,
            state: onErms ? "is-erms" : "",
            // On file: the reference no. opens the Document Portal at that serial.
            href: onErms && anchor.serials?.[0] ? `${ROUTES.documentPortal}?serial=${encodeURIComponent(anchor.serials[0])}` : null,
            tip: [
              ecc.includes("CNC") ? "Certificate of Non-Coverage" : "Environmental Compliance Certificate",
              record.date_approved && `Approved ${record.date_approved}`,
              record.date_amend && `Amended ${record.date_amend}`,
              onErms ? `On file in ERMS: ${anchor.serials.join(", ")} — click to open it in the Document Portal` : ecc && "Not found in ERMS",
            ],
          },
          (() => {
            const x = expiryOf(record.pto_expiration);
            return { key: "pto", label: "PTO", value: record.pto_code, state: x?.state || "", tip: ["Permit to Operate", record.pto_issued && `Issued ${record.pto_issued}`, record.pto_expiration && `Expires ${record.pto_expiration}${x ? (x.days < 0 ? " (expired)" : x.days <= 30 ? ` (in ${x.days} days)` : "") : ""}`] };
          })(),
          (() => {
            const x = expiryOf(record.wwdp_expiration);
            return { key: "wwdp", label: "WWDP", value: record.wwdp_code, state: x?.state || "", tip: ["Wastewater Discharge Permit", record.wwdp_issued && `Issued ${record.wwdp_issued}`, record.wwdp_expiration && `Expires ${record.wwdp_expiration}${x ? (x.days < 0 ? " (expired)" : x.days <= 30 ? ` (in ${x.days} days)` : "") : ""}`] };
          })(),
          { key: "haz", label: "HWG ID", value: record.haz_id, state: "", tip: ["Hazardous Waste Generator ID", record.haz_issued && `Issued ${record.haz_issued}`] },
          (() => {
            const x = expiryOf(record.pco_validity);
            return { key: "pco", label: "PCO", value: record.pco_no, state: x?.state || "", tip: ["PCO Accreditation", record.pco_name && `PCO: ${record.pco_name}`, record.pco_validity && `Valid until ${record.pco_validity}${x ? (x.days < 0 ? " (expired)" : x.days <= 30 ? ` (in ${x.days} days)` : "") : ""}`] };
          })(),
        ];
        return (
          <div className="ucds-pc">
            {lines.map((l) => {
              const has = l.value && String(l.value).trim() && String(l.value).trim() !== "N/A";
              const row = (
                <div key={l.key} className={`ucds-pc-row ${has ? l.state : "is-none"}`}>
                  <span className="ucds-pc-label">{l.label}</span>
                  <span className="ucds-pc-value">
                    {has && l.href ? (
                      <a className="ucds-pc-link" href={l.href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                        {String(l.value).trim()}
                      </a>
                    ) : has ? (
                      String(l.value).trim()
                    ) : (
                      "—"
                    )}
                    {has && checkPendingStatus(String(l.value)) && <ClockCircleFilled className="ucds-pc-pending" aria-label="pending" />}
                  </span>
                </div>
              );
              return has ? (
                <Tooltip key={l.key} placement="left" title={<div style={{ fontSize: 11.5 }}>{l.tip.filter(Boolean).map((t) => <div key={t}>{t}</div>)}</div>}>
                  {row}
                </Tooltip>
              ) : (
                row
              );
            })}
          </div>
        );
      },
    },
    {
      title: "Section/Unit Incharged",
      key: "section_incharged",
      ...getColumnSearchProps("section_incharged"),
      render: (text, record) => {
        // Split sections by comma; a record with none shows no tag.
        const sections = splitSections(record.section_incharged);
        if (sections.length === 0) return null;

        return (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
            }}
          >
            {sections.map((section, index) => {
              // The section's own colour as a soft chip: a light tint behind,
              // a firmer edge, and the ink a deep (or, in dark mode, light)
              // shade of the same hue — readable whatever the colour.
              const backgroundColor = sectionColor(section); // the section's colour
              const darkerBackgroundColor = darkenColor(backgroundColor, -40); // for the tooltip
              const chip = sectionChip(backgroundColor, theme === "dark");

              // Dynamically set tooltip background color based on theme
              const tooltipBackgroundColor =
                theme === "dark" ? darkerBackgroundColor : backgroundColor;

              return (
                <Tooltip
                  key={index}
                  title={
                    <div style={{ fontSize: "11px", textAlign: "left" }}>
                      <div>Section Incharge: {record.section_incharged}</div>
                      <div>Handler: {record.handler || "N/A"}</div>
                      <div>
                        Monitoring Schedule: {record.monitoring_sched || "N/A"}
                      </div>
                      <div>Inspection Type: {record.insp_type || "N/A"}</div>
                    </div>
                  }
                  color={tooltipBackgroundColor}
                  style={{ textAlign: "center" }}
                >
                  <div className="ucds-section-chip" style={chip}>
                    <i style={{ background: chip.borderColor }} />
                    {sectionLabel(section)}
                  </div>
                </Tooltip>
              );
            })}
          </div>
        );
      },
      align: "center",
      width: "10%",
    },
    {
      title: (
        <div style={{ textAlign: "center", width: "100%" }}>
          Remarks/Recommendations
        </div>
      ),
      key: "remarks",
      ...getColumnSearchProps("remarks"),
      // From 2027 the RAW workbooks' Remarks/Recommendations column is `recommendations`.
      render: (text, record) => <div>{isRawLayout(record) ? record.recommendations : record.remarks}</div>,
      align: "center",
      width: "13%",
    },
    {
      title: (
        <div style={{ textAlign: "center", width: "100%" }}>
          Monitoring Status
        </div>
      ),
      key: "monitoringStatus",
      width: "14%",
      align: "left",
      ...getColumnSearchProps("iis_no"),
      render: (text, record) => (
        <div className="monitoring-status-container-province">
          {record.date_monitored && (
            <p className="monitoring-label">
              <Tooltip
                title={<div style={{ fontSize: "10px" }}>Date Monitored</div>}
                color="#1890ff"
              >
                <MonitorOutlined style={{ marginRight: 8, color: "#1890ff" }} />
                {record.date_monitored}
              </Tooltip>
            </p>
          )}

          {record.date_routed && (
            <p className="monitoring-label">
              <Tooltip
                title={
                  <div style={{ fontSize: "10px" }}>Date Routed to IIS</div>
                }
                color="#52c41a"
              >
                <GlobalOutlined style={{ marginRight: 8, color: "#52c41a" }} />
                {record.date_routed}
              </Tooltip>
            </p>
          )}

          {record.date_signed && (
            <p className="monitoring-label">
              <Tooltip
                title={
                  <div style={{ fontSize: "10px" }}>Date Report Signed</div>
                }
                color="#faad14"
              >
                <CheckCircleFilled
                  style={{ marginRight: 8, color: "#faad14" }}
                />
                {record.date_signed}
              </Tooltip>
            </p>
          )}

          {/* Render iis_no_2024 if exists */}
          {record.iis_no_2024 && record.iis_no_2024 !== "N/A" && (
            <p className="monitoring-label">
              {String(record.iis_no_2024)
                .split(/\s+/)
                .filter(
                  (iis) => iis && iis.trim() !== "" && iis.trim() !== "N/A"
                )
                .map((iis, index) => (
                  <span
                    key={index}
                    style={{ display: "block", lineHeight: "1.2" }}
                  >
                    <TagsOutlined
                      style={{ color: "#1890ff", marginRight: 4 }}
                    />
                    <a
                      href={`https://iis.emb.gov.ph/embis/dms/documents/tracker/?trn_no=${encodeURIComponent(
                        iis.trim()
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "#1890ff", textDecoration: "none" }}
                    >
                      {iis.trim()}
                    </a>
                  </span>
                ))}
            </p>
          )}

          {/* Render iis_no_2025 if exists */}
          {record.iis_no_2025 && record.iis_no_2025 !== "N/A" && (
            <p className="monitoring-label">
              {String(record.iis_no_2025)
                .split(/\s+/)
                .filter(
                  (iis) => iis && iis.trim() !== "" && iis.trim() !== "N/A"
                )
                .map((iis, index) => (
                  <span
                    key={index}
                    style={{ display: "block", lineHeight: "1.2" }}
                  >
                    <TagsOutlined
                      style={{ color: "#52c41a", marginRight: 4 }}
                    />
                    <a
                      href={`https://iis.emb.gov.ph/embis/dms/documents/tracker/?trn_no=${encodeURIComponent(
                        iis.trim()
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "#52c41a", textDecoration: "none" }}
                    >
                      {iis.trim()}
                    </a>
                  </span>
                ))}
            </p>
          )}

          {/* 2026: the register's own, else the RAW data's (read by serial). */}
          {(() => {
            const iis2026 = [record.iis_no_2026, rawIis[record.sort_key]].find((v) => v && String(v).trim() && String(v).trim() !== "N/A");
            if (!iis2026) return null;
            return (
              <p className="monitoring-label">
                {String(iis2026)
                  .split(/[\s,;]+/)
                  .filter((iis) => iis && iis.trim() !== "" && iis.trim() !== "N/A")
                  .map((iis, index) => (
                    <Tooltip key={index} title={<div style={{ fontSize: "10px" }}>2026 IIS reference no.{record.iis_no_2026 ? "" : " (from the RAW data)"}</div>} color="#722ed1">
                      <span style={{ display: "block", lineHeight: "1.2" }}>
                        <TagsOutlined style={{ color: "#722ed1", marginRight: 4 }} />
                        <a
                          href={`https://iis.emb.gov.ph/embis/dms/documents/tracker/?trn_no=${encodeURIComponent(iis.trim())}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "#722ed1", textDecoration: "none" }}
                        >
                          {iis.trim()}
                        </a>
                      </span>
                    </Tooltip>
                  ))}
              </p>
            );
          })()}

          {/* PISMU Tracking */}
          {record.pismu_tracking && record.pismu_tracking.trim() !== "" && (
            <p className="monitoring-label">
              <Tooltip
                title={
                  <div style={{ fontSize: "10px" }}>
                    Received by PISMU: {record.pismu_tracking}
                  </div>
                }
                color="#0D92F4"
              >
                <span>
                  <CheckCircleFilled
                    style={{ color: "#0D92F4", marginRight: 8 }}
                  />
                  Received by PISMU
                </span>
              </Tooltip>
            </p>
          )}
        </div>
      ),
    },
    {
      title: "Actions",
      key: "actions",
      align: "center",
      width: "8%",
      render: (text, record) => (
        <div>
          <Tooltip title="View Details" style={{ fontSize: "11px" }}>
            <Button
              icon={<EyeOutlined />}
              onClick={() => showModal(record)}
              type="primary"
              className="btn-action"
              size="small"
            />
          </Tooltip>
        </div>
      ),
    },
  ];

  return (
    <div className="province-container-card">
      <UcdsHeader
        title={`${displayProvinceName} — Monitoring Plan`}
        description={`Universe of Firms and Industries · ${new Intl.NumberFormat().format(originalData.length)} establishments${Object.keys(anchors).length ? ` · ${new Intl.NumberFormat().format(Object.values(anchors).filter((a) => a.status === "found").length)} permits found in ERMS` : ""}`}
        actions={
          <>
            <Tooltip title="Reload the table">
              <Button icon={<ReloadOutlined />} onClick={() => handleReload(provinceName)} loading={loading} aria-label="Reload" />
            </Tooltip>
            <Button icon={<TableOutlined />} onClick={() => setSpreadsheetOpen(true)} disabled={!originalData.length}>Spreadsheet</Button>
            <Button icon={<FileExcelOutlined />} onClick={exportXlsx} loading={exportingXlsx}>Export to Excel</Button>
            <Button icon={<FilePdfOutlined />} onClick={() => handleExportPDF(displayProvinceName)}>Export PDF</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={showModalAdd}>Add Industry</Button>
          </>
        }
      />
      <div className="header-content ucds-viewers-row">
        <AddProvinceModal
          visible={isModalVisibleAdd}
          onCancel={handleCancelAdd}
          zIndex={1000}
        />
      </div>

      {spreadsheetOpen && (
        <Suspense fallback={null}>
          <SpreadsheetView
            open={spreadsheetOpen}
            onClose={() => setSpreadsheetOpen(false)}
            rows={originalData}
            rawIis={rawIis}
            anchors={anchors}
            province={displayProvinceName}
            onOpenRecord={(r) => showModal(r)}
            // The same rule as the record view's Edit button: read-write on the province.
            canEdit={currentUser?.provinceStringPermissions?.[provincePermissionKey(provinceName)] === "readWrite"}
            currentUser={currentUser}
            // A saved cell updates the page's table too, without reloading it.
            onSaved={(serial, changes) => setOriginalData((prev) => prev.map((r) => (r.sort_key === serial ? { ...r, ...changes } : r)))}
          />
        </Suspense>
      )}

      <Modal
        open={Boolean(mapRecord)}
        onCancel={() => setMapRecord(null)}
        footer={null}
        width={760}
        destroyOnHidden
        title={
          <span>
            <EnvironmentOutlined style={{ marginRight: 8 }} />
            <span style={{ fontFamily: "monospace", opacity: 0.75, marginRight: 8 }}>{mapRecord?.sort_key || ""}</span>
            {mapRecord?.title || mapRecord?.name || ""}
          </span>
        }
      >
        {mapRecord && (
          <Suspense fallback={<div style={{ height: 420, display: "grid", placeItems: "center" }}><Spin /></div>}>
            <EstablishmentMap record={mapRecord} dark={theme === "dark"} />
          </Suspense>
        )}
      </Modal>

      <FloatingModal
        open={isModalVisible}
        title={
          <span>
            <span style={{ fontFamily: "monospace", opacity: 0.75, marginRight: 8 }}>{selectedRecord?.sort_key || ""}</span>
            <strong>{selectedRecord?.title || ""}</strong>
          </span>
        }
        extra={selectedRecord?.ecc_cnc ? <Tag color="green" style={{ marginInlineEnd: 0, fontFamily: "monospace" }}>{selectedRecord.ecc_cnc}</Tag> : null}
        onCancel={handleCloseModal}
        // One fixed size that does not resize, nearly the whole window: the tab
        // bar and the buttons at the foot stay put, and each tab's content is
        // fitted to the space between them — no scrolling (ProvinceModal FitToHeight).
        width={1400}
        height="calc(100vh - 40px)"
        maxHeight="calc(100vh - 40px)"
        bodyStyle={{ overflow: "hidden", display: "flex", flexDirection: "column" }}
        resizable={false}
        top={20}
        className="ucds-record-modal"
      >
        {selectedRecord && (
          <ProvinceModal
            record={selectedRecord}
            isEditing={isEditing}
            setIsEditing={setIsEditing}
            onToggleEdit={handleToggleEdit}
            onClose={handleCloseModal}
            handleReload={handleReload}
            currentUser={currentUser}
            theme={theme}
          />
        )}
      </FloatingModal>

      <Modal
        title={
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ flex: 1, textAlign: "left", fontSize: "11px" }}>
              ID No: {selectedDuplicate?.sort_key}
            </span>
            <span
              style={{
                flex: 1,
                textAlign: "center",
                fontSize: "11px",
                minWidth: "500px",
              }}
            >
              {selectedDuplicate?.title}
            </span>
            <span
              style={{
                flex: 1,
                textAlign: "right",
                fontSize: "11px",
                marginRight: "30px",
              }}
            >
              {selectedDuplicate?.ecc_cnc}
            </span>
          </div>
        }
        open={isModalDuplicateVisible}
        onOk={handleModalOk}
        width={1200}
        onCancel={handleModalCancel}
        footer={[
          <Button
            key="delist"
            type="primary"
            danger
            onClick={handleDelist}
            disabled={selectedDuplicateRowKeys.length === 0}
          >
            Archive from Universe
          </Button>,
          <Button key="cancel" onClick={handleModalCancel}>
            Cancel
          </Button>,
        ]}
        zIndex={1000}
      >
        <span
          style={{ fontSize: "12px", marginBottom: "10px", display: "block" }}
        >
          Please select a record from the table below to delist. You can choose
          any duplicate records associated with the selected ID No.
          <Popover content={tourContent} title="Delisting Help" trigger="click">
            <Button
              type="primary"
              size="small"
              icon={<InfoCircleOutlined />}
              style={{ marginLeft: "10px", padding: 0, marginRight: "0" }}
            />
          </Popover>
        </span>
        {selectedDuplicate && (
          <div>
            <Table
              dataSource={duplicateRecords} // Exclude selected record
              columns={duplicateColumns}
              pagination={false}
              rowKey="sort_key"
              bordered
              locale={{ emptyText: "No duplicate records found" }}
              rowSelection={{
                selectedDuplicateRowKeys,
                onChange: (newSelectedRowKeys) => {
                  setSelectedDuplicateRowKeys(newSelectedRowKeys);
                },
              }}
            />
          </div>
        )}
      </Modal>

      <div className="table-container">
        <Card size="small" className="ucds-toolbar">
          <div className="total-count" style={{ textAlign: "left" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", alignItems: "center" }}>
                <h4 className="total-count-label">
                  Industry Count: <strong>{filteredData.length.toLocaleString("en-US")}</strong>
                </h4>
              </div>

              <div style={{ display: "flex", alignItems: "center" }}>
                {/* {canAccessRangePicker && (
                  <>
                    <span className="date-signed">Date Report Signed:</span>
                    <RangePicker
                    size="small"
                      style={{ marginLeft: 16 }}
                      onChange={handleDateChange}
                      value={dateRange || undefined} // Pass undefined if dateRange is null for RangePicker
                      format="MM/DD/YYYY" // Set the desired format
                      placeholder={["Start Date", "End Date"]}
                      allowClear={true}
                    />
                  </>
                )} */}

                <Pagination
                  simple={{
                    readOnly: true,
                  }}
                  current={currentPage}
                  total={filteredData.length}
                  onChange={handlePageChange}
                  showSizeChanger={false}
                  pageSize={pageSize}
                  size="small"
                  className="custom-pagination"
                />
                {!loading && !error && paginatedData.length > 0 && (
                  <div className="custom-page-size-selector-container">
                    <AntSelect
                      value={pageSize}
                      onChange={handlePageSizeChange}
                      size="small"
                    >
                      <AntSelect.Option value={10}>10 / page</AntSelect.Option>
                      <AntSelect.Option value={25}>25 / page</AntSelect.Option>
                      <AntSelect.Option value={50}>50 / page</AntSelect.Option>
                      <AntSelect.Option value={100}>
                        100 / page
                      </AntSelect.Option>
                      <AntSelect.Option value={200}>200 / page</AntSelect.Option>
                    </AntSelect>
                  </div>
                )}
              </div>
            </div>
            {/* Structured filters, under the keyword row. They combine with
                the keywords and with each other. */}
            <div style={{ marginTop: 6 }}>
              <MonitoringPlanFilters
                rows={originalData || []}
                value={filters}
                onChange={(next) => {
                  setFilters(next);
                  setCurrentPage(1);
                }}
                showDateRange={canAccessRangePicker}
              />
            </div>
          </div>
        </Card>

        {refreshing && (
          <div className="ucds-refresh-bar" role="progressbar" aria-label="Refreshing the establishments" aria-valuenow={Math.round(progress)}>
            <span style={{ width: `${progress}%` }} />
          </div>
        )}
        {loading ? (
          <div style={{ textAlign: "center", padding: "20px" }}>
            <span>Loading Universe Data...</span> <br />
            <Progress
              percent={Math.round(progress)}
              status="active"
              className="ucds-load-progress"
              style={{ width: "50%" }}
            />
          </div>
        ) : error ? (
          <p>{error}</p>
        ) : (
          <Table
            rowSelection={{
              selectedRowKeys,
              onChange: setSelectedRowKeys,
            }}
            // Fits the card: no sideways scroll, columns share the width.
            scroll={{ y: "calc(100vh - 330px)" }}
            tableLayout="fixed"
            dataSource={paginatedData} // Ensure this is set correctly
            columns={columns}
            rowKey="sort_key"
            size="small"
            bordered
            className="custom-table ucds-table"
            pagination={false}
            // A click selects the row (for the bulk actions); a double-click
            // opens its details, as a record does in ERMS.
            onRow={(record) => ({
              onClick: () => onRowClick(record),
              onDoubleClick: () => showModal(record),
            })}
          />
        )}
      </div>
    </div>
  );
};

export default Province;
