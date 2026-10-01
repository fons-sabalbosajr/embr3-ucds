import React, { useState, useEffect } from "react";
import { Table, Input, DatePicker, Select } from "antd";
import axios from "axios";
import moment from "moment";
import "./activitlylog.css";
import { API_BASE_URL } from "../../config/api";

const { RangePicker } = DatePicker;
const { Option } = Select;

const ActivityLog = ({ theme }) => {
  const [logs, setLogs] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [filteredLogs, setFilteredLogs] = useState([]);
  const [dateRange, setDateRange] = useState([null, null]);
  const [selectedMethod, setSelectedMethod] = useState("");

  useEffect(() => {
    // Fetch logs from the API
    const fetchLogs = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/api/logs`);
        //console.log("Fetched logs:", response.data); // Log the fetched data
        setLogs(response.data);
        setFilteredLogs(response.data);
      } catch (error) {
        console.error("Failed to fetch logs:", error);
      }
    };

    fetchLogs();
  }, []);

  useEffect(() => {
    const filtered = logs.filter((log) => {
      const matchesSearchText =
        log.username?.toLowerCase().includes(searchText.toLowerCase()) ||
        log.actionType?.toLowerCase().includes(searchText.toLowerCase()) ||
        false;

      const [startDate, endDate] =
        dateRange.length === 2 ? dateRange : [null, null];
      const logDate = moment(log.timestamp);
      const matchesDateRange =
        startDate && endDate
          ? logDate.isBetween(
              moment(startDate),
              moment(endDate).endOf("day"),
              null,
              "[]"
            )
          : true;

      const matchesMethod = selectedMethod
        ? log.method === selectedMethod
        : true;

      return matchesSearchText && matchesDateRange && matchesMethod;
    });
    setFilteredLogs(filtered);
  }, [searchText, dateRange, selectedMethod, logs]);

  const removeCurlyBraces = (str) => {
    let obj;
    try {
      obj = JSON.parse(str);
    } catch {
      return str;
    }
    return Object.entries(obj)
      .map(([key, value]) => `${key}: ${value}`)
      .join("\n");
  };


  const getMethodStyle = (method) => {
    switch (method) {
      case "GET":
        return {
          backgroundColor: "#d4edda",
          color: "#155724",
          borderRadius: "4px",
        }; // Green background for GET
      case "POST":
        return {
          backgroundColor: "#cce5ff",
          color: "#004085",
          borderRadius: "4px",
        }; // Blue background for POST
      case "PUT":
        return {
          backgroundColor: "#fff3cd",
          color: "#856404",
          borderRadius: "4px",
        }; // Yellow background for PUT
      case "DELETE":
        return {
          backgroundColor: "#f8d7da",
          color: "#721c24",
          borderRadius: "4px",
        }; // Red background for DELETE
      default:
        return {
          backgroundColor: "#e2e3e5",
          color: "#383d41",
          borderRadius: "4px",
        }; // Default background for other methods
    }
  };

  const getDropdownStyle = (method) => {
    switch (method) {
      case "GET":
        return { backgroundColor: "#d4edda", color: "#155724" }; // Green background for GET
      case "POST":
        return { backgroundColor: "#cce5ff", color: "#004085" }; // Blue background for POST
      case "PUT":
        return { backgroundColor: "#fff3cd", color: "#856404" }; // Yellow background for PUT
      case "DELETE":
        return { backgroundColor: "#f8d7da", color: "#721c24" }; // Red background for DELETE
      default:
        return { backgroundColor: "#e2e3e5", color: "#383d41" }; // Default background for other methods
    }
  };

  const columns = [
    {
      title: "Timestamp",
      dataIndex: "timestamp",
      key: "timestamp",
      align: "left",
      render: (text) => moment(text).format("YYYY-MM-DD hh:mm:ss A"),
    },
    {
      title: "Username",
      dataIndex: "username",
      key: "username",
      align: "left",
    },
    {
      title: "Action Type",
      dataIndex: "actionType",
      key: "actionType",
      align: "left",
    },
    {
      title: "Method",
      dataIndex: "method",
      key: "method",
      render: (text) => <div style={getMethodStyle(text)}>{text}</div>,
    },
    {
      title: "Path",
      dataIndex: "path",
      key: "path",
      align: "left",
    },
    {
      title: "Request Data",
      dataIndex: "requestData",
      key: "requestData",
      render: (text) => removeCurlyBraces(JSON.stringify(text)),
      align: "left",
    },
  ];


  return (
    <div
    style={{
      backgroundColor: theme === "dark" ? "#121212" : "#ffffff",
      color: theme === "dark" ? "#e0e0e0" : "#000000",
      padding: "16px",
      borderRadius: "8px",
    }}
  >
    <Input
      placeholder="Search logs"
      value={searchText}
      onChange={(e) => setSearchText(e.target.value)}
      style={{
        marginBottom: 16,
        width: 300,
        backgroundColor: theme === "dark" ? "#1e1e1e" : "#ffffff",
        color: theme === "dark" ? "#e0e0e0" : "#000000",
      }}
    />
    <RangePicker
      onChange={(dates) => setDateRange(dates)}
      style={{
        marginBottom: 16,
        marginLeft: 16,
        backgroundColor: theme === "dark" ? "#1e1e1e" : "#ffffff",
      }}
    />
    <Select
      placeholder="Select method"
      style={{
        width: 200,
        marginBottom: 16,
        marginLeft: 16,
        backgroundColor: theme === "dark" ? "#1e1e1e" : "#ffffff",
        color: theme === "dark" ? "#e0e0e0" : "#000000",
      }}
      onChange={(value) => setSelectedMethod(value)}
      allowClear
    >
      <Option value="">All Activities</Option>
      <Option value="GET">Load Data</Option>
      <Option value="POST">Added Data</Option>
      <Option value="PUT">Update Data</Option>
      <Option value="DELETE">Delete Data</Option>
    </Select>
    <Table
      columns={columns}
      dataSource={filteredLogs}
      rowKey="_id"
      pagination={{ defaultPageSize: 10 }}
      className="activitylog-table"
      style={{
        backgroundColor: theme === "dark" ? "#1e1e1e" : "#ffffff",
        color: theme === "dark" ? "#e0e0e0" : "#000000",
      }}
    />
  </div>
  );
};

export default ActivityLog;
