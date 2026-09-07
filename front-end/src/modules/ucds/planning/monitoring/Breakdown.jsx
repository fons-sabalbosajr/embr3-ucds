import React, { useEffect, useState, useMemo } from "react";
import { Modal, Table, Spin, Alert, Tag, Input, Space, Button } from "antd";
import { SearchOutlined, EyeOutlined } from "@ant-design/icons";
import axios from "axios";
import "./breakdown.css";
import Swal from "sweetalert2";
import { API_BASE_URL } from "../../../../config/api";

const Breakdown = ({
  visible,
  onClose,
  criteria,
  theme,
  currentUser, // New prop from Monitoring
  setShouldRefreshTableForParent, // New prop from Monitoring
  handleReloadParentTable, // New prop from Monitoring
}) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [error, setError] = useState(null);
  const [filteredInfo, setFilteredInfo] = useState({});

  useEffect(() => {
    if (visible && criteria && criteria.type) {
      const fetchBreakdownData = async () => {
        setLoading(true);
        setError(null);
        setData([]);
        setFilteredInfo({}); // Reset filters when new criteria are loaded
        try {
          // Assuming an API endpoint like this. You'll need to implement it on your backend.
          let apiUrl = "";
          let apiParams = {};

          if (criteria.type === "eccCncSubtype") {
            apiUrl = `${API_BASE_URL}/api/ucds/list-by-ecc-cnc-subtype`;
            apiParams = { subtypeLabel: criteria.label };
          } else if (criteria.type === "permitStatus") {
            apiUrl = `${API_BASE_URL}/api/ucds/list-by-permit-status`; // New API
            apiParams = {
              permitKey: criteria.permitKey,
              status: criteria.status,
            };
          } else if (criteria.type === "allIndustries") {
            apiUrl = `${API_BASE_URL}/api/ucds/list-all-industries`;
            apiParams = {}; // No specific parameters needed for fetching all
          } else {
            setLoading(false);
            setError("Invalid criteria type for breakdown.");
            return;
          }

          const response = await axios.get(apiUrl, { params: apiParams });
          // Format sort_key here
          const formattedData = response.data.map((item) => {
            let newSortKey = String(item.sort_key || "");
            if (newSortKey.includes("-")) {
              const parts = newSortKey.split("-");
              const prefix = parts[0];
              if (parts.length > 1)
                newSortKey = `${prefix}-${parseInt(parts[1], 10)}`;
            }
            return { ...item, sort_key: newSortKey };
          });
          setData(formattedData);
        } catch (err) {
          console.error("Error fetching breakdown data:", err);
          setError("Failed to load breakdown details. Please try again.");
        } finally {
          setLoading(false);
        }
      };
      fetchBreakdownData();
    }
  }, [visible, criteria]);

  const handleTableChange = (pagination, filters, sorter) => {
    setFilteredInfo(filters);
    // Add sorter handling if needed: setSortedInfo(sorter);
  };

  const getColumnSearchProps = (dataIndex, columnTitle) => ({
    filterDropdown: ({
      setSelectedKeys,
      selectedKeys,
      confirm,
      clearFilters,
    }) => (
      <div style={{ padding: 8 }} onKeyDown={(e) => e.stopPropagation()}>
        <Input
          placeholder={`Search ${columnTitle}`}
          value={selectedKeys[0]}
          onChange={(e) =>
            setSelectedKeys(e.target.value ? [e.target.value] : [])
          }
          onPressEnter={() => confirm()}
          style={{ marginBottom: 8, display: "block" }}
        />
        <Space>
          <Button
            type="primary"
            onClick={() => confirm()}
            size="small"
            style={{ width: 90 }}
          >
            Search
          </Button>
          <Button
            onClick={() => {
              clearFilters();
              confirm();
            }}
            size="small"
            style={{ width: 90 }}
          >
            Reset
          </Button>
        </Space>
      </div>
    ),
    filterIcon: (filtered) => (
      <span style={{ color: filtered ? "#1890ff" : undefined }}>
        <SearchOutlined />
      </span>
    ),
    onFilter: (value, record) =>
      record[dataIndex]
        ? record[dataIndex]
            .toString()
            .toLowerCase()
            .includes(value.toLowerCase())
        : "",
    filteredValue: filteredInfo[dataIndex] || null,
  });

  const currentColumns = useMemo(() => {
    const commonInitialColumns = [
      {
        title: "ID No.",
        dataIndex: "sort_key",
        key: "sort_key",
        width: 70,
        align: "left",
      },
      {
        title: "Proponent Name",
        dataIndex: "name",
        key: "name",
        width: 220,
        align: "left",
        ...getColumnSearchProps("name", "Proponent Name"),
      },
      {
        title: "Project Title",
        dataIndex: "title",
        key: "title",
        width: 220,
        align: "left",
        ...getColumnSearchProps("title", "Project Title"),
        render: (text) => (
          <div style={{ whiteSpace: "normal", wordWrap: "break-word" }}>
            {text}
          </div>
        ),
      },
    ];

    let specificColumns = [];

    if (!criteria || !criteria.type) {
      return commonInitialColumns;
    }

    if (criteria.type === "eccCncSubtype") {
      const eccCncSpecificColumns = [
        {
          title: "ECC/CNC No.",
          dataIndex: "ecc_cnc",
          key: "ecc_cnc",
          width: 180,
          align: "left",
          ...getColumnSearchProps("ecc_cnc", "ECC/CNC Reference No."),
          render: (text, record) => {
            if (!text) return text;
            const eccOnlinePatterns = ["ECC-OL", "ECC OL", "ECC-OL-R03"];
            const cncOnlinePatterns = ["CNC-OL", "CNC OL", "CNC-OL-R03"];
            const getTargetInfo = () => {
              if (criteria.label === "ECC Online") {
                return {
                  name: "ECC Online",
                  url: "https://ecconline.emb.gov.ph/live/Account/Login.aspx",
                  patterns: eccOnlinePatterns,
                };
              } else if (criteria.label === "CNC Online") {
                return {
                  name: "CNC Online",
                  url: "https://cnconline.emb.gov.ph/live/Default.aspx",
                  patterns: cncOnlinePatterns,
                };
              } else if (criteria.label === "Blank ECC/CNC") {
                return null; // No target info for blank ECC/CNC, so no action on click
              }
              return null;
            };

            const handleClick = async () => {
              const target = getTargetInfo();
              if (!target) return;
              const isOnlineGenerated = target.patterns.some((pattern) =>
                text.toUpperCase().includes(pattern)
              );
              if (isOnlineGenerated) {
                try {
                  await navigator.clipboard.writeText(text.trim());
                  Swal.fire({
                    title: `Go to ${target.name}?`,
                    text: "The reference number has been copied to your clipboard. Click OK to proceed.",
                    icon: "info",
                    showCancelButton: true,
                    confirmButtonText: `Open ${target.name}`,
                    cancelButtonText: "Cancel",
                  }).then((result) => {
                    if (result.isConfirmed) {
                      window.open(target.url, "_blank");
                    }
                  });
                } catch (err) {
                  Swal.fire({
                    title: "Clipboard Failed",
                    text: "Unable to copy reference number. Please copy manually.",
                    icon: "error",
                  });
                }
              } else {
                Swal.fire({
                  title: "Manual ECC/CNC Reference",
                  text: "This reference number appears to be manually issued. It may not be searchable online.",
                  icon: "warning",
                  showCancelButton: true,
                  confirmButtonText: `Check ${target.name} Anyway`,
                  cancelButtonText: "Cancel",
                }).then((result) => {
                  if (result.isConfirmed) {
                    navigator.clipboard.writeText(text.trim());
                    window.open(target.url, "_blank");
                  }
                });
              }
            };

            return (
              <span
                onClick={handleClick}
                style={{
                  textDecoration: "underline",
                  cursor: "pointer",
                  color: "#1677ff",
                }}
              >
                {text}
              </span>
            );
          },
        },
        {
          title: "Process",
          dataIndex: "permit_process",
          key: "permit_process",
          width: 100,
          align: "left",
        },
        {
          title: "IIS Transaction No.",
          key: "iis_transaction_no",
          dataIndex: ["iis_no_2024", "iis_no_2025"],
          width: 170,
          align: "left",
          ...getColumnSearchProps("iis_no_2024", "IIS No. (2024/2025)"),
          render: (text, record) => {
            const iis2024 = record.iis_no_2024;
            const iis2025 = record.iis_no_2025;
            const elements = [];
            if (iis2024)
              elements.push(
                <div key="iis2024">
                  2024:{" "}
                  <a
                    href={`https://iis.emb.gov.ph/embis/dms/documents/tracker/?trn_no=${encodeURIComponent(
                      iis2024
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {iis2024}
                  </a>
                </div>
              );
            if (iis2025)
              elements.push(
                <div key="iis2025">
                  2025:{" "}
                  <a
                    href={`https://iis.emb.gov.ph/embis/dms/documents/tracker/?trn_no=${encodeURIComponent(
                      iis2025
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {iis2025}
                  </a>
                </div>
              );
            return elements.length > 0 ? <>{elements}</> : null;
          },
        },
        {
          title: "Date Approved",
          dataIndex: "date_approved",
          key: "date_approved",
          width: 100,
          align: "left",
        },
        {
          title: "Date Amended",
          dataIndex: "date_amended",
          key: "date_amended",
          width: 100,
          align: "left",
        },
        {
          title: "Barangay",
          dataIndex: "brgy",
          key: "brgy",
          width: 100,
          align: "left",
           ...getColumnSearchProps("brgy", "Barangay"),
        },
        {
          title: "City/Municipality",
          dataIndex: "city",
          key: "city",
          width: 100,
          align: "left",
           ...getColumnSearchProps("city", "City"),
        },
        {
          title: "Province",
          dataIndex: "province",
          key: "province",
          width: 100,
          align: "left",
           ...getColumnSearchProps("province", "Province"),
        },
      ];
      specificColumns = eccCncSpecificColumns;
    } else if (criteria.type === "permitStatus") {
      // permitSpecificColumns will be populated based on criteria.permitKey
      if (criteria.permitKey === "pto_code") {
        specificColumns.push(
          {
            title: "PTO Code",
            dataIndex: "pto_code",
            key: "pto_code",
            width: 200,
            align: "left",
            ...getColumnSearchProps("pto_code", "PTO Code"),
            render: (text) => {
              let style = {};
              let color;

              if (
                criteria.type === "permitStatus" &&
                criteria.permitKey === "pto_code"
              ) {
                // Only apply expiry-based colors for these statuses
                if (['Expired', 'Near Expiry', 'Not Expired'].includes(criteria.status) && criteria.status !== "Application Stages") {
                 if (criteria.status === "Expired") {
                  color = theme === "dark" ? "#ff8a80" : "#e57373";
                } else if (criteria.status === "Near Expiry") {
                  color = theme === "dark" ? "#ffd180" : "#ffb74d";
                } else if (criteria.status === "Not Expired") {
                  color = theme === "dark" ? "#a5d6a7" : "#81c784";
                }
                if (color) {
                  style.color = color;
                }
                }
              }

              const isSystemGenerated = (value) =>
                value.includes("PTO-OL") || value.startsWith("PTO");

              const handleClick = async () => {
                const isSystem = isSystemGenerated(text.trim());

                if (isSystem) {
                  try {
                    await navigator.clipboard.writeText(text.trim());

                    Swal.fire({
                      title: "Go to OPMS?",
                      text: "The certificate number has been copied to your clipboard. Click OK to open OPMS.",
                      icon: "info",
                      showCancelButton: true,
                      confirmButtonText: "Open OPMS",
                      cancelButtonText: "Cancel",
                    }).then((result) => {
                      if (result.isConfirmed) {
                        window.open(
                          "https://opms.emb.gov.ph/manage/all/applications/",
                          "_blank"
                        );
                      }
                    });
                  } catch (err) {
                    Swal.fire({
                      title: "Clipboard Failed",
                      text: "Unable to copy certificate number. Please copy manually.",
                      icon: "error",
                    });
                  }
                } else {
                  Swal.fire({
                    title: "Manual PTO Certificate",
                    text: "This certificate number appears to be manually generated. It may not be searchable in OPMS.",
                    icon: "warning",
                    showCancelButton: true,
                    confirmButtonText: "Check OPMS Anyway",
                    cancelButtonText: "Cancel",
                  }).then((result) => {
                    if (result.isConfirmed) {
                      navigator.clipboard.writeText(text.trim());
                      window.open(
                        "https://opms.emb.gov.ph/manage/all/applications/",
                        "_blank"
                      );
                    }
                  });
                }
              };

              // Support multiline pto_code
              if (text && typeof text === "string" && text.includes("\n")) {
                return text.split("\n").map((item, index) => (
                  <span
                    key={index}
                    onClick={() => handleClick(item.trim())}
                    style={{
                      ...style,
                      display: "block",
                      textDecoration: "underline",
                      cursor: "pointer",
                    }}
                  >
                    {item.trim()}
                  </span>
                ));
              }

              return (
                <span
                  onClick={handleClick}
                  style={{
                    ...style,
                    textDecoration: "underline",
                    cursor: "pointer",
                  }}
                >
                  {text}
                </span>
              );
            },
          },
          {
            title: "PTO Date Issued",
            dataIndex: "pto_issued",
            key: "pto_issued",
            width: 120,
            align: "left",
            render: (text) => {
              let style = {};
              if (
                criteria.type === "permitStatus" &&
                criteria.permitKey === "pto_code"
              ) {
                let color;
                // Only apply expiry-based colors for these statuses
                if (['Expired', 'Near Expiry', 'Not Expired'].includes(criteria.status) && criteria.status !== "Application Stages") {
                 if (criteria.status === "Expired") {
                  color = theme === "dark" ? "#ff8a80" : "#e57373";
                } else if (criteria.status === "Near Expiry") {
                  color = theme === "dark" ? "#ffd180" : "#ffb74d";
                } else if (criteria.status === "Not Expired") {
                  color = theme === "dark" ? "#a5d6a7" : "#81c784";
                }
                if (color) {
                  style.color = color;
                }
                }
              }
              if (text && typeof text === "string" && text.includes("\n")) {
                return text.split("\n").map((item, index) => (
                  <div key={index} style={style}>
                    {item.trim()}
                  </div>
                ));
              }
              return <div style={style}>{text}</div>;
            },
          },
          {
            title: "PTO Date of Expiration",
            dataIndex: "pto_expiration",
            key: "pto_expiration",
            width: 120,
            align: "left",
            render: (text) => {
              let style = {};
              if (
                criteria.type === "permitStatus" &&
                criteria.permitKey === "pto_code"
              ) {
                let color;
                // Only apply expiry-based colors for these statuses
                if (['Expired', 'Near Expiry', 'Not Expired'].includes(criteria.status) && criteria.status !== "Application Stages") {
                 if (criteria.status === "Expired") {
                  color = theme === "dark" ? "#ff8a80" : "#e57373";
                } else if (criteria.status === "Near Expiry") {
                  color = theme === "dark" ? "#ffd180" : "#ffb74d";
                } else if (criteria.status === "Not Expired") {
                  color = theme === "dark" ? "#a5d6a7" : "#81c784";
                }
                if (color) {
                  style.color = color;
                }
                }
              }
              if (text && typeof text === "string" && text.includes("\n")) {
                return text.split("\n").map((item, index) => (
                  <div key={index} style={style}>
                    {item.trim()}
                  </div>
                ));
              }
              return <div style={style}>{text}</div>;
            },
          },
          {
            title: "IIS Transaction No.",
            key: "iis_transaction_no_pto", // Unique key for this instance
            dataIndex: ["iis_no_2024", "iis_no_2025"],
            width: 170,
            align: "left",
            ...getColumnSearchProps("iis_no_2024", "IIS No. (2024/2025)"), // Can reuse or adapt search logic
            render: (text, record) => {
              const iis2024 = record.iis_no_2024;
              const iis2025 = record.iis_no_2025;
              const elements = [];
              if (iis2024)
                elements.push(
                  <div key="pto_iis2024">
                    2024:{" "}
                    <a
                      href={`https://iis.emb.gov.ph/embis/dms/documents/tracker/?trn_no=${encodeURIComponent(
                        iis2024
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {iis2024}
                    </a>
                  </div>
                );
              if (iis2025)
                elements.push(
                  <div key="pto_iis2025">
                    2025:{" "}
                    <a
                      href={`https://iis.emb.gov.ph/embis/dms/documents/tracker/?trn_no=${encodeURIComponent(
                        iis2025
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {iis2025}
                    </a>
                  </div>
                );
              return elements.length > 0 ? <>{elements}</> : null;
            },
          },
          {
            title: "Barangay",
            dataIndex: "brgy",
            key: "brgy_pto",
            width: 100,
            align: "left",
             ...getColumnSearchProps("brgy", "Barangay"),
          },
          {
            title: "City/Municipality",
            dataIndex: "city",
            key: "city_pto",
            width: 100,
            align: "left",
            ...getColumnSearchProps("city", "City"),
          },
          {
            title: "Province",
            dataIndex: "province",
            key: "province_pto",
            width: 100,
            align: "left",
            ...getColumnSearchProps("province", "Province"),
          }
        );
      } else if (criteria.permitKey === "wwdp_code") {
        specificColumns.push(
          {
            title: "WWDP Code",
            dataIndex: "wwdp_code",
            key: "wwdp_code",
            width: 150,
            align: "left",
            ...getColumnSearchProps("wwdp_code", "WWDP Code"),
            render: (text) => {
              let style = {};
              let color;

              if (
                criteria.type === "permitStatus" &&
                ['wwdp_code', 'haz_id'].includes(criteria.permitKey) && criteria.status !== "All" && criteria.status !== "Application Stages" // Apply to WWDP and HAZ_ID, exclude "All" & "Application Stages"
              ) {
                if (criteria.status === "Expired") {
                  color = theme === "dark" ? "#ff8a80" : "#e57373";
                } else if (criteria.status === "Near Expiry") {
                  color = theme === "dark" ? "#ffd180" : "#ffb74d";
                } else if (criteria.status === "Not Expired") {
                  color = theme === "dark" ? "#a5d6a7" : "#81c784";
                }
                if (color) {
                  style.color = color;
                }
              }

              const isSystemGenerated = (value) =>
                value && typeof value === 'string' && value.toUpperCase().includes("DP-R03");

              const handleClick = async (codeToHandle) => {
                if (!codeToHandle) return;
                const isSystem = isSystemGenerated(codeToHandle.trim());
                const opmsUrl = "https://opms.emb.gov.ph/manage/all/applications/";

                if (isSystem) {
                  try {
                    await navigator.clipboard.writeText(codeToHandle.trim());
                    Swal.fire({
                      title: "Go to OPMS?",
                      text: "The WWDP code has been copied to your clipboard. Click OK to open OPMS.",
                      icon: "info",
                      showCancelButton: true,
                      confirmButtonText: "Open OPMS",
                      cancelButtonText: "Cancel",
                    }).then((result) => {
                      if (result.isConfirmed) window.open(opmsUrl, "_blank");
                    });
                  } catch (err) {
                    Swal.fire("Clipboard Failed", "Unable to copy WWDP code. Please copy manually.", "error");
                  }
                } else {
                  Swal.fire({
                    title: "Manual WWDP Certificate",
                    text: "This WWDP code appears to be manually generated. It may not be searchable in OPMS.",
                    icon: "warning",
                    showCancelButton: true,
                    confirmButtonText: "Check OPMS Anyway",
                    cancelButtonText: "Cancel",
                  }).then((result) => {
                    if (result.isConfirmed) {
                      navigator.clipboard.writeText(codeToHandle.trim());
                      window.open(opmsUrl, "_blank");
                    }
                  });
                }
              };

              if (text && typeof text === "string" && text.includes("\n")) {
                return text.split("\n").map((item, index) => (
                  <span
                    key={index}
                    onClick={() => handleClick(item.trim())}
                    style={{ ...style, display: "block", textDecoration: "underline", cursor: "pointer" }}
                  >
                    {item.trim()}
                  </span>
                ));
              }

              return (
                <span
                  onClick={() => handleClick(text)}
                  style={{ ...style, textDecoration: "underline", cursor: "pointer" }}
                >
                  {text}
                </span>
              );
            },
          },
          {
            title: "WWDP Issued",
            dataIndex: "wwdp_issued",
            key: "wwdp_issued",
            width: 120,
            align: "left",
            render: (text) => {
              let style = {};
              if (
                criteria.type === "permitStatus" &&
                ['wwdp_code', 'haz_id'].includes(criteria.permitKey) && criteria.status !== "All" && criteria.status !== "Application Stages"  // Apply to WWDP and HAZ_ID, exclude "All" & "Application Stages"
              ) {
                let color;
                if (criteria.status === "Expired") {
                  color = theme === "dark" ? "#ff8a80" : "#e57373";
                } else if (criteria.status === "Near Expiry") {
                  color = theme === "dark" ? "#ffd180" : "#ffb74d";
                } else if (criteria.status === "Not Expired") {
                  color = theme === "dark" ? "#a5d6a7" : "#81c784";
                }
                if (color) {
                  style.color = color;
                }
              }
              // Support multiline dates if they exist
              if (text && typeof text === "string" && text.includes("\n")) {
                return text.split("\n").map((item, index) => (
                  <div key={index} style={style}>
                    {item.trim()}
                  </div>
                ));
              }
              return <div style={style}>{text}</div>;
            },
          },
          {
            title: "WWDP Expiration",
            dataIndex: "wwdp_expiration",
            key: "wwdp_expiration",
            width: 120,
            align: "left",
            render: (text) => {
              // Apply color based on status, similar to PTO dates
              let style = {};
              if (
                criteria.type === "permitStatus" &&
                ['wwdp_code', 'haz_id'].includes(criteria.permitKey) && criteria.status !== "All" && criteria.status !== "Application Stages"  // Apply to WWDP and HAZ_ID, exclude "All" & "Application Stages"
              ) {
                let color;
                if (criteria.status === "Expired") {
                  color = theme === "dark" ? "#ff8a80" : "#e57373";
                } else if (criteria.status === "Near Expiry") {
                  color = theme === "dark" ? "#ffd180" : "#ffb74d";
                } else if (criteria.status === "Not Expired") {
                  color = theme === "dark" ? "#a5d6a7" : "#81c784";
                }
                if (color) {
                  style.color = color;
                }
              }
              // Support multiline dates if they exist
              if (text && typeof text === "string" && text.includes("\n")) {
                return text.split("\n").map((item, index) => (
                  <div key={index} style={style}>
                    {item.trim()}
                  </div>
                ));
              }
              return <div style={style}>{text}</div>;
            },
          },
          {
            title: "IIS Transaction No.",
            key: "iis_transaction_no_wwdp",
            dataIndex: ["iis_no_2024", "iis_no_2025"],
            width: 170,
            align: "left",
            ...getColumnSearchProps("iis_no_2024", "IIS No. (2024/2025)"),
            render: (text, record) => {
              const iis2024 = record.iis_no_2024;
              const iis2025 = record.iis_no_2025;
              const elements = [];
              if (iis2024)
                elements.push(
                  <div key="wwdp_iis2024">
                    2024:{" "}
                    <a
                      href={`https://iis.emb.gov.ph/embis/dms/documents/tracker/?trn_no=${encodeURIComponent(
                        iis2024
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {iis2024}
                    </a>
                  </div>
                );
              if (iis2025)
                elements.push(
                  <div key="wwdp_iis2025">
                    2025:{" "}
                    <a
                      href={`https://iis.emb.gov.ph/embis/dms/documents/tracker/?trn_no=${encodeURIComponent(
                        iis2025
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {iis2025}
                    </a>
                  </div>
                );
              return elements.length > 0 ? <>{elements}</> : null;
            },
          },
          {
            title: "Barangay",
            dataIndex: "brgy",
            key: "brgy_wwdp",
            width: 100,
            align: "left",
            ...getColumnSearchProps("brgy", "Barangay"),
          },
          {
            title: "City/Municipality",
            dataIndex: "city",
            key: "city_wwdp",
            width: 100,
            align: "left",
            ...getColumnSearchProps("city", "City"),
          },
          {
            title: "Province",
            dataIndex: "province",
            key: "province_wwdp",
            width: 100,
            align: "left",
            ...getColumnSearchProps("province", "Province"),
          }
        );
      } else if (criteria.permitKey === "haz_id") {
        specificColumns.push(
          {
            title: "HWG ID",
            dataIndex: "haz_id",
            key: "haz_id",
            width: 150,
            align: "left",
            ...getColumnSearchProps("haz_id", "HWG ID"),
            render: (text) => { // Basic render, add color/click if needed for HAZ_ID
              let style = {};
               if (
                criteria.type === "permitStatus" &&
                criteria.permitKey === "haz_id" && criteria.status !== "All" && criteria.status !== "Application Stages"  // Check for haz_id specifically, exclude "All" & "Application Stages"
              ) {
                let color;
                // Only apply expiry-based colors for these statuses
                if (['Expired', 'Near Expiry', 'Not Expired'].includes(criteria.status) && criteria.status !== "Application Stages") {
                 if (criteria.status === "Expired") {
                  color = theme === "dark" ? "#ff8a80" : "#e57373";
                } else if (criteria.status === "Near Expiry") {
                  color = theme === "dark" ? "#ffd180" : "#ffb74d";
                } else if (criteria.status === "Not Expired") {
                  color = theme === "dark" ? "#a5d6a7" : "#81c784";
                }
                if (color) {
                  style.color = color;
                }
                }
              }
              if (text && typeof text === "string" && text.includes("\n")) {
                return text.split("\n").map((item, index) => (
                  <div key={index} style={style}>
                    {item.trim()}
                  </div>
                ));
              }
              return <div style={style}>{text}</div>;
            }
          },
          {
            title: "HWG Issued",
            dataIndex: "haz_issued",
            width: 120,
            align: "left",
            render: (text) => { // Basic render, add color/click if needed for HAZ_ID dates
              let style = {};
              if (
                criteria.type === "permitStatus" &&
                criteria.permitKey === "haz_id" && criteria.status !== "All" && criteria.status !== "Application Stages"  // Check for haz_id specifically, exclude "All" & "Application Stages"
              ) {
                let color;
                // Only apply expiry-based colors for these statuses
                if (['Expired', 'Near Expiry', 'Not Expired'].includes(criteria.status) && criteria.status !== "Application Stages") {
                 if (criteria.status === "Expired") {
                  color = theme === "dark" ? "#ff8a80" : "#e57373";
                } else if (criteria.status === "Near Expiry") {
                  color = theme === "dark" ? "#ffd180" : "#ffb74d";
                } else if (criteria.status === "Not Expired") {
                  color = theme === "dark" ? "#a5d6a7" : "#81c784";
                }
                if (color) {
                  style.color = color;
                }
                }
              }
              return <div style={style}>{text}</div>;
            }
          },
          {
            title: "IIS Transaction No.",
            key: "iis_transaction_no_wwdp", 
            dataIndex: ["iis_no_2024", "iis_no_2025"],
            width: 170,
            align: "left",
            ...getColumnSearchProps("iis_no_2024", "IIS No. (2024/2025)"),
            render: (text, record) => {
              const iis2024 = record.iis_no_2024;
              const iis2025 = record.iis_no_2025;
              const elements = [];
              if (iis2024)
                elements.push(
                  <div key="wwdp_iis2024">
                    2024:{" "}
                    <a
                      href={`https://iis.emb.gov.ph/embis/dms/documents/tracker/?trn_no=${encodeURIComponent(
                        iis2024
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {iis2024}
                    </a>
                  </div>
                );
              if (iis2025)
                elements.push(
                  <div key="wwdp_iis2025">
                    2025:{" "}
                    <a
                      href={`https://iis.emb.gov.ph/embis/dms/documents/tracker/?trn_no=${encodeURIComponent(
                        iis2025
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {iis2025}
                    </a>
                  </div>
                );
              return elements.length > 0 ? <>{elements}</> : null;
            },
          },
          {
            title: "Barangay",
            dataIndex: "brgy",
            key: "brgy_wwdp",
            width: 100,
            align: "left",
            ...getColumnSearchProps("brgy", "Barangay"),
          },
          {
            title: "City/Municipality",
            dataIndex: "city",
            key: "city_wwdp",
            width: 100,
            align: "left",
            ...getColumnSearchProps("city", "City"),
          },
          {
            title: "Province",
            dataIndex: "province",
            key: "province_wwdp",
            width: 100,
            align: "left",
            ...getColumnSearchProps("province", "Province"),
          }
        );
      } else if (criteria.permitKey === "pco_no") {
        specificColumns.push(
          {
            title: "PCO No.",
            dataIndex: "pco_no",
            key: "pco_no",
            width: 150,
            align: "left",
            ...getColumnSearchProps("pco_no", "PCO No."),
          },
          {
            title: "PCO Name",
            dataIndex: "pco_name",
            key: "pco_name",
            width: 200,
            align: "left",
            ...getColumnSearchProps("pco_name", "PCO Name"),
          },
          {
            title: "PCO Validity",
            dataIndex: "pco_validity",
            key: "pco_validity",
            width: 120,
            align: "left",
          },
          {
            title: "IIS Transaction No.",
            key: "iis_transaction_no_pco", 
            dataIndex: ["iis_no_2024", "iis_no_2025"],
            width: 170,
            align: "left",
            ...getColumnSearchProps("iis_no_2024", "IIS No. (2024/2025)"),
            render: (text, record) => {
              const iis2024 = record.iis_no_2024;
              const iis2025 = record.iis_no_2025;
              const elements = [];
              if (iis2024)
                elements.push(
                  <div key="pco_iis2024">
                    2024:{" "}
                    <a
                      href={`https://iis.emb.gov.ph/embis/dms/documents/tracker/?trn_no=${encodeURIComponent(
                        iis2024
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {iis2024}
                    </a>
                  </div>
                );
              if (iis2025)
                elements.push(
                  <div key="pco_iis2025">
                    2025:{" "}
                    <a
                      href={`https://iis.emb.gov.ph/embis/dms/documents/tracker/?trn_no=${encodeURIComponent(
                        iis2025
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {iis2025}
                    </a>
                  </div>
                );
              return elements.length > 0 ? <>{elements}</> : null;
            },
          },
          {
            title: "Barangay",
            dataIndex: "brgy",
            key: "brgy_pco",
            width: 100,
            align: "left",
            ...getColumnSearchProps("brgy", "Barangay"),
          },
          {
            title: "City/Municipality",
            dataIndex: "city",
            key: "city_pco",
            width: 100,
            align: "left",
            ...getColumnSearchProps("city", "City"),
          },
          {
            title: "Province",
            dataIndex: "province",
            key: "province_pco",
            width: 100,
            align: "left",
            ...getColumnSearchProps("province", "Province"),
          }
        );
      }
      // specificColumns is already populated
    } else if (criteria.type === "allIndustries") {
      // No specific columns for "allIndustries", commonInitialColumns will be used.
    }
    return [...commonInitialColumns, ...specificColumns];
  }, [criteria, getColumnSearchProps, theme]); 

  const modalTitle = criteria?.label
    ? `Industries Registration Type : ${criteria.label}`
    : "Industry Breakdown";
  const totalRecords = data.length;

  return (
    <Modal
      title={modalTitle}
      open={visible}
      onCancel={onClose}
      footer={null}
      width="85%"
      className={`breakdown-modal ${
        theme === "dark" ? "theme-dark" : "theme-light"
      }`}
      destroyOnClose
    >
      <div
        style={{
          marginBottom: "10px",
          textAlign: "right",
          fontSize: "12px",
          color:
            theme === "dark" ? "rgba(255,255,255,0.65)" : "rgba(0,0,0,0.65)",
        }}
      >
        Total Records: {totalRecords}
      </div>
      {loading && (
        <div style={{ textAlign: "center", padding: "20px" }}>
          <Spin tip="Loading details..." />
        </div>
      )}
      {error && (
        <Alert
          message="Error"
          description={error}
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}
      {!loading && !error && (
        <Table
          dataSource={data}
          columns={currentColumns} // Use the dynamic columns
          rowKey="_id"
          size="small"
          scroll={{ y: "65vh" }}
          pagination={{
            pageSize: 50,
            showSizeChanger: true,
            simple: true,
            pageSizeOptions: ["10", "20", "50", "100"],
          }}
          onChange={handleTableChange}
        />
      )}
      {!loading && !error && data.length === 0 && criteria?.label && (
        <Alert
          message={`No industries found for ${criteria.label}.`}
          type="info"
        />
      )}
    </Modal>
  );
};

export default Breakdown;
