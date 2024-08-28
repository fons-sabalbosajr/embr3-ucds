import React, { useEffect, useState } from "react";
import { Table, Button, Modal, Input } from "antd";
import axios from "axios";
import {
  EyeFilled,
  PlusCircleFilled,
  EditFilled,
  ToTopOutlined,
  QuestionCircleOutlined,
  DatabaseFilled,
} from "@ant-design/icons";
import { format } from "date-fns";
import "./history.css";

const History = () => {
  const [logs, setLogs] = useState([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalData, setModalData] = useState(null);
  const [usernames, setUsernames] = useState({});
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    const permission = localStorage.getItem("permission").replace(/"/g, "");
    const username = localStorage.getItem("username").replace(/"/g, "");
    //console.log("Current user permission:", permission);
    //console.log("Current username:", username);

    if (permission === "admin" || permission === "developer") {
      const fetchLogs = async () => {
        try {
          //console.log("Fetching all logs");

          const logsResponse = await axios.get(
            "http://localhost:8081/api/logs?all=true",
            {
              withCredentials: true,
            }
          );

          setLogs(logsResponse.data);
        } catch (error) {
          console.error("Error fetching logs:", error);
          throw error; // re-throw the error to propagate it up the call stack
        }
      };

      fetchLogs();
    } else if (permission === "viewer" || permission === "contributor") {
      const fetchLogs = async () => {
        try {
          //console.log(`Fetching logs for ${username}`);

          const logsResponse = await axios.get(
            `http://localhost:8081/api/logs?username=${username}`,
            {
              withCredentials: true,
            }
          );

          setLogs(logsResponse.data);
        } catch (error) {
          console.error("Error fetching logs:", error);
          throw error; // re-throw the error to propagate it up the call stack
        }
      };

      fetchLogs();
    } else {
      console.log("You do not have permission to view logs");
      setLogs([]);
    }
  }, []);

  const showModal = (record) => {
    setModalData(record);
    setIsModalVisible(true);
  };

  const handleCancel = () => {
    setIsModalVisible(false);
    setModalData(null);
  };

  const handleSearch = (e) => {
    setSearchText(e.target.value);
  };

  const filteredLogs = logs.filter((log) => {
    return Object.values(log).some((value) =>
      value.toString().toLowerCase().includes(searchText.toLowerCase())
    );
  });

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
      case "Generic Action":
        return (
          <DatabaseFilled
            style={{ color: "gray", fontSize: "20px", marginLeft: "-10px" }}
          />
        );
      default:
        return null;
    }
  };

  const columns = [
    {
      title: null,
      dataIndex: "message",
      key: "message",
      align: "left",
      width: 230,
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
                  {usernames[record.username] || record.username} •{" "}
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
      width: 50,
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
      width: 150,
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

    const fieldsToExclude = ["_id", "userId", "method", "path", "actionLabel"];

    const fieldMappings = {
      timestamp: "Date Modified",
      username: "Name",
      actionType: "Action Type",
      requestData: "Update Details",
    };

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

    const entries = Object.entries(data)
      .filter(([key]) => !fieldsToExclude.includes(key))
      .map(([key, value]) => {
        let displayValue = value;

        if (key === "actionLabel") {
          displayValue = formatActionLabel(value);
        } else if (key === "timestamp") {
          displayValue = format(new Date(value), "MMMM dd, yyyy hh:mm a");
        } else if (key === "requestData" && typeof value === "object") {
          displayValue = removeCurlyBraces(JSON.stringify(value));
        } else if (typeof value === "object") {
          try {
            displayValue = removeCurlyBraces(JSON.stringify(value));
          } catch (error) {
            console.error("Error parsing value as JSON:", error);
            displayValue = value;
          }
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
      const cleanedLabel = label
        .replace(/^Added data: /, "")
        .replace(/^Updated fields: /, "")
        .trim();

      const parsed = JSON.parse(cleanedLabel);

      return Object.entries(parsed)
        .map(([field, value]) => {
          return `${field}: ${value}`;
        })
        .join(", ");
    } catch {
      return label;
    }
  };

  return (
    <div>
      <h3 className="summary-title">
        System Changes
        <Input
          placeholder="Search"
          value={searchText}
          onChange={handleSearch}
          style={{ width: 170, marginLeft: 10 }}
          size="small"
        />
      </h3>
      <div className="summary-container">
        <Table
          columns={columns}
          dataSource={filteredLogs}
          rowKey={(record) => record._id}
          pagination={false}
          className="log-table custom-pagination"
          showHeader={false}
          style={{ width: "100%" }}
          scroll={{ y: 520 }}
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
    </div>
  );
};

export default History;
