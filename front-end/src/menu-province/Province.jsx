import React, { useContext, useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import {
  Table,
  Button,
  Spin,
  notification,
  Input,
  Space,
  Tooltip,
  Tag,
  Modal,
  Select,
  Pagination,
  Popover,
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
} from "@ant-design/icons";
import { DataContext } from "./DataContext";
import ProvinceModal from "./ProvinceModal";
import Highlighter from "react-highlight-words";
import { TweenOneGroup } from "rc-tween-one";
import Swal from "sweetalert2";
import jsPDF from "jspdf";
import "jspdf-autotable";
import "./province.css";

const capitalizeFirstLetter = (str) => {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

const tourContent = (
  <div style={{ maxWidth: "300px" }}>
    <h4>Delisting Instructions</h4>
    <p>
      To delist a record, select any duplicate record from the table below.
    </p>
    <p>
      Click the "Delist" button to proceed. If you wish to cancel, click
      "Cancel."
    </p>
  </div>
);

const Province = ({ theme, currentUser  }) => {
  const { provinceName } = useParams();
  const { data, error, fetchData, setCurrentProvince } =
    useContext(DataContext);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const capitalizedProvinceName = capitalizeFirstLetter(provinceName);
  const [filteredData, setFilteredData] = useState(data);
  const [tags, setTags] = useState([]);
  const [inputVisible, setInputVisible] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef(null);
  const searchInput = useRef(null);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isModalDuplicateVisible, setIsModalDuplicateVisible] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [originalData, setOriginalData] = useState([]);
  const [duplicates, setDuplicates] = useState({});
  const [selectedDuplicate, setSelectedDuplicate] = useState(null);
  const [duplicateRecords, setDuplicateRecords] = useState([]);
  const [selectedDuplicateRowKeys, setSelectedDuplicateRowKeys] = useState([]);
  const [filterDuplicates, setFilterDuplicates] = useState(false); 

  useEffect(() => {
    const fetchDataOnProvinceChange = async () => {
      if (provinceName) {
        setLoading(true);
        setCurrentProvince(capitalizedProvinceName);
        try {
          const fetchedData = await fetchData(capitalizedProvinceName);
          setOriginalData(fetchedData); // Store the complete dataset
        } catch (error) {
          console.error("Error fetching data:", error);
        } finally {
          setLoading(false);
        }
      }
    };

    fetchDataOnProvinceChange();
  }, [provinceName, capitalizedProvinceName, fetchData]);

  useEffect(() => {
    const filterData = () => {
      if (!data || data.length === 0) return []; // Return empty array if no data

      // Filter based on the tags and inputValue
      return data.filter((record) => {
        // Aggregate all searchable fields into a single array
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
        ].map((field) =>
          (typeof field === "string" ? field : "").toLowerCase()
        ); // Normalize fields to lowercase

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

        return isMatchingTags && isMatchingInput; // Return true if all tags match and input matches
      });
    };

    setLoading(true);
    const filtered = filterData();
    setFilteredData(filtered);
    setLoading(false);
  }, [data, tags, inputValue]);

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
      // Handle filtering for "Industry Details" with duplicates
      if (dataIndex === "industryDetails") {
        const industryText = `${record.title} ${record.name} ${record.address} ${record.ecc_cnc}`;

        // If the search value is 'duplicate', filter based on ecc_cnc duplicates
        if (value.toLowerCase() === "duplicate") {
          return duplicates[record.ecc_cnc]; // Return true for duplicates
        }

        // Check if the industry text includes the search value
        return industryText.toLowerCase().includes(value.toLowerCase());
      }

      // Handle other simple text columns
      return record[dataIndex]
        ? record[dataIndex]
            .toString()
            .toLowerCase()
            .includes(value.toLowerCase())
        : "";
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
    setSearchText(selectedKeys[0]);
  };

  const handleReset = (clearFilters) => {
    clearFilters();
    setSearchText("");
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
        return "transparent"; // no color encoded

      case "PEMU_Bataan":
      case "PEMU_BATAAN":
        return "#FCE5BB"; // Biege. pero pag namonitor na, transparent

      case "PEMU_Bulacan":
      case "PEMU_BULACAN":
        return "#FCE5BB"; // Light purple

      case "PEMU_Nueva Ecija":
      case "PEMU_NUEVA ECIJA":
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
        setFilterDuplicates(true); // Set the state to filter duplicates
      } else if (!tags.includes(inputValue)) {
        setTags((prevTags) => [...prevTags, inputValue]);
        setFilterDuplicates(false); // Reset filter if other keyword is entered
      }
    }
    setInputVisible(false);
    setInputValue("");
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

  const duplicateEccCnc = duplicateRecords.map(record => record.ecc_cnc);
  const filteredDuplicateData = filterDuplicates
  ? paginatedData.filter((record) => duplicateEccCnc.includes(record.ecc_cnc))
  : paginatedData;

  const handleReload = async () => {
    try {
      setLoading(true); // Start loading
      await fetchData(provinceName);
      setCurrentPage(1);
    } catch (error) {
      console.error("Error reloading data:", error);
    } finally {
      setLoading(false); // End loading
    }
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

    if (record.tsd_ref_no) {
      permits.push(`TSD: ${record.tsd_ref_no}`);
    }

    if (record.tp_trc_ref_no) {
      permits.push(`TP/TRC: ${record.tp_trc_ref_no}`);
    }

    if (record.chemical_code) {
      permits.push(`Chemical Permit: ${record.chemical_code}`);
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
          { title: "Section/Unit Incharged", dataKey: "section_incharge" },
          {
            title: "Remarks/Recommendations",
            dataKey: "remarks_recommendations",
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
          Section Incharged: {record.fmr_section_incharged}{" "}
          {record.section_incharge} <br />
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
          Date Amend: {record.date_amend} <br />
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
          PCO Tel No: {record.pco_tel_no} <br />
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
      width: 120,
      ...getColumnSearchProps("id_no"),
      render: (text) => <div className="industry-label">{text}</div>,
    },
    {
      title: "Industry Details",
      key: "industryDetails",
      ...getColumnSearchProps("industryDetails"),
      render: (text, record) => {
        const isDuplicate = duplicates[record.ecc_cnc]; // Check if the current record's `ecc_cnc` is a duplicate

        return (
          <div className="industry-label">
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
                href={`https://iis.emb.gov.ph/embis/`}
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
      width: 900,
    },
    {
      title: "Industry Classification",
      key: "industry_class",
      ...getColumnSearchProps("industry_class"),
      render: (text, record) => (
        <div className="industry-label">{record.industry_class}</div>
      ),
      align: "left",
    },
    {
      title: "Permits/Clearances",

      key: "permits_clearances",
      render: (text, record) => (
        <div
          className="permits-clearances-container"
          style={{ fontSize: "11px" }}
        >
          {record.ecc_cnc &&
            ((record.permit_process === "ECC Online" ||
              record.permit_process === "ECC Manual") &&
            typeof record.ecc_cnc === "string" &&
            (record.ecc_cnc.includes("ECC-OL") ||
              record.ecc_cnc.includes("R3") ||
              record.ecc_cnc.includes("03") ||
              record.ecc_cnc.includes("III") ||
              record.ecc_cnc.includes("RO3") ||
              record.ecc_cnc.includes("ECC")) ? (
              <Tooltip
                title={
                  <div className="tooltip-content" style={{ fontSize: "11px" }}>
                    <div>ECC Information</div>
                    <div>Reference No.: {record.ecc_cnc}</div>
                    <div>Date Approved: {record.date_approved}</div>
                    <div>Date Amended: {record.date_amend}</div>
                  </div>
                }
                color="#0b5f74"
              >
                <Button
                  type="text"
                  className="custom-button-green"
                  size="small"
                >
                  ECC
                </Button>
              </Tooltip>
            ) : typeof record.ecc_cnc === "string" &&
              (record.ecc_cnc.includes("CNC") ||
                record.ecc_cnc.includes("R03")) ? (
              <Tooltip
                title={
                  <div className="tooltip-content" style={{ fontSize: "11px" }}>
                    <div>CNC Information</div>
                    <div>Code: {record.ecc_cnc}</div>
                    <div>Date Issued: {record.date_approved}</div>
                  </div>
                }
                color="#bc6e00"
              >
                <Button
                  type="text"
                  className="custom-button-yellow"
                  size="small"
                >
                  CNC
                </Button>
              </Tooltip>
            ) : null)}

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
              <Button type="text" className="custom-button-blue" size="small">
                {typeof record.pto_code === "string" &&
                (record.pto_code.includes("POA") ||
                  record.pto_code.includes("PTO") ||
                  record.pto_code.includes("FLA"))
                  ? "PTO"
                  : record.pto_code}
              </Button>
            </Tooltip>
          )}

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
              <Button type="text" className="custom-button-orange" size="small">
                {typeof record.wwdp_code === "string" &&
                record.wwdp_code.includes("DP")
                  ? "WWDP"
                  : record.wwdp_code}
              </Button>
            </Tooltip>
          )}

          {record.haz_id && (
            <Tooltip
              title={
                <div style={{ fontSize: "11px" }}>
                  <div>HWG ID Information</div>
                  <div>Code: {record.haz_id}</div>
                  <div>Date Issued: {record.haz_issued}</div>
                </div>
              }
              color="#415e20"
            >
              <Button
                type="text"
                className="custom-button-skyblue"
                size="small"
              >
                {typeof record.haz_id === "string" &&
                (record.haz_id.includes("GR") ||
                  record.haz_id.includes("M-GR") ||
                  record.pto_code.includes("OL-GR") ||
                  record.pto_code.includes("HW"))
                  ? "HWG ID"
                  : record.haz_id}
              </Button>
            </Tooltip>
          )}

          {record.tsd_ref_no && (
            <Tooltip
              title={
                <div style={{ fontSize: "11px" }}>
                  <div>TSD Information</div>
                  <div>Code: {record.tsd_ref_no}</div>
                  <div>Date of Expiration: {record.tsd_expiration}</div>
                </div>
              }
              color="#542c14"
            >
              <Button type="text" className="custom-button-brown" size="small">
                {typeof record.tsd_ref_no === "string" &&
                (record.tsd_ref_no.includes("TR") ||
                  record.tsd_ref_no.includes("OL-TR"))
                  ? "TSD ID"
                  : record.tsd_ref_no}
              </Button>
            </Tooltip>
          )}

          {record.tp_trc_ref_no && (
            <Tooltip
              title={
                <div style={{ fontSize: "11px" }}>
                  <div>TP/TRC Information</div>
                  <div>Code: {record.tp_trc_ref_no}</div>
                  <div>Date of Expiration: {record.tp_trc_expiration}</div>
                </div>
              }
              color="#242726"
            >
              <Button type="text" className="custom-button-stone" size="small">
                {typeof record.tp_trc_ref_no === "string" &&
                (record.tp_trc_ref_no.includes("TR") ||
                  record.tp_trc_ref_no.includes("OL-TP") ||
                  record.tp_trc_ref_no.includes("OL-PTT"))
                  ? "TP/TRC ID"
                  : record.tp_trc_ref_no}
              </Button>
            </Tooltip>
          )}

          {record.chemical_code && (
            <Tooltip
              title={
                <div>
                  <div>Chemical Permit/s Information</div>
                  <table>
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Element</th>
                        <th>Code</th>
                        <th>Permit Issued</th>
                        <th>Permit Expiration</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>{record.chemical_code.split("-")[0]}</td>
                        <td>{record.chemical_code.split("-")[2]}</td>
                        <td>{record.chemical_code}</td>
                        <td>{record.chem_permit_issued}</td>
                        <td>{record.chem_permit_exp}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              }
              color="#5e5d3e"
            >
              <Button type="text" className="custom-button-ash" size="small">
                {typeof record.chemical_code === "string" &&
                (record.chemical_code.includes("CCOr") ||
                  record.chemical_code.includes("CCOi") ||
                  record.chemical_code.includes("OL") ||
                  record.chemical_code.includes("PCL") ||
                  record.chemical_code.includes("SQI"))
                  ? "Chemical Permits"
                  : record.chemical_code}
              </Button>
            </Tooltip>
          )}

          {record.pco_no && (
            <Tooltip
              title={
                <div style={{ fontSize: "11px" }}>
                  <div>PCO Information</div>
                  <div>Code: {record.pco_no}</div>
                  <div>Name: {record.pco_name}</div>
                  <div>Tel. No: {record.pco_tel_no}</div>
                  <div>PCO Validity: {record.pco_validity}</div>
                </div>
              }
              color="#243d57"
            >
              <Button type="text" className="custom-button-slate" size="small">
                {typeof record.pco_no === "string" &&
                (record.pco_no.includes("PCO") ||
                  record.pco_no.includes("PCC") ||
                  record.pco_no.includes("A-PCO"))
                  ? "PCO ID"
                  : record.pco_no}
              </Button>
            </Tooltip>
          )}
        </div>
      ),
    },
    {
      title: "Section/Unit Incharged",
      key: "section_incharge",
      ...getColumnSearchProps("section_incharge"),
      render: (text, record) => {
        // Split sections by comma
        const sections = record.section_incharge
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
                    <div style={{ fontSize: "12px" }}>
                      {" "}
                      {/* Reduced font size */}
                      <div>Section Incharge: {record.section_incharge}</div>
                      <div>
                        FMR Section Incharge:{" "}
                        {record.fmr_section_incharged || "N/A"}
                      </div>
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
                      fontSize: "11px",
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
    },
    {
      title: "Remarks/Recommendations",
      key: "remarks_recommendations",
      ...getColumnSearchProps("remarks_recommendations"),
      render: (text, record) => (
        <div className="industry-label">{record.remarks_recommendations}</div>
      ),
      align: "left",
    },
    {
      title: "Monitoring Status",
      key: "iis_no",
      ...getColumnSearchProps("iis_no"),
      render: (text, record) => (
        <div className="industry-label">
          <a
            href={`https://iis.emb.gov.ph/embis/dms/documents/tracker/?trn_no=${encodeURIComponent(
              record.iis_no
            )}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {record.iis_no || ""}
          </a>

          {/* One-liner for each field */}
          <div>
            {/* Date Monitored */}
            {record.date_monitored && (
              <div>
                <Tooltip title="Date Monitored">
                  <MonitorOutlined
                    style={{ marginRight: 8, color: "#1890ff" }}
                  />{" "}
                  {/* Blue */}
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
                  {/* Green */}
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
                  {/* Yellow */}
                  {record.date_signed}
                </Tooltip>
              </div>
            )}
          </div>
        </div>
      ),
      width: 400, // Adjust as needed
      align: "left",
    },
    {
      title: "Actions",
      key: "actions",
      align: "center",
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
          onClick={handleReload}
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

        <Button type="primary" className="add-industry-button">
          Add Industry
        </Button>
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
              style={{ whiteSpace: "normal", textAlign: "right" }}
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
          style={{ marginLeft: "10px", padding: 0, marginRight: "0"}}
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
        <div
          className="total-count"
          style={{ margin: "10px 0", textAlign: "left" }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <h4 style={{ marginRight: 16 }}>
              Industry Count: {filteredData.length}
            </h4>
            <div style={{ display: "flex", alignItems: "center" }}>
              {inputVisible ? (
                <Input
                  ref={inputRef}
                  type="primary"
                  size="small"
                  style={{ width: 200 }}
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
            <div className="pagination-controls" style={{ marginLeft: "auto" }}>
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
              />
            </div>
          </div>
        </div>

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
