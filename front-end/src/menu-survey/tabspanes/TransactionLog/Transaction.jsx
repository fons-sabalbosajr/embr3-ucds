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

const Transaction = ({ editedRecord }) => {
  const [transactions, setTransactions] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10); // Set initial page size to 5
  const [totalItems, setTotalItems] = useState(0);

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
      width: 60
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
        // Assume the iis_no is the first part of the newValue before the line break
        const iisNoMatch = newValue.split("\n")[0]; // Split by line breaks
        const restOfNewValue = newValue.split("\n").slice(1).join("\n"); // Remainder of newValue after the iis_no

        return (
          <div>
            <a
              href={`https://iis.emb.gov.ph/embis/dms/documents/tracker/?trn_no=${encodeURIComponent(
                iisNoMatch
              )}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {iisNoMatch}
            </a>
            <br />
            {restOfNewValue}
          </div>
        );
      },
    },
    {
      title: <span className="table-header">User Acted</span>,
      dataIndex: "userActed",
      key: "userActed",
      align: "center",
    },
    {
      title: <span className="table-header">Date Acted</span>,
      dataIndex: "dateActed",
      key: "dateActed",
      render: (date) => moment(date).format("MM/DD/yyyy \n hh:mm A"),
      align: "center",
    },
    {
      title: <span className="table-header">Actions</span>,
      key: "actions",
      align: "center",
      render: (_, record) => (
        <div className="action-buttons">
          <div>
            <Tooltip title="View Data">
              <Button
                type="primary"
                className="action-button"
                size="small"
                icon={<EyeOutlined />}
              />
            </Tooltip>
          </div>
          <div>
            <Tooltip title="Revert Changes">
              <Button
                type="primary"
                className="action-button"
                size="small"
                icon={<RollbackOutlined />}
              />
            </Tooltip>
          </div>
          <div>
            <Tooltip title="Delete Transaction">
              <Button
                type="primary"
                danger
                icon={<DeleteOutlined />}
                className="action-button action-button-danger"
                size="small"
              />
            </Tooltip>
          </div>
        </div>
      ),
    },
  ];

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
