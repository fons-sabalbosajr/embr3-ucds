import React, { useState, useEffect } from "react";
import {
  Calendar,
  Modal,
  Table,
  Typography,
  Dropdown,
  Menu,
  Button,
  Badge,
  Input,
  Tooltip,
} from "antd";
import { DownOutlined, SearchOutlined } from "@ant-design/icons";
import axios from "axios";
import moment from "moment";
import "./systemcalendar.css";

const { Search } = Input;

const SystemCalendar = ({ theme }) => {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedNotices, setSelectedNotices] = useState([]);
  const [notices, setNotices] = useState([]);
  const [monitoredDates, setMonitoredDates] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [filteredData, setFilteredData] = useState([]);

  useEffect(() => {
    const fetchMonitoredDates = async () => {
      try {
        const response = await axios.get(
          "http://localhost:8081/api/monitored_dates"
        );
        setMonitoredDates(response.data.monitoredDates || []);
      } catch (error) {
        console.error("Error fetching monitored dates:", error);
      }
    };

    const fetchDailyNotices = async () => {
      try {
        const response = await axios.get(
          " http://localhost:8081/api/daily_notices"
        );
        setNotices(response.data.notices || []);
      } catch (error) {
        console.error("Error fetching daily notices:", error);
      }
    };

    fetchMonitoredDates();
    fetchDailyNotices();
  }, []);

  const renderIISNo = (text) => {
    if (!text) {
      console.warn("Text is undefined or null:", text);
      return null; // Or any fallback UI you want to show
    }

    // Split the text based on the pattern ICIR: and Survey:
    const parts = text.split(/ICIR:|Survey:/);

    return (
      <Typography.Text
        style={{ whiteSpace: "pre-wrap", width: "200px", display: "block" }}
      >
        {parts.map((part, index) => {
          // Check if the part matches the format you want to hyperlink
          if (/^R\d{1}-\d{4}-\d{6}$/.test(part.trim())) {
            return (
              <a
                key={index}
                href={`https://iis.emb.gov.ph/embis/dms/documents/tracker/?trn_no=${encodeURIComponent(
                  part.trim()
                )}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {part}
              </a>
            );
          } else {
            return part;
          }
        })}
      </Typography.Text>
    );
  };

  const handleSearch = (value) => {
    setSearchText(value);
    filterTableData(value);
  };

  const filterTableData = (value) => {
    const lowercasedValue = value.toLowerCase().trim();
    if (lowercasedValue === "") {
      setFilteredData(selectedNotices); // Reset to show all items when search text is empty
    } else {
      const filteredDataSource = selectedNotices.filter((item) =>
        Object.keys(item).some((key) =>
          item[key]?.toString().toLowerCase().includes(lowercasedValue)
        )
      );
      setFilteredData(filteredDataSource);
    }
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

      case "PEMU_Nueva_Ecija":
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

  const measureTextWidth = (text, font = "14px Poppins") => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    context.font = font;
    return context.measureText(text).width;
  };

  const columns = [
    {
      title: "Title",
      dataIndex: "title",
      key: "title",
      render: (text) => <Typography.Text strong>{text}</Typography.Text>,
      width: "200px",
      align: "left",
    },
    {
      title: "Address",
      dataIndex: "address",
      key: "address",
      width: "200px",
      align: "left",
    },
    {
      title: "Industry Class",
      dataIndex: "industry_class",
      key: "industry_class",
      align: "left",
    },
    {
      title: "Date Monitored",
      dataIndex: "date_monitored",
      key: "date_monitored",
      align: "left",
    },
    {
      title: "Date Routed to IIS",
      dataIndex: "date_routed",
      key: "date_routed",
      width: "150px",
      align: "left",
    },
    {
      title: "IIS No",
      dataIndex: "iis_no",
      key: "iis_no",
      width: "150px",
      render: (text) => renderIISNo(text),
      align: "left",
    },
    {
      title: "Section Incharge",
      dataIndex: "section_incharge",
      key: "section_incharge",
      width: "150px",
      align: "left",
      render: (text, record) => {
        // Ensure section_incharge is defined and not empty
        const sections = record.section_incharge
          ? record.section_incharge.split(",").map((section) => section.trim())
          : [];

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
                      <div>
                        Section Incharge: {record.section_incharge || "N/A"}
                      </div>
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
                  color={darkerBackgroundColor}
                >
                  <div
                    className="industry-label"
                    style={{
                      backgroundColor: backgroundColor,
                      padding: "5px",
                      margin: "2px",
                      width: `${textWidth + 10}px`,
                      display: "inline-block",
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      borderRadius: "5px",
                      cursor: "pointer",
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
    },
    {
      title: "Remarks/Recommendation",
      dataIndex: "remarks_recommendation",
      key: "remarks_recommendation",
      align: "left",
    },
  ];

  const handleGenerateICIR = (notice) => {
    // Implement your logic for Generate ICIR here
    console.log("Generating ICIR for:", notice);
  };

  const handleGenerateIC = (notice) => {
    // Implement your logic for Generate IC here
    console.log("Generating IC for:", notice);
  };

  const handleGenerateCIC = (notice) => {
    // Implement your logic for Generate CIC here
    console.log("Generating CIC for:", notice);
  };

  const menu = (record) => (
    <Menu>
      <Menu.Item key="icir" onClick={() => handleGenerateICIR(record)}>
        Generate ICIR
      </Menu.Item>
      <Menu.Item key="ic" onClick={() => handleGenerateIC(record)}>
        Generate IC
      </Menu.Item>
      <Menu.Item key="cic" onClick={() => handleGenerateCIC(record)}>
        Generate CIC
      </Menu.Item>
    </Menu>
  );

  const onSelect = (date) => {
    const formattedDate = date.format("M/DD/YYYY");
    const dailyNotices = notices.filter(
      (notice) => notice.date_monitored === formattedDate
    );
    const monitoredTitle = monitoredDates.find(
      (item) => item.date_monitored === formattedDate
    )?.title;

    if (dailyNotices.length > 0 || monitoredTitle) {
      setSelectedDate(formattedDate);
      setSelectedNotices(dailyNotices);
      setFilteredData(dailyNotices); // Set filtered data for the selected date
      setIsModalVisible(true);
    }
  };

  const handleCancel = () => {
    setIsModalVisible(false);
    setSelectedDate("");
    setSelectedNotices([]);
    setSearchText(""); // Clear search text when modal is closed
    setFilteredData([]); // Clear filtered data
  };

  const dateCellRender = (date) => {
    const formattedDate = date.format("M/DD/YYYY");
    let dailyNotices = notices.filter(
      (notice) => notice.date_monitored === formattedDate
    );
    const monitoredTitle = monitoredDates.find(
      (item) => item.date_monitored === formattedDate
    )?.title;
    const hasData = dailyNotices.length > 0 || monitoredTitle;

    // Sort notices to prioritize those with non-empty titles
    dailyNotices = dailyNotices.sort((a, b) => {
      if (a.title && !b.title) return -1;
      if (!a.title && b.title) return 1;
      return 0;
    });

    const displayNotices = dailyNotices.slice(0, 3); // Display only the first 2 notices

    return (
      <div className={hasData ? "clickable-date" : ""}>
        <ul className="events" style={{ padding: "0", margin: "0" }}>
          {displayNotices.length > 0 &&
            displayNotices.map((notice, index) => (
              <li
                key={index}
                style={{
                  fontSize: "9px", // Further reduced font size for event titles
                  lineHeight: "1.1", // Adjust line height for better spacing
                  marginBottom: "1px", // Reduce spacing between events
                  overflow: "hidden", // Hide overflow text
                  textOverflow: "ellipsis", // Add ellipsis for long text
                  whiteSpace: "nowrap", // Prevent text wrapping
                }}
              >
                <Badge
                  status="success"
                  text={
                    <span
                      style={{
                        fontSize: "9px", // Match event title font size
                        fontWeight: "400",
                        verticalAlign: "middle",
                        color: theme === "dark" ? "#ffffff" : "#000000", // Adjust text color based on theme
                      }}
                    >
                      {notice.title}
                    </span>
                  }
                  className="event-title"
                  style={{
                    fontSize: "9px", // Match event title font size
                  }}
                />
              </li>
            ))}
          {dailyNotices.length > 1 && (
            <li className="see-more" style={{ fontSize: "9px" }}>See {dailyNotices.length - 1} more...</li>
          )}
        </ul>
      </div>
    );
  };

  return (
    <div
      className="calendar-container"
      style={{
        fontFamily: "Poppins, sans-serif",
        color: theme === "dark" ? "#ffffff" : "#000000", // Adjust font color based on theme
      }}
    >
      <h3
        className="calendar-title"
        style={{
          color: theme === "dark" ? "#ffffff" : "#000000", // Adjust title color based on theme
          fontSize: "16px",
        }}
      >
        Monitoring Calendar
      </h3>
      <Calendar
        onSelect={onSelect}
        cellRender={dateCellRender}
        className="custom-calendar"
        style={{
          backgroundColor: theme === "dark" ? "#121212" : "#ffffff",
          color: theme === "dark" ? "#ffffff" : "#000000", // Adjust calendar text color
          padding: "10px",
          borderRadius: "8px",
        }}
      />
      <Modal
        title={`Monitored Industries as of ${selectedDate}`}
        open={isModalVisible}
        onCancel={handleCancel}
        footer={null}
        width={1200} // Adjust modal width
        style={{
          color: theme === "dark" ? "#ffffff" : "#000000", // Adjust modal font color
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 20,
          }}
        >
          <Search
            placeholder="Search industries"
            onChange={(e) => handleSearch(e.target.value)}
            style={{
              width: 250, // Reduced search box width
              backgroundColor: theme === "dark" ? "#333333" : "#ffffff", // Adjust search box background
              color: theme === "dark" ? "#ffffff" : "#000000", // Adjust search box text color
              fontSize: "12px", // Reduced font size for the search box
            }}
            prefix={<SearchOutlined />}
            allowClear
            value={searchText}
          />
        </div>
        <Table
          dataSource={filteredData.length > 0 ? filteredData : selectedNotices}
          columns={columns}
          pagination={{ pageSize: 10 }}
          scroll={{ y: 700 }}
          size="small"
          className="custom-table"
          style={{
            backgroundColor: theme === "dark" ? "#1f1f1f" : "#ffffff", // Adjust table background
            color: theme === "dark" ? "#ffffff" : "#000000", // Adjust table text color
          }}
        />
      </Modal>
    </div>
  );
};

export default SystemCalendar;
