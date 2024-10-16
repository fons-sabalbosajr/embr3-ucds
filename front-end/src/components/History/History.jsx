import React, { useEffect, useState } from "react";
import { Table, Button, Modal, Input } from "antd";
import { InfoCircleOutlined } from '@ant-design/icons';
import axios from "axios";
import { format } from "date-fns";
import "./history.css";

const History = () => {
  const [ucdsLogs, setUcdsLogs] = useState([]);
  const [surveyLogs, setSurveyLogs] = useState([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalData, setModalData] = useState(null);
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    const fetchUcdsLogs = async () => {
      try {
        const ucdsLogsResponse = await axios.get("http://localhost:8081/api/ucds-log");
        setUcdsLogs(ucdsLogsResponse.data);
      } catch (error) {
        console.error("Error fetching ucds logs:", error);
      }
    };

    const fetchSurveyLogs = async () => {
      try {
        const surveyLogsResponse = await axios.get("http://localhost:8081/api/survey-log");
        setSurveyLogs(surveyLogsResponse.data);
      } catch (error) {
        console.error("Error fetching survey logs:", error);
      }
    };

    fetchUcdsLogs();
    fetchSurveyLogs();
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

  const combinedLogs = [...ucdsLogs, ...surveyLogs];

  const filteredLogs = combinedLogs.filter((log) => {
    return Object.values(log).some((value) =>
      value.toString().toLowerCase().includes(searchText.toLowerCase())
    );
  });

  const recentLogs = filteredLogs.slice(0, 3);

  const getTagClass = (actionType) => {
    switch (actionType) {
      case "Create":
        return "tag-create";
      case "Initial Data":
        return "tag-add";
      case "Modified":
        return "tag-update";
      case "Delete":
        return "tag-delete";
      default:
        return "";
    }
  };

  const columns = [
    {
      title: "Action",
      dataIndex: "actionType",
      key: "actionType",
      align: "left",
      width: 200,
      render: (text , record) => (
        <div>
          <span className={getTagClass(record.actionType)}>{record.actionType}</span>
          <div>{format(new Date(record.dateActed), "MMMM dd, yyyy hh:mm a")}</div>
          <div>{record.referenceNo}</div>
          <div>by {record.userActed}</div>
        </div>
      ),
    },
    {
      title: "Actions",
      key: "actions",
      width: 50,
      render: (text, record) => (
        <div className="actions-container">
          <Button 
            type="link" 
            icon={<InfoCircleOutlined />} 
            onClick={() => showModal(record)} 
            style={{ padding: 0 }}
          />
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
      transactionID: "Transaction ID", 
      transactionDate: "Date",
      actionType: "Type of Action",
      oldValue: "Old Value",
      newValue: "New Value",
      userActed: "Modified by",
      dateActed: "Date last modified",
      ecc_cnc: "Reference No.",
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
        } else if ( key === "timestamp") {
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
          dataSource={recentLogs}
          rowKey={(record) => record._id}
          pagination={false}
          className="log-table custom-pagination"
          showHeader={true}
          style={{ width: "100%" }}
          scroll={{ y: 520 }}
        />
        {modalData && (
          <Modal
            title={<span className="modal-title">Recent Changes Details</span>}
            visible={isModalVisible}
            onCancel={handleCancel}
            footer={null}
            width={1000}
          >
            <Table
              columns={modalColumns}
              dataSource={getModalData(modalData)} 
              pagination={false}
              size="small"
              className="modal-table"
            />
          </Modal>
        )}
      </div>
    </div>
  );
};

export default History;