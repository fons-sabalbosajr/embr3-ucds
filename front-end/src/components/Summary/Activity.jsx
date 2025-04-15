import React, { useState, useEffect } from "react";
import { Collapse, Spin, Tooltip, Tag, Modal, Button } from "antd";
import {
  EditOutlined,
  ClockCircleFilled,
  WarningFilled,
  CaretLeftOutlined,
  CaretRightOutlined,
  LoadingOutlined,
} from "@ant-design/icons";
import axios from "axios";
import "./activity.css";

const { Panel } = Collapse;

const Activity = () => {
  const [permits, setPermits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState({
    id_no: "",
    ecc_cnc: "",
  });
  const pageSize = 5; // Number of id_no entries per page

  useEffect(() => {
    const fetchPermits = async () => {
      try {
        setLoading(true); // Start loading before fetching
        // Make the API call
        const response = await axios.get(
          `http://localhost:8081/api/permits-summary?page=${currentPage}&pageSize=${pageSize}`
        );

        // Ensure we correctly extract data and total records
        const { data, total } = response.data;
        // Set the permits and total number of records in state
        setPermits(data);
        setTotal(total);
      } catch (error) {
        console.error("Error fetching permit summary:", error);
      } finally {
        setLoading(false); // Stop loading after fetching is done
      }
    };

    fetchPermits();
  }, [currentPage, pageSize]);

  const handleNext = () => {
    if (currentPage * pageSize < total) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handlePrev = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  return (
    <div className="activity-container">
      <div className="activity-header-row">
        <h3>Permit Monitoring</h3>
        <div className="pagination-buttons">
          <Tooltip title="Previous">
            <button
              disabled={currentPage === 1 || loading}
              onClick={handlePrev}
              className="nav-button"
            >
              {loading ? <LoadingOutlined /> : <CaretLeftOutlined />}
            </button>
          </Tooltip>
          <Tooltip title="Next">
            <button
              disabled={currentPage * pageSize >= total || loading}
              onClick={handleNext}
              className="nav-button"
            >
              {loading ? <LoadingOutlined /> : <CaretRightOutlined />}
            </button>
          </Tooltip>
        </div>
      </div>

      {loading ? (
        <div className="loading-container">
          <Spin size="small" /> Loading Data...
        </div>
      ) : (
        <div className="collapsible-table-wrapper">
          <Collapse
            accordion
            className="activity-collapse"
            expandIcon={({ isActive }) => (
              <div className="expand-icon-wrapper">
                <CaretRightOutlined
                  rotate={isActive ? 90 : 0}
                  style={{ fontSize: "14px", color: "#555" }}
                />
              </div>
            )}
          >
            {permits.map((item) => (
              <Panel
                header={
                  <div className="panel-header-content">
                    <div className="title-column">
                      <div className="panel-title">
                        {item.id_no}: {item.title} <br />
                        {item.ecc_cnc && (
                          <span className="ecc-cnc-tag"> {item.ecc_cnc}</span>
                        )}
                      </div>
                    </div>
                    <div className="permit-tags-column">
                      <div className="permit-tags-container">
                        {item.permits
                          .filter(
                            (permit) => permit.isNearExpiry || permit.isExpired
                          )
                          .map((permit, index) => (
                            <Tag
                              key={index}
                              color={
                                permit.isExpired
                                  ? "red"
                                  : permit.isNearExpiry
                                  ? "orange"
                                  : ""
                              }
                              className="permit-tag"
                            >
                              {permit.type}
                            </Tag>
                          ))}
                      </div>
                    </div>
                  </div>
                }
                key={item.id_no}
                className="panel-header"
              >
                <ul className="permit-list">
                  {item.permits.map((permit, index) => {
                    const expiryDate = new Date(permit.expiry);

                    return (
                      <li key={index} className="permit-item">
                        <div className="permit-text">
                          {permit.isExpired ? (
                            <>
                              <WarningFilled className="expired-icon" />{" "}
                              {permit.type} already expired last{" "}
                              {expiryDate.toLocaleDateString()}
                            </>
                          ) : (
                            <>
                              <ClockCircleFilled className="will-expire-icon" />{" "}
                              {permit.type} will expire by{" "}
                              {expiryDate.toLocaleDateString()}
                            </>
                          )}
                        </div>
                        <Tooltip title="Update">
                          <Button
                            type="primary"
                            icon={<EditOutlined />}
                            size="small"
                            className="update-btn"
                            onClick={() => {
                              setSelectedRecord({
                                id_no: item.id_no,
                                ecc_cnc: item.ecc_cnc,
                              });
                              setIsModalVisible(true);
                            }}
                          />
                        </Tooltip>
                      </li>
                    );
                  })}
                </ul>
              </Panel>
            ))}
          </Collapse>
        </div>
      )}

      <Modal
        title="Update ECC/CNC"
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        footer={null}
      >
        <p>
          <strong>ID No:</strong> {selectedRecord.id_no}
        </p>
        <p>
          <strong>ECC/CNC:</strong> {selectedRecord.ecc_cnc || "N/A"}
        </p>

        {/* Add your update form or buttons here */}
      </Modal>
    </div>
  );
};

export default Activity;
