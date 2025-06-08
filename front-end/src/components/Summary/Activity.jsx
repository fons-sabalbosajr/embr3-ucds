import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
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
import PermitMonitoringModal from "./PermitMonitoring";
import "./activity.css";

const { Panel } = Collapse;

const formatSortKeyDisplay = (sortKey) => {
  if (typeof sortKey !== 'string') return sortKey;
  const parts = sortKey.split('-');
  if (parts.length === 2) {
    const prefix = parts[0];
    const numberStr = parts[1];
    // Check if numberStr consists only of digits before parsing
    if (/^\d+$/.test(numberStr)) {
      const number = parseInt(numberStr, 10); // This removes leading zeros
      return `${prefix}-${number}`;
    }
  }
  return sortKey; // Return original if format is unexpected or no numeric part
};

const Activity = ({ theme, provinceAccess }) => {
  const [permits, setPermits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [selectedRecord, setSelectedRecord] = useState({
    id_no: "",
    ecc_cnc: "",
  });
  const pageSize = 10; // Number of id_no entries per page

  const provincePrefixes = {
    aurora: "AU",
    bataan: "BA",
    bulacan: "BU",
    nuevaEcija: "NE",
    pampanga: "PA",
    tarlac: "TA",
    zambales: "ZA",
  };

  const allowedPrefixes = Object.entries(provinceAccess)
    .filter(([_, access]) => access)
    .map(([prov]) => provincePrefixes[prov]);

  useEffect(() => {
    const fetchPermits = async () => {
      try {
        setLoading(true);

        const response = await axios.get(
          "http://localhost:8081/api/permits-summary",
          {
            params: {
              page: currentPage,
              pageSize: pageSize,
              prefixes: allowedPrefixes.join(","), // Send as query string
            },
          }
        );

        const { data, total } = response.data;
        setPermits(data);
        setTotal(total);
      } catch (error) {
        console.error("Error fetching permit summary:", error);
        setPermits([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    };

    if (allowedPrefixes.length > 0) {
      fetchPermits();
    } else {
      setPermits([]);
      setTotal(0);
    }
  }, [currentPage, pageSize, allowedPrefixes.join(",")]);

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

  const collapseItems = permits.map((item) => ({
    key: item.sort_key,
    label: (
      <div className="panel-header-content">
        <div className="title-column">
          <div className="panel-title">
            {formatSortKeyDisplay(item.sort_key)}: {item.title} <br />
            {item.ecc_cnc && (
              <span
                className="ecc-cnc-tag"
                style={{
                  backgroundColor: theme === "dark" ? "#333333" : "#f0f0f0",
                  color: theme === "dark" ? "#e0e0e0" : "#000000",
                }}
              >
                {item.ecc_cnc}
              </span>
            )}
          </div>
        </div>
        <div className="permit-tags-column">
          <div className="permit-tags-container">
            {item.permits
              .filter(
                (permit) => permit.isNearExpiry || permit.isExpired
              )
              .map((permit, index) => {
                // Add this console.log to inspect the permit object
                console.log("Activity.jsx - Rendering Tag for Permit:", permit);
                return (
                  <Tag
                    key={index}
                    color={
                      permit.isExpired
                        ? "red"
                        : permit.isNearExpiry
                        ? "yellow"
                        : ""
                    }
                    className="permit-tag"
                  >
                    {permit.type}
                  </Tag>
                );
              })}
          </div>
        </div>
      </div>
    ),
    children: (
      <ul className="permit-list">
        {item.permits.map((permit, index) => {
          const expiryDate = new Date(permit.expiry);
          let iconElement = null;
          let textElement = null;

          if (permit.isExpired) {
            iconElement = (
              <WarningFilled
                className="expired-icon"
                style={{ color: theme === "dark" ? "#ff4d4f" : "#ff7875" }}
              />
            );
            textElement = (
              <span>
                {permit.type} already expired last{" "}
                {expiryDate.toLocaleDateString()}
              </span>
            );
          } else if (permit.isNearExpiry) {
            iconElement = (
              <ClockCircleFilled
                className="will-expire-icon"
                style={{ color: theme === "dark" ? "#faad14" : "#ffc069" }}
              />
            );
            textElement = (
              <span>
                {permit.type} will expire by {expiryDate.toLocaleDateString()}
              </span>
            );
          } else {
            // Valid and not near expiry
            iconElement = (
              <ClockCircleFilled // Or consider CheckCircleFilled if available/preferred
                className="valid-icon"
                style={{ color: theme === "dark" ? "#52c41a" : "#73d13d" }} // Green tones
              />
            );
            textElement = (
              <span>
                {permit.type} is valid until {expiryDate.toLocaleDateString()}
              </span>
            );
          }

          return (
            <li key={index} className="permit-item">
              <div className="permit-text">{iconElement} {textElement}</div>
            </li>
          );
        })}
      </ul>
    ),
  }));

  return (
    <div className="activity-container">
      <div className="activity-header-row">
        <h3
          className="activity-title"
          style={{
            color: theme === "dark" ? "#ffffff" : "#000000", // Adjust title color based on theme
            fontSize: "16px",
          }}
        >
          Permit Monitoring
        </h3>
        <div className="pagination-buttons">
          <Tooltip title="Previous">
            <button
              disabled={currentPage === 1 || loading}
              onClick={handlePrev}
              className="nav-button"
              style={{
                backgroundColor: theme === "dark" ? "#1e1e1e" : "#f0f0f0",
                color: theme === "dark" ? "#e0e0e0" : "#000000",
              }}
            >
              {loading ? <LoadingOutlined /> : <CaretLeftOutlined />}
            </button>
          </Tooltip>
          <Tooltip title="Next">
            <button
              disabled={currentPage * pageSize >= total || loading}
              onClick={handleNext}
              className="nav-button"
              style={{
                backgroundColor: theme === "dark" ? "#1e1e1e" : "#f0f0f0",
                color: theme === "dark" ? "#e0e0e0" : "#000000",
              }}
            >
              {loading ? <LoadingOutlined /> : <CaretRightOutlined />}
            </button>
          </Tooltip>
          <Tooltip title="See All">
            <button
              onClick={() => setModalOpen(true)}
              className="nav-button see-all-button"
              style={{
                backgroundColor: theme === "dark" ? "#1e1e1e" : "#f0f0f0",
                color: theme === "dark" ? "#e0e0e0" : "#000000",
              }}
            >
              ...
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
            style={{
              backgroundColor: theme === "dark" ? "#1e1e1e" : "#ffffff",
              border: theme === "dark" ? "1px solid #333" : "1px solid #ddd",
              borderRadius: "8px",
            }}
            expandIcon={({ isActive }) => (
              <div className="expand-icon-wrapper">
                <CaretRightOutlined
                  rotate={isActive ? 90 : 0}
                  style={{
                    fontSize: "14px",
                    color: theme === "dark" ? "#e0e0e0" : "#555",
                  }}
                />
              </div>
            )}
            items={collapseItems}
          />
        </div>
      )}

      <Modal
        title="Update ECC/CNC"
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        footer={null}
        style={{
          backgroundColor: theme === "dark" ? "#1e1e1e" : "#ffffff",
          color: theme === "dark" ? "#e0e0e0" : "#000000",
        }}
      >
        <p>
          <strong>ID No:</strong> {formatSortKeyDisplay(selectedRecord.sort_key)}
        </p>
        <p>
          <strong>ECC/CNC:</strong> {selectedRecord.ecc_cnc || "N/A"}
        </p>
      </Modal>

      <PermitMonitoringModal
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        data={permits}
        provinceAccess={provinceAccess}
      />
    </div>
  );
};

export default Activity;
