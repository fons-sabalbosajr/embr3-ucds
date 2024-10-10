import React, { useEffect, useState } from "react";
import { Table, Tag, Button, Tooltip } from "antd";
import {
  EyeOutlined,
  RollbackOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import moment from "moment";
import "./transaction.css";
import axios from "axios";
import Swal from "sweetalert2";

const Transaction = ({ editedRecord, currentUser }) => {
  const [transactions, setTransactions] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [userData, setUserData] = useState(null);

  // Extract permissions from currentUser
  const permissions = currentUser?.permissions || [];
  const canGenerateData = permissions[0];
  const canManageData = permissions[1];
  const canViewAdminPanel = permissions[2];
  const canViewDataHistory = permissions[3];

  useEffect(() => {
    if (editedRecord && editedRecord.iis_no) {
      //console.log('IIS No:', editedRecord.iis_no);
    } else {
      console.log("No IIS No found in editedRecord");
    }
  }, [editedRecord]);

  useEffect(() => {
    const fetchTransactions = async () => {
      if (editedRecord?.iis_no) {
        try {
          const response = await axios.get(
            "http://localhost:8081/api/survey-log",
            {
              params: { iis_no: editedRecord.iis_no },
            }
          );

          if (
            response.data.message === "No logs found for the provided iis_no"
          ) {
            setTransactions([]);
          } else {
            const fetchedTransactions = response.data;
            const uniqueTransactions = [
              ...new Map(
                fetchedTransactions.map((transaction) => [
                  transaction.transactionID,
                  transaction,
                ])
              ).values(),
            ];
            setTransactions(uniqueTransactions);
            setTotalItems(uniqueTransactions.length);
          }
        } catch (error) {
          console.error("Error fetching transactions:", error);
        }
      }
    };

    fetchTransactions();

    const intervalId = setInterval(fetchTransactions, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [editedRecord]);

  const fetchUserByUsername = async (username) => {
    try {
      const response = await axios.get(`http://localhost:8081/api/users`, {
        params: { username }, // This sends the username as a query parameter
      });
      return response.data.length > 0 ? response.data[0] : null; // Return the first user or null if not found
    } catch (error) {
      console.error("Error fetching user:", error);
      return null; // Return null on error
    }
  };

  useEffect(() => {
    const username = localStorage.getItem("username"); // Get username from local storage
    if (username) {
      fetchUserByUsername(username).then((user) => {
        if (user) {
          setUserData(user); // Store user data
        }
      });
    }
  }, []);

  const handleTableChange = (pagination) => {
    setCurrentPage(pagination.current);
    setPageSize(pagination.pageSize);
  };

  const columns = [
    {
      title: <span className="table-header">Trans. ID</span>,
      dataIndex: "transactionID",
      key: "transactionID",
      align: "center",
      width: 60,
    },
    {
      title: <span className="table-header">Date</span>,
      dataIndex: "transactionDate",
      key: "transactionDate",
      render: (date) => moment(date).format("MM/DD/yyyy \n hh:mm A"),
      align: "center",
    },
    {
      title: <span className="table-header">Action Type</span>,
      dataIndex: "actionType",
      key: "actionType",
      render: (actionType) => {
        let tagClass;
        switch (actionType) {
          case "Create":
            tagClass = "tag-create";
            break;
          case "Initial Data":
            tagClass = "tag-add";
            break;
          case "Modified":
            tagClass = "tag-update";
            break;
          case "Delete":
            tagClass = "tag-delete";
            break;
          default:
            tagClass = "";
        }
        return <Tag className={tagClass}>{actionType}</Tag>;
      },
      align: "center",
    },
    {
      title: <span className="table-header">Old Value</span>,
      dataIndex: "oldValue",
      key: "oldValue",
      align: "center",
    },
    {
      title: <span className="table-header">New Value</span>,
      dataIndex: "newValue",
      key: "newValue",
      align: "center",
      render: (newValue) => {
        const restOfNewValue = newValue.split("\n").slice(1).join("\n");

        return <div>{restOfNewValue}</div>;
      },
    },
    {
      title: <span className="table-header">User Acted</span>,
      dataIndex: "userActed",
      key: "userActed",
      align: "center",
      render: () =>
        userData ? `${userData.name} \n ${userData.division}` : "Loading...", // Display the full name
    },
    {
      title: <span className="table-header">Date Acted</span>,
      dataIndex: "dateActed",
      key: "dateActed",
      render: (date) => moment(date).format("MM/DD/yyyy \n hh:mm A"),
      align: "center",
    },
  ].concat(
    canManageData
      ? [
          {
            title: <span className="table-header">Actions</span>,
            key: "actions",
            align: "center",
            render: (_, record) => (
              <div className="action-buttons">
                <Tooltip title="View Data">
                  <Button
                    type="primary"
                    className="action-button"
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => {
                      Swal.fire({
                        icon: "info",
                        title: "In Development",
                        text: "This feature is still under development.",
                        confirmButtonText: "OK",
                      });
                    }}
                  />
                </Tooltip>
                <Tooltip title="Revert Changes">
                  <Button
                    type="primary"
                    className="action-button button-revert"
                    size="small"
                    icon={<RollbackOutlined />}
                    onClick={() => {
                      Swal.fire({
                        icon: "info",
                        title: "In Development",
                        text: "This feature is still under development.",
                        confirmButtonText: "OK",
                      });
                    }}
                  />
                </Tooltip>
                <Tooltip title="Delete Transaction">
                  <Button
                    type="primary"
                    danger
                    icon={<DeleteOutlined />}
                    className="action-button button-danger"
                    size="small"
                    onClick={() => {
                      Swal.fire({
                        icon: "info",
                        title: "In Development",
                        text: "This feature is still under development.",
                        confirmButtonText: "OK",
                      });
                    }}
                  />
                </Tooltip>
              </div>
            ),
          },
        ]
      : []
  );

  return (
    <div>
      <Table
        columns={columns}
        dataSource={transactions}
        rowKey={(record) => record.transactionID}
        rowClassName={() => "table-row"}
        pagination={{
          current: currentPage,
          pageSize: pageSize,
          total: totalItems,
          showSizeChanger: true,
          pageSizeOptions: [5, 10, 20, 50],
        }}
        onChange={handleTableChange}
      />
    </div>
  );
};

export default Transaction;
