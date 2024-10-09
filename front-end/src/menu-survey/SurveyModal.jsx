import React, { useEffect, useState } from "react";
import { Tabs, Button, message } from "antd";
import { EditOutlined, SaveOutlined } from "@ant-design/icons";
import Swal from "sweetalert2";
import axios from "axios";
import GenInfo from "./tabspanes/GenInfo/GenInfo";
import FocalPerson from "./tabspanes/FocalPerson/FocalPerson";
import LegalUnit from "./tabspanes/LegalUnit/LegalUnit";
import MBU from "./tabspanes/MBU/MBU";
import Transaction from "./tabspanes/TransactionLog/Transaction";
import "./surveymodal.css";

const { TabPane } = Tabs;

const SurveyModal = ({ record, handleReload, onClose }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedRecord, setEditedRecord] = useState(record);
  const [activeTab, setActiveTab] = useState("1");
  const [penaltyAmounts, setPenaltyAmounts] = useState([]);
  const [penaltyOrNumbers, setPenaltyOrNumbers] = useState([]);
  const [isLogChecked, setIsLogChecked] = useState(() => {
    const storedValue = localStorage.getItem("isLogChecked");
    return storedValue ? JSON.parse(storedValue) : {};
  });
  const [previousRecord, setPreviousRecord] = useState(null);

  useEffect(() => {
    localStorage.setItem("isLogChecked", JSON.stringify(isLogChecked));
  }, [isLogChecked]);

  useEffect(() => {
    if (record && JSON.stringify(record) !== JSON.stringify(previousRecord)) {
      checkIfLogExists(record);
    }
    setPreviousRecord(record);
  }, [record, previousRecord, isLogChecked]);

  const checkIfLogExists = async (record) => {
    try {
      const iisNo = record.iis_no;
      const response = await axios.get(
        `http://localhost:8081/api/survey-log?iis_no=${iisNo}`
      );
      const existingLogs = response.data;

      if (existingLogs.length > 0) {
        setIsLogChecked((prevIsLogChecked) => ({
          ...prevIsLogChecked,
          [iisNo]: true,
        }));
      } else {
        logInitialData(record);
        setIsLogChecked((prevIsLogChecked) => ({
          ...prevIsLogChecked,
          [iisNo]: true,
        }));
      }
    } catch (error) {
      console.error("Error checking existing logs:", error);
    }
  };

  useEffect(() => {
    if (record) {
      setEditedRecord(record);
      const loadedPenaltyAmounts = (record.penalty_amount || "")
        .split("\n")
        .map((amount) => amount.trim());
      const loadedPenaltyOrNumbers = (record.penalty_or_number || "")
        .split("\n")
        .map((number) => number.trim());
      setPenaltyAmounts(loadedPenaltyAmounts);
      setPenaltyOrNumbers(loadedPenaltyOrNumbers);
    }
  }, [record]);

  let isLogging = false;

  const logInitialData = async (record) => {
    if (isLogging) return;
    isLogging = true;

    const now = new Date();
    const transactionDate = `${
      now.getMonth() + 1
    }/${now.getDate()}/${now.getFullYear()} ${now.getHours()}:${String(
      now.getMinutes()
    ).padStart(2, "0")}`;

    try {
      const response = await axios.get("http://localhost:8081/api/survey-log");
      const transactions = response.data;

      // Check if the iis_no already exists in the survey-log collection
      // const existingTransaction = transactions.find((transaction) => {
      //   return transaction.newValue.includes(record.iis_no);
      // });

      // if (existingTransaction) {
      //   console.log(
      //     `iis_no ${record.iis_no} already exists in the survey-log collection.`
      //   );
      //   isLogging = false;
      //   return;
      // }

      let transactionCounter = 1;
      if (transactions.length > 0) {
        const lastTransaction = transactions[transactions.length - 1];
        const lastTransactionID = lastTransaction.transactionID;
        const lastTransactionNumber = parseInt(
          lastTransactionID.replace("TRX-", "")
        );
        transactionCounter = lastTransactionNumber + 1;
      }

      const logData = {
        transactionID: `TRX-${String(transactionCounter).padStart(4, "0")}`,
        transactionDate: transactionDate,
        actionType: "Initial Data",
        oldValue: "-",
        newValue: `${record.iis_no} \n ${record.project_title}`,
        userActed: localStorage.getItem("username"),
        dateActed: transactionDate,
      };

      try {
        const response = await axios.post(
          "http://localhost:8081/api/survey-log",
          logData
        );
        // if (response.status === 200) {
        //   console.log("Initial data logged successfully:", response.data);
        // } else {
        //   console.error("Failed to log initial data:", response);
        // }
      } catch (error) {
        console.error("Error logging initial data:", error);
      } finally {
        isLogging = false;
      }
    } catch (error) {
      console.error("Error fetching transactions:", error);
    }
  };

  const handleChange = (field, value) => {
    setEditedRecord({
      ...editedRecord,
      [field]: value,
    });
  };

  const handleSaveChanges = async () => {
    Swal.fire({
      title: "Confirm Save",
      text: "Do you want to save the changes?",
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#3085d6",
      cancelButtonColor: "#d33",
      confirmButtonText: "Save Data",
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const { _id, ...recordToUpdate } = editedRecord;

          const currentUsername = localStorage.getItem("username");
          const updatedRecord = {
            ...recordToUpdate,
            penalty_amount: penaltyAmounts.join("\n"),
            penalty_or_number: penaltyOrNumbers.join("\n"),
            iis_no: editedRecord.iis_no,
            updated_by: currentUsername, // Add the username to the request body
          };

          const response = await axios.put(
            `http://localhost:8081/api/update-survey-data/${editedRecord.id_no}`,
            updatedRecord // Send the updated record
          );

          if (response.status === 200) {
            const auditLog = response.data;

            Swal.fire("Success", "Data updated successfully!", "success").then(
              () => {
                setIsEditing(false);

                // Get the latest transaction ID from the survey-log collection
                axios
                  .get("http://localhost:8081/api/survey-log")
                  .then((response) => {
                    const transactions = response.data;

                    let transactionCounter = 1;
                    if (transactions.length > 0) {
                      const lastTransaction =
                        transactions[transactions.length - 1];
                      const lastTransactionID = lastTransaction.transactionID;
                      const lastTransactionNumber = parseInt(
                        lastTransactionID.replace("TRX-", "")
                      );
                      transactionCounter = lastTransactionNumber + 1;
                    }

                    // Create the survey log entry based on the audit log returned from the server
                    const surveyLogEntry = {
                      transactionID: `TRX-${String(transactionCounter).padStart(
                        4,
                        "0"
                      )}`,
                      transactionDate: new Date().toLocaleString(),
                      actionType: "Modified",
                      oldValue: auditLog.changes
                        .map((change) => `${change.old_value}`)
                        .join("\n"), 
                      newValue: `${auditLog.iis_no} \n${auditLog.changes
                        .map((change) => `${change.new_value}`)
                        .join("\n")}`,
                      userActed: auditLog.updated_by,
                      dateActed: new Date(auditLog.updated_at).toLocaleString(),
                    };

                    // Save the survey log entry to the survey-log collection
                    axios
                      .post(
                        "http://localhost:8081/api/survey-log",
                        surveyLogEntry
                      )
                      .then((response) => {
                        //console.log("Survey log entry created successfully!");
                      })
                      .catch((error) => {
                        console.error(
                          "Error creating survey log entry:",
                          error
                        );
                      });
                  })
                  .catch((error) => {
                    console.error(
                      "Error getting latest transaction ID:",
                      error
                    );
                  });

                // Refresh the state with the updated values
                const updatedValues = response.data.changes.find(
                  (change) => change.field === "penalty_amount"
                );
                const refreshedPenaltyAmounts = updatedValues
                  ? updatedValues.new_value
                      .split("\n")
                      .map((amount) => amount.trim())
                  : [];

                const updatedValues2 = response.data.changes.find(
                  (change) => change.field === "penalty_or_number"
                );
                const refreshedPenaltyOrNumbers = updatedValues2
                  ? updatedValues2.new_value
                      .split("\n")
                      .map((number) => number.trim())
                  : [];

                setPenaltyAmounts(refreshedPenaltyAmounts);
                setPenaltyOrNumbers(refreshedPenaltyOrNumbers);

                if (handleReload) handleReload();
              }
            );
          } else {
            Swal.fire("Error", "Failed to save changes", "error");
          }
        } catch (error) {
          Swal.fire("Error", "Failed to save changes", "error");
          console.error("Error updating data:", error);
        }
      }
    });
  };

  const handleCancelEdit = () => {
    Swal.fire({
      title: "Are you sure?",
      text: "You won't be able to revert this!",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#3085d6",
      cancelButtonColor: "#d33",
      confirmButtonText: "Yes, cancel it!",
    }).then((result) => {
      if (result.isConfirmed) {
        setIsEditing(false);
        setEditedRecord(record);
      }
    });
  };

  return (
    <div className="modal-container">
      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        <TabPane
          tab={<span className="custom-tab">General Information</span>}
          key="1"
        >
          <GenInfo
            editedRecord={editedRecord}
            handleChange={handleChange}
            isEditing={isEditing}
          />
        </TabPane>
        <TabPane
          tab={<span className="custom-tab">Concerned Unit/Focal Person</span>}
          key="2"
        >
          <FocalPerson
            editedRecord={editedRecord}
            handleChange={handleChange}
            isEditing={isEditing}
          />
        </TabPane>
        <TabPane
          tab={<span className="custom-tab">Legal Services Unit</span>}
          key="3"
        >
          <LegalUnit
            editedRecord={editedRecord}
            handleChange={handleChange}
            isEditing={isEditing}
            penaltyAmounts={penaltyAmounts}
            setPenaltyAmounts={setPenaltyAmounts}
            penaltyOrNumbers={penaltyOrNumbers}
            setPenaltyOrNumbers={setPenaltyOrNumbers}
          />
        </TabPane>
        <TabPane
          tab={<span className="custom-tab">Manila Bay Unit</span>}
          key="4"
        >
          <MBU
            editedRecord={editedRecord}
            handleChange={handleChange}
            isEditing={isEditing}
          />
        </TabPane>
        <TabPane
          tab={<span className="custom-tab-history">History</span>}
          key="5"
        >
          <Transaction editedRecord={editedRecord} />
        </TabPane>
      </Tabs>

      <div className="action-buttons-container">
        {/* Hide buttons if Transaction History tab is active */}
        {activeTab !== "5" && (
          <div>
            {isEditing ? (
              <div>
                <Button onClick={handleCancelEdit} className="btn-cancel-right">
                  Cancel
                </Button>
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  onClick={handleSaveChanges}
                >
                  Save
                </Button>
              </div>
            ) : (
              <Button
                type="primary"
                icon={<EditOutlined />}
                onClick={() => setIsEditing(true)}
              >
                Edit
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SurveyModal;
