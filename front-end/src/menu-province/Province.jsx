import React, { useContext, useEffect, useState, useRef } from "react";
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
  ConfigProvider,
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
} from "@ant-design/icons";
import { DataContext } from "./DataContext";
import ProvinceModal from "./ProvinceModal";
import Highlighter from "react-highlight-words";
import Swal from "sweetalert2";
import jsPDF from "jspdf";
import "jspdf-autotable";
import SectionDetailsModal from "./sectiondetails/SectionDetailsModal";
import AddProvinceModal from "./actions/AddProvinceModal";
import "./province.css";

const capitalizeFirstLetter = (str) => {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
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
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const capitalizedProvinceName = capitalizeFirstLetter(provinceName);
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
  const [isEditing, setIsEditing] = useState(false);
  const [originalData, setOriginalData] = useState([]);
  const [duplicates, setDuplicates] = useState({});
  const [selectedDuplicate, setSelectedDuplicate] = useState(null);
  const [duplicateRecords, setDuplicateRecords] = useState([]);
  const [selectedDuplicateRowKeys, setSelectedDuplicateRowKeys] = useState([]);
  const [filterDuplicates, setFilterDuplicates] = useState(false);
  const [searchedColumn, setSearchedColumn] = useState("");
  const [searchText, setSearchText] = useState("");
  const [dateRange, setDateRange] = useState([null, null]);
  const [filteredData, setFilteredData] = useState(originalData);
  const [sectionCounts, setSectionCounts] = useState({});
  const [isDateRangeApplied, setIsDateRangeApplied] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSection, setSelectedSection] = useState("");
  const [sectionDetails, setSectionDetails] = useState([]);
  const [selectedSectionData, setSelectedSectionData] = useState([]);
  const [sectionDetailsLoading, setSectionDetailsLoading] = useState(false);
  const [buttonColor, setButtonColor] = useState("primary");

  // Extract permissions from currentUser
  const permissions = currentUser?.permissions || [];
  const canGenerateData = permissions[0];
  const canManageData = permissions[1];
  const canViewAdminPanel = permissions[2];
  const canViewDataHistory = permissions[3];
  const canAccessRangePicker = permissions[4];

  // Province codes and their human-readable names
  const provinceCodes = {
    BA: "Bataan",
    BU: "Bulacan",
    NE: "Nueva_Ecija",
    PA: "Pampanga",
    TA: "Tarlac",
    ZA: "Zambales",
    AU: "Aurora",
  };

  // Function to fetch and sort data for the selected province
  const fetchDataForProvince = async (provinceCode) => {
    setLoading(true);
    try {
      const fetchedData = await fetchData(provinceCode); // Fetch data for the specific province
      if (fetchedData) {
        // Sort the fetched data by id_no (ascending order)
        const sortedData = fetchedData.sort((a, b) => {
          const numA = parseInt(a.id_no.replace(/[^0-9]/g, ""), 10); // Extract numeric part from id_no
          const numB = parseInt(b.id_no.replace(/[^0-9]/g, ""), 10); // Extract numeric part from id_no
          return numA - numB; // Ascending sort
        });

        // Set the sorted data into state
        setFilteredData(sortedData);
        setOriginalData(sortedData);
        setSectionCounts(calculateSectionCounts(sortedData));
      }
    } catch (err) {
      console.error("Error fetching data:", err);
    } finally {
      setLoading(false);
    }
  };

  // Whenever the provinceName changes, fetch and sort the data for that province
  useEffect(() => {
    if (provinceName && provinceCodes[provinceName]) {
      setCurrentProvince(provinceCodes[provinceName]); // Set current province's name
      handleReload(provinceName); // Call handleReload whenever provinceName changes
    }
  }, [provinceName]);

  const handleReload = async (provinceName) => {
    setLoading(true);
    setSectionCounts({}); // Reset section counts

    try {
      const fetchedData = await fetchData(provinceName); // Fetch data for the current province
      if (fetchedData) {
        setFilteredData(fetchedData); // Update filtered data
        setOriginalData(fetchedData); // Update original data
        setCurrentPage(1); // Reset to the first page

        // Recalculate the section counts based on the new fetched data
        const newSectionCounts = calculateSectionCounts(fetchedData);
        setSectionCounts(newSectionCounts); // Update section counts

        setIsDateRangeApplied(false); // Reset date range filter
      }
    } catch (error) {
      console.error("Error reloading data:", error);
    } finally {
      setLoading(false); // End loading animation
    }
  };


  const filterData = () => {
    if (!data || data.length === 0) return [];

    // Filter based on the tags, inputValue, and dateRange
    return data.filter((record) => {
      const searchableFields = [
        record.id_no,
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
        record.fmr_section_incharged,
        record.section_incharge,
        record.handler,
        record.monitoring_sched,
        record.iis_no,
        record.insp_type,
        record.report_type,
        record.date_monitored,
        record.date_routed,
        record.date_signed,
        record.days_dmds,
        record.days_dsdrs,
        record.pismu_tracking,
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
      ].map((field) => (typeof field === "string" ? field : "").toLowerCase()); // Normalize fields to lowercase

      // Check if all tags match cumulatively
      const isMatchingTags =
        tags.length === 0 ||
        tags.every((tag) =>
          searchableFields.some((field) => field.includes(tag.toLowerCase()))
        );

      // Check if input value matches any record detail cumulatively
      const isMatchingInput =
        !inputValue || // If no inputValue, consider it a match
        searchableFields.some((field) =>
          field.includes(inputValue.toLowerCase())
        );

      const isMatchingPismuTracking =
        inputValue &&
        (inputValue.toLowerCase().includes("received") ||
          inputValue.toLowerCase().includes("pismu") ||
          inputValue.toLowerCase().includes("planning")) &&
        record.pismu_tracking === "✔"; // Check if pismu_tracking is marked

      const isMatchingDateSigned =
        inputValue.toLowerCase() === "date signed" && record.date_signed; // Ensure date_signed exists

      const dateSigned = new Date(record.date_signed);

      const isMatchingDateRange =
        !dateRange || // If dateRange is null or undefined, consider it a match
        !dateRange[0] ||
        !dateRange[1] || // If no specific range is selected, consider it a match
        (dateSigned >= dateRange[0] && dateSigned <= dateRange[1]);

      return (
        isMatchingTags &&
        (isMatchingInput || isMatchingPismuTracking || isMatchingDateSigned) &&
        isMatchingDateRange // Combine filters
      );
    });
  };

  useEffect(() => {
    setLoading(true);
    const filtered = filterData();
    setFilteredData(filtered);

    const counts = calculateSectionCounts(filtered);
    setSectionCounts(counts);

    //console.log("Section Counts:", counts);

    setLoading(false);
  }, [data, tags, inputValue, dateRange]);

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

  const handleSectionClick = async (section, sectionData) => {
    if (isDateRangeApplied) {
      console.log("Cannot click on section because date range is applied");
      return; // Prevent further action
    }

    const validSectionData = Array.isArray(sectionData) ? sectionData : [];
    //console.log("Section Data on Click:", validSectionData);
    setSelectedSection(section);
    setSelectedSectionData(validSectionData);

    try {
      if (sectionData && sectionData.length > 0) {
        const { id_no } = sectionData[0];
        const response = await fetch(
          `http://localhost:8081/api/ucds-data/${id_no}`
        );
        const data = await response.json();

        if (response.ok) {
          setSectionDetails(data);
        } else {
          console.error("Error fetching detailed data:", data.error);
        }
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setIsModalOpen(true);
    }
  };

  const handleCloseSectionModal = () => {
    setIsModalOpen(false);
    setSelectedSection("");
    setSelectedSectionData([]);
    setSectionDetails([]);
  };

  const filteredSectionData = (section) => {
    return filteredData.filter((item) => {
      const sections = item.section_incharged
        ? item.section_incharged.split(",").map((s) => s.trim())
        : ["NoSectionIncharged"];
      return sections.includes(section);
    });
  };

  const calculateFilteredSectionCounts = (data) => {
    const sectionCounts = {};
    data.forEach((item) => {
      const section = item.section || "NoSectionIncharged";
      sectionCounts[section] = (sectionCounts[section] || 0) + 1;
    });
    return sectionCounts;
  };

  const handleDateChange = (dates) => {
    // Check if dates is valid and contains two elements
    if (
      !dates ||
      !Array.isArray(dates) ||
      dates.length < 2 ||
      !dates[0] ||
      !dates[1]
    ) {
      setIsDateRangeApplied(false); // Date range is not applied
      setFilteredData(originalData); // Reset to original data if no date range
      setSectionCounts(calculateSectionCounts(originalData)); // Reset section counts
      console.log("No valid date range selected. Resetting to original data.");
      return; // Exit early if dates are invalid
    }

    // Proceed with filtering if dates are valid
    setDateRange(dates);
    setIsDateRangeApplied(true); // Date range is applied

    const filteredByDate = originalData.filter((record) => {
      const dateSigned = new Date(record.date_signed); // Assuming date_signed is in a valid format
      return dateSigned >= dates[0] && dateSigned <= dates[1];
    });

    setFilteredData(filteredByDate);

    // Calculate section counts for filtered data
    const counts = calculateSectionCounts(filteredByDate);
    setSectionCounts(counts);
  };

  const onRowClick = (record) => {
    const selectedIndex = selectedRowKeys.indexOf(record.id_no);
    const newSelectedRowKeys = [...selectedRowKeys];

    if (selectedIndex >= 0) {
      newSelectedRowKeys.splice(selectedIndex, 1);
    } else {
      newSelectedRowKeys.push(record.id_no);
    }

    setSelectedRowKeys(newSelectedRowKeys);
  };

  const handlePageChange = (page) => {
    setLoading(true);
    setCurrentPage(page);
    setLoading(false);
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
    onFilterDropdownOpenChange: (visible) => {
      if (visible) {
        setTimeout(() => searchInput.current.select(), 100);
      }
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
        record.title,
        record.name,
        record.address,
        record.ecc_cnc,
        record.industry_class,
        record.remarks,
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
        record.iis_no,
        record.insp_type,
        record.report_type,
        record.date_monitored,
        record.date_routed,
        record.date_signed,
        record.days_dmds,
        record.days_dsdrs,
        record.pismu_tracking,
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
    setFilteredData(data);
  };

  const measureTextWidth = (text, font = "14px Poppins") => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    context.font = font;
    return context.measureText(text).width;
  };

  const sectionBackgroundColor = (section) => {
    switch (section) {
      case "PEMU_Aurora":
      case "PEMU_AURORA":
        return "#F0F3FF";

      case "PEMU_Bataan":
      case "PEMU_BATAAN":
        return "#FCE5BB"; // Biege. pero pag namonitor na, transparent

      case "PEMU_Bulacan":
      case "PEMU_BULACAN":
        return "#FCE5BB"; // Light purple

      case "PEMU_Nueva Ecija":
      case "PEMU_NUEVA ECIJA":
      case "PEMU_NUEVA_ECIJA":
        return "#FFE225"; // Yellow

      case "PEMU_Pampanga":
      case "PEMU_PAMPANGA":
        return "#FFE225"; // Yellow

      case "PEMU_Tarlac":
      case "PEMU_TARLAC":
        return "#39C665"; // Green

      case "PEMU_Zambales":
      case "PEMU_ZAMBALES":
        return "#d1c4e9"; // Light lavender

      case "MBU":
      case "mbu":
        return "#FF9B3E"; // Light green

      case "TCHWMS":
      case "tchwms":
        return "#936DDF";

      case "AWECMES":
      case "awecmes":
        return "#c8e6c9";

      case "TCHWMS/MBU":
        return "linear-gradient(to right, #936DDF, #FF9B3E)"; // Dual tone color for TCHWMS/MBU

      default:
        return "transparent"; // Default transparent background
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
    setInputValue("");

    // Re-filter the data and update section counts
    const filtered = filterData();
    setFilteredData(filtered);
    const filteredSectionCounts = calculateFilteredSectionCounts(filtered);
    setSectionCounts(filteredSectionCounts); // Update section counts for filtered data
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
          { title: "ID No.", dataKey: "id_no" },
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
          .filter((record) => selectedRowKeys.includes(record.id_no))
          .map((record) => ({
            id_no: record.id_no || "",
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
            id_no: { cellWidth: 15 },
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
      { title: "ID No.", dataKey: "id_no" },
      { title: "Industry Details", dataKey: "industryDetails" },
      { title: "Industry Classification", dataKey: "industry_class" },
      { title: "Permits/Clearances", dataKey: "permits_clearances" },
      { title: "Section/Unit Incharged", dataKey: "section_incharge" },
      { title: "Remarks/Recommendations", dataKey: "remarks_recommendations" },
      { title: "IIS Transaction No.", dataKey: "iis_no" },
    ];

    // Use the original data source, not just the paginated data
    const data = originalData.map((record) => ({
      id_no: record.id_no || "",
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
        id_no: { cellWidth: 15 },
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
    console.log("Selected Row Keys for Delisting:", selectedDuplicateRowKeys);

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
          <strong>ID No.: {record.id_no}</strong> <br />
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
      dataIndex: "id_no",
      key: "id_no",
      align: "left",
      width: 100,
      ...getColumnSearchProps("id_no"),
      render: (text) => <div>{text}</div>,
    },
    {
      title: "Industry Details",
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
      width: "800px",
    },
    {
      title: "Industry Classification",
      key: "industry_class",
      ...getColumnSearchProps("industry_class"),
      render: (text, record) => <div>{record.industry_class}</div>,
      align: "left",
      width: 100,
    },
    {
      title: "Permits/Clearances",
      key: "permits_clearances",
      width: 300,
      render: (text, record) => {
        const checkPendingStatus = (value) =>
          typeof value === "string" &&
          (value.includes("App. No") ||
            value.includes("In process") ||
            value.includes("On process") ||
            value.includes("Application No"));

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
                  color: "#FF0303",
                }}
              />
            )}
          </span>
        );

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
                    text={record.ecc_cnc.includes("CNC") ? "CNC" : "ECC"}
                    isPending={checkPendingStatus(record.ecc_cnc)}
                    className={
                      record.ecc_cnc.includes("CNC")
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
                    <div>Date of Expiration: {record.pto_expiration}</div>
                  </div>
                }
                color="#643c6a"
              >
                <span>
                  <LabelWithIcon
                    text="PTO"
                    isPending={checkPendingStatus(record.pto_code)}
                    className="custom-span-blue"
                  />
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
                    <div>Date of Expiration: {record.wwdp_expiration}</div>
                  </div>
                }
                color="#b45248"
              >
                <span>
                  <LabelWithIcon
                    text="WWDP"
                    isPending={checkPendingStatus(record.wwdp_code)}
                    className="custom-span-orange"
                  />
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
                    isPending={checkPendingStatus(record.haz_id)}
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
                    <div>PCO Validity: {record.pco_validity}</div>
                  </div>
                }
                color="#242726"
              >
                <span>
                  <LabelWithIcon
                    text="PCO"
                    isPending={checkPendingStatus(record.pco_no)}
                    className="custom-span-stone"
                  />
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
        const sections = record.section_incharged
          .split(",")
          .map((section) => section.trim());

        return (
          <div style={{ display: "flex", flexWrap: "wrap" }}>
            {sections.map((section, index) => {
              const textWidth = measureTextWidth(section);
              const backgroundColor = sectionBackgroundColor(section); // Base background color
              const darkerBackgroundColor = darkenColor(backgroundColor, -40); // Darker shade

              return (
                <Tooltip
                  key={index}
                  title={
                    <div style={{ fontSize: "11px" }}>
                      {" "}
                      {/* Reduced font size */}
                      <div>Section Incharge: {record.section_incharged}</div>
                      <div>Handler: {record.handler || "N/A"}</div>
                      <div>
                        Monitoring Schedule: {record.monitoring_sched || "N/A"}
                      </div>
                      <div>Inspection Type: {record.insp_type || "N/A"}</div>
                    </div>
                  }
                  color={darkerBackgroundColor} // Tooltip background color (slightly darker)
                >
                  <div
                    className="industry-label"
                    style={{
                      backgroundColor: backgroundColor, // Original background color for the label
                      padding: "5px",
                      margin: "2px", // Add some margin between sections
                      width: `${textWidth + 10}px`, // Add some padding for better appearance
                      display: "inline-block",
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      borderRadius: "5px",
                      cursor: "pointer", // Cursor changes to pointer on hover
                      fontSize: "10px",
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
      align: "left",
      width: 150,
    },
    {
      title: "Remarks/\nRecommendations",
      key: "remarks_recommendations",
      ...getColumnSearchProps("remarks_recommendations"),
      render: (text, record) => <div>{record.remarks_recommendations}</div>,
      align: "left",
      width: 100,
    },
    {
      title: <span style={{ fontSize: "10px" }}>Monitoring Status</span>,
      key: "iis_no",
      ...getColumnSearchProps("iis_no"), // Ensure this is set to the correct dataIndex
      render: (text, record) => (
        <div>
          <a
            href={`https://iis.emb.gov.ph/embis/dms/documents/tracker/?trn_no=${encodeURIComponent(
              record.iis_no
            )}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {record.iis_no || ""}
          </a>

          <div>
            {/* Date Monitored */}
            {record.date_monitored && (
              <div>
                <Tooltip title="Date Monitored">
                  <MonitorOutlined
                    style={{ marginRight: 8, color: "#1890ff" }}
                  />{" "}
                  {record.date_monitored}
                </Tooltip>
              </div>
            )}

            {/* Date Routed */}
            {record.date_routed && (
              <div>
                <Tooltip title="Date Routed to IIS">
                  <GlobalOutlined
                    style={{ marginRight: 8, color: "#52c41a" }}
                  />{" "}
                  {record.date_routed}
                </Tooltip>
              </div>
            )}

            {/* Date Signed */}
            {record.date_signed && (
              <div>
                <Tooltip title="Date Report Signed">
                  <CheckCircleFilled
                    style={{ marginRight: 8, color: "#faad14" }}
                  />{" "}
                  {record.date_signed}
                </Tooltip>
              </div>
            )}

            {/* PISMU Tracking */}
            <div>
              <Tooltip title="PISMU Tracking of Report">
                {record.pismu_tracking === "✔" ? (
                  <span>
                    <CheckCircleFilled style={{ color: "#0D92F4" }} />{" "}
                    <span style={{ marginLeft: 8 }}>Received by PISMU</span>
                  </span>
                ) : (
                  <span></span>
                )}
              </Tooltip>
            </div>
          </div>
        </div>
      ),
      width: 400, // Adjust as needed
      align: "left",
      onFilter: (value, record) => {
        const lowerValue = value.toLowerCase();

        // Check if iis_no matches
        const iisNoMatches =
          record.iis_no && record.iis_no.toLowerCase().includes(lowerValue);

        // Check if any date matches (partial match allowed)
        const dateMonitoredMatches =
          record.date_monitored && record.date_monitored.includes(lowerValue);
        const dateRoutedMatches =
          record.date_routed && record.date_routed.includes(lowerValue);
        const dateSignedMatches =
          record.date_signed && record.date_signed.includes(lowerValue);

        // Check if pismu_tracking matches based on user input (partial match allowed)
        const pismuTrackingMatches =
          (record.pismu_tracking === "✔" &&
            (lowerValue.includes("received") ||
              lowerValue.includes("pismu"))) ||
          (record.pismu_tracking !== "✔" && !lowerValue.includes("received"));

        // Return true if any of the conditions match
        return (
          iisNoMatches ||
          dateMonitoredMatches ||
          dateRoutedMatches ||
          dateSignedMatches ||
          pismuTrackingMatches
        );
      },
    },
    {
      title: "Actions",
      key: "actions",
      align: "center",
      width: 80,
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
    <div className={`header-panel ${theme}`}>
      <div className="header-content">
        <h3 className="header-title">{`${capitalizedProvinceName} Universe of Firms and Industries`}</h3>

        <Button
          type="primary"
          className="refresh-button"
          icon={<ReloadOutlined />}
          onClick={() => handleReload(provinceName)}
          loading={loading}
          title="Reload Table"
        />

        <Button
          type="primary"
          className="refresh-button"
          icon={<ExportOutlined />}
          onClick={() => handleExportPDF(capitalizedProvinceName)}
          title="Export Data"
        />

        <Button
          type="primary"
          className="add-industry-button"
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
        />
      </div>

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
        onClose={handleCloseModal}
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
              ID No: {selectedDuplicate?.id_no}
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
        visible={isModalDuplicateVisible}
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
              rowKey="id_no"
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
              fontSize: 12,
            },
          }}
        >
          <div
            className="total-count"
            style={{ margin: "5px 0", textAlign: "left" }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", alignItems: "center" }}>
                <h4 style={{ marginRight: 16 }}>
                  Industry Count: {filteredData.length}
                </h4>

                <div style={{ display: "flex", alignItems: "center" }}>
                  {inputVisible ? (
                    <Input
                      ref={inputRef}
                      type="primary"
                      size="small"
                      style={{ width: 200, marginRight: 16 }}
                      value={inputValue}
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
                    >
                      <PlusOutlined /> Search keyword here...
                    </Tag>
                  )}
                  {tagChild}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center" }}>
                {canAccessRangePicker && (
                  <>
                    <span className="date-signed">Date Report Signed:</span>
                    <RangePicker
                      style={{ marginLeft: 16 }}
                      onChange={handleDateChange}
                      value={dateRange}
                      format="MM/DD/YYYY" // Set the desired format
                      placeholder={["Start Date", "End Date"]}
                      allowClear={true}
                    />
                  </>
                )}

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
                  style={{ marginLeft: 16 }}
                />
              </div>
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
                    onClick={
                      () =>
                        !isDateRangeApplied &&
                        handleSectionClick(filteredSectionData(section)) // Only allow click if date range is not applied
                    }
                    className={`section-item ${
                      isDateRangeApplied ? "disabled" : ""
                    }`}
                    style={{
                      backgroundColor:
                        section === "nosectionincharged" // normalized version
                          ? "gray"
                          : sectionBackgroundColor(section),
                      cursor: isDateRangeApplied ? "not-allowed" : "pointer", // Change cursor if disabled
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
                          key={section || "No Section Incharged"}
                          onClick={
                            () =>
                              !isDateRangeApplied &&
                              handleSectionClick(
                                displaySection,
                                filteredSectionData(section)
                              ) // Only allow click if date range is not applied
                          }
                          className={`section-item ${
                            isDateRangeApplied ? "disabled" : ""
                          }`}
                          style={{
                            backgroundColor:
                              section === "NoSectionIncharged" || !section
                                ? "gray"
                                : sectionBackgroundColor(section),
                            cursor: isDateRangeApplied
                              ? "not-allowed"
                              : "pointer", // Change cursor if disabled
                          }}
                        >
                          <span className="section-label">
                            {displaySection}:
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

            {/* SectionDetails Modal */}
            <SectionDetailsModal
              visible={isModalOpen}
              section={selectedSection}
              data={selectedSectionData}
              onClose={handleCloseSectionModal}
              loading={sectionDetailsLoading} // Use a separate loading state for modal
            />
          </div>
        </ConfigProvider>

        {loading ? (
          <Spin tip="Loading data..." />
        ) : error ? (
          <p>{error}</p>
        ) : (
          <Table
            rowSelection={{
              selectedRowKeys,
              onChange: setSelectedRowKeys,
            }}
            dataSource={filteredDuplicateData} // Ensure this is set correctly
            columns={columns}
            rowKey="id_no"
            size="small"
            className="custom-table"
            pagination={{
              pageSize,
              showSizeChanger: true,
              pageSizeOptions: ["10", "50", "100"],
              onShowSizeChange: (current, size) => setPageSize(size),
            }}
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
