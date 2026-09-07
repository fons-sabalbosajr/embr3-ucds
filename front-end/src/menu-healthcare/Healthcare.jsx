import React, { useContext, useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import {
  Table,
  Button,
  Spin,
  Input,
  Space,
  Tooltip,
  Tag,
  Modal,
  Pagination,
  Popover,
  DatePicker,
  Progress,
  Avatar, // Added Avatar
  ConfigProvider,
  message,
} from "antd";
import {
  ReloadOutlined,
  ExportOutlined,
  SearchOutlined,
  EyeOutlined,
  PlusOutlined,
  MonitorOutlined,
  GlobalOutlined,
  CheckCircleFilled,
  InfoCircleOutlined,
  EditOutlined,
  ClockCircleFilled,
  TagsOutlined,
  ExclamationCircleOutlined,
  ExceptionOutlined,
} from "@ant-design/icons";
import Highlighter from "react-highlight-words";
import "./healthcare.css";
import Swal from "sweetalert2";
import HealthcareModal from "./HealthcareModal";
import { io } from "socket.io-client"; // Added io
import { fetchHealthcareData } from "../api/healthcareService";
import AddHealthcareModal from "./actions/AddHealthcareModal";
import { SOCKET_URL } from "../config/api";

const Healthcare = ({ theme, currentUser, data }) => {
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [searchedColumn, setSearchedColumn] = useState("");
  const [inputVisible, setInputVisible] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [filteredData, setFilteredData] = useState([]);
  const [tags, setTags] = useState([]); // State to store tags
  const [industryOptions, setIndustryOptions] = useState([]);
  const [filteredCount, setFilteredCount] = useState(0);
  const searchInput = useRef(null);
  const inputRef = useRef(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [currentRecord, setCurrentRecord] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [originalRecord, setOriginalRecord] = useState(null);
  const [editingKey, setEditingKey] = useState("");
  const [dataSource, setDataSource] = useState(data);
  const [currentValue, setCurrentValue] = useState("");
  const [progress, setProgress] = useState(0);
  const [healthcareViewers, setHealthcareViewers] = useState([]); // Added state for viewers
  const socketRef = useRef(null); // Added socket ref
  const [addModalVisible, setAddModalVisible] = useState(false);
  const canViewDataHistory = currentUser?.permissions?.[3]; // For Avatar.Group visibility

  useEffect(() => {
    if (filteredData.length > 0) {
      // Extract unique values from industry_class
      const uniqueIndustries = [
        ...new Set(filteredData.map((item) => item.industry_class || "blank")),
      ];
      //console.log("Unique Industries:", uniqueIndustries); // Debugging log
      setIndustryOptions(uniqueIndustries);
    }
  }, [filteredData]);

  useEffect(() => {
    let interval;
    if (loading) {
      setProgress(0);
      interval = setInterval(() => {
        setProgress((prev) => {
          if (prev < 95) return prev + 5;
          return prev;
        });
      }, 100);
    } else {
      setProgress(100);
      setTimeout(() => setProgress(0), 500);
    }
    return () => clearInterval(interval);
  }, [loading]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const result = await fetchHealthcareData();
        const sortedResult = sortByIdNo(result);
        setFilteredData(sortedResult);
        setFilteredCount(sortedResult.length);

        if (sortedResult.length > 0) {
          setCurrentRecord(sortedResult[0]);
          setOriginalRecord(sortedResult[0]);
        }
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    if (!currentUser?.username) return;

    if (!socketRef.current) {
      socketRef.current = io(SOCKET_URL, {
        withCredentials: true,
      });
    }
    const socket = socketRef.current;

    const joinUserToHealthcare = () => {
      socket.emit("joinHealthcare", {
        user: {
          username: currentUser.username,
          avatar: currentUser.avatar || currentUser.avatarUrl,
          name: currentUser.name,
        },
      });
    };

    joinUserToHealthcare();

    const healthcareViewersHandler = (updatedViewers) => {
      // console.log("[Healthcare.jsx] Received healthcareViewers update:", updatedViewers.map(u => u.username).join(', '));
      setHealthcareViewers(updatedViewers);
    };

    const handleConnect = () => {
      joinUserToHealthcare();
    };

    socket.on("healthcareViewers", healthcareViewersHandler);
    socket.on("connect", handleConnect);

    return () => {
      if (socketRef.current) {
        socketRef.current.emit("leaveHealthcare");
        socketRef.current.off("healthcareViewers", healthcareViewersHandler);
        socketRef.current.off("connect", handleConnect);
      }
    };
  }, [currentUser]);

  const sortByIdNo = (arr) => {
    return [...arr].sort((a, b) => {
      const aId = Number(a.id_no || a.idNo || 0);
      const bId = Number(b.id_no || b.idNo || 0);
      return aId - bId;
    });
  };

  const handleReload = async () => {
    setLoading(true);
    try {
      const result = await fetchHealthcareData();
      const sortedResult = sortByIdNo(result);
      setFilteredData(sortedResult);
      setFilteredCount(sortedResult.length);
    } catch (error) {
      console.error("Error fetching healthcare data:", error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (selectedKeys, confirm, dataIndex) => {
    confirm();
    setSearchText(selectedKeys[0]);
    setSearchedColumn(dataIndex);
    if (selectedKeys[0]) {
      setTags((prevTags) => [...prevTags, selectedKeys[0]]);
      const filtered = filteredData.filter((item) =>
        Object.values(item).some((val) =>
          String(val).toLowerCase().includes(selectedKeys[0].toLowerCase())
        )
      );
      const sortedFiltered = sortByIdNo(filtered);
      setFilteredData(sortedFiltered);
      setFilteredCount(sortedFiltered.length);
    }
  };

  const handleReset = (clearFilters) => {
    clearFilters();
    setSearchText("");
    setTags([]);
    handleReload();
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    setInputValue(value);

    const filtered = filteredData.filter((item) =>
      tags
        .concat(value)
        .some((tag) =>
          Object.values(item).some((val) =>
            String(val).toLowerCase().includes(tag.toLowerCase())
          )
        )
    );
    const sortedFiltered = sortByIdNo(filtered);
    setFilteredData(sortedFiltered);
    setFilteredCount(sortedFiltered.length);
  };

  const handleInputConfirm = () => {
    if (inputValue) {
      setTags((prevTags) => [...prevTags, inputValue]);
      const filtered = filteredData.filter((item) =>
        tags
          .concat(inputValue)
          .some((tag) =>
            Object.values(item).some((val) =>
              String(val).toLowerCase().includes(tag.toLowerCase())
            )
          )
      );
      const sortedFiltered = sortByIdNo(filtered);
      setFilteredData(sortedFiltered);
      setFilteredCount(sortedFiltered.length);
    } else {
      handleReload();
    }
    setInputVisible(false);
    setInputValue("");
  };

  const handleRemoveKeyword = (tagToRemove) => {
    const newTags = tags.filter((tag) => tag !== tagToRemove);
    setTags(newTags);

    const filtered = filteredData.filter((item) =>
      newTags.some((tag) =>
        Object.values(item).some((val) =>
          String(val).toLowerCase().includes(tag.toLowerCase())
        )
      )
    );
    const sortedFiltered =
      filtered.length > 0 ? sortByIdNo(filtered) : sortByIdNo(filteredData);
    setFilteredData(sortedFiltered);
    setFilteredCount(sortedFiltered.length);
  };

  const getColumnSearchProps = (dataIndex) => ({
    filterDropdown: ({
      setSelectedKeys,
      selectedKeys,
      confirm,
      clearFilters,
    }) => (
      <div className="healthcare-custom-filter-dropdown">
        <Input
          ref={searchInput}
          placeholder={`Search ${dataIndex}`}
          value={selectedKeys[0]}
          onChange={(e) => {
            setSelectedKeys(e.target.value ? [e.target.value] : []);
            handleInputChange(e);
          }}
          onPressEnter={() => handleSearch(selectedKeys, confirm, dataIndex)}
          className="healthcare-custom-filter-input"
        />
        <Space>
          <Button
            type="primary"
            onClick={() => handleSearch(selectedKeys, confirm, dataIndex)}
            icon={<SearchOutlined />}
            size="small"
            className="healthcare-custom-filter-button"
          >
            Search
          </Button>
          <Button
            onClick={() => handleReset(clearFilters)}
            size="small"
            className="healthcare-custom-filter-button"
          >
            Reset
          </Button>
        </Space>
      </div>
    ),
    filterIcon: (filtered) => (
      <SearchOutlined style={{ color: filtered ? "#1890ff" : undefined }} />
    ),
    onFilter: (value, record) =>
      record[dataIndex]
        ? record[dataIndex]
            .toString()
            .toLowerCase()
            .includes(value.toLowerCase())
        : "",
    onFilterDropdownVisibleChange: (visible) => {
      if (visible) {
        setTimeout(() => searchInput.current?.select(), 100);
      }
    },
    render: (text) =>
      searchedColumn === dataIndex ? (
        <Highlighter
          highlightStyle={{ backgroundColor: "#ffc069", padding: 0 }}
          searchWords={[searchText]}
          autoEscape
          textToHighlight={text ? text.toString() : ""}
        />
      ) : (
        text
      ),
  });

  const getColumnDropdownProps = (dataIndex, options) => {
    const sortedOptions = options.sort((a, b) => a.localeCompare(b));
    return {
      filters: sortedOptions.map((option) => ({
        text: option || "blank", // Replace empty values with "blank"
        value: option || "blank", // Replace empty values with "blank"
      })),
      onFilter: (value, record) => (record[dataIndex] || "blank") === value,
      render: (text) =>
        searchedColumn === dataIndex ? (
          <Highlighter
            highlightStyle={{ backgroundColor: "#ffc069", padding: 0 }}
            searchWords={[searchText]}
            autoEscape
            textToHighlight={text ? text.toString() : ""}
          />
        ) : (
          text || "blank" // Replace empty values with "blank"
        ),
      dropdownRender: (menu) => (
        <ConfigProvider
          theme={{
            components: {
              Dropdown: {
                fontSize: 10, // Adjust the font size as needed
              },
            },
          }}
        >
          <div>{menu}</div>
        </ConfigProvider>
      ),
    };
  };

  const getPermitClearancesFilterProps = () => ({
    filters: [
      { text: "ECC", value: "ECC" },
      { text: "CNC", value: "CNC" },
      { text: "PTO", value: "PTO" },
      { text: "WWDP", value: "WWDP" },
      { text: "HAZWASTE", value: "HAZWASTE" },
      { text: "PCO", value: "PCO" },
    ],
    onFilter: (value, record) => {
      const permitValues = {
        ECC: record.ecc_cnc && record.ecc_cnc.includes("ECC"),
        CNC: record.ecc_cnc && record.ecc_cnc.includes("CNC"),
        PTO:
          record.pto_code &&
          record.pto_code !== "n/a" &&
          record.pto_code !== "no records found per OPMS",
        WWDP:
          record.wwdp_code &&
          record.wwdp_code !== "n/a" &&
          record.wwdp_code !== "no records found per OPMS",
        HAZWASTE:
          record.haz_id &&
          record.haz_id !== "n/a" &&
          record.haz_id !== "no records found per OPMS",
        PCO:
          record.pco_np &&
          record.pco_np !== "n/a" &&
          record.pco_np !== "no records found per OPMS",
      };
      return permitValues[value];
    },
    // Inside getPermitClearancesFilterProps render:
    render: (text, record) => {
      // Helper to check expiration
      const isExpired = (dateStr) => {
        if (!dateStr || dateStr === "Not Applicable" || dateStr === "n/a")
          return false;
        const [month, day, year] = dateStr
          .split(/[\/\-]/)
          .map((v) => parseInt(v, 10));
        let d;
        if (year > 1900 && year < 2100 && month && day) {
          d = new Date(year, month - 1, day);
        } else if (month > 1900 && month < 2100 && year && day) {
          d = new Date(month, day - 1, year);
        } else {
          d = new Date(dateStr);
        }
        if (isNaN(d.getTime())) return false;
        const today = new Date();
        d.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);
        return d < today;
      };

      // Helper to get background color if expired
      const expiredBg = { background: "maroon", borderRadius: 4 }; // Ant Design error bg

      return (
        <div
          style={{
            position: "relative",
            display: "flex",
            flexWrap: "wrap",
            gap: 2,
          }}
        >
          {/* ECC or CNC */}
          {record.ecc_cnc &&
            record.ecc_cnc !== "no records found per OPMS" &&
            record.ecc_value !== "n/a" && (
              <Tooltip
                title={
                  <div style={{ fontSize: "10px" }}>
                    <div>ECC Information</div>
                    <div>Reference No.: {record.ecc_cnc}</div>
                    <div>Date Approved: {record.date_approved}</div>
                  </div>
                }
                color={record.ecc_cnc.includes("ECC") ? "#083f50" : "#8a5200"}
              >
                <span
                  className={
                    record.ecc_cnc.includes("ECC")
                      ? "custom-button-cyan"
                      : "custom-button-yellow"
                  }
                  style={{ position: "relative" }}
                >
                  {record.ecc_cnc.includes("ECC") ? "ECC" : "CNC"}
                  {(record.ecc_cnc.includes("App") ||
                    record.ecc_cnc.includes("Application") ||
                    record.ecc_cnc.includes("Application No.")) && (
                    <ClockCircleFilled
                      style={{
                        position: "absolute",
                        top: -8,
                        right: -6,
                        fontSize: "12px",
                        color: "#3B6790",
                        backgroundColor: "#ffffff",
                        borderRadius: "50%",
                        padding: "1px",
                      }}
                    />
                  )}
                </span>
              </Tooltip>
            )}

          {/* PTO */}
          {record.pto_code &&
            record.pto_code !== "no records found per OPMS" &&
            record.pto_code !== "n/a" && (
              <Tooltip
                title={
                  <div style={{ fontSize: "10px" }}>
                    <div>PTO Information</div>
                    <div>Code: {record.pto_code}</div>

                    {isExpired(record.pto_expiration) && (
                      <div className="custom-button-red">
                        <span>
                          Date Issued: {record.pto_issued} <br />
                        </span>
                        <span>Date of Expiration: {record.pto_expiration}</span>
                      </div>
                    )}
                  </div>
                }
                color="#321838"
              >
                <span
                  className="custom-button-blue"
                  style={{
                    position: "relative",
                    ...(isExpired(record.pto_expiration) ? expiredBg : {}),
                  }}
                >
                  PTO
                  {(record.pto_code.includes("App") ||
                    record.pto_code.includes("Application") ||
                    record.pto_code.includes("Application No.")) && (
                    <ClockCircleFilled
                      style={{
                        position: "absolute",
                        top: -8,
                        right: -6,
                        fontSize: "12px",
                        color: "#3B6790",
                        backgroundColor: "#ffffff",
                        borderRadius: "50%",
                        padding: "1px",
                      }}
                    />
                  )}
                  {isExpired(record.pto_expiration) && (
                    <ExclamationCircleOutlined
                      style={{
                        color: "white",
                        marginLeft: 4,
                        fontSize: 14,
                        verticalAlign: "middle",
                      }}
                      title="Expired"
                    />
                  )}
                </span>
              </Tooltip>
            )}

          {/* WWDP */}
          {record.wwdp_code &&
            record.wwdp_code !== "no records found per OPMS" &&
            record.wwdp_code !== "n/a" && (
              <Tooltip
                title={
                  <div style={{ fontSize: "10px" }}>
                    <div>WWDP Information</div>
                    <div>Code: {record.wwdp_code}</div>

                    {isExpired(record.wwdp_expiration) && (
                      <div className="custom-button-red">
                        <div>Date Issued: {record.wwdp_issued}</div>
                        <div>Date of Expiration: {record.wwdp_expiration}</div>
                      </div>
                    )}
                  </div>
                }
                color="#873c34"
              >
                <span
                  className="custom-button-orange"
                  style={{
                    position: "relative",
                    ...(isExpired(record.wwdp_expiration) ? expiredBg : {}),
                  }}
                >
                  WWDP
                  {(record.wwdp_code.includes("App") ||
                    record.wwdp_code.includes("Application") ||
                    record.wwdp_code.includes("Application No.")) && (
                    <ClockCircleFilled
                      style={{
                        position: "absolute",
                        top: -8,
                        right: -6,
                        fontSize: "12px",
                        color: "#3B6790",
                        backgroundColor: "#ffffff",
                        borderRadius: "50%",
                        padding: "1px",
                      }}
                    />
                  )}
                  {isExpired(record.wwdp_expiration) && (
                    <ExclamationCircleOutlined
                      style={{
                        color: "white",
                        marginLeft: 4,
                        fontSize: 14,
                        verticalAlign: "middle",
                      }}
                      title="Expired"
                    />
                  )}
                </span>
              </Tooltip>
            )}

          {/* HAZWASTE */}
          {record.haz_id &&
            record.haz_id !== "no records found per OPMS" &&
            record.haz_id !== "n/a" && (
              <Tooltip
                title={
                  <div style={{ fontSize: "10px" }}>
                    <div>HAZWASTE Information</div>
                    <div>Code: {record.haz_id}</div>
                    <div>Date Issued: {record.haz_issued}</div>
                  </div>
                }
                color="#2d4115"
              >
                <span
                  className="custom-button-skyblue"
                  style={{ position: "relative" }}
                >
                  HWG ID
                  {String(record.haz_id).includes("App") ||
                  String(record.haz_id).includes("Application") ||
                  String(record.haz_id).includes("Application No.") ? (
                    <ClockCircleFilled
                      style={{
                        position: "absolute",
                        top: -8,
                        right: -6,
                        fontSize: "12px",
                        color: "#3B6790",
                        backgroundColor: "#ffffff",
                        borderRadius: "50%",
                        padding: "1px",
                      }}
                    />
                  ) : null}
                </span>
              </Tooltip>
            )}

          {/* PCO */}
          {record.pco_np &&
            record.pco_np !== "no records found per OPMS" &&
            record.pco_np !== "n/a" && (
              <Tooltip
                title={
                  <div style={{ fontSize: "10px" }}>
                    <div>PCO Information</div>
                    <div>Code: {record.pco_np}</div>
                    <div>Name: {record.pco_name}</div>
                    <div>Tel. No: {record.pco_tel_no}</div>

                    {isExpired(record.pco_validity) && (
                      <div className="custom-button-red">
                        PCO Validity: {record.pco_validity}
                      </div>
                    )}
                  </div>
                }
                color="#181a19"
              >
                <span
                  className="custom-button-stone"
                  style={{
                    position: "relative",
                    ...(isExpired(record.pco_validity) ? expiredBg : {}),
                  }}
                >
                  PCO
                  {(record.pco_np.includes("App") ||
                    record.pco_np.includes("Application") ||
                    record.pco_np.includes("Application No.")) && (
                    <ClockCircleFilled
                      style={{
                        position: "absolute",
                        top: -8,
                        right: -6,
                        fontSize: "12px",
                        color: "#3B6790",
                        backgroundColor: "#ffffff",
                        borderRadius: "50%",
                        padding: "1px",
                      }}
                    />
                  )}
                  {isExpired(record.pco_validity) && (
                    <ExclamationCircleOutlined
                      style={{
                        color: "#d4380d",
                        marginLeft: 4,
                        fontSize: 14,
                        verticalAlign: "middle",
                      }}
                      title="Expired"
                    />
                  )}
                </span>
              </Tooltip>
            )}
        </div>
      );
    },
  });

  const showModal = (record) => {
    setCurrentRecord(record);
    setIsModalVisible(true);
  };

  const handleSave = (value, key) => {
    const newData = [...dataSource];
    const index = newData.findIndex((item) => key === item.key);
    if (index > -1) {
      newData[index]["remarks"] = value; // Update the remarks column with the new value
      setDataSource(newData);
    }
  };

  const handleEdit = (key, currentValue) => {
    setEditingKey(key);
    setCurrentValue(currentValue);
  };

  const handleCancel = () => {
    setEditingKey("");
  };

  const columns = [
    {
      title: <div style={{ textAlign: "center", width: "100%" }}>ID No.</div>,
      dataIndex: "id_no",
      key: "id_no",
      width: 70,
      ellipsis: true,
      ...getColumnSearchProps("id_no"),
    },
    {
      title: (
        <div style={{ textAlign: "center", width: "100%" }}>
          Project Details
        </div>
      ),
      key: "project_details",
      align: "left",
      width: 320, // Increased width for better readability
      ellipsis: false, // Disable ellipsis to allow wrapping
      ...getColumnSearchProps("project_details"),
      render: (text, record) => (
        <div style={{ wordBreak: "break-word", whiteSpace: "normal" }}>
          <div>{record.name}</div>
          <div style={{ fontWeight: "bold" }}>{record.title}</div>
          <div>{record.address}</div>
          <div>
            <a
              href={
                record.ecc_cnc && record.ecc_cnc.startsWith("ECC-OL")
                  ? `https://ecconline.emb.gov.ph/live/Secured/Search.aspx?refCode=${record.ecc_cnc}`
                  : record.ecc_cnc && record.ecc_cnc.startsWith("CNC-OL")
                  ? `https://cnconline.emb.gov.ph/live/CNC/Projects.aspx?refCode=${record.ecc_cnc}`
                  : "#"
              }
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                if (
                  record.ecc_cnc &&
                  !record.ecc_cnc.startsWith("ECC-OL") &&
                  !record.ecc_cnc.startsWith("CNC-OL")
                ) {
                  e.preventDefault();
                  Swal.fire({
                    title:
                      "Reference Code in Electronic Records Management System",
                    text: `The reference code ${record.ecc_cnc} is available in the Electronic Records Management System. If you wish to verify the code, please contact emb.idms@gmail.com.`,
                    icon: "info",
                    confirmButtonText: "Send Email",
                    cancelButtonText: "Ok",
                    showCancelButton: true,
                    preConfirm: () => {
                      window.location.href =
                        "mailto:emb.idms@gmail.com?subject=Verification of Code&body=Hello, I would like to verify the reference code: " +
                        record.ecc_cnc;
                    },
                  });
                }
              }}
            >
              {record.ecc_cnc}
            </a>
          </div>
        </div>
      ),
    },
    {
      title: "Industry Classification",
      dataIndex: "industry_class",
      key: "industry_class",
      align: "center",
      width: 160,
      ellipsis: true,
      ...getColumnDropdownProps("industry_class", industryOptions),
    },
    {
      title: "Permit/Clearances",
      key: "permit_clearances",
      align: "center",
      width: 200,
      ellipsis: true,
      ...getPermitClearancesFilterProps(),
    },
    {
      title: (
        <div style={{ textAlign: "center", width: "100%" }}>
          Monitoring Status
        </div>
      ),
      key: "monitoring_status",
      align: "left",
      width: 220,
      ellipsis: true,
      render: (text, record) => (
        <div className="monitoring-status-container">
          {/* IIS No */}
          {record.iis_no && (
            <p className="monitoring-label">
              <Tooltip
                title={
                  <div style={{ fontSize: "10px" }}>IIS Transaction No.</div>
                }
                color="#1890ff"
              >
                <TagsOutlined style={{ marginRight: 6, color: "#1890ff" }} />
                <a
                  href={`https://iis.emb.gov.ph/embis/dms/documents/tracker/?trn_no=${encodeURIComponent(
                    record.iis_no
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#1890ff", textDecoration: "none" }}
                >
                  {record.iis_no}
                </a>
              </Tooltip>
            </p>
          )}

          {/* Date Monitored */}
          {record.date_monitored && (
            <p className="monitoring-label">
              <Tooltip
                title={<div style={{ fontSize: "10px" }}>Date Monitored</div>}
                color="#1890ff"
              >
                <MonitorOutlined style={{ marginRight: 6, color: "#1890ff" }} />
                {record.date_monitored}
              </Tooltip>
            </p>
          )}

          {/* Date Routed */}
          {record.date_routed && (
            <p className="monitoring-label">
              <Tooltip
                title={
                  <div style={{ fontSize: "10px" }}>Date Routed to IIS</div>
                }
                color="#52c41a"
              >
                <GlobalOutlined style={{ marginRight: 6, color: "#52c41a" }} />
                {record.date_routed}
              </Tooltip>
            </p>
          )}

          {/* Date Signed */}
          {record.date_signed && (
            <p className="monitoring-label">
              <Tooltip
                title={
                  <div style={{ fontSize: "10px" }}>Date Report Signed</div>
                }
                color="#faad14"
              >
                <CheckCircleFilled
                  style={{ marginRight: 6, color: "#faad14" }}
                />
                {record.date_signed}
              </Tooltip>
            </p>
          )}

          {/* PISMU Tracking */}
          {record.pismu_tracking && record.pismu_tracking.trim() !== "" && (
            <p className="monitoring-label">
              <Tooltip
                title={
                  <div style={{ fontSize: "10px" }}>
                    Received by PISMU: {record.pismu_tracking}
                  </div>
                }
                color="#0D92F4"
              >
                <span>
                  <CheckCircleFilled
                    style={{ color: "#0D92F4", marginRight: 6 }}
                  />
                  Received by PISMU
                </span>
              </Tooltip>
            </p>
          )}
        </div>
      ),
    },
    {
      title: (
        <div style={{ textAlign: "center", width: "100%" }}>
          Remarks/Recommendations
        </div>
      ),
      dataIndex: "remarks",
      key: "remarks",
      width: 220,
      ellipsis: true,
      ...getColumnSearchProps("remarks"),
    },
    {
      title: "Action",
      key: "action",
      align: "center",
      width: 80,
      fixed: "right",
      render: (text, record) => (
        <Button type="primary" size="small" onClick={() => showModal(record)}>
          <EyeOutlined />
        </Button>
      ),
    },
  ];

  return (
    <div className={`healthcare-container-card ${theme}-theme`}>
      <div className="header-content-survey">
        <h3
          className="header-title-survey"
          style={{ margin: 0, marginRight: 16 }}
        >
          Universe of Industries (Healthcare)
        </h3>

        {canViewDataHistory && healthcareViewers.length > 0 && (
          <Avatar.Group
            max={{ count: 3 }}
            maxStyle={{
              color: "#f56a00",
              backgroundColor: "#fde3cf",
              fontSize: 11,
            }}
            size={24}
          >
            {healthcareViewers.map((user) => (
              <Tooltip
                key={user.username}
                title={
                  <span
                    style={{ fontSize: "10px" }}
                  >{`${user.username} is here`}</span>
                }
              >
                <Avatar
                  src={user.avatar}
                  style={{ marginLeft: 2, verticalAlign: "middle" }}
                >
                  {!user.avatar && user.username
                    ? user.username[0].toUpperCase()
                    : ""}
                </Avatar>
              </Tooltip>
            ))}
          </Avatar.Group>
        )}

        <div className="header-action-buttons">
          <Button
            type="primary"
            className="refresh-button"
            icon={<ReloadOutlined />}
            onClick={handleReload}
            loading={loading}
            title="Reload Table"
          />
          <Button
            type="primary"
            size="large"
            className="add-industry-survey"
            onClick={() => setAddModalVisible(true)}
          >
            Add Industry
          </Button>
        </div>
      </div>

      <AddHealthcareModal
        visible={addModalVisible}
        onCancel={() => setAddModalVisible(false)}
        onOk={() => setAddModalVisible(false)}
        dataSource={filteredData}
      />

      <div className="healthcare-table-header">
        <div className="search-input-tags">
          {inputVisible ? (
            <Input
              ref={inputRef}
              type="primary"
              size="small"
              style={{ width: 200, marginRight: 16 }}
              value={inputValue}
              onChange={handleInputChange}
              onBlur={handleInputConfirm}
              onPressEnter={handleInputConfirm}
              placeholder="Enter keyword..."
            />
          ) : (
            <Tag
              onClick={() => setInputVisible(true)}
              className="healthcare-tag-plus"
              color="#108ee9"
            >
              <PlusOutlined /> Search keyword here...
            </Tag>
          )}
          {tags.map((tag) => (
            <Tag
              key={tag}
              closable
              onClose={() => handleRemoveKeyword(tag)}
              className="healthcare-search-keyword"
              color="blue"
            >
              {tag}
            </Tag>
          ))}
        </div>
        <span className="results-found">Results Found: {filteredCount}</span>
      </div>

      <Table
        className="custom-table-healthcare"
        columns={columns}
        dataSource={filteredData}
        pagination={{
          position: ["topRight"],
          simple: true,
          size: "small",
        }}
        scroll={{ x: "max-content", y: "calc(100vh - 300px)" }}
        loading={{
          spinning: loading,
          indicator: (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                padding: 24,
                top: "20%",
              }}
            >
              <Progress
                percent={progress}
                status={progress < 100 ? "active" : "success"}
                showInfo={true}
                style={{ width: 500 }}
              />
              <div
                style={{
                  fontWeight: 500,
                  fontSize: 12,
                  textAlign: "center",
                  color: "#aaa",
                  width: 300,
                  padding: 8,
                }}
              >
                Loading Healthcare Universe
              </div>
            </div>
          ),
        }}
        onChange={(pagination, filters, sorter, extra) => {
          setFilteredCount(extra.currentDataSource.length);
        }}
      />

      {currentRecord && (
        <HealthcareModal
          record={currentRecord}
          isEditing={isEditing}
          handleChange={(field, value) => {
            setCurrentRecord((prev) => ({
              ...prev,
              [field]: value,
            }));
          }}
          setIsEditing={setIsEditing}
          setIsModalVisible={setIsModalVisible}
          isModalVisible={isModalVisible}
          setOriginalRecord={setOriginalRecord}
          setCurrentRecord={setCurrentRecord}
          originalRecord={originalRecord}
          handleReload={handleReload}
        />
      )}
    </div>
  );
};

export default Healthcare;
