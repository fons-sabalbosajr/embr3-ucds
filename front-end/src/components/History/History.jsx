import React, { useEffect, useState } from "react";
import { Table, Button, Modal } from "antd";
import axios from "axios";
import {
  EyeFilled,
  PlusCircleFilled,
  EditFilled,
  ToTopOutlined,
  QuestionCircleOutlined,
} from "@ant-design/icons";
import { format } from "date-fns";
import "./history.css";

const Summary = () => {
  const [logs, setLogs] = useState([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalData, setModalData] = useState(null);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const response = await axios.get("https://embr3-ucds.onrender.com/api/logs", {
          withCredentials: true,
        });
        // Filter out logs where the username is "Anonymous"
        const filteredLogs = response.data.filter(
          (log) =>
            log.username !== "Anonymous" &&
            ["View Data", "Update Data"].includes(log.actionType)
        );
        setLogs(filteredLogs);
      } catch (error) {
        console.error("Error fetching logs:", error);
      }
    };

    fetchLogs();
  }, []);

  // Function to fetch user details based on username
  const fetchUserName = async (username) => {
    try {
      const response = await axios.get(
        `https://embr3-ucds.onrender.com/api/logs-users?username=${username}`
      );
      return response.data.name; // Adjust based on your API response structure
    } catch (error) {
      console.error("Error fetching user name:", error);
      return username; // Return the username if the fetch fails
    }
  };

  const showModal = async (record) => {
    const userName = await fetchUserName(record.username);
    const dataWithUserName = { ...record, username: userName };
    setModalData(dataWithUserName);
    setIsModalVisible(true);
  };

  const handleCancel = () => {
    setIsModalVisible(false);
    setModalData(null);
  };

  // Function to get the icon with the appropriate color based on action type
  const getIcon = (actionType) => {
    switch (actionType) {
      case "Update Data":
        return (
          <EditFilled
            style={{ color: "orange", fontSize: "20px", marginLeft: "-10px" }}
          />
        );
      case "Added Data":
        return (
          <PlusCircleFilled
            style={{ color: "green", fontSize: "20px", marginLeft: "-10px" }}
          />
        );
      case "Patch":
        return (
          <ToTopOutlined
            style={{ color: "purple", fontSize: "20px", marginLeft: "-10px" }}
          />
        );
      case "Unknown Action":
        return (
          <QuestionCircleOutlined
            style={{ color: "red", fontSize: "20px", marginLeft: "-10px" }}
          />
        );
      case "View Data":
        return (
          <EyeFilled
            style={{ color: "blue", fontSize: "20px", marginLeft: "-10px" }}
          />
        );
      default:
        return null;
    }
  };

  const formatTimestamp = (timestamp) => {
    return format(new Date(timestamp), "MMMM-dd-yyyy hh:mm a"); // Use date-fns format function
  };

  const columns = [
    {
      title: null, // Hide the header
      dataIndex: "message",
      key: "message",
      align: "left",
      width: 200,
      render: (text, record) => (
        <div className="card-container">
          <div className="card-header">
            {getIcon(record.actionType)}{" "}
            <span className="timestamp-container">
              {new Date(record.timestamp).toLocaleString("en-US", {
                month: "2-digit",
                day: "2-digit",
                year: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: true,
              })}
            </span>
          </div>
          <div className="card-body">
            <strong>{record.actionType}</strong>
            <div className="card-subtext">
              {record.username && (
                <div>
                  {record.username} •{" "}
                  {record.actionType === "Update"
                    ? record.requestData.project_title
                    : formatActionLabel(record.actionLabel)}
                </div>
              )}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "Actions",
      key: "actions",
      width: 100,
      render: (text, record) => (
        <div className="actions-container">
          <Button type="link" onClick={() => showModal(record)}>
            <EyeFilled className="view-details" />
          </Button>
        </div>
      ),
    },
  ];

  const modalColumns = [
    {
      title: "Field",
      dataIndex: "key",
      key: "key",
      align: "left",
      width: 150
    },
    {
      title: "Description",
      dataIndex: "value",
      key: "value",
      align: "left",
    },
  ];

  const getModalData = (data) => {
    if (!data) return [];
  
    // Define fields to exclude
    const fieldsToExclude = ["_id", "userId", "method", "path" ,"actionLabel"];
  
    // Define field name mappings
    const fieldMappings = {
      timestamp: "Date Modified",
      username: "Name",
      actionType: "Action Type",
      requestData: "Update Details",
      // Add other field mappings as needed
    };
  
    // Function to remove curly braces from a JSON string
    const removeCurlyBraces = (str) => {
      // Parse the string to a JSON object
      let obj;
      try {
        obj = JSON.parse(str);
      } catch {
        return str; // If parsing fails, return the original string
      }
  
      // Convert object to a string without curly braces
      return Object.entries(obj)
        .map(([key, value]) => `${key}: ${value}`)
        .join("\n");
    };
  
    // Convert the data object into an array of key-value pairs
    const entries = Object.entries(data)
      .filter(([key]) => !fieldsToExclude.includes(key))
      .map(([key, value]) => {
        let displayValue = value;
  
        if (key === "actionLabel") {
          displayValue = formatActionLabel(value);
        } else if (key === "timestamp") {
          displayValue = format(new Date(value), "MMMM dd, yyyy hh:mm a");
        } else if (key === "requestData" && typeof value === "object") {
          // Remove curly braces from requestData
          displayValue = removeCurlyBraces(JSON.stringify(value));
        } else if (typeof value === "object") {
          displayValue = removeCurlyBraces(JSON.stringify(value));
        }
  
        return {
          key: fieldMappings[key] || key,
          value: displayValue,
        };
      });

    return entries;
  };
  
  
  const formatActionLabel = (label) => {
    try {
      // Clean up the label string by removing known prefixes
      const cleanedLabel = label
        .replace(/^Added data: /, "") // Remove "Added data: " prefix if present
        .replace(/^Updated fields: /, "") // Remove "Updated fields: " prefix if present
        .trim(); // Remove any leading or trailing whitespace
  
      // Attempt to parse the cleaned label as JSON
      const parsed = JSON.parse(cleanedLabel);
      
      // Format each key-value pair
      return Object.entries(parsed)
        .map(([field, value]) => {
          // Check if the value is an object and format accordingly
          if (typeof value === 'object' && value !== null) {
            return `${field}: \n${JSON.stringify(value, null, 2)}`; // Indented JSON string
          } else {
            return `${field}: ${value}`;
          }
        })
        .join("\n"); // Join entries with new lines
    } catch (e) {
      // Handle JSON parsing errors
      console.error("Error parsing actionLabel:", e);
      console.error("Action Label Content:", label); // Log the problematic label
      return label; // Return the original label if parsing fails
    }
  };
  
  
  
  

  return (
    <>
      <h3 className="summary-title">Recent Changes</h3>
      <div className="summary-container">
        <Table
          columns={columns}
          dataSource={logs}
          rowKey={(record) => record._id}
          pagination={false}
          className="log-table"
          showHeader={false}
          style={{ width: "100%" }}
          scroll={{ y: 400 }} // Enable vertical scrolling with fixed height
        />
        {modalData && (
          <Modal
            title="Recent Changes Details"
            visible={isModalVisible}
            onCancel={handleCancel}
            footer={null}
            width={1000}
          >
            <Table
              columns={modalColumns}
              dataSource={getModalData(modalData)} // No need for `await` here
              pagination={false}
              size="small"
            />
          </Modal>
        )}
      </div>
    </>
  );
};

export default Summary;
