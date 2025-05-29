import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import {
  Modal,
  Table,
  Button,
  Tooltip,
  Input,
  Checkbox,
  DatePicker,
  Select,
  Typography,
  Space,
  Progress,
} from "antd";
import {
  ClockCircleFilled,
  SearchOutlined,
  EyeOutlined,
  MonitorOutlined,
  GlobalOutlined,
  CheckCircleFilled,
  CalendarOutlined,
  TagsOutlined,
} from "@ant-design/icons";
import "./sectiondetailsmodal.css";
import ProvinceModal from "../ProvinceModal";
import moment from "moment"; // For date comparison
import dayjs from "dayjs";

const { RangePicker } = DatePicker;

const SectionDetailsModal = ({ visible, section, count, data, onClose }) => {
  const [searchText, setSearchText] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [searchedColumn, setSearchedColumn] = useState("");
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [filteredData, setFilteredData] = useState(data); // Filtered data based on checkbox and dates
  const [originalData, setOriginalData] = useState(data); // Store the original dataset
  const [isChecked, setIsChecked] = useState(false); // Checkbox state
  const [dateRange, setDateRange] = useState([null, null]); // Date range for filtering (start, end)
  const [pismuTrackingFilter, setPismuTrackingFilter] = useState(null);
  const [dateField, setDateField] = useState("date_monitored");
  const [mainFilterText, setMainFilterText] = useState("");
  const [loading, setLoading] = useState(true); // Loading state
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Simulate data loading with progress
    let progressInterval;
    setLoading(true);
    setProgress(0);

    progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(progressInterval);

          // Filter data based on the section value
          const filtered =
            section === "NoSectionIncharged"
              ? data.filter(
                  (record) =>
                    !record.section_incharged || // Include records with no section_incharged field
                    record.section_incharged.trim() === ""
                )
              : data.filter(
                  (record) =>
                    record.section_incharged &&
                    record.section_incharged.toLowerCase() ===
                      section.toLowerCase()
                );

          setFilteredData(filtered); // Set the filtered data
          setLoading(false);
          return 100;
        }
        return prev + 10; // Increment progress by 10%
      });
    }, 200);

    return () => clearInterval(progressInterval);
  }, [data, section]);

  useEffect(() => {
    if (isChecked) {
      // Filter records where pismu_tracking is "✔"
      setFilteredData(data.filter((record) => record.pismu_tracking === "✔"));
    } else {
      // If checkbox is unchecked, show all records
      setFilteredData(data);
    }
  }, [isChecked, data]);

  useEffect(() => {
    // Filter the data based on the main filter text
    const filtered = data.filter((record) => {
      const searchText = mainFilterText.toLowerCase();
      return (
        record.id_no?.toString().toLowerCase().includes(searchText) ||
        record.title?.toLowerCase().includes(searchText) ||
        record.name?.toLowerCase().includes(searchText) ||
        record.address?.toLowerCase().includes(searchText) ||
        record.ecc_cnc?.toLowerCase().includes(searchText) ||
        record.industry_class?.toLowerCase().includes(searchText) ||
        record.remarks?.toLowerCase().includes(searchText) ||
        record.section_incharged?.toLowerCase().includes(searchText)
      );
    });
    setFilteredData(filtered);
  }, [mainFilterText, data]);

  // Checkbox change handler
  const handleCheckboxChange = (e) => {
    setIsChecked(e.target.checked);
  };

  // Filtering function
  const filterRecords = () => {
    let filtered = [...originalData]; // Work with a copy of the original data

    // Filter by Pismu Tracking (if checked)
    if (isChecked) {
      filtered = filtered.filter((record) => record.pismu_tracking === "✔");
    }

    // Filter by Date Range (date_monitored, date_routed, date_signed)
    if (dateRange[0] && dateRange[1]) {
      const start = moment(dateRange[0]).startOf("day");
      const end = moment(dateRange[1]).endOf("day");
      filtered = filtered.filter((record) => {
        const dateMonitored = record.date_monitored
          ? moment(record.date_monitored)
          : null;
        const dateRouted = record.date_routed
          ? moment(record.date_routed)
          : null;
        const dateSigned = record.date_signed
          ? moment(record.date_signed)
          : null;

        return (
          (dateMonitored && dateMonitored.isBetween(start, end, null, "[]")) ||
          (dateRouted && dateRouted.isBetween(start, end, null, "[]")) ||
          (dateSigned && dateSigned.isBetween(start, end, null, "[]"))
        );
      });
    }

    // Filter by pismu_tracking
    if (pismuTrackingFilter !== null) {
      filtered = filtered.filter((record) =>
        pismuTrackingFilter
          ? record.pismu_tracking === "✔"
          : record.pismu_tracking !== "✔"
      );
    }

    setFilteredData(filtered);
  };

  const getColumnSearchProps = (dataIndex) => ({
    filterDropdown: ({
      setSelectedKeys,
      selectedKeys,
      confirm,
      clearFilters,
    }) => (
      <div style={{ padding: 8 }}>
        <Input
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
    onFilter: (value, record) =>
      record[dataIndex]
        ? record[dataIndex]
            .toString()
            .toLowerCase()
            .includes(value.toLowerCase())
        : "",
    render: (text) =>
      searchedColumn === dataIndex ? (
        <span style={{ backgroundColor: "#ffc069", padding: 0 }}>{text}</span>
      ) : (
        text
      ),
  });

  const handleSearch = (selectedKeys, confirm, dataIndex) => {
    confirm();
    setSearchText(selectedKeys[0]);
    setSearchedColumn(dataIndex);
  };

  const handleReset = (clearFilters) => {
    clearFilters();
    setSearchText("");
  };

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

  const handleTableChange = (pagination, filters, sorter) => {
    // Apply filters to the data
    let filtered = [...data];

    // Filter by Industry Classification
    if (filters.industry_class) {
      filtered = filtered.filter((record) =>
        filters.industry_class.includes(record.industry_class)
      );
    }

    // Filter by Remarks/Recommendations
    if (filters.remarks) {
      filtered = filtered.filter((record) =>
        filters.remarks.includes(record.remarks)
      );
    }

    // Update the filtered data
    setFilteredData(filtered);
  };

  const handleActionClick = (record) => {
    setSelectedRecord(record); // Set the selected record
    setIsModalVisible(true); // Open the ProvinceModal
  };

  const handleModalClose = () => {
    setIsModalVisible(false); // Close the ProvinceModal
    setSelectedRecord(null);
  };

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
      title: "Industry Details",
      key: "industryDetails",
      render: (text, record) => (
        <div className="industry-details">
          <strong>{record.title}</strong>
          <br />
          Proponent Name: <i className="monitoring-label">{record.name}</i>
          <br />
          Address: <span className="monitoring-label">{record.address}</span>
          <br />
          ECC/CNC Ref. No.:{" "}
          <a
            href={`https://ecconline.emb.gov.ph/live/Account/Login.aspx/`}
            target="_blank"
            rel="noopener noreferrer"
            className="ecc-link"
          >
            &nbsp;<span className="monitoring-label">{record.ecc_cnc}</span>
          </a>
        </div>
      ),
      width: 300,
      align: "center",
    },
    {
      title: "Industry Classification",
      dataIndex: "industry_class",
      key: "industry_class",
      align: "center",
      width: 150,
      filters: Array.from(
        new Set(data.map((record) => record.industry_class).filter(Boolean))
      ).map((industry) => ({
        text: industry,
        value: industry,
      })),
      onFilter: (value, record) => record.industry_class === value,
      render: (text) => (
        <div
          className="left-align"
          style={{
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {text}
        </div>
      ),
      filterDropdown: ({
        setSelectedKeys,
        selectedKeys,
        confirm,
        clearFilters,
      }) => (
        <div style={{ padding: 8, width: 150 /* Reduced width */ }}>
          <Select
            style={{ width: "100%" }}
            placeholder="Select Industry"
            value={selectedKeys[0]}
            onChange={(value) => setSelectedKeys(value ? [value] : [])}
            onSelect={() => confirm()}
            allowClear
            dropdownStyle={{
              maxWidth: 200, // Limit dropdown width
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {Array.from(
              new Set(
                data.map((record) => record.industry_class).filter(Boolean)
              )
            ).map((industry) => (
              <Select.Option
                key={industry}
                value={industry}
                style={{
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {industry}
              </Select.Option>
            ))}
          </Select>
          <div style={{ marginTop: 8, textAlign: "right" }}>
            <Button
              type="primary"
              size="small"
              onClick={() => {
                clearFilters();
                setSelectedKeys([]);
                confirm();
              }}
            >
              Reset
            </Button>
          </div>
        </div>
      ),
    },
    {
      title: "Permits/Clearances",
      key: "permits_clearances",
      align: "center",
      width: 150,
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
      title: "Remarks/Recommendations",
      dataIndex: "remarks",
      key: "remarks",
      align: "center",
      width: 150,
      filters: Array.from(
        new Set(data.map((record) => record.remarks).filter(Boolean))
      ).map((remark) => ({
        text: remark,
        value: remark,
      })),
      onFilter: (value, record) => record.remarks === value,
      render: (text) => <div className="remarks-label">{text}</div>,
    },
    {
      title: "Section/Unit Incharged",
      key: "section_incharge",
      align: "center",
      width: 150,
      render: (text, record) => {
        const sections = record.section_incharged
          ? record.section_incharged.split(",").map((section) => section.trim())
          : ["N/A"];

        return (
          <div className="section-container">
            {sections.map((section, index) => {
              const backgroundColor = sectionBackgroundColor(section);
              const tooltipColor = darkenColor(backgroundColor, -40);

              return (
                <Tooltip
                  key={index}
                  title={
                    <div className="tooltip-content">
                      <div>Section Incharge: {record.section_incharged}</div>
                      <div>Handler: {record.handler || "N/A"}</div>
                      <div>
                        Monitoring Schedule: {record.monitoring_sched || "N/A"}
                      </div>
                      <div>Inspection Type: {record.insp_type || "N/A"}</div>
                    </div>
                  }
                  color={tooltipColor}
                >
                  <div
                    className="section-tag"
                    style={{ backgroundColor: backgroundColor }}
                  >
                    {section}
                  </div>
                </Tooltip>
              );
            })}
          </div>
        );
      },
    },
    {
      title: "Monitoring Status",
      key: "monitoringStatus",
      align: "center",
      width: 200,
      filterDropdown: ({
        setSelectedKeys,
        selectedKeys,
        confirm,
        clearFilters,
      }) => (
        <div style={{ padding: 8, width: 200 }}>
          <RangePicker
            value={selectedKeys[0] || null}
            onChange={(dates) => {
              setSelectedKeys(dates ? [dates] : []);
            }}
            style={{ marginBottom: 8, fontSize: "10px" }}
            size="small"
            format="MM/DD/YYYY"
          />
          <Button
            type="primary"
            onClick={() => confirm()}
            icon={<SearchOutlined />}
            size="small"
            style={{ marginRight: 8 }}
          >
            Filter
          </Button>
          <Button onClick={() => clearFilters()} size="small">
            Reset
          </Button>
        </div>
      ),
      filterIcon: (filtered) => (
        <CalendarOutlined style={{ color: filtered ? "#1890ff" : undefined }} />
      ),
      render: (text, record) => (
        <div className="monitoring-status-container">
          {/* Date Monitored */}
          <p className="monitoring-label">
            <Tooltip
              title={<div style={{ fontSize: "10px" }}>Date Monitored</div>}
              color="#1890ff"
            >
              <MonitorOutlined style={{ marginRight: 8, color: "#1890ff" }} />
            </Tooltip>
            {record.date_monitored || "N/A"}
          </p>

          {/* Date Routed */}
          <p className="monitoring-label">
            <Tooltip
              title={<div style={{ fontSize: "10px" }}>Date Routed to IIS</div>}
              color="#52c41a"
            >
              <GlobalOutlined style={{ marginRight: 8, color: "#52c41a" }} />
            </Tooltip>
            {record.date_routed || "N/A"}
          </p>

          {/* Date Signed */}
          <p className="monitoring-label">
            <Tooltip
              title={<div style={{ fontSize: "10px" }}>Date Report Signed</div>}
              color="#faad14"
            >
              <CheckCircleFilled style={{ marginRight: 8, color: "#faad14" }} />
            </Tooltip>
            {record.date_signed || "N/A"}
          </p>

          {/* IIS No. 2024 */}
          {record.iis_no && record.iis_no !== "N/A" && (
            <p className="monitoring-label">
              <Tooltip
                title={<div style={{ fontSize: "10px" }}>IIS No. (2024)</div>}
                color="#1890ff"
              >
                <TagsOutlined style={{ color: "#1890ff", marginRight: 8 }} />
              </Tooltip>
              {record.iis_no.split(/\s+/).map((iis, index) => (
                <span key={index}>
                  <a
                    href={`https://iis.emb.gov.ph/embis/dms/documents/tracker/?trn_no=${encodeURIComponent(
                      iis.trim()
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: "#1890ff",
                      textDecoration: "none",
                    }}
                    className="iis-link"
                  >
                    {iis.trim()}
                  </a>
                  <br />
                </span>
              ))}
            </p>
          )}

          {/* IIS No. 2025 */}
          {record.iis_no_2025 && record.iis_no_2025 !== "N/A" && (
            <p className="monitoring-label">
              <Tooltip
                title={<div style={{ fontSize: "10px" }}>IIS No. (2025)</div>}
                color="#52c41a"
              >
                <TagsOutlined style={{ color: "#52c41a", marginRight: 8 }} />
              </Tooltip>
              {record.iis_no_2025.split(/\s+/).map((iis, index) => (
                <span key={index}>
                  <a
                    href={`https://iis.emb.gov.ph/embis/dms/documents/tracker/?trn_no=${encodeURIComponent(
                      iis.trim()
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: "#52c41a",
                      textDecoration: "none",
                    }}
                    className="iis-link"
                  >
                    {iis.trim()}
                  </a>
                  <br />
                </span>
              ))}
            </p>
          )}

          {/* PISMU Tracking */}
          {record.pismu_tracking && record.pismu_tracking !== "none" && (
            <p className="monitoring-label">
              <Tooltip
                title={
                  <div style={{ fontSize: "10px" }}>Received by PISMU</div>
                }
                color="#0D92F4"
              >
                <span>
                  <CheckCircleFilled
                    style={{ color: "#0D92F4", marginRight: 8 }}
                  />
                  <span>Received by Planning Unit</span>
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
      width: 80,
      render: (text, record) => (
        <Tooltip title="View Details">
          <Button
            icon={<EyeOutlined />}
            onClick={() => handleActionClick(record)}
            type="primary"
            className="btn-action"
            size="small"
          />
        </Tooltip>
      ),
    },
  ];

  return (
    <>
      {/* SectionDetailsModal */}
      <Modal
        open={visible}
        onCancel={onClose}
        footer={null}
        width={1400}
        style={{
          height: "90vh", // Set modal height to 80% of viewport
          maxHeight: "90vh",
          overflow: "hidden",
          padding: "16px",
        }}
        title={
          <div className="modal-header">
            <div className="modal-header-left">
              <Typography.Title level={4} className="modal-title">
                Industries Incharged to: {section}
              </Typography.Title>
              <Input
                placeholder="Search within industries..."
                value={mainFilterText}
                onChange={(e) => setMainFilterText(e.target.value)}
                prefix={<SearchOutlined />}
                style={{
                  width: "300px",
                  marginTop: "8px",
                }}
              />
            </div>
            <div className="modal-header-right">
              <Typography.Text className="modal-count">
                Industry Count: {filteredData.length}
              </Typography.Text>
            </div>
          </div>
        }
      >
        {loading ? (
          <div style={{ textAlign: "center", padding: "20px" }}>
            <span>Loading Section Data...</span> <br />
            <Progress
              percent={progress}
              style={{ marginTop: "16px", width: "50%" }}
            />
          </div>
        ) : (
          <Table
            columns={columns}
            dataSource={filteredData}
            rowKey="id_no"
            pagination={{
              position: ["topRight"],
              size: "small",
              simple: true,
            }}
            scroll={{
              y: "70vh",
            }}
            className="custom-table-section"
            onChange={handleTableChange}
          />
        )}
      </Modal>

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
        onCancel={handleModalClose}
        width={1100}
        footer={null}
        zIndex={1050} // Ensure it appears above other modals
      >
        {selectedRecord && (
          <ProvinceModal visible={isModalVisible} record={selectedRecord} />
        )}
      </Modal>
    </>
  );
};

export default SectionDetailsModal;
