import React, { useEffect, useState, useRef, useMemo } from "react";
import { Table, Spin, Input, Tooltip, Button, Modal, message } from "antd";
import { EditOutlined, SaveOutlined, CloseOutlined } from "@ant-design/icons";
import Draggable from "react-draggable";
import fieldLabels from "../../constants/fieldLabels";
import {
  getUcdsRecordById,
  updateUcdsDuplicates,
  archiveUcdsRecord,
} from "../../api/notificationService"; // Import the consolidated service
import "./duplicatenotif.css";

const DuplicateNotif = ({
  duplicateData,
  onDuplicateResolved,
  theme
}) => {
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
    const fetchDuplicateData = async () => {
      setLoading(true);
      try {
        const fetchedRecords = await Promise.all(
          duplicateData.idNos.map(async (id_no, index) => {
            // Use the service function
            const record = await getUcdsRecordById(id_no).catch(error => {
              // Errors are logged in the service, but we can add component-specific handling
              message.error(`Could not load details for record ${id_no}.`);
              return null;
            });
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

  const checkFieldDuplicate = (field, label, message) => {
    const values = records.map((r) => r[field]);
    const allSame = values.every((val) => val === values[0]);
    if (allSame && values[0]) {
      issues.push(`${label}: ${message}`);
    }
  };

  // General duplicate checks
  checkFieldDuplicate("ecc_cnc", "ECC/CNC", "All records have the same ECC/CNC, which may indicate a duplicate permit.");
  checkFieldDuplicate("title", "Project Title", "All records have the same project title, which may indicate a double entry.");
  checkFieldDuplicate("address", "Address", "All records have the same address, which may indicate a duplicate entry.");
  checkFieldDuplicate("name", "Name", "All records have the same facility name, possibly indicating a reused name.");
  checkFieldDuplicate("industry_class", "Industry Class", "Same industry classification across records.");
  checkFieldDuplicate("industry_type", "Industry Type", "Same industry type across records.");
  checkFieldDuplicate("industry_subtype", "Industry Subtype", "Same industry subtype across records.");
  checkFieldDuplicate("psic_code", "PSIC Code", "Identical PSIC code across all records.");
  checkFieldDuplicate("mbu_area", "MBU Area", "Identical MBU area values across records.");
  checkFieldDuplicate("waterbody", "Waterbody", "Same waterbody assigned to all records.");
  checkFieldDuplicate("long", "Longitude", "Identical longitude may imply same location.");
  checkFieldDuplicate("lat", "Latitude", "Identical latitude may imply same location.");
  checkFieldDuplicate("cong_district", "Congressional District", "All records are in the same congressional district.");
  checkFieldDuplicate("street", "Street", "Identical street name in all records.");
  checkFieldDuplicate("brgy", "Barangay", "Same barangay across all entries.");
  checkFieldDuplicate("city", "City", "Same city indicated in all records.");
  checkFieldDuplicate("province", "Province", "All entries are from the same province.");
  checkFieldDuplicate("emp_total", "Total Employees", "Identical employee count might imply same business.");
  checkFieldDuplicate("wwtf_type", "WWTF Type", "Same wastewater facility type.");
  checkFieldDuplicate("bod", "BOD", "Identical BOD values across all records.");
  checkFieldDuplicate("section_incharged", "Section In-Charge", "Same section is handling all records.");
  checkFieldDuplicate("handler", "Handler", "Same handler is assigned to all records.");
  checkFieldDuplicate("monitoring_sched", "Monitoring Schedule", "Identical schedule detected.");
  checkFieldDuplicate("iis_no", "IIS No", "Same IIS number may mean duplicate tracking.");
  checkFieldDuplicate("iis_no_2025", "IIS No 2025", "Same 2025 IIS number may indicate duplicate entry.");
  checkFieldDuplicate("insp_type", "Inspection Type", "Same inspection type across all entries.");
  checkFieldDuplicate("date_monitored", "Date Monitored", "Identical monitoring dates.");
  checkFieldDuplicate("date_routed", "Date Routed", "Same routing date detected.");
  checkFieldDuplicate("date_signed", "Date Signed", "Same date signed value.");
  checkFieldDuplicate("days_dmds", "Days in DMDS", "Same DMDS duration across records.");
  checkFieldDuplicate("days_drds", "Days in DRDS", "Same DRDS duration across records.");
  checkFieldDuplicate("pismu_tracking", "PISMU Tracking", "Same tracking code used.");
  checkFieldDuplicate("title_status", "Title Status", "Identical title status values.");
  checkFieldDuplicate("with_nov", "With NOV", "Same NOV status in all records.");
  checkFieldDuplicate("operational", "Operational", "All records have same operational status.");
  checkFieldDuplicate("permit_process", "Permit Process", "Same permit process value.");
  checkFieldDuplicate("date_amended", "Date Amended", "Same amendment date detected.");
  checkFieldDuplicate("date_approved", "Date Approved", "Identical approval dates.");
  checkFieldDuplicate("pto_code", "PTO Code", "Same PTO code across all records.");
  checkFieldDuplicate("pto_issued", "PTO Issued", "Same PTO issuance date.");
  checkFieldDuplicate("pto_expiration", "PTO Expiration", "Same PTO expiration date.");
  checkFieldDuplicate("wwdp_code", "WWDP Code", "Same WWDP code across all records.");
  checkFieldDuplicate("wwdp_issued", "WWDP Issued", "Same WWDP issuance date.");
  checkFieldDuplicate("wwdp_expiration", "WWDP Expiration", "Same WWDP expiration date.");
  checkFieldDuplicate("haz_id", "HazWaste ID", "Same hazardous waste ID across all records.");
  checkFieldDuplicate("haz_issued", "HazWaste Issued", "Same hazardous waste issuance date.");
  checkFieldDuplicate("pco_no", "PCO Number", "Same PCO number used.");
  checkFieldDuplicate("pco_name", "PCO Name", "Same PCO assigned.");
  checkFieldDuplicate("pco_validity", "PCO Validity", "Same PCO validity date.");
  checkFieldDuplicate("docket_no", "Docket Number", "Same docket number detected.");
  checkFieldDuplicate("denr_pab_case_no", "DENR-PAB Case No", "Same PAB case number.");
  checkFieldDuplicate("nov_issued", "NOV Issued", "Same NOV issuance.");
  checkFieldDuplicate("v_pd1586", "PD 1586 Violation", "Same violation of PD 1586.");
  checkFieldDuplicate("v_ra9275", "RA 9275 Violation", "Same violation under RA 9275.");
  checkFieldDuplicate("v_ra8749", "RA 8749 Violation", "Same violation under RA 8749.");
  checkFieldDuplicate("v_ra6969_haz", "RA 6969 Hazardous", "Same violation under RA 6969 - hazardous.");
  checkFieldDuplicate("v_ra6969_tchem", "RA 6969 Toxic", "Same violation under RA 6969 - toxic.");
  checkFieldDuplicate("tc_date_actual", "TC Actual Date", "Same technical conference date.");
  checkFieldDuplicate("legal_officer", "Legal Officer", "Same legal officer assigned.");
  checkFieldDuplicate("tc_compliance_link", "TC Compliance Link", "Same TC compliance link detected.");
  checkFieldDuplicate("pos_paper", "Position Paper", "Same position paper noted.");
  checkFieldDuplicate("penalty_date", "Penalty Date", "Same penalty issuance date.");
  checkFieldDuplicate("amount", "Penalty Amount", "Identical penalty amount.");
  checkFieldDuplicate("or_number", "OR Number", "Same official receipt number.");
  checkFieldDuplicate("tc_commitment", "TC Commitment", "Same commitment statement.");
  checkFieldDuplicate("other_tc_remarks", "Other TC Remarks", "Same technical conference remarks.");
  checkFieldDuplicate("resolution_issued", "Resolution", "Same resolution issued.");
  checkFieldDuplicate("order_issued", "Order", "Same order issued.");
  checkFieldDuplicate("order_status", "Order Status", "Same order status.");
  checkFieldDuplicate("color", "Color Tag", "All records tagged with the same color.");

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
    setIsSaving(true);
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

      // Use the service function
      await updateUcdsDuplicates(updatedRecords);

      message.success("Changes saved to database.");
      setHasChanges(false); // Reset hasChanges after saving
    } catch (err) {
      // Error is logged in the service
      message.error(err.message || "Error saving changes.");
    } finally {
      setIsSaving(false);
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

    setIsSaving(true); // Indicate saving/processing state
    try {
      // Use the service function
      await archiveUcdsRecord(id_no);

      // console.log(`Successfully archived record: ${id_no}`);

      message.success({
        content: `Record with ID ${id_no} has been successfully archived.`,
        placement: "topRight", // Show the message on the right side
      });

      // Remove the archived record from the records state
      setRecords((prev) => prev.filter((record) => record.id_no !== id_no));

      // Notify the parent component about the resolved duplicate
      if (typeof onDuplicateResolved === "function") {
        onDuplicateResolved(id_no);
      }
      setIsModalVisible(false); // Close the archive selection modal
    } catch (error) {
      // Error is logged in the service
      message.error({
        content: error.message || `Failed to archive the record.`,
        placement: "topRight", // Show the message on the right side
      });
      // Potentially do not close the modal on error, or handle as needed
    } finally {
      setIsSaving(false);
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
      render: (cellValue, tableRowRecord) => { // cellValue is the text for this cell, tableRowRecord is the row data for the AntD table (e.g., { field: 'ecc_cnc', record1: 'val1', ...})
        const fieldKey = tableRowRecord.field; // The field name for this row (e.g., 'ecc_cnc', 'title')

        let isDuplicateField = false;
        if (records.length > 1) {
          const allValuesForThisField = records.map(r => r[fieldKey]);
          const firstValue = allValuesForThisField[0];

          // Check if the first value is meaningful (not null, undefined, or an empty/whitespace string)
          // and if all other values strictly match it.
          if (firstValue !== null &&
              firstValue !== undefined &&
              String(firstValue).trim() !== '' && // Ensures "  " is treated as empty
              allValuesForThisField.every(val => val === firstValue)) {
            isDuplicateField = true;
          }
        }

        return (
          <div
            className={isDuplicateField ? 'duplicate-data-text' : ''} // Apply class if data is duplicate
            style={{ textAlign: "left" }}
          >
            {cellValue === null || cellValue === undefined || String(cellValue).trim() === '' ? "N/A" : String(cellValue)}
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
            <Tooltip title="Save" classNames="custom-tooltip">
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
            <Tooltip title="Cancel" classNames="custom-tooltip">
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
          <Tooltip title="Edit" classNames="custom-tooltip">
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
     <div className={`${theme}-theme`}> {/* Ensure this line exists and uses the theme prop */}
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
        rowClassName={(tableRowRecord) => {
          // 'records' is the component's state: array of original data objects
          // 'tableRowRecord' is a row from 'dataSource', representing one field across all original records
          // e.g., tableRowRecord = { field: 'ecc_cnc', record1: 'val1', record2: 'val2', ... }

          if (records.length < 2) {
            return "table-row"; // No comparison or highlight if less than 2 original records
          }

          const fieldValuesInRow = [];
          for (let i = 0; i < records.length; i++) {
            fieldValuesInRow.push(tableRowRecord[`record${i + 1}`]);
          }

          const allSame = fieldValuesInRow.every((val) => val === fieldValuesInRow[0]);
          return "table-row"; // Remove row-level class, cell-level styling will handle it
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
          <Button type="primary" size="small" onClick={() => handleArchive()}>
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
    </div>
  );
};

export default DuplicateNotif;
