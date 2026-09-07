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
  ConfigProvider,
  Progress,
  Avatar, // Added Avatar
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
  TagsOutlined,
  EditOutlined,
  ClockCircleFilled,
} from "@ant-design/icons";
import Highlighter from "react-highlight-words";
import axios from "axios";
import "./chemicals.css";
import Swal from "sweetalert2";
import ChemicalModal from "./ChemicalModal";
import { API_BASE_URL, SOCKET_URL } from "../../../config/api";
import { io } from "socket.io-client"; // Added io

const sortByIdNo = (arr) => {
  return [...arr].sort((a, b) => {
    // Try both id_no and idNo for compatibility
    const aId = Number(a.id_no ?? a.idNo ?? 0);
    const bId = Number(b.id_no ?? b.idNo ?? 0);
    return aId - bId;
  });
};

const Chemicals = ({ theme, currentUser, data }) => {
  const [loading, setLoading] = useState(false);
  const [buttonColor, setButtonColor] = useState("primary");
  const [searchText, setSearchText] = useState("");
  const [searchedColumn, setSearchedColumn] = useState("");
  const [inputVisible, setInputVisible] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [filteredData, setFilteredData] = useState([]);
  const [tags, setTags] = useState([]); // State to store tags
  const [initialState, setInitialState] = useState(new Map());
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
  const [chemicalsViewers, setChemicalsViewers] = useState([]); // Added state for viewers
  const socketRef = useRef(null); // Added socket ref

  const canViewDataHistory = currentUser?.capabilities?.canViewDataHistory === true; // For Avatar.Group visibility

  useEffect(() => {
    const fetchChemicalsData = async () => {
      setLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/api/chemicals`, {
          method: "GET",
          credentials: "include",
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText);
        }

        const result = await response.json();
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

    fetchChemicalsData(); // Renamed to avoid conflict
  }, []);

  useEffect(() => {
    if (!currentUser?.username) return;

    if (!socketRef.current) {
      socketRef.current = io(SOCKET_URL, { withCredentials: true });
    }
    const socket = socketRef.current;

    const joinUserToChemicals = () => {
      socket.emit("joinChemicals", {
        user: {
          username: currentUser.username,
          avatar: currentUser.avatar || currentUser.avatarUrl,
          name: currentUser.name,
        },
      });
    };

    joinUserToChemicals();

    const chemicalsViewersHandler = (updatedViewers) => {
      // console.log("[Chemicals.jsx] Received chemicalsViewers update:", updatedViewers.map(u => u.username).join(', '));
      setChemicalsViewers(updatedViewers);
    };

    const handleConnect = () => {
      joinUserToChemicals();
    };

    socket.on("chemicalsViewers", chemicalsViewersHandler);
    socket.on("connect", handleConnect);

    return () => {
      if (socketRef.current) {
        socketRef.current.emit("leaveChemicals");
        socketRef.current.off("chemicalsViewers", chemicalsViewersHandler);
        socketRef.current.off("connect", handleConnect);
      }
    };
  }, [currentUser]);

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

  const handleReload = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/chemicals`, {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }
      const result = await response.json();
      const sortedResult = sortByIdNo(result);
      setFilteredData(sortedResult);
      setFilteredCount(sortedResult.length);
    } catch (error) {
      // console.error("Error fetching chemical data:", error.message);
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

    if (newTags.length === 0) {
      // If no tags left, reset filter and reload all data
      handleReload();
    } else {
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
    }
  };

  const getColumnSearchProps = (dataIndex) => ({
    filterDropdown: ({
      setSelectedKeys,
      selectedKeys,
      confirm,
      clearFilters,
    }) => (
      <div style={{ fontSize: 10 }}>
        <Input
          ref={searchInput}
          placeholder={`Search ${dataIndex}`}
          value={selectedKeys[0]}
          onChange={(e) => {
            setSelectedKeys(e.target.value ? [e.target.value] : []);
            handleInputChange(e);
          }}
          onPressEnter={() => handleSearch(selectedKeys, confirm, dataIndex)}
          className="chemical-custom-filter-input"
          style={{ fontSize: 10 }}
        />
        <Space>
          <Button
            type="primary"
            onClick={() => handleSearch(selectedKeys, confirm, dataIndex)}
            icon={<SearchOutlined />}
            size="small"
            className="chemical-custom-filter-button"
            style={{ fontSize: 10 }}
          >
            Search
          </Button>
          <Button
            onClick={() => handleReset(clearFilters)}
            size="small"
            className="chemical-custom-filter-button"
            style={{ fontSize: 10 }}
          >
            Reset
          </Button>
        </Space>
      </div>
    ),
    filterIcon: (filtered) => (
      <SearchOutlined
        style={{ color: filtered ? "#1890ff" : undefined, fontSize: 12 }}
      />
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
          highlightStyle={{
            backgroundColor: "#ffc069",
            padding: 0,
            fontSize: 10,
          }}
          searchWords={[searchText]}
          autoEscape
          textToHighlight={text ? text.toString() : ""}
        />
      ) : (
        <span style={{ fontSize: 10 }}>{text}</span>
      ),
  });

  const getColumnDropdownProps = (dataIndex, options) => {
    const sortedOptions = options.sort((a, b) => a.localeCompare(b));
    return {
      filters: sortedOptions.map((option) => ({
        text: option || "", // Replace empty values with "blank"
        value: option || "", // Replace empty values with "blank"
      })),
      onFilter: (value, record) => (record[dataIndex] || "") === value,
      render: (text) =>
        searchedColumn === dataIndex ? (
          <Highlighter
            highlightStyle={{ backgroundColor: "#ffc069", padding: 0 }}
            searchWords={[searchText]}
            autoEscape
            textToHighlight={text ? text.toString() : ""}
          />
        ) : (
          text || "" // Replace empty values with "blank"
        ),
      dropdownRender: (menu) => (
        <ConfigProvider
          theme={{
            components: {
              Dropdown: {
                fontSize: 10, // Reduced font size for dropdown menu
                optionFontSize: 10, // Also reduce option font size if supported
              },
              Menu: {
                itemFontSize: 10, // Reduce font size for menu items
              },
            },
          }}
        >
          <div style={{ fontSize: 10 }}>{menu}</div>
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
        ECC: record.ecc_cnc && String(record.ecc_cnc).includes("ECC"),
        CNC: record.ecc_cnc && String(record.ecc_cnc).includes("CNC"),
        PTO:
          record.pto_code &&
          record.pto_code !== "n/a" &&
          record.pto_code !== "no records found per OPMS" &&
          String(record.pto_code).includes("PTO"),
        WWDP:
          record.wwdp_code &&
          record.wwdp_code !== "n/a" &&
          record.wwdp_code !== "no records found per OPMS" &&
          String(record.wwdp_code).includes("WWDP"),
        HAZWASTE:
          record.haz_id &&
          record.haz_id !== "n/a" &&
          record.haz_id !== "no records found per OPMS" &&
          String(record.haz_id).includes("HAZWASTE"),
        PCO:
          record.pco_np &&
          record.pco_np !== "n/a" &&
          record.pco_np !== "no records found per OPMS" &&
          String(record.pco_np).includes("PCO"),
      };
      return permitValues[value];
    },
    render: (text, record) => (
      <div style={{ position: "relative" }}>
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
              color={
                String(record.ecc_cnc).includes("ECC") ? "#083f50" : "#8a5200"
              }
            >
              <span
                className={
                  String(record.ecc_cnc).includes("ECC")
                    ? "custom-button-cyan"
                    : "custom-button-yellow"
                }
                style={{ position: "relative" }}
              >
                {String(record.ecc_cnc).includes("ECC") ? "ECC" : "CNC"}
                {(String(record.ecc_cnc).includes("App") ||
                  String(record.ecc_cnc).includes("Application") ||
                  String(record.ecc_cnc).includes("Application No.")) && (
                  <ClockCircleFilled
                    style={{
                      position: "absolute",
                      top: -8,
                      right: -6,
                      fontSize: "12px",
                      color: "#3B6790",
                      backgroundColor: "#ffffff", // White background
                      borderRadius: "50%", // Make it circular
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
                  <div>Date Issued: {record.pto_issued}</div>
                  <div>Date of Expiration: {record.pto_expiration}</div>
                </div>
              }
              color="#321838"
            >
              <span
                className="custom-button-blue"
                style={{ position: "relative" }}
              >
                PTO
                {(String(record.pto_code).includes("App") ||
                  String(record.pto_code).includes("Application") ||
                  String(record.pto_code).includes("Application No.")) && (
                  <ClockCircleFilled
                    style={{
                      position: "absolute",
                      top: -8,
                      right: -6,
                      fontSize: "12px",
                      color: "#3B6790",
                      backgroundColor: "#ffffff", // White background
                      borderRadius: "50%", // Make it circular
                      padding: "1px",
                    }}
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
                  <div>Date Issued: {record.wwdp_issued}</div>
                  <div>Date of Expiration: {record.wwdp_expiration}</div>
                </div>
              }
              color="#873c34"
            >
              <span
                className="custom-button-orange"
                style={{ position: "relative" }}
              >
                WWDP
                {(String(record.wwdp_code).includes("App") ||
                  String(record.wwdp_code).includes("Application") ||
                  String(record.wwdp_code).includes("Application No.")) && (
                  <ClockCircleFilled
                    style={{
                      position: "absolute",
                      top: -8,
                      right: -6,
                      fontSize: "12px",
                      color: "#3B6790",
                      backgroundColor: "#ffffff", // White background
                      borderRadius: "50%", // Make it circular
                      padding: "1px",
                    }}
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
                      backgroundColor: "#ffffff", // White background
                      borderRadius: "50%", // Make it circular
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
                  <div>PCO Validity: {record.pco_validity}</div>
                </div>
              }
              color="#181a19"
            >
              <span
                className="custom-button-stone"
                style={{ position: "relative" }}
              >
                PCO
                {(String(record.pco_np).includes("App") ||
                  String(record.pco_np).includes("Application") ||
                  String(record.pco_np).includes("Application No.")) && (
                  <ClockCircleFilled
                    style={{
                      position: "absolute",
                      top: -8,
                      right: -6,
                      fontSize: "12px",
                      color: "#3B6790",
                      backgroundColor: "#ffffff", // White background
                      borderRadius: "50%", // Make it circular
                      padding: "1px",
                    }}
                  />
                )}
              </span>
            </Tooltip>
          )}
      </div>
    ),
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
      title: "ID No",
      dataIndex: "id_no",
      key: "id_no",
      ...getColumnSearchProps("id_no"),
      width: "65px",
    },
    {
      title: "Project Details",
      key: "project_details",
      align: "left",
      width: "300px",
      ...getColumnSearchProps("project_details"),
      render: (text, record) => (
        <div>
          <div style={{ fontWeight: "bold" }}>{record.title}</div>
          <div>Proponent Name: {record.name}</div>
          <div>Address: {record.address}</div>
          <div>
            ECC/CNC Ref. No.:{" "}
            <a
              href={
                record.ecc_cnc && String(record.ecc_cnc).startsWith("ECC-OL")
                  ? `https://ecconline.emb.gov.ph/live/Secured/Search.aspx?refCode=${record.ecc_cnc}`
                  : record.ecc_cnc &&
                    String(record.ecc_cnc).startsWith("CNC-OL")
                  ? `https://cnconline.emb.gov.ph/live/CNC/Projects.aspx?refCode=${record.ecc_cnc}`
                  : record.ecc_cnc && String(record.ecc_cnc).includes("CNC")
                  ? "https://cnconline.emb.gov.ph/live/Default.aspx"
                  : "#"
              }
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                // Only prevent default and show SweetAlert for values that do NOT start with "ECC-OL" or "CNC-OL" or contain "CNC"
                if (
                  record.ecc_cnc &&
                  !String(record.ecc_cnc).startsWith("ECC-OL") &&
                  !String(record.ecc_cnc).startsWith("CNC-OL") &&
                  !String(record.ecc_cnc).includes("CNC")
                ) {
                  e.preventDefault(); // Prevent the default link action

                  // Show SweetAlert
                  Swal.fire({
                    title:
                      "Reference Code in Electronic Records Management System",
                    text: `The reference code ${record.ecc_cnc} is available in the Electronic Records Management System. If you wish to verify the code, please contact emb.idms@gmail.com.`,
                    icon: "info",
                    confirmButtonText: "Send Email",
                    cancelButtonText: "Ok",
                    showCancelButton: true,
                    preConfirm: () => {
                      // Redirect to email client with pre-filled email address
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
      width: "150px",
      ...getColumnDropdownProps("industry_class", industryOptions),
    },
    {
      title: (
        <div style={{ textAlign: "center", width: "100%" }}>
          Permit/Clearances
        </div>
      ),
      key: "permit_clearances",
      align: "left",
      ...getPermitClearancesFilterProps(),
    },
    {
      title: "Monitoring Status",
      key: "monitoring_status",
      align: "center",
      render: (text, record) => (
        <div className="industry-label">
          <div>
            {/* Date Monitored */}
            {record.date_monitored && (
              <div>
                <Tooltip
                  title={<div style={{ fontSize: "10px" }}>Date Monitored</div>}
                  color="#0f5c9e" // Darker color than the source
                >
                  <MonitorOutlined
                    style={{ marginRight: 8, color: "#1890ff" }}
                  />{" "}
                  {record.date_monitored}
                </Tooltip>
              </div>
            )}

            {/* Date Routed */}
            {record.date_routed && (
              <div>
                <Tooltip
                  title={
                    <div style={{ fontSize: "10px" }}>Date Routed to IIS</div>
                  }
                  color="#3a8f1a" // Darker color than the source
                >
                  <GlobalOutlined
                    style={{ marginRight: 8, color: "#52c41a" }}
                  />{" "}
                  {record.date_routed}
                </Tooltip>
              </div>
            )}

            {/* Date Signed */}
            {record.date_signed && (
              <div>
                <Tooltip
                  title={
                    <div style={{ fontSize: "10px" }}>Date Report Signed</div>
                  }
                  color="#b8860b" // Darker color than the source
                >
                  <CheckCircleFilled
                    style={{ marginRight: 8, color: "#faad14" }}
                  />{" "}
                  {record.date_signed}
                </Tooltip>
              </div>
            )}

            {/* IIS Transaction No. */}
            {record.iis_no && (
              <a
                href={`https://iis.emb.gov.ph/embis/dms/documents/tracker/?trn_no=${encodeURIComponent(
                  record.iis_no
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: "inline-flex", alignItems: "center" }}
              >
                <Tooltip
                  title={
                    <div style={{ fontSize: "10px" }}>IIS Transaction No.</div>
                  }
                  color="#0a6bbf"
                >
                  <TagsOutlined style={{ color: "#1890ff", marginRight: 8 }} />
                </Tooltip>
                {record.iis_no || ""}
              </a>
            )}

            {/* PISMU Tracking */}
            <div>
              <Tooltip
                title={
                  <div style={{ fontSize: "10px" }}>
                    PISMU Tracking of Report
                  </div>
                }
                color="#0a6bbf" // Darker color than the source
              >
                {record.pismu_tracking === "✔" ? (
                  <span>
                    <CheckCircleFilled style={{ color: "#0D92F4" }} />{" "}
                    <span style={{ marginLeft: 8 }}>
                      Received by Planning Unit
                    </span>
                  </span>
                ) : (
                  <span></span>
                )}
              </Tooltip>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "Remarks/Recommendations",
      dataIndex: "remarks",
      key: "remarks",
      align: "center",
      ...getColumnSearchProps("remarks"),
    },
    {
      title: "Action",
      key: "action",
      align: "center",
      render: (text, record) => (
        <Button
          type="primary"
          size="small"
          onClick={() => showModal(record)} // Pass the row data to the modal
        >
          <EyeOutlined />
        </Button>
      ),
    },
  ];

  return (
    <div className={`healthcare-container-card ${theme}-theme`}>
      <div className="header-content-survey">
        <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
          <h3
            className="header-title-survey"
            style={{ margin: 0, marginRight: 16 }}
          >
            Universe of Industries (Chemicals)
          </h3>
          {canViewDataHistory && chemicalsViewers.length > 0 && (
            <Avatar.Group
              max={{ count: 3 }}
              maxStyle={{
                color: "#f56a00",
                backgroundColor: "#fde3cf",
                fontSize: 11,
              }}
              size={24}
            >
              {chemicalsViewers.map((user) => (
                <Tooltip
                  key={user.username}
                  title={<span style={{ fontSize: "10px" }}>{`${user.username} is here`}</span>}
                >
                  <Avatar src={user.avatar} style={{ marginLeft: 2, verticalAlign: "middle" }}>
                    {!user.avatar && user.username ? user.username[0].toUpperCase() : ""}
                  </Avatar>
                </Tooltip>
              ))}
            </Avatar.Group>
          )}
        </div>
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
            className="add-industry-button"
            style={{
              backgroundColor:
                buttonColor === "primary" ? "#1890ff" : "#03396c",
            }}
          >
            Add Industry
          </Button>
        </div>
      </div>

      <div className="chemical-table-header">
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
              className="chemical-tag-plus"
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
              className="chemical-search-keyword"
              color="blue"
            >
              {tag}
            </Tag>
          ))}
        </div>
        <span className="results-found">Results Found: {filteredCount}</span>
      </div>

      <Table
        className="custom-table-chemical"
        columns={columns}
        dataSource={filteredData}
        pagination={{
          position: ["topRight"],
          simple: true,
          size: "small",
        }}
        scroll={{ x: "max-content", y: "calc(100vh - 300px)" }} // maximize table height to available viewport
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
                Loading Chemical Industries
              </div>
            </div>
          ),
        }}
        onChange={(pagination, filters, sorter, extra) => {
          setFilteredCount(extra.currentDataSource.length);
        }}
      />

      {currentRecord && (
        <ChemicalModal
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

export default Chemicals;
