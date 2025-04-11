import React, { useEffect, useState, useRef, useMemo } from "react";
import { Table, Spin, Input, Tooltip, Button, Modal, message } from "antd";
import { EditOutlined, SaveOutlined, CloseOutlined } from "@ant-design/icons";
import Draggable from "react-draggable";
import fieldLabels from "../../constants/fieldLabels";
import "./duplicatenotif.css";

const DuplicateNotif = ({ duplicateData, onDuplicateResolved, setWarnings }) => {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState([]);
  const [editingKey, setEditingKey] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  const [originalRecords, setOriginalRecords] = useState([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [editingRow, setEditingRow] = useState(null);
  const [dataSource, setDataSource] = useState([]);
  const [showConfirmModal, setShowConfirmModal] = useState(false); // Track if confirmation modal is visible
  const [actionType, setActionType] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchRecord = async (id_no) => {
      try {
        const response = await fetch(
          `http://localhost:8081/api/ucds-data/${id_no}`
        );

        if (response.ok) {
          return await response.json();
        } else if (response.status === 404) {
          console.warn(
            `Record ${id_no} not found in ucds-data (possibly archived).`
          );
          return null; // Skip rendering this record
        } else {
          console.error(
            `Failed to fetch ${id_no}: ${response.status} ${response.statusText}`
          );
          return null;
        }
      } catch (error) {
        console.error(`Network error fetching ${id_no}:`, error);
        return null;
      }
    };

    const fetchDuplicateData = async () => {
      try {
        const fetchedRecords = await Promise.all(
          duplicateData.idNos.map(async (id_no, index) => {
            const record = await fetchRecord(id_no);
            if (!record) return null;

            return {
              ...record,
              key: index,
              onEdit: (field, value) => {
                setRecords((prev) =>
                  prev.map((r, i) =>
                    i === index ? { ...r, [field]: value } : r
                  )
                );
                setHasChanges(true);
              },
            };
          })
        );

        setRecords(fetchedRecords.filter(Boolean));
      } catch (error) {
        console.error("Error fetching duplicate data:", error);
      } finally {
        setLoading(false); // Ensure loading is set to false
      }
    };

    fetchDuplicateData();
  }, [duplicateData]);

  useEffect(() => {
    if (records.length > 0) {
      const transformed = Object.keys(records[0])
        .filter((key) => !["_id", "sort_key", "onEdit", "key"].includes(key)) // keep all needed
        .sort((a, b) => {
          if (a === "id_no") return -1;
          if (b === "id_no") return 1;
          if (a === "ecc_cnc") return -1;
          if (b === "ecc_cnc") return 1;
          return 0;
        })
        .map((fieldKey) => {
          const row = { key: fieldKey, field: fieldKey };
          records.forEach((record, index) => {
            row[`record${index + 1}`] = record[fieldKey] || "";
          });
          return row;
        });
      setDataSource(transformed);
    }
  }, [records]);

  const EditableCell = ({
    editing,
    dataIndex,
    record,
    children,
    ...restProps
  }) => {
    const handleChange = (e) => {
      const newValue = e.target.value;
      setDataSource((prev) =>
        prev.map((row) =>
          row.key === record.key ? { ...row, [dataIndex]: newValue } : row
        )
      );
      setHasChanges(true); // Mark that changes have been made
    };
  
    return (
      <td {...restProps}>
        {editing ? (
          <Input
            value={record[dataIndex]}
            onChange={handleChange}
            autoFocus
            style={{ textAlign: "left", fontSize: "12px", padding: "4px" }}
            size="small"
          />
        ) : (
          children
        )}
      </td>
    );
  };

  const isEditing = (record) => record.key === editingKey;

  const edit = (key) => setEditingKey(key);

  const cancel = () => setEditingKey("");

  const save = (key) => {
    setEditingKey("");
    //message.success("Changes saved.");
  };

  const detectIssues = (records) => {
    if (!Array.isArray(records) || records.length < 2) {
      return <p>No records to compare.</p>;
    }

    const issues = [];

    // Check for duplicate ECC/CNC
    const eccCncSet = new Set(records.map((record) => record.ecc_cnc));
    if (eccCncSet.size === 1) {
      issues.push(
        "All records have the same ECC/CNC, which may indicate a duplicate permit."
      );
    }

    // Check for duplicate project titles
    const titleSet = new Set(records.map((record) => record.title));
    if (titleSet.size === 1) {
      issues.push(
        "All records have the same project title, which may indicate a double entry."
      );
    }

    // Check for duplicate addresses
    const addressSet = new Set(records.map((record) => record.address));
    if (addressSet.size === 1) {
      issues.push(
        "All records have the same address, which may indicate a duplicate entry."
      );
    }

    // Return the issues or a message if no issues are found
    return issues.length > 0 ? (
      <ul>
        {issues.map((issue, index) => (
          <li key={index}>{issue}</li>
        ))}
      </ul>
    ) : (
      <p>No issues detected between the records.</p>
    );
  };

  const handleSaveChanges = async () => {
    try {
      const updatedRecords = [];
  
      dataSource.forEach((row) => {
        const field = row.field;
  
        records.forEach((record, index) => {
          const currentVal = row[`record${index + 1}`];
          const originalVal = record[field];
          const id_no = record.id_no;
  
          if (currentVal !== originalVal) {
            let target = updatedRecords.find((r) => r.id_no === id_no);
            if (!target) {
              target = { id_no };
              updatedRecords.push(target);
            }
            target[field] = currentVal;
          }
        });
      });
  
      if (updatedRecords.length === 0) {
        message.info("No changes to save.");
        return;
      }
  
      const response = await fetch(
        "http://localhost:8081/api/ucds/update-duplicates",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ updates: updatedRecords }),
        }
      );
  
      if (!response.ok) throw new Error("Failed to save changes.");
  
      message.success("Changes saved to database.");
      setHasChanges(false); // Reset hasChanges after saving
    } catch (err) {
      console.error(err);
      message.error("Error saving changes.");
    }
  };

  const handleArchive = () => {
    setIsModalVisible(true); // Show the modal
  };

  const handleModalOk = async () => {
    if (!selectedRecord) {
      message.error({
        content: "No record selected for archiving.",
        placement: "topRight", // Show the message on the right side
      });
      return;
    }

    const id_no = selectedRecord.id_no; // Use selectedRecord.id_no

    try {
      //console.log(`Archiving record with id_no: ${id_no}`);

      const response = await fetch("http://localhost:8081/api/archive-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_no }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to transfer the record to archive-data. Server response: ${errorText}`
        );
      }

      //console.log(`Successfully archived record: ${id_no}`);

      message.success({
        content: `Record with ID ${id_no} has been successfully archived.`,
        placement: "topRight", // Show the message on the right side
      });

       // Remove the archived record from the records state
    setRecords((prev) => prev.filter((record) => record.id_no !== id_no));

    // Remove the archived record from the warnings state
    setWarnings((prevWarnings) =>
      prevWarnings.filter((warning) =>
        !warning.idNos.includes(id_no)
      )
    );

     
    // Notify the parent component about the resolved duplicate
    if (typeof onDuplicateResolved === "function") {
      onDuplicateResolved(id_no);
    }

    } catch (error) {
      console.error("Error during transfer operation:", error);

      message.error({
        content: `Failed to archive the record. Details: ${error.message}`,
        placement: "topRight", // Show the message on the right side
      });
    }
  };

  const handleModalCancel = () => {
    setIsModalVisible(false); // Hide the modal
    setSelectedRecord(null); // Reset the selected record
  };

  const handleCancel = () => {
    console.log("Cancelling changes...");
    setEditingKey("");
    setHasChanges(false);
  };

  const showConfirm = (action) => {
    setActionType(action); // Set the action type (save or cancel)
    setShowConfirmModal(true); // Show the confirmation modal
  };

  const handleCancelChanges = () => {
    setHasChanges(false); // Reset any changes
    setShowConfirmModal(false); // Close the confirmation modal
    message.info("Changes discarded.");
  };

  const columns = [
    {
      title: "Field",
      dataIndex: "field",
      key: "field",
      align: "center",
      width: "200px",
      render: (text) => (
        <div style={{ textAlign: "left" }}>
          <b>{fieldLabels[text] || text}</b>
        </div>
      ),
    },
    ...records.map((_, index) => ({
      title: `Record ${index + 1}`,
      dataIndex: `record${index + 1}`,
      key: `record${index + 1}`,
      align: "center",
      className: "table-header-center",
      render: (text, record) => {
        const original = originalRecords[index];
        const fieldName = record.field;
        const changed = original && original[fieldName] !== text;

        return (
          <div
            style={{
              textAlign: "left",
            }}
          >
            {text || "N/A"}
          </div>
        );
      },
      onCell: (record) => ({
        record,
        dataIndex: `record${index + 1}`,
        editing: isEditing(record),
      }),
    })),
    {
      title: "Actions",
      key: "actions",
      align: "center",
      width: "100px",
      className: "table-header-center",
      render: (_, record) => {
        const editable = isEditing(record);
        return editable ? (
          <div style={{ textAlign: "center" }}>
            <Tooltip title="Save" overlayClassName="custom-tooltip">
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={() => save(record.key)}
                style={{
                  fontSize: "12px",
                  padding: "4px 8px",
                  marginRight: "8px",
                }}
                size="small"
              />
            </Tooltip>
            <Tooltip title="Cancel" overlayClassName="custom-tooltip">
              <Button
                type="default"
                danger
                icon={<CloseOutlined />}
                onClick={cancel}
                style={{ fontSize: "12px", padding: "4px 8px" }}
                size="small"
              />
            </Tooltip>
          </div>
        ) : (
          <Tooltip title="Edit" overlayClassName="custom-tooltip">
            <Button
              type="primary"
              icon={<EditOutlined />}
              onClick={() => edit(record.key)}
              style={{
                fontSize: "12px",
                padding: "4px 8px",
                backgroundColor: "#4caf50",
                borderColor: "#4caf50",
              }}
              size="small"
            />
          </Tooltip>
        );
      },
    },
  ];

  return loading ? (
    <Spin />
  ) : (
    <>
      <Table
        components={{
          body: {
            cell: EditableCell,
          },
        }}
        dataSource={dataSource} // Use the full dataSource
        columns={columns}
        pagination={false} // Disable pagination
        bordered
        size="small"
        locale={{
          emptyText: loading ? <Spin /> : "No duplicate records found.",
        }}
        rowClassName={(record) => {
          // Highlight the row if all records in the row are the same
          const values = records.map(
            (_, index) => record[`record${index + 1}`]
          );
          return values.every((val) => val === values[0])
            ? "highlight-row"
            : "";
        }}
        scroll={{ y: 400 }} // Set the height for vertical scrolling
      />
      <div className="table-footer">
        <div className="issues-section">
          <h3>Possible Issues Detected:</h3>
          {detectIssues(records)}
        </div>
        <div className="button-group">
          <Button
            type="primary"
            size="small"
            onClick={() => showConfirm("save")}
            disabled={!hasChanges || isSaving}
          >
            Save Changes
          </Button>
          <Button type="default" size="small" onClick={() => handleArchive()}>
            Archive
          </Button>
          <Button
            type="default"
            size="small"
            danger
            onClick={() => showConfirm("cancel")}
            disabled={!hasChanges || isSaving}
          >
            Cancel
          </Button>
        </div>
      </div>

      <Modal
        title={
          <div
            style={{
              width: "100%",
            }}
          >
            Archive Record
          </div>
        }
        open={isModalVisible}
        onOk={handleModalOk}
        onCancel={handleModalCancel}
        okText="Archive"
        cancelText="Cancel"
      >
        <p>Please select which record to archive:</p>
        <div>
          <Button
            type={selectedRecord === records[0] ? "primary" : "default"}
            onClick={() => {
              console.log("Selected Record 1:", records[0]);
              setSelectedRecord(records[0]);
            }}
          >
            Archive Record 1
          </Button>
          <Button
            type={selectedRecord === records[1] ? "primary" : "default"}
            onClick={() => {
              console.log("Selected Record 2:", records[1]);
              setSelectedRecord(records[1]);
            }}
            style={{ marginLeft: "10px" }}
          >
            Archive Record 2
          </Button>
        </div>
      </Modal>

      <Modal
        title={`Confirm ${actionType === "save" ? "Save" : "Cancel"}`}
        open={showConfirmModal}
        onOk={() => {
          if (actionType === "save") {
            handleSaveChanges(); // Save changes if confirmed
          } else if (actionType === "cancel") {
            handleCancelChanges(); // Cancel changes if confirmed
          }
          setShowConfirmModal(false); // Close the modal after confirming
        }}
        onCancel={() => setShowConfirmModal(false)} // Close the modal without doing anything
        okText="Yes"
        cancelText="No"
      >
        <p>
          Are you sure you want to {actionType === "save" ? "save" : "cancel"}{" "}
          the changes?
        </p>
      </Modal>
    </>
  );
};

export default DuplicateNotif;
