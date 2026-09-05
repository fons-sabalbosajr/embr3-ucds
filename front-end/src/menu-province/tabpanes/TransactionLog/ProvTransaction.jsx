import React, { useEffect, useState, useCallback } from "react";
import { Table, Tag, Button, Tooltip, Modal } from "antd";
import { RollbackOutlined, DeleteOutlined } from "@ant-design/icons";
import moment from "moment";
import axios from "axios";
import Swal from "sweetalert2";
import CryptoJS from "crypto-js";
import "./provtransaction.css";
import { API_BASE_URL } from "../../../config/api";

const ProvTransaction = ({
  editedRecord,
  currentUser,
  handleReload,
  reloadEditedRecord,
}) => {
  const [transactions, setTransactions] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [initialLog, setInitialLog] = useState(null);
  const [totalViewItems, setTotalViewItems] = useState(0);
  const [userMap, setUserMap] = useState({});
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [revertRecord, setRevertRecord] = useState(null);

  // Extract permissions from currentUser
  const permissions = currentUser?.permissions || [];
  const canGenerateData = permissions[0];
  const canManageData = permissions[1];
  const canViewAdminPanel = permissions[2];
  const canViewDataHistory = permissions[3];

  useEffect(() => {
    const fetchTransactions = async () => {
      if (!editedRecord?.ecc_cnc) {
        setTransactions([]);
        setUserMap({});
        return;
      }
      try {
        const response = await axios.get(
          `${API_BASE_URL}/api/ucds-log`,
          {
            params: { ecc_cnc: editedRecord.ecc_cnc },
          }
        );
        const fetchedTransactions = Array.isArray(response.data)
          ? response.data
          : [];
        // Get unique usernames
        const uniqueUsernames = [
          ...new Set(
            fetchedTransactions.map((t) => t.userActed).filter((u) => !!u)
          ),
        ];
        // Fetch user data for all unique usernames
        const userFetches = uniqueUsernames.map((username) =>
          axios
            .get(`${API_BASE_URL}/api/users`, { params: { username } })
            .then((res) => ({
              username,
              user: res.data && res.data.length > 0 ? res.data[0] : null,
            }))
            .catch(() => ({ username, user: null }))
        );
        const userResults = await Promise.all(userFetches);
        const userMapObj = {};
        userResults.forEach(({ username, user }) => {
          userMapObj[username] = user;
        });
        // Remove duplicate transactions by transactionID
        const uniqueTransactions = [
          ...new Map(
            fetchedTransactions.map((transaction) => [
              transaction.transactionID,
              transaction,
            ])
          ).values(),
        ];
        setTransactions(uniqueTransactions);
        // Find and store the "Initial Data" log entry
        const initialDataLog = uniqueTransactions.find(
          (t) => t.actionType === "Initial Data"
        );
        setInitialLog(initialDataLog || null); // Set to null if not found
        setUserMap(userMapObj);
        setTotalItems(uniqueTransactions.length);
        const viewActionCount = uniqueTransactions.filter(
          (t) => t.actionType === "View"
        ).length;
        setTotalViewItems(viewActionCount);
      } catch (error) {
        setTransactions([]);
        setUserMap({});
        console.error("Error fetching transactions:", error);
      }
    };

    fetchTransactions();

    const intervalId = setInterval(fetchTransactions, 1000);
    return () => clearInterval(intervalId);
  }, [editedRecord, handleReload]);

  const handleTableChange = (pagination) => {
    setCurrentPage(pagination.current);
    setPageSize(pagination.pageSize);
  };

  // Function to close the modal
  const handleModalClose = () => {
    setIsModalVisible(false);
    setRevertRecord(null); // Clear the record after closing
  };

  const handleRevertConfirm = async (record) => {
    if (!record || !record.ecc_cnc) {
      Swal.fire({
        icon: "error",
        title: "Revert Failed",
        text: "ECC/CNC value is missing in this transaction.",
      });
      return;
    }

    let field = "date_approved";
    let oldValue = record.oldValue;
    if (Array.isArray(record.changes) && record.changes.length > 0) {
      field = record.changes[0].field;
      oldValue = record.changes[0].new_value; // Revert to previous value
    }

    const payload = {
      ecc_cnc: record.ecc_cnc,
      field,
      oldValue,
      updated_by: currentUser?.username,
    };

    try {
      await axios.put(`${API_BASE_URL}/api/revert-by-ecc`, payload);

      Swal.fire({
        icon: "success",
        title: "Revert Successful",
        text: "The changes have been reverted successfully.",
        confirmButtonText: "OK",
      });

      // 🔁 Refresh both main record and table log
      if (typeof handleReload === "function") handleReload();
      if (typeof reloadEditedRecord === "function") {
        await reloadEditedRecord(record.ecc_cnc); // ← reload modal data
      }
    } catch (error) {
      console.error("Revert error:", error);
      Swal.fire({
        icon: "error",
        title: "Revert Failed",
        text: "Something went wrong while reverting the data.",
        confirmButtonText: "OK",
      });
    }
  };

  const handleDeleteTransaction = async (transactionID) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/transaction/${transactionID}`, // Use transactionID instead of ID
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

  const columns = [];

  // Only show Trans. ID if canManageData is true (dev mode)
  if (canManageData) {
    columns.push({
      title: <span className="table-header">Trans. ID</span>,
      dataIndex: "transactionID",
      key: "transactionID",
      align: "center",
      width: 90,
    });
  }

  columns.push(
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
      title: <span className="table-header">Old Data</span>,
      dataIndex: "oldValue",
      key: "oldValue",
      align: "center",
      width: 200,
      render: (_, record) => {
        if (record.actionType === "Initial Data") {
          if (!record.oldValue || record.oldValue === "-")
            return <span>-</span>;
          return record.oldValue
            .split("\n")
            .filter((val) => val !== "undefined" && val !== "0")
            .map((val, idx) => (
              <div key={idx}>
                <div>{val}</div>
              </div>
            ));
        }
        if (Array.isArray(record.changes) && record.changes.length > 0) {
          // Only show fields that have changed and are not empty
          const filteredChanges = record.changes.filter(
            (chg) =>
              chg.old_value !== chg.new_value &&
              chg.field &&
              chg.old_value !== undefined &&
              chg.old_value !== null &&
              chg.old_value !== "" // Only show if old_value is not empty
          );
          if (filteredChanges.length === 0) return <span>-</span>;
          return (
            <div>
              {filteredChanges.map((chg, idx) => (
                <div key={idx} style={{ marginBottom: 8 }}>
                  <div>{chg.old_value}</div>
                  {canManageData && (
                    <div
                      style={{
                        fontSize: "9px",
                        color: "#888",
                        fontWeight: 400,
                        fontStyle: "italic",
                      }}
                    >
                      {chg.field}
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        }
        if (!record.oldValue || record.oldValue === "-") return <span>-</span>;
        return record.oldValue
          .split("\n")
          .filter((val) => val !== "undefined" && val !== "0")
          .map((val, idx) => (
            <div key={idx} style={{ marginBottom: 8 }}>
              <div>{val}</div>
            </div>
          ));
      },
    },
    {
      title: <span className="table-header">New Data</span>,
      dataIndex: "newValue",
      key: "newValue",
      align: "center",
      width: 200,
      render: (_, record) => {
        if (record.actionType === "Initial Data") {
          if (!record.newValue) return <span>-</span>;
          const [ecc_cnc, project_title] = record.newValue.split("\n");
          return (
            <div>
              {ecc_cnc && (
                <div style={{ marginBottom: 8 }}>
                  <div>{ecc_cnc}</div>
                </div>
              )}
              {project_title && (
                <div style={{ marginBottom: 8 }}>
                  <div>{project_title}</div>
                </div>
              )}
            </div>
          );
        }
        if (Array.isArray(record.changes) && record.changes.length > 0) {
          // Only show fields that have changed and are not empty
          const filteredChanges = record.changes.filter(
            (chg) =>
              chg.old_value !== chg.new_value &&
              chg.field &&
              chg.new_value !== undefined &&
              chg.new_value !== null &&
              chg.new_value !== "" // Only show if new_value is not empty
          );
          if (filteredChanges.length === 0) return <span>-</span>;
          return (
            <div>
              {filteredChanges.map((chg, idx) => (
                <div key={idx} style={{ marginBottom: 8 }}>
                  <div>{chg.new_value}</div>
                  {canManageData && (
                    <div
                      style={{
                        fontSize: "9px",
                        color: "#888",
                        fontWeight: 400,
                        fontStyle: "italic",
                      }}
                    >
                      {chg.field}
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        }
        if (!record.newValue) return <span>-</span>;
        const [ecc_cnc, project_title] = record.newValue.split("\n");
        return (
          <div>
            {ecc_cnc && (
              <div style={{ marginBottom: 8 }}>
                <div>{ecc_cnc}</div>
                {canManageData && (
                  <div
                    style={{
                      fontSize: "9px",
                      color: "#888",
                      fontWeight: 400,
                      fontStyle: "italic",
                    }}
                  >
                    ECC/CNC
                  </div>
                )}
              </div>
            )}
            {project_title && (
              <div style={{ marginBottom: 8 }}>
                <div>{project_title}</div>
                {canManageData && (
                  <div
                    style={{
                      fontSize: "9px",
                      color: "#888",
                      fontWeight: 400,
                      fontStyle: "italic",
                    }}
                  >
                    Project Title
                  </div>
                )}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: <span className="table-header">User Acted</span>,
      dataIndex: "userActed",
      key: "userActed",
      align: "center",
      render: (userActed) => {
        const user = userMap[userActed];
        if (user) {
          return (
            <>
              <span>{user.name}</span>
              <br />
              <span style={{ fontSize: "10px", color: "#888" }}>
                {user.division}
              </span>
            </>
          );
        }
        return <span>{userActed || "Unknown"}</span>;
      },
    }
  );

  if (canManageData) {
    columns.push({
      title: <span className="table-header">Actions</span>,
      key: "actions",
      align: "center",
      render: (_, record) => (
        <div className="action-buttons">
          {/* Revert Button */}
          {record.actionType !== "Initial Data" && (
            <Tooltip title="Revert to Old Value">
              <Button
                type="primary"
                icon={<RollbackOutlined />}
                className="action-button"
                size="small"
                style={{ marginRight: 20 }}
                onClick={async () => {
                  const field = record.changes?.[0]?.field || "-";
                  const oldValue = record.changes?.[0]?.old_value ?? "-";
                  const newValue = record.changes?.[0]?.new_value ?? "-";

                  const result = await Swal.fire({
                    title: "Revert Changes?",
                    html: `
                    <div style='text-align:left; font-size: 14px;'>
                      <b>Transaction ID:</b> ${record.transactionID}<br/>
                      <b>Field:</b> ${field}<br/>
                      <b>User Acted:</b> ${
                        userMap[record.userActed]?.name || "N/A"
                      }<br/>
                      <b>Date Acted:</b> ${moment(record.dateActed).format(
                        "MM/DD/yyyy hh:mm A"
                      )}<br/>
                      <b>Old Value:</b> ${oldValue}<br/>
                      <b>New Value:</b> ${newValue}
                    </div>
                  `,
                    icon: "warning",
                    showCancelButton: true,
                    confirmButtonColor: "#3085d6",
                    cancelButtonColor: "#d33",
                    confirmButtonText: "Confirm Revert",
                    cancelButtonText: "Cancel",
                    width: 600,
                  });

                  if (result.isConfirmed) {
                    await handleRevertConfirm(record);
                  }
                }}
              />
            </Tooltip>
          )}

          {/* Delete Button */}
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
    });
  }

  return (
    <div>
      <Modal
        title="Revert Changes?"
        open={isModalVisible}
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
              <p className="revert-paragraph">
                <strong>Field:</strong>{" "}
                {revertRecord.changes?.[0]?.field ?? "-"}
              </p>
            </div>

            <Table
              dataSource={[
                {
                  key: "1",
                  oldValue: revertRecord.changes?.[0]?.old_value ?? "-",
                  newValue: revertRecord.changes?.[0]?.new_value ?? "-",
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
                    const safeSplit =
                      typeof newValue === "string"
                        ? newValue.split("\n")
                        : [String(newValue)];
                    const filteredValues = safeSplit.filter(
                      (val) =>
                        val &&
                        val.trim() !== "" &&
                        val.trim().toLowerCase() !== "undefined"
                    );
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
                    const safeSplit =
                      typeof oldValue === "string"
                        ? oldValue.split("\n")
                        : [String(oldValue)];
                    const filteredValues = safeSplit.filter(
                      (val) =>
                        val &&
                        val.trim() !== "" &&
                        val.trim().toLowerCase() !== "undefined"
                    );
                    return (
                      <div>
                        {filteredValues.map((val, index) => (
                          <p key={index}>{val}</p>
                        ))}
                      </div>
                    );
                  },
                },
              ]}
              size="small"
              style={{ fontSize: "14px" }}
            />
          </div>
        ) : (
          <p>Loading...</p>
        )}
      </Modal>

      <Table
        columns={columns}
        dataSource={transactions}
        rowKey={(record) => record.transactionID || record._id?.$oid}
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
