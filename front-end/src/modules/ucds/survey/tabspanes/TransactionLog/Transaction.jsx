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
import CryptoJS from "crypto-js";
import { API_BASE_URL } from "../../../../../config/api";

const Transaction = ({ editedRecord, currentUser }) => {
  const [transactions, setTransactions] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [userData, setUserData] = useState(null);

  // Named capability flags from GET /api/auth/me
  const capabilities = currentUser?.capabilities || {};
  const canGenerateData = capabilities.canGenerateData === true;
  const canManageData = capabilities.canManageData === true;
  const canViewAdminPanel = capabilities.canViewAdminPanel === true;
  const canViewDataHistory = capabilities.canViewDataHistory === true;

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
            `${API_BASE_URL}/api/survey-log`,
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

 // Decrypt username and fetch user data
 const fetchUserByUsername = async (username) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/users`, {
      params: { username }, // This sends the username as a query parameter
    });
    return response.data.length > 0 ? response.data[0] : null; // Return the first user or null if not found
  } catch (error) {
    console.error("Error fetching user:", error);
    return null; // Return null on error
  }
};

useEffect(() => {
  const encryptedUsername = localStorage.getItem("username"); // Get encrypted username from local storage
  if (encryptedUsername) {
    // Decrypt the username
    const decryptedBytes = CryptoJS.AES.decrypt(
      encryptedUsername,
      import.meta.env.VITE_CRYPTOJS_ENCRYPTION_KEY
    );
    const decryptedUsername = decryptedBytes.toString(CryptoJS.enc.Utf8);

    // Fetch user data using the decrypted username
    fetchUserByUsername(decryptedUsername).then((user) => {
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

  const handleDeleteTransaction = async (transactionID) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/survey-transaction/${transactionID}`, // Use transactionID instead of ID
        {
          method: "DELETE",
          credentials: "include", // Include credentials if necessary
        }
      );

      if (response.ok) {
        const result = await response.json();
        Swal.fire({
          title: "Success!",
          text: result.message,
          icon: "success",
          confirmButtonText: "OK",
        });
      } else {
        const error = await response.json();
        console.error("Server response error:", error); // Log the error
        Swal.fire({
          title: "Error",
          text: error.message || "Error deleting transaction",
          icon: "error",
          confirmButtonText: "OK",
        });
      }
    } catch (error) {
      console.error("Network error:", error); // Log network errors
      Swal.fire({
        title: "Error",
        text: "Error deleting transaction",
        icon: "error",
        confirmButtonText: "OK",
      });
    }
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
      render: (date) => {
        const formattedDate = moment(date).format("MM/DD/yyyy");
        const formattedTime = moment(date).format("hh:mm A");
        return (
          <>
            {formattedDate}
            <br />
            {formattedTime}
          </>
        );
      },
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
        userData ? (
          <>
            {userData.name}
            <br />
            {userData.division}
          </>
        ) : (
          "Loading..."
        ), // Display the full name with line break
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
                {/* Conditionally render delete button */}
                {record.actionType !== "Initial Data" && (
                  <Tooltip title="Delete Transaction">
                    <Button
                      type="primary"
                      danger
                      icon={<DeleteOutlined />}
                      className="action-button button-danger"
                      size="small"
                      onClick={async () => {
                        const result = await Swal.fire({
                          title: "Are you sure?",
                          text: "This will permanently delete the transaction!",
                          icon: "warning",
                          showCancelButton: true,
                          confirmButtonColor: "#d33",
                          cancelButtonColor: "#3085d6",
                          confirmButtonText: "Yes, delete it!",
                          cancelButtonText: "Cancel",
                        });

                        if (result.isConfirmed) {
                          await handleDeleteTransaction(record.transactionID);
                        }
                      }}
                    />
                  </Tooltip>
                )}
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
