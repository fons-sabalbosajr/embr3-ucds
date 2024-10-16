import React, { useEffect, useState } from "react";
import { Table, Tag, Button, Tooltip, Modal } from "antd";
import {
  EyeOutlined,
  RollbackOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import moment from "moment";
import axios from "axios";
import Swal from "sweetalert2";
import "./provtransaction.css";

const ProvTransaction = ({ editedRecord, currentUser }) => {
  const [transactions, setTransactions] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [userData, setUserData] = useState(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [revertRecord, setRevertRecord] = useState(null);

  // Extract permissions from currentUser
  const permissions = currentUser?.permissions || [];
  const canGenerateData = permissions[0];
  const canManageData = permissions[1];
  const canViewAdminPanel = permissions[2];
  const canViewDataHistory = permissions[3];

  useEffect(() => {
    if (editedRecord && editedRecord.ecc_cnc) {
      //console.log("ECC_CNC Reference No:", editedRecord.ecc_cnc);
    } else {
      console.log("No ECC No found in editedRecord");
    }
  }, [editedRecord]);

  useEffect(() => {
    const fetchTransactions = async () => {
      if (editedRecord?.ecc_cnc) {
        try {
          const response = await axios.get(
            "http://localhost:8081/api/ucds-log",
            {
              params: { ecc_cnc: editedRecord.ecc_cnc },
            }
          );

          if (
            response.data.message === "No logs found for the provided ecc_cnc"
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
        params: { username },
      });
      return response.data.length > 0 ? response.data[0] : null;
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

  // Function to show the modal and set the record to be reverted
  const showRevertModal = (record) => {
    setRevertRecord(record);
    setIsModalVisible(true);
  };

  // Function to close the modal
  const handleModalClose = () => {
    setIsModalVisible(false);
    setRevertRecord(null); // Clear the record after closing
  };

  const handleRevertConfirm = () => {
    Swal.fire({
      icon: "success",
      title: "Revert Successful",
      text: "The changes have been reverted.",
    });
    handleModalClose();
  };

  const handleDeleteTransaction = async (transactionID) => {
    try {
      const response = await fetch(
        `http://localhost:8081/api/transaction/${transactionID}`, // Use transactionID instead of ID
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
      width: 200,
      render: (oldValue) => {
        if (!oldValue) return null; // Handle undefined or null oldValue
        // Split the oldValue by new lines
        const filteredValues = oldValue
          .split("\n")
          .filter((val) => val !== "undefined" && val !== "0");
        return filteredValues.map((val, index) => <p key={index}>{val}</p>);
      },
    },
    {
      title: <span className="table-header">New Value</span>,
      dataIndex: "newValue",
      key: "newValue",
      align: "center",
      width: 200,
      render: (newValue) => {
        const [ecc_cnc, project_title] = newValue.split("\n");

        return (
          <div>
            <p>{ecc_cnc}</p>
            <p>{project_title}</p>
          </div>
        );
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
      <Modal
        title="Revert Changes?"
        visible={isModalVisible}
        onCancel={handleModalClose}
        width={800}
        footer={[
          <Button key="cancel" type="primary" danger onClick={handleModalClose}>
            Cancel
          </Button>,
          <Button key="confirm" type="primary" onClick={handleRevertConfirm}>
            Confirm Revert
          </Button>,
        ]}
      >
        {revertRecord ? (
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "11px",
              }}
            >
              <p className="revert-paragraph">
                <strong>Transaction ID:</strong> {revertRecord.transactionID}
              </p>
              <p className="revert-paragraph">
                <strong>User Acted:</strong> {revertRecord.userActed}
              </p>
              <p className="revert-paragraph">
                <strong>Date Acted:</strong>{" "}
                {moment(revertRecord.dateActed).format("MM/DD/yyyy hh:mm A")}
              </p>
            </div>
            <Table
              dataSource={[
                {
                  key: "1",
                  oldValue: revertRecord.oldValue,
                  newValue: revertRecord.newValue,
                },
              ]}
              pagination={false}
              showHeader={true}
              columns={[
                {
                  title: "Current Data",
                  dataIndex: "newValue",
                  width: "200px",
                  align: "center",
                  render: (newValue) => {
                    // Split the newValue by new lines and filter out ECC values
                    const filteredValues = newValue
                      .split("\n")
                      .filter((val) => !val.includes("ECC")); // Adjust the filter condition as needed
                    return (
                      <div>
                        {filteredValues.map((val, index) => (
                          <p key={index}>{val}</p>
                        ))}
                      </div>
                    );
                  },
                },
                {
                  title: "Revert to Old Data",
                  dataIndex: "oldValue",
                  width: "200px",
                  align: "center",
                  render: (oldValue) => {
                    if (!oldValue) return null; // Handle undefined or null oldValue
                    // Split the oldValue by new lines
                    const filteredValues = oldValue
                      .split("\n")
                      .filter((val) => val !== "undefined" && val !== "0");
                    return filteredValues.map((val, index) => (
                      <p key={index}>{val}</p>
                    ));
                  },
                },
              ]}
              size="small"
              style={{ fontSize: "14px" }} // Reduce the font size of the values table
            />
          </div>
        ) : (
          <p>Loading...</p>
        )}
      </Modal>

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

export default ProvTransaction;
