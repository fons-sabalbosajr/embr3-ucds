import MonitoringPlanFilters, { EMPTY_FILTERS, matchesFilters } from "./MonitoringPlanFilters";
import React, {
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
} from "react";
import { useParams } from "react-router-dom";
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
  ConfigProvider,
  Progress,
  Avatar,
} from "antd";
import {
  ReloadOutlined,
  ExportOutlined,
  SearchOutlined,
  EyeOutlined,
  PlusOutlined,
  MonitorOutlined,
  GlobalOutlined,
  CheckCircleFilled,
  InfoCircleOutlined,
  ClockCircleFilled,
  TagsOutlined,
  ExclamationCircleOutlined, // For expired indicator
} from "@ant-design/icons";
import { DataContext } from "./DataContext";
import { useUcdsSettings } from "../../../context/UcdsSettingsContext";
import ProvinceModal from "./ProvinceModal";
import Highlighter from "react-highlight-words";
import Swal from "sweetalert2";
import jsPDF from "jspdf";
import "jspdf-autotable";
import SectionDetailsModal from "./sectiondetails/SectionDetailsModal";
import AddProvinceModal from "./actions/AddProvinceModal";
import moment from "moment"; // Import moment for date calculations
import { io } from "socket.io-client";
import "./province.css";
import { API_BASE_URL, SOCKET_URL } from "../../../config/api";

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
  const [tags, setTags] = useState([]);
  const [inputVisible, setInputVisible] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef(null);
  const searchInput = useRef(null);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isModalVisibleAdd, setIsModalVisibleAdd] = useState(false);
  const [isModalDuplicateVisible, setIsModalDuplicateVisible] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [isEditing, setIsEditing] = useState(false); // For ProvinceModal
  const [originalData, setOriginalData] = useState([]);
  const [duplicates, setDuplicates] = useState({});
  const [selectedDuplicate, setSelectedDuplicate] = useState(null);
  const [duplicateRecords, setDuplicateRecords] = useState([]);
  const [selectedDuplicateRowKeys, setSelectedDuplicateRowKeys] = useState([]);
  const [filterDuplicates, setFilterDuplicates] = useState(false);
  const [searchedColumn, setSearchedColumn] = useState("");
  const [searchText, setSearchText] = useState("");
  const [dateRange, setDateRange] = useState(null); // Initialize as null for clarity
  // Structured filters (industry, municipality, permits, NOV, …). Combined
  // with the keyword tags and evaluated client-side over the province rows.
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [filteredData, setFilteredData] = useState(originalData);
  const [sectionCounts, setSectionCounts] = useState({});
  const [isDateRangeApplied, setIsDateRangeApplied] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSection, setSelectedSection] = useState("");
  const [sectionDetails, setSectionDetails] = useState([]);
  const [selectedSectionData, setSelectedSectionData] = useState([]); // Combined with sectionDetails logic
  const [buttonColor, setButtonColor] = useState("primary");
  const [progress, setProgress] = useState(0); // Progress state
  const [provinceViewers, setProvinceViewers] = useState({});
  const socketRef = useRef(null);

  // Named capability flags from GET /api/auth/me
  const capabilities = currentUser?.capabilities || {};
  const canGenerateData = capabilities.canGenerateData === true;
  const canManageData = capabilities.canManageData === true;
  const canViewAdminPanel = capabilities.canViewAdminPanel === true;
  const canViewDataHistory = capabilities.canViewDataHistory === true;
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
      ].map((field) => (field != null ? String(field) : "").toLowerCase());

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

      // 2. Keyword Filters (tags and inputValue)
      // If no active keyword filters after date filter, the record passes
      if (tags.length === 0 && !inputValue) {
        return true;
      }

      let matchesAllTags = true;
      if (tags.length > 0) {
        matchesAllTags = tags.every((tag) =>
          searchableFields.some((field) => field.includes(tag.toLowerCase()))
        );
      }

      let matchesInputValueCriteria = true; // True if inputValue is empty
      if (inputValue) {
        const lowerInputValue = inputValue.toLowerCase();
        const generalInputMatch = searchableFields.some((field) =>
          field.includes(lowerInputValue)
        );
        const pismuMatch =
          (lowerInputValue.includes("received") ||
            lowerInputValue.includes("pismu") ||
            lowerInputValue.includes("planning")) &&
          record.pismu_tracking === "✔";
        const dateSignedMatch =
          lowerInputValue === "date signed" && record.date_signed;
        matchesInputValueCriteria =
          generalInputMatch || pismuMatch || dateSignedMatch;
      }

      if (tags.length > 0 && inputValue) {
        return matchesAllTags && matchesInputValueCriteria;
      } else if (tags.length > 0) {
        return matchesAllTags;
      } else if (inputValue) {
        return matchesInputValueCriteria;
      }

      return false; // Fallback, should be covered by above conditions
    });
  }, [originalData, dateRange, tags, inputValue, filters]);

  useEffect(() => {
    // This useEffect is responsible for updating filteredData and sectionCounts
    // whenever the source data or any primary filter criteria change.
    const filtered = filterData();
    setFilteredData(filtered);

    const counts = calculateSectionCounts(filtered);
    setSectionCounts(counts);
  }, [filterData]); // Depends on the memoized filterData function

  const handleReload = async (provinceNameForReload, updatedRecord = null) => {
    setLoading(true);
    setProgress(0);
    let intervalId = null;

    try {
      intervalId = setInterval(() => {
        setProgress((prev) => Math.min(prev + 10, 90));
      }, 200);

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
        setProgress(0);
      }, 500);
    }
  };

  useEffect(() => {
    if (inputVisible) {
      inputRef.current?.focus();
    }
  }, [inputVisible]);

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

    const provinceViewersHandler = (viewers) => {
      setProvinceViewers(viewers);
    };

    if (socket.connected) {
      // If already connected, join immediately
      handleConnect();
    }
    socket.on("connect", handleConnect);
    socket.on("provinceViewers", provinceViewersHandler);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("provinceViewers", provinceViewersHandler);
    };
  }, [currentUser, displayProvinceName]);

  const calculateSectionCounts = (data) => {
    const counts = {};
    data.forEach((record) => {
      const sections = record.section_incharged
        ? record.section_incharged.split(",").map((s) => s.trim())
        : ["NoSectionIncharged"];
      sections.forEach((section) => {
        counts[section] = counts[section] ? counts[section] + 1 : 1;
      });
    });
    return counts;
  };

  const handleSectionClick = (section) => {
    if (isDateRangeApplied) {
      console.log("Cannot click on section because date range is applied");
      return; // Prevent further action
    }

    // Filter data based on the selected section
    const filteredSectionData = filteredData.filter((item) => {
      const sections = item.section_incharged
        ? item.section_incharged.split(",").map((s) => s.trim())
        : ["NoSectionIncharged"];
      return sections.includes(section);
    });

    setSelectedSection(section); // Set the selected section
    setSelectedSectionData(filteredSectionData); // Set the filtered data for the section
    setIsModalOpen(true); // Open the modal // This state was `selectedSectionData` before, ensure it's correct
  };

  const handleCloseSectionModal = () => {
    setIsModalOpen(false); // Close the modal
    setSelectedSection(""); // Clear the selected section
    setSelectedSectionData([]); // Clear the section data
    setSectionDetails([]); // Clear the section details
  };

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

      // Check if all tags match cumulatively
      const isMatchingTags =
        tags.length === 0 ||
        tags.every((tag) =>
          searchableFields.some((field) => field.includes(tag.toLowerCase()))
        );

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

      return (
        isMatchingTags &&
        (isMatchingInput || isMatchingPismuTracking || isMatchingDateSigned)
      );
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

  const sectionBackgroundColor = (section) => {
    switch (section) {
      case "PEMU_Aurora":
      case "PEMU_AURORA":
        return "#A4B465";

      case "PEMU_Bataan":
      case "PEMU_BATAAN":
        return "#D2D0A0"; // Biege. pero pag namonitor na, transparent

      case "PEMU_Bulacan":
      case "PEMU_BULACAN":
        return "#7A73D1"; // Light purple

      case "PEMU_Nueva Ecija":
      case "PEMU_Nueva_Ecija":
      case "PEMU_NUEVA ECIJA":
      case "PEMU_NUEVA_ECIJA":
        return "#DDA853"; // Yellow

      case "PEMU_Pampanga":
      case "PEMU_PAMPANGA":
        return "#DF9755"; // Yellow

      case "PEMU_Tarlac":
      case "PEMU_TARLAC":
        return "#39C665"; // Green

      case "PEMU_Zambales":
      case "PEMU_ZAMBALES":
        return "#161A30"; // Light lavender

      case "MBU":
      case "mbu":
        return "#FF9B3E"; // Light green

      case "TCHWMS":
      case "tchwms":
        return "#936DDF";

      case "AWECMES":
      case "awecmes":
        return "#626F47";

      case "":
        return "transparent";

      case "TCHWMS/MBU":
        return "linear-gradient(to right, #936DDF, #FF9B3E)"; // Dual tone color for TCHWMS/MBU

      default:
        return "gray"; // Default transparent background
    }
  };

  const handleClose = (removedTag) => {
    setTags((prevTags) => prevTags.filter((tag) => tag !== removedTag));
  };

  const handleInputChange = (e) => {
    setInputValue(e.target.value);
  };

  const handleInputConfirm = () => {
    if (inputValue) {
      if (inputValue.toLowerCase() === "duplicate") {
        setFilterDuplicates(true);
        setTags([]); // Clear existing tags if "duplicate" is used
      } else if (!tags.includes(inputValue)) {
        setTags((prevTags) => [...prevTags, inputValue]);
        setFilterDuplicates(false); // Reset filter if other keyword is entered
      }
    }
    setInputVisible(false);
    setInputValue(""); // Clearing inputValue will trigger the main filtering useEffect
  };

  const tagPlusStyle = {
    background: "#108ee9",
    borderStyle: "dashed",
  };

  const forMap = (tag) => (
    <span key={tag} style={{ display: "inline-block" }}>
      <Tag
        closable
        onClose={(e) => {
          e.preventDefault();
          handleClose(tag);
        }}
      >
        {tag}
      </Tag>
    </span>
  );

  const tagChild = tags.map(forMap);

  const duplicateEccCnc = duplicateRecords.map((record) => record.ecc_cnc);
  const filteredDuplicateData = filterDuplicates
    ? paginatedData.filter((record) => duplicateEccCnc.includes(record.ecc_cnc))
    : paginatedData;

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
          { title: "Permits/Clearances", dataKey: "permits_clearances" },
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

  const normalizeSectionName = (sectionName) => {
    if (!sectionName) return "No Section Incharged"; // Handle blank or undefined section names
    return sectionName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/gi, ""); // Normalize by trimming, converting to lowercase, and removing symbols
  };

  const mergeSections = (sectionCounts) => {
    const mergedSections = {};

    Object.entries(sectionCounts).forEach(([section, count]) => {
      const normalizedSection = normalizeSectionName(section);

      if (normalizedSection) {
        if (mergedSections[normalizedSection]) {
          mergedSections[normalizedSection].count += count;
        } else {
          mergedSections[normalizedSection] = {
            count: count,
            originalName: section, // Store the original section name
          };
        }
      } else {
        if (mergedSections["No Section Incharged"]) {
          mergedSections["No Section Incharged"].count += count;
        } else {
          mergedSections["No Section Incharged"] = {
            count: count,
            originalName: "No Section Incharged",
          };
        }
      }
    });

    return Object.entries(mergedSections)
      .sort(([, { count: countA }], [, { count: countB }]) => countB - countA) // Sort descending by count
      .reduce((sorted, [key, value]) => {
        sorted[value.originalName] = value.count; // Use the original name as the key
        return sorted;
      }, {});
  };

  const showModalAdd = () => {
    setIsModalVisibleAdd(true);
    setButtonColor("secondary");
  };

  const handleCancelAdd = () => {
    setIsModalVisibleAdd(false);
    setButtonColor("primary");
  };

  // Helper function to get permit status
  const getPermitStatus = (expirationDateStr) => {
    const dateStr = String(expirationDateStr || "");
    if (!dateStr || dateStr === "N/A") {
      return {
        status: "unknown",
        daysRemaining: null,
        color: null,
        icon: null,
      };
    }
    const expirationDate = moment(dateStr, ["MM/DD/YYYY", "YYYY-MM-DD"], true); // Strict parsing
    if (!expirationDate.isValid()) {
      return {
        status: "invalid_date",
        daysRemaining: null,
        color: null,
        icon: null,
      };
    }
    const today = moment().startOf("day");
    const daysRemaining = expirationDate.diff(today, "days");

    if (daysRemaining < 0) {
      return {
        status: "expired",
        daysRemaining,
        color: "#cf1322",
        icon: (
          <ExclamationCircleOutlined
            style={{ color: "white", marginLeft: "4px" }}
          />
        ),
      }; // Bright red for expired
    } else if (daysRemaining <= 30) {
      return {
        status: "nearly_expired",
        daysRemaining,
        color: "#faad14",
        icon: null,
      }; // Orange/Yellow for nearly expired
    }
    return { status: "active", daysRemaining, color: null, icon: null }; // Null color means use default
  };

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

  // Assuming sectionCounts is the original data you provided
  const mergedSectionCounts = mergeSections(sectionCounts);

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

  const columns = [
    {
      title: "ID No.",
      dataIndex: "sort_key",
      key: "sort_key",
      align: "left",
      width: 70,
      ...getColumnSearchProps("sort_key"),
      render: (text) => {
        if (typeof text !== "string") return text;

        const [prefix, numberPart] = text.split("-");
        const formatted = `${prefix}-${parseInt(numberPart, 10)}`;

        return <div>{formatted}</div>;
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

        return (
          <div>
            <strong>{record.title}</strong>
            <br />
            Proponent Name: <i>{record.name}</i>
            <br />
            Address: {record.address}
            <br />
            ECC/CNC Ref. No.:{" "}
            {isDuplicate ? (
              <a
                onClick={() => showModalDuplicate(record)} // Open modal on click
                style={{ color: "red", fontWeight: "bold", cursor: "pointer" }} // Highlight duplicates in red
              >
                {record.ecc_cnc}
              </a>
            ) : (
              <a
                href={`https://ecconline.emb.gov.ph/live/Account/Login.aspx/`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {record.ecc_cnc}
              </a>
            )}
          </div>
        );
      },
      align: "left",
      width: "300px",
    },
    {
      title: "Industry Classification",
      key: "industry_class",
      ...getColumnSearchProps("industry_class"),
      render: (text, record) => <div>{record.industry_class}</div>,
      align: "center",
      width: 150,
    },
    {
      title: "Permits/Clearances",
      key: "permits_clearances",
      width: 150,
      render: (text, record) => {
        // checkPendingStatus is now defined outside this render function

        const LabelWithIcon = ({ text, isPending, className }) => (
          <span
            style={{ position: "relative", display: "inline-block" }}
            className={className}
          >
            {text}
            {isPending && (
              <ClockCircleFilled
                style={{
                  position: "absolute",
                  top: "-3px",
                  right: "-3px",
                  fontSize: "11px",
                  color: "#a8e8f9",
                }}
              />
            )}
          </span>
        );

        const ptoStatus = getPermitStatus(record.pto_expiration);
        const wwdpStatus = getPermitStatus(record.wwdp_expiration);
        const pcoStatus = getPermitStatus(record.pco_validity); // Assuming pco_validity is the expiration date

        return (
          <div
            className="permits-clearances-container"
            style={{ fontSize: "10px" }}
          >
            {/* ECC / CNC */}
            {record.ecc_cnc && (
              <Tooltip
                title={
                  <div className="tooltip-content" style={{ fontSize: "11px" }}>
                    <div>
                      {record.ecc_cnc.includes("CNC")
                        ? "CNC Information"
                        : "ECC Information"}
                    </div>
                    <div>Reference No.: {record.ecc_cnc}</div>
                    <div>Date Approved: {record.date_approved}</div>
                    {record.date_amend && (
                      <div>Date Amended: {record.date_amend}</div>
                    )}
                  </div>
                }
                color={record.ecc_cnc.includes("CNC") ? "#bc6e00" : "#0b5f74"}
              >
                <span>
                  <LabelWithIcon
                    text={
                      String(record.ecc_cnc || "").includes("CNC")
                        ? "CNC"
                        : "ECC"
                    }
                    isPending={checkPendingStatus(String(record.ecc_cnc || ""))}
                    className={
                      String(record.ecc_cnc || "").includes("CNC")
                        ? "custom-span-yellow"
                        : "custom-span-green"
                    }
                  />
                </span>
              </Tooltip>
            )}

            {/* PTO */}
            {record.pto_code && (
              <Tooltip
                title={
                  <div style={{ fontSize: "11px" }}>
                    <div>PTO Information</div>
                    <div>Code: {record.pto_code}</div>
                    <div>Date Issued: {record.pto_issued}</div>
                    <div>
                      Date of Expiration: {record.pto_expiration}
                      {ptoStatus.status === "nearly_expired" &&
                        ` (Expires in ${ptoStatus.daysRemaining} days)`}
                      {ptoStatus.status === "expired" && " (Expired)"}
                    </div>
                  </div>
                }
                color={ptoStatus.color || "#643c6a"} // Use status color if available
              >
                <span>
                  <LabelWithIcon
                    text="PTO"
                    isPending={checkPendingStatus(
                      String(record.pto_code || "")
                    )}
                    className={
                      ptoStatus.status === "expired"
                        ? "custom-span-red"
                        : "custom-span-blue"
                    }
                  />
                  {ptoStatus.icon}
                </span>
              </Tooltip>
            )}

            {/* WWDP */}
            {record.wwdp_code && (
              <Tooltip
                title={
                  <div style={{ fontSize: "11px" }}>
                    <div>WWDP Information</div>
                    <div>Code: {record.wwdp_code}</div>
                    <div>Date Issued: {record.wwdp_issued}</div>
                    <div>
                      Date of Expiration: {record.wwdp_expiration}
                      {wwdpStatus.status === "nearly_expired" &&
                        ` (Expires in ${wwdpStatus.daysRemaining} days)`}
                      {wwdpStatus.status === "expired" && " (Expired)"}
                    </div>
                  </div>
                }
                color={wwdpStatus.color || "#b45248"}
              >
                <span>
                  <LabelWithIcon
                    text="WWDP"
                    isPending={checkPendingStatus(
                      String(record.wwdp_code || "")
                    )}
                    className={
                      wwdpStatus.status === "expired"
                        ? "custom-span-red"
                        : "custom-span-orange"
                    }
                  />
                  {wwdpStatus.icon}
                </span>
              </Tooltip>
            )}

            {/* Hazwaste */}
            {record.haz_id && (
              <Tooltip
                title={
                  <div style={{ fontSize: "11px" }}>
                    <div>Hazwaste Gen. Cert. Information</div>
                    <div>Code: {record.haz_id}</div>
                    <div>Date Issued: {record.haz_issued}</div>
                  </div>
                }
                color="#415e20"
              >
                <span>
                  <LabelWithIcon
                    text="HAZ"
                    isPending={checkPendingStatus(String(record.haz_id || ""))}
                    className="custom-span-skyblue"
                  />
                </span>
              </Tooltip>
            )}

            {/* PCO */}
            {record.pco_no && (
              <Tooltip
                title={
                  <div style={{ fontSize: "11px" }}>
                    <div>PCO Accreditation Certificate</div>
                    <div>PCO No: {record.pco_no}</div>
                    <div>PCO Name: {record.pco_name}</div>
                    <div>
                      PCO Validity (Expires): {record.pco_validity}
                      {pcoStatus.status === "nearly_expired" &&
                        ` (Expires in ${pcoStatus.daysRemaining} days)`}
                      {pcoStatus.status === "expired" && " (Expired)"}
                    </div>
                  </div>
                }
                color={pcoStatus.color || "#242726"}
              >
                <span>
                  <LabelWithIcon
                    text="PCO"
                    isPending={checkPendingStatus(String(record.pco_no || ""))}
                    className={
                      pcoStatus.status === "expired"
                        ? "custom-span-red"
                        : "custom-span-stone"
                    }
                  />
                  {pcoStatus.icon}
                </span>
              </Tooltip>
            )}
          </div>
        );
      },
    },
    {
      title: "Section/Unit Incharged",
      key: "section_incharged",
      ...getColumnSearchProps("section_incharged"),
      render: (text, record) => {
        // Split sections by comma
        const sections = String(record.section_incharged || "")
          .split(",")
          .map((section) => section.trim());

        return (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
            }}
          >
            {sections.map((section, index) => {
              const backgroundColor = sectionBackgroundColor(section); // Base background color
              const darkerBackgroundColor = darkenColor(backgroundColor, -40); // Darker shade

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
                  <div
                    className="industry-label"
                    style={{
                      backgroundColor: backgroundColor,
                      padding: "5px",
                      margin: "2px",
                      display: "inline-block",
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      borderRadius: "5px",
                      cursor: "pointer",
                      fontSize: "10px",
                      textAlign: "center",
                    }}
                  >
                    {section}
                  </div>
                </Tooltip>
              );
            })}
          </div>
        );
      },
      align: "center",
      width: 150,
    },
    {
      title: (
        <div style={{ textAlign: "center", width: "100%" }}>
          Remarks/Recommendations
        </div>
      ),
      key: "remarks",
      ...getColumnSearchProps("remarks"),
      render: (text, record) => <div>{record.remarks}</div>,
      align: "center",
      width: 200,
    },
    {
      title: (
        <div style={{ textAlign: "center", width: "100%" }}>
          Monitoring Status
        </div>
      ),
      key: "monitoringStatus",
      width: 200,
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
      width: 100,
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
      <div className="header-content">
        <h3 className="header-title">{`${displayProvinceName} Universe of Firms and Industries`}</h3>
        <Button
          type="primary"
          size="small"
          className="refresh-button-province"
          icon={<ReloadOutlined style={{ fontSize: "12px" }} />} // Adjusted font size
          onClick={() => handleReload(provinceName)}
          loading={loading}
          title="Reload Table"
          style={{ marginLeft: "10px" }}
        />

        <Button
          type="primary"
          size="small"
          className="refresh-button-province"
          icon={<ExportOutlined style={{ fontSize: "12px" }} />} // Adjusted font size
          onClick={() => handleExportPDF(displayProvinceName)}
          title="Export Data"
        />

        {/* Display avatars of other users viewing this province */}
        {canViewDataHistory && provinceViewers[displayProvinceName] && (
          <div
            className="province-viewers-avatars"
            style={{
              marginLeft: "15px",
              display: "flex",
              alignItems: "center",
              margin: "12px 0",
            }}
          >
            <Avatar.Group max={{ count: 3 }} size={24}>
              {provinceViewers[displayProvinceName]
                .filter((viewer) => viewer.username !== currentUser?.username) // Show OTHERS
                .map((viewer) => (
                  <Tooltip
                    key={viewer.username}
                    title={
                      <span style={{ fontSize: "9px" }}>
                        {`${
                          viewer.name || viewer.username
                        } is viewing ${displayProvinceName}`}
                      </span>
                    }
                  >
                    <Avatar
                      src={
                        viewer.avatar
                          ? `${API_BASE_URL}${viewer.avatar}`
                          : undefined
                      }
                      style={{
                        marginLeft: -8, // Overlap avatars slightly
                        border: `2px solid ${
                          theme === "dark" ? "#262626" : "#fff"
                        }`, // Border for better visibility
                      }}
                    >
                      {!viewer.avatar && viewer.name
                        ? viewer.name[0].toUpperCase()
                        : !viewer.avatar && viewer.username
                        ? viewer.username[0].toUpperCase()
                        : null}
                    </Avatar>
                  </Tooltip>
                ))}
            </Avatar.Group>
          </div>
        )}

        <Button
          type="primary"
          className="add-industry-button"
          size="small "
          style={{
            backgroundColor: buttonColor === "primary" ? "#1890ff" : "#03396c",
          }}
          onClick={showModalAdd}
        >
          Add Industry
        </Button>

        <AddProvinceModal
          visible={isModalVisibleAdd}
          onCancel={handleCancelAdd}
          zIndex={1000}
        />
      </div>

      <Modal
        open={isModalVisible}
        title={
          <div className="modal-title-container">
            <span className="modal-title" style={{ whiteSpace: "normal" }}>
              Record ID: {selectedRecord?.sort_key || "Unknown"}
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
        onClose={handleCloseModal}
        zIndex={1000}
        style={{ top: 40 }}
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
      </Modal>

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
        <ConfigProvider
          theme={{
            token: {
              fontSize: 11,
            },
          }}
        >
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
                  Industry Count: {filteredData.length}
                </h4>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "8px",
                  }}
                >
                  {inputVisible ? (
                    <Input
                      ref={inputRef}
                      type="primary"
                      size="small"
                      value={inputValue}
                      className="search-input"
                      onChange={handleInputChange}
                      onBlur={handleInputConfirm}
                      onPressEnter={handleInputConfirm}
                      placeholder="enter keyword..."
                    />
                  ) : (
                    <Tag
                      onClick={() => setInputVisible(true)}
                      style={tagPlusStyle}
                      color="#108ee9"
                      className="tag"
                    >
                      <PlusOutlined /> Search keyword here...
                    </Tag>
                  )}
                  {tagChild}
                </div>
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
                {!loading && !error && filteredDuplicateData.length > 0 && (
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
            <div style={{ marginTop: 8 }}>
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

          <div className="section-result">
            {loading ? (
              // Display a spinner or placeholder during loading
              <div className="loading-placeholder">
                <div className="loading-spinner"></div>
                <p className="loading-label">Loading section counts...</p>
              </div>
            ) : isDateRangeApplied &&
              sectionCounts &&
              Object.keys(sectionCounts).length > 0 ? (
              <div className="section-breakdown">
                {Object.entries(mergedSectionCounts).map(([section, count]) => (
                  <div
                    key={section}
                    onClick={() => handleSectionClick(section)}
                    className={`section-item ${
                      isDateRangeApplied ? "disabled" : ""
                    }`}
                    style={{
                      backgroundColor:
                        section === "nosectionincharged"
                          ? "gray"
                          : sectionBackgroundColor(section),
                      color: "white", // Set font color to white
                      cursor: isDateRangeApplied ? "not-allowed" : "pointer",
                    }}
                  >
                    <span className="section-label">
                      {section === "nosectionincharged" || section === ""
                        ? "No Section Incharged"
                        : section}
                      :
                    </span>
                    <span className="section-count">{count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="section-breakdown">
                {Object.entries(mergedSectionCounts).length > 0 ? (
                  Object.entries(mergedSectionCounts).map(
                    ([section, count]) => {
                      const displaySection =
                        section === "nosectionincharged" || !section
                          ? "No Section Incharged"
                          : section;

                      return (
                        <div
                          key={section}
                          onClick={() => handleSectionClick(section)}
                          className={`section-item ${
                            isDateRangeApplied ? "disabled" : ""
                          }`}
                          style={{
                            backgroundColor:
                              section === "NoSectionIncharged"
                                ? "gray"
                                : sectionBackgroundColor(section),
                            color: "white",
                            cursor: "pointer",
                          }}
                        >
                          <span className="section-label">
                            {section === "NoSectionIncharged"
                              ? "No Section Incharged"
                              : section}
                            :
                          </span>
                          <span className="section-count">{count}</span>
                        </div>
                      );
                    }
                  )
                ) : (
                  <div
                    className="no-sections-message"
                    style={{
                      backgroundColor: "gray",
                      color: "white",
                      padding: "10px",
                      borderRadius: "5px",
                      textAlign: "center",
                      fontSize: "10px",
                    }}
                  >
                    Processing...
                  </div>
                )}
              </div>
            )}

            <SectionDetailsModal
              visible={isModalOpen}
              section={selectedSection}
              count={sectionCounts[selectedSection] || 0} // Pass the count for the selected section
              data={selectedSectionData} // Pass the filtered data for the section
              onClose={handleCloseSectionModal}
              zIndex={1000}
            />
          </div>
        </ConfigProvider>

        {loading ? (
          <div style={{ textAlign: "center", padding: "20px" }}>
            <span>Loading Universe Data...</span> <br />
            <Progress
              percent={progress}
              status="active"
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
            scroll={{ y: 950 }}
            dataSource={filteredDuplicateData} // Ensure this is set correctly
            columns={columns}
            rowKey="sort_key"
            size="small"
            className="custom-table"
            pagination={false}
            onRow={(record) => ({
              onClick: () => onRowClick(record),
            })}
          />
        )}
      </div>
    </div>
  );
};

export default Province;
