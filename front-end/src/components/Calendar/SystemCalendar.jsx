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
} from "antd";
import { DownOutlined, SearchOutlined } from "@ant-design/icons";
import axios from "axios";
import moment from "moment";
import "./systemcalendar.css";

const { Search } = Input;

const SystemCalendar = () => {
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
          " http://localhost:8081/api/monitored_dates"
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
                href={`https://iis.emb.gov.ph/embis/`}
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

  const columns = [
    {
      title: "Title",
      dataIndex: "title",
      key: "title",
      render: (text) => <Typography.Text strong>{text}</Typography.Text>,
      width: "200px",
    },
    {
      title: "Address",
      dataIndex: "address",
      key: "address",
      width: "200px",
    },
    {
      title: "Industry Class",
      dataIndex: "industry_class",
      key: "industry_class",
    },
    {
      title: "Date Monitored",
      dataIndex: "date_monitored",
      key: "date_monitored",
    },
    {
      title: "Date Routed to IIS",
      dataIndex: "date_routed",
      key: "date_routed",
      width: "150px",
    },
    {
      title: "IIS No",
      dataIndex: "iis_no",
      key: "iis_no",
      width: "150px",
      render: (text) => renderIISNo(text),
    },
    {
      title: "Section Incharge",
      dataIndex: "section_incharge",
      key: "section_incharge",
      width: "100px",
    },
    {
      title: "Remarks/Recommendation",
      dataIndex: "remarks_recommendation",
      key: "remarks_recommendation",
    },
    {
      title: "Actions",
      key: "actions",
      render: (text, record) => (
        <Dropdown
          overlay={menu(record)}
          trigger={["click"]}
          placement="bottomCenter"
        >
          <Button type="primary" icon={<DownOutlined />}>
            Generate
          </Button>
        </Dropdown>
      ),
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

  const data = selectedNotices.map((notice, index) => ({
    ...notice,
    key: index,
  }));

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

    const displayNotices = dailyNotices.slice(0, 1); // Display only the first 2 notices

    return (
      <div className={hasData ? "clickable-date" : ""}>
        <ul className="events">
          {displayNotices.length > 0 &&
            displayNotices.map((notice, index) => (
              <li key={index}>
                <Badge status="success" text={notice.title} />
              </li>
            ))}
          {dailyNotices.length > 1 && (
            <li className="see-more">See {dailyNotices.length - 1} more...</li>
          )}
        </ul>
      </div>
    );
  };

  return (
    <div className="calendar-container">
      <h2 className="calendar-title">Monitoring Calendar</h2>
      <Calendar onSelect={onSelect} cellRender={dateCellRender} />
      <Modal
        title={`Monitored Industries as of ${selectedDate}`}
        visible={isModalVisible}
        onCancel={handleCancel}
        footer={null}
        width={1600} // Adjust width as needed
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
            style={{ width: 500 }}
          />
        </div>
        <Table
          columns={columns}
          dataSource={searchText ? filteredData : selectedNotices}
          pagination={{ pageSize: 10 }}
        />
      </Modal>
    </div>
  );
};

export default SystemCalendar;
