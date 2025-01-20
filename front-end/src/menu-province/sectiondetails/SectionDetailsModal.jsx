import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import {
  Modal,
  Table,
  Button,
  Tooltip,
  Pagination,
  Spin,
  Input,
  Checkbox,
  DatePicker,
  Select,
} from "antd"; // Import Ant Design components
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
  ExclamationCircleOutlined,
} from "@ant-design/icons";
import "./sectiondetailsmodal.css";
import ProvinceModal from "../ProvinceModal";
import moment from "moment"; // For date comparison

const { RangePicker } = DatePicker;

const SectionDetailsModal = ({ visible, section, data, onClose, loading }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [searchText, setSearchText] = useState("");
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isDetailsModalVisible, setIsDetailsModalVisible] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [filteredData, setFilteredData] = useState(data); // Filtered data based on checkbox and dates
  const [originalData, setOriginalData] = useState(data); // Store the original dataset
  const [isChecked, setIsChecked] = useState(false); // Checkbox state
  const [dateRange, setDateRange] = useState([null, null]); // Date range for filtering (start, end)
  const [pismuTrackingFilter, setPismuTrackingFilter] = useState(null);

  // Filter the records based on the selected filters
  useEffect(() => {
    setOriginalData(data); // Ensure we always have the original data to work with
    filterRecords();
  }, [data]);

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
          value={selectedKeys[0]}
          onChange={(e) => {
            const value = e.target.value ? [e.target.value] : [];
            setSelectedKeys(value);
            // Filter the data based on the search input
            const filtered = value.length
              ? data.filter((record) =>
                  record[dataIndex]
                    .toString()
                    .toLowerCase()
                    .includes(value[0].toLowerCase())
                )
              : data;
            setFilteredData(filtered);
          }}
          placeholder={`Search ${dataIndex}`}
          style={{ marginBottom: 8, display: "block" }}
        />
        <Button
          type="primary"
          onClick={() => confirm()}
          icon={<SearchOutlined />}
          size="small"
          style={{ width: 90, marginRight: 8 }}
        >
          Search
        </Button>
        <Button
          onClick={() => {
            clearFilters();
            setFilteredData(data); // Reset filtered data to original data
          }}
          size="small"
        >
          Reset
        </Button>
      </div>
    ),
    filterIcon: (filtered) => (
      <SearchOutlined style={{ color: filtered ? "#1890ff" : undefined }} />
    ),
    onFilter: (value, record) => {
      return record[dataIndex]
        ? record[dataIndex]
            .toString()
            .toLowerCase()
            .includes(value.toLowerCase())
        : "";
    },
  });

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

  const handleActionClick = (record) => {
    setSelectedRecord(record);
    setIsModalVisible(true);
  };

  const handleModalClose = () => {
    setIsModalVisible(false);
    setSelectedRecord(null);
  };

  const handlePageChange = (page, pageSize) => {
    setCurrentPage(page);
    setPageSize(pageSize); // Update the page size when changed
  };

  // Paginate data (for the current page and page size)
  const paginatedData = filteredData.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  useEffect(() => {
    if (isChecked) {
      // Filter records where pismu_tracking is "✔"
      setFilteredData(data.filter((record) => record.pismu_tracking === "✔"));
    } else {
      // If checkbox is unchecked, show all records
      setFilteredData(data);
    }
  }, [isChecked, data]);

  // Checkbox change handler
  const handleCheckboxChange = (e) => {
    setIsChecked(e.target.checked);
  };

  const columns = [
    {
      title: "ID No.",
      dataIndex: "id_no",
      key: "id_no",
      align: "left",
      width: 60,
      render: (text) => <div className="industry-label">{text}</div>,
      ...getColumnSearchProps("id_no"),
    },
    {
      title: "Industry Details",
      key: "industryDetails",
      render: (text, record) => (
        <div className="industry-label">
          <strong>{record.title}</strong>
          <br />
          Proponent Name: <i className="monitoring-label">{record.name}</i>
          <br />
          Address: <span className="monitoring-label">{record.address}</span>
          <br />
          ECC/CNC Ref. No.:
          <a
            href={`https://ecconline.emb.gov.ph/live/Account/Login.aspx/`}
            target="_blank"
            rel="noopener noreferrer"
          >
            &nbsp;<span className="monitoring-label">{record.ecc_cnc}</span>
          </a>
        </div>
      ),
      align: "left",
      width: 500,
      ...getColumnSearchProps("industryDetails"),
    },
    {
      title: "Industry Classification",
      dataIndex: "industry_class",
      key: "industry_class",
      align: "left",
      width: 150,
      render: (text) => (
        <div className="industry-label monitoring-label">{text}</div>
      ),
      ...getColumnSearchProps("industry_class"),
    },
    {
      title: "Remarks/Recommendations",
      key: "remarks_recommendations",
      render: (text, record) => (
        <div className="industry-label monitoring-label">
          {record.remarks_recommendations}
        </div>
      ),
      align: "left",
      width: 100,
      ...getColumnSearchProps("remarks_recommendations"),
    },
    {
      title: "Section/Unit Incharged",
      key: "section_incharge",
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
                    <div style={{ fontSize: "10px" }}>
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
                      width: `${textWidth}px`, // Add some padding for better appearance
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
      align: "center",
      width: 200,
    },
    {
      title: "Monitoring Status",
      key: "monitoringStatus",
      align: "left",
      width: 300,
      render: (text, record) => (
        <div>
          <p className="monitoring-label">
            <MonitorOutlined style={{ marginRight: 8, color: "#1890ff" }} />
            Date Monitored:{" "}
            {record.date_monitored ? record.date_monitored : "N/A"}
          </p>

          <p className="monitoring-label">
            <GlobalOutlined style={{ marginRight: 8, color: "#52c41a" }} />
            Date Routed: {record.date_routed ? record.date_routed : "N/A"}
          </p>

          <p className="monitoring-label">
            <CheckCircleFilled style={{ marginRight: 8, color: "#faad14" }} />
            Date Signed: {record.date_signed ? record.date_signed : "N/A"}
          </p>

          <p>
            <Tooltip title="PISMU Tracking of Report">
              {record.pismu_tracking === "✔" ? (
                <span>
                  <CheckCircleFilled style={{ color: "#0D92F4" }} />{" "}
                  <span className="pismu-tracking-text">
                    Received by Planning Unit
                  </span>
                </span>
              ) : (
                <span></span>
              )}
            </Tooltip>
          </p>
        </div>
      ),
      filterDropdown: ({
        setSelectedKeys,
        selectedKeys,
        confirm,
        clearFilters,
      }) => {
        // Local state for managing the selected date field
        const [dateField, setDateField] = useState("date_monitored"); // Default to date_monitored
        const [dateRange, setDateRange] = useState([null, null]); // Local date range state

        // Handle date range change
        const handleDateRangeChange = (dates) => {
          setDateRange(dates);
          setSelectedKeys(dates && dates.length ? [dates] : []); // Update Ant Design's filter state
        };

        // Apply the selected date range filter
        const handleFilter = () => {
          if (dateRange && dateRange[0] && dateRange[1]) {
            confirm(); // Apply the filter
          }
        };

        return (
          <div
            style={{
              padding: 8,
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            {/* Dropdown to select the date field */}
            <Select
              size="small"
              defaultValue="date_monitored"
              style={{ width: 200 }}
              onChange={(value) => setDateField(value)}
            >
              <Select.Option value="date_monitored">
                Date Monitored
              </Select.Option>
              <Select.Option value="date_routed">Date Routed</Select.Option>
              <Select.Option value="date_signed">Date Signed</Select.Option>
            </Select>

            {/* Date Range Picker */}
            <DatePicker.RangePicker
              size="small"
              style={{ width: 200 }}
              value={dateRange}
              onChange={handleDateRangeChange}
            />

            {/* Action Buttons */}
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <Button
                type="primary"
                onClick={handleFilter}
                icon={<SearchOutlined />}
                size="small"
                style={{ width: 90 }}
              >
                Search
              </Button>
              <Button
                onClick={() => {
                  clearFilters(); // Clear Ant Design's filter state
                  setDateRange([null, null]); // Clear local date range
                  setFilteredData(data); // Reset filtered data to original data
                }}
                size="small"
              >
                Reset
              </Button>
            </div>
          </div>
        );
      },
      onFilter: (value, record) => {
        // Ensure value is an array
        if (!Array.isArray(value) || value.length !== 2) {
          return true; // No filter applied if value is not a valid array
        }

        const [start, end] = value; // Safely destructure start and end
        if (!start || !end) return true; // Skip filtering if dates are not set

        const selectedField = dateField || "date_monitored"; // Default to date_monitored
        const recordDate = record[selectedField]
          ? moment(record[selectedField])
          : null;
        return recordDate && recordDate.isBetween(start, end, "days", "[]");
      },
    },
    {
      title: "Actions",
      key: "actions",
      align: "center",
      width: 80,
      render: (text, record) => (
        <Tooltip title="View Details" style={{ fontSize: "11px" }}>
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
        onCancel={handleModalClose}
        width={1100}
        footer={null}
        zIndex={1050}
      >
        {selectedRecord && (
          <ProvinceModal
            visible={isModalVisible}
            record={selectedRecord}
            zIndex={1060} // Set a higher zIndex for the ProvinceModal so it stays above the SectionDetailsModal
          />
        )}
      </Modal>

      <Modal
        title={
          <div
            className="modal-title-container"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span className="modal-title" style={{ whiteSpace: "normal" }}>
              Result Details for {section}
            </span>
            <span
              className="modal-title"
              style={{
                whiteSpace: "normal",
                textAlign: "right",
                fontSize: "12px", // adjust size if needed
              }}
            >
              Records Found: {filteredData ? filteredData.length : 0}
            </span>
          </div>
        }
        open={visible}
        onCancel={onClose}
        footer={null}
        width={1200}
        destroyOnClose={true}
      >
        {loading ? (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              height: "300px",
            }}
          >
            <Spin size="small" />
          </div>
        ) : (
          <>
            {/* Checkbox for filtering by "Received by Planning" */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginBottom: "10px",
              }}
            >
              <Checkbox checked={isChecked} onChange={handleCheckboxChange}>
                Received by Planning Unit
              </Checkbox>
            </div>

            {/* Table to display filtered records */}
            {filteredData && filteredData.length > 0 ? (
              <>
                <Table
                  columns={columns}
                  dataSource={paginatedData}
                  rowKey="id_no"
                  pagination={false}
                  bordered
                />
                <Pagination
                  total={filteredData.length}
                  current={currentPage}
                  pageSize={pageSize}
                  onChange={handlePageChange}
                  showSizeChanger
                  pageSizeOptions={["5", "10", "20", "30"]}
                  style={{ marginTop: "20px" }}
                  size="small"
                />
              </>
            ) : (
              <div>No data available</div>
            )}
          </>
        )}
      </Modal>
    </>
  );
};

// PropTypes for validation
SectionDetailsModal.propTypes = {
  visible: PropTypes.bool.isRequired,
  section: PropTypes.string.isRequired,
  data: PropTypes.array.isRequired,
  onClose: PropTypes.func.isRequired,
  loading: PropTypes.bool.isRequired,
};

export default SectionDetailsModal;
