import React, { useState, useEffect, useContext, useRef } from "react";
import { useParams } from "react-router-dom";
import _ from "lodash";
import {
  Table,
  Input,
  Tooltip,
  Button,
  Modal,
  Select,
  Pagination,
  Spin,
  Menu,
  Dropdown,
  notification,
  Checkbox,
  Tag,
  Space,
} from "antd";
import {
  SearchOutlined,
  EyeOutlined,
  ReloadOutlined,
  BgColorsOutlined,
  ExportOutlined,
} from "@ant-design/icons";
import "./province.css";
import ProvinceModal from "./ProvinceModal";
import { DataContext } from "./DataContext";
import Swal from "sweetalert2";
import jsPDF from "jspdf";
import "jspdf-autotable";
import Highlighter from "react-highlight-words";

const capitalizeFirstLetter = (str) => {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

const { Option } = Select;

const Province = ({ theme }) => {
  const { provinceName } = useParams();
  const { data, loading, error, currentProvince, setCurrentProvince } =
    useContext(DataContext);
  const { fetchData } = useContext(DataContext);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const capitalizedProvinceName = capitalizeFirstLetter(provinceName);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [shouldRefreshTable, setShouldRefreshTable] = useState(false);
  const [filteredData, setFilteredData] = useState(data);
  const [tableLoading, setTableLoading] = useState(false);
  const [editedRecord, setEditedRecord] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [selectedRowColors, setSelectedRowColors] = useState({});
  const [selectedTags, setSelectedTags] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [searchText, setSearchText] = useState("");
  const [searchedColumn, setSearchedColumn] = useState("");
  const searchInput = useRef(null);
  const [filteredSearch, setFilteredSearch] = useState(data);

  useEffect(() => {
    if (provinceName) {
      setCurrentProvince(provinceName);
    }
  }, [provinceName]);

  useEffect(() => {
    if (shouldRefreshTable) {
      fetchData(provinceName);
      setShouldRefreshTable(false);
    }
  }, [shouldRefreshTable, fetchData, provinceName]);

  useEffect(() => {
    setTableLoading(loading);
  }, [loading]);

  useEffect(() => {
    if (selectedRecord) {
      setEditedRecord({ ...selectedRecord });
    }
  }, [selectedRecord]);

  useEffect(() => {
    const storedColors = localStorage.getItem("rowColors");
    if (storedColors) {
      const parsedColors = JSON.parse(storedColors);
      setSelectedRowColors(parsedColors);
    }
  }, []);

  const filterDataByTags = (adjustedData, selectedTags) => {
    if (!selectedTags.length) return adjustedData;

    return adjustedData.filter((item) => {
      return selectedTags.some((tag) => {
        const lowerCaseTag = tag.toLowerCase();
        return (
          (item.adjusted_id_no &&
            item.adjusted_id_no.toString().includes(tag)) ||
          (item.id_no &&
            item.id_no.toString().toLowerCase().includes(lowerCaseTag)) ||
          (typeof item.name === "string" &&
            item.name.toLowerCase().includes(lowerCaseTag)) ||
          (typeof item.address === "string" &&
            item.address.toLowerCase().includes(lowerCaseTag)) ||
          (typeof item.title === "string" &&
            item.title.toLowerCase().includes(lowerCaseTag)) ||
          (typeof item.section_incharge === "string" &&
            item.section_incharge.toLowerCase().includes(lowerCaseTag)) ||
          (typeof item.remarks_recommendations === "string" &&
            item.remarks_recommendations.toLowerCase().includes(lowerCaseTag))
        );
      });
    });
  };

  const adjustedData = data.map((item, index) => ({
    ...item,
    adjusted_id_no: index + 1, // Adjust id_no to start from 1
  }));

  useEffect(() => {
    const filtered = filterDataByTags(adjustedData, selectedTags);
    setFilteredData(filtered);
  }, [adjustedData, selectedTags]);

  const handleTagClose = (removedTag) => {
    setSelectedTags(selectedTags.filter((tag) => tag !== removedTag));
  };

  const handleInputChange = (e) => {
    setInputValue(e.target.value);
  };

  const handleInputConfirm = () => {
    if (inputValue && !selectedTags.includes(inputValue)) {
      setSelectedTags([...selectedTags, inputValue]);
    }
    setInputValue(""); // Clear input field
  };

  const handleSearch = (selectedKeys, confirm, dataIndex) => {
    confirm();
    setSearchText(selectedKeys[0]);
    setSearchedColumn(dataIndex);

    // Filter data when searching
    const filtered = data.filter((record) =>
      record[dataIndex]
        .toString()
        .toLowerCase()
        .includes(selectedKeys[0].toLowerCase())
    );
    setFilteredSearch(filtered); // Update filteredSearch with filtered results
  };

  const handleReset = (clearFilters) => {
    clearFilters();
    setSearchText("");
    setFilteredSearch(data); // Reset filteredSearch to original data
  };

  const getColumnSearchProps = (dataIndex) => ({
    filterDropdown: ({
      setSelectedKeys,
      selectedKeys,
      confirm,
      clearFilters,
      close,
    }) => (
      <div
        style={{
          padding: 8,
        }}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <Input
          ref={searchInput}
          placeholder={`Search ${dataIndex}`}
          value={selectedKeys[0]}
          onChange={(e) =>
            setSelectedKeys(e.target.value ? [e.target.value] : [])
          }
          onPressEnter={() => handleSearch(selectedKeys, confirm, dataIndex)}
          style={{
            marginBottom: 8,
            display: "block",
          }}
        />
        <Space>
          <Button
            type="primary"
            onClick={() => handleSearch(selectedKeys, confirm, dataIndex)}
            icon={<SearchOutlined />}
            size="small"
            style={{
              width: 90,
            }}
          >
            Search
          </Button>
          <Button
            onClick={() => clearFilters && handleReset(clearFilters)}
            size="small"
            style={{
              width: 90,
            }}
          >
            Reset
          </Button>
          <Button
            type="link"
            size="small"
            onClick={() => {
              confirm({
                closeDropdown: false,
              });
              setSearchText(selectedKeys[0]);
              setSearchedColumn(dataIndex);
            }}
          >
            Filter
          </Button>
          <Button
            type="link"
            size="small"
            onClick={() => {
              close();
            }}
          >
            Close
          </Button>
        </Space>
      </div>
    ),
    filterIcon: (filtered) => (
      <SearchOutlined
        style={{
          color: filtered ? "#1677ff" : undefined,
        }}
      />
    ),
    onFilter: (value, record) =>
      record[dataIndex].toString().toLowerCase().includes(value.toLowerCase()),
    onFilterDropdownOpenChange: (visible) => {
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
          }}
          searchWords={[searchText]}
          autoEscape
          textToHighlight={text ? text.toString() : ""}
        />
      ) : (
        text
      ),
  });

  const formatNumber = (number) => {
    return new Intl.NumberFormat("en-US").format(number);
  };

  const showModal = (record) => {
    setSelectedRecord(record);
    setIsEditing(false);
    setModalVisible(true);
  };

  const handleCloseModal = () => {
    if (isEditing && !_.isEqual(editedRecord, selectedRecord)) {
      Swal.fire({
        title: "Unsaved changes",
        text: "You have unsaved changes. Are you sure you want to close the modal?",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Close",
        cancelButtonText: "Stay",
      }).then((result) => {
        if (result.isConfirmed) {
          setModalVisible(false);
          setIsEditing(false);
          setEditMode(false);
        }
      });
    } else {
      setModalVisible(false);
      setIsEditing(false);
    }
  };

  const handleToggleEdit = () => {
    setIsEditing(!isEditing);
  };

  const handleReload = async () => {
    try {
      setTableLoading(true);
      await fetchData(provinceName);
      const filtered = filterData(data, searchTerm);
      setFilteredData(filtered);
    } catch (error) {
      console.error("Error reloading data:", error);
    } finally {
      setTableLoading(false);
    }
  };

  const handleColorReload = async () => {
    try {
      await fetchData(provinceName);
      const filtered = filterData(data, searchTerm);
      setFilteredData(filtered);
    } catch (error) {
      console.error("Error reloading data:", error);
    }
  };

  const handleRowClick = async (record) => {
    if (!selectedRowKeys.includes(record.id_no)) {
      // If the row is not already selected, add it to the selection
      setSelectedRowKeys([...selectedRowKeys, record.id_no]);
    } else {
      // If the row is already selected, remove it from the selection
      setSelectedRowKeys(selectedRowKeys.filter((key) => key !== record.id_no));
    }
  };

  const sectionBackgroundColor = (section) => {
    switch (section) {
      case "PEMU_Aurora":
      case "PEMU_AURORA":
        return "transparent"; // no color encoded

      case "PEMU_Bataan":
      case "PEMU_BATAAN":
        return "#FCE5BB"; // Biege. pero pag namonitor na, transparent

      case "PEMU_Bulacan":
      case "PEMU_BULACAN":
        return "#FCE5BB"; // Light purple

      case "PEMU_Nueva Ecija":
      case "PEMU_NUEVA ECIJA":
        return "#FFE225"; // Yellow

      case "PEMU_Pampanga":
      case "PEMU_PAMPANGA":
        return "#FFE225"; // Yellow

      case "PEMU_Tarlac":
      case "PEMU_TARLAC":
        return "#39C665"; // Green

      case "PEMU_Zambales":
      case "PEMU_ZAMBALES":
        return "#d1c4e9"; // Light lavender

      case "MBU":
      case "mbu":
        return "#FF9B3E"; // Light green

      case "TCHWMS":
      case "tchwms":
        return "#936DDF";

      case "AWECMES":
      case "awecmes":
        return "#c8e6c9";

      default:
        return "transparent"; // Default transparent background
    }
  };

  const measureTextWidth = (text, font = "14px Poppins") => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    context.font = font;
    return context.measureText(text).width;
  };

  const columns = [
    {
      title: (
        <Checkbox
          onChange={(e) => handleSelectAll(e.target.checked)}
          checked={selectedRowKeys.length === filteredData.length}
          indeterminate={
            selectedRowKeys.length > 0 &&
            selectedRowKeys.length < filteredData.length
          }
        />
      ),
      key: "select",
      align: "center",
      width: "20px",
      render: (text, record) => (
        <Checkbox
          checked={selectedRowKeys.includes(record.id_no)}
          onChange={(e) => handleCheckboxChange(e, record.id_no)}
        />
      ),
      selections: [
        Table.SELECTION_ALL,
        Table.SELECTION_INVERT,
        Table.SELECTION_NONE,
        {
          key: "odd",
          text: "Select Odd Row",
          onSelect: (changeableRowKeys) => {
            let newSelectedRowKeys = [];
            newSelectedRowKeys = changeableRowKeys.filter((_, index) => {
              if (index % 2 !== 0) {
                return false;
              }
              return true;
            });
            setSelectedRowKeys(newSelectedRowKeys);
          },
        },
        {
          key: "even",
          text: "Select Even Row",
          onSelect: (changeableRowKeys) => {
            let newSelectedRowKeys = [];
            newSelectedRowKeys = changeableRowKeys.filter((_, index) => {
              if (index % 2 !== 0) {
                return true;
              }
              return false;
            });
            setSelectedRowKeys(newSelectedRowKeys);
          },
        },
      ],
    },
    {
      title: "ID No.",
      dataIndex: "adjusted_id_no", // Use adjusted_id_no for display
      key: "id_no",
      align: "left",
      width: "100px",
      ...getColumnSearchProps("adjusted_id_no"), // Add search props
      render: (text) => <div className="industry-label">{text}</div>,
    },
    {
      title: "Industry Details",
      key: "industryDetails",
      ...getColumnSearchProps("title"), // Add search props
      render: (text, record) => (
        <div className="industry-label">
          <strong>{record.title}</strong>
          <br />
          Proponent Name: <i>{record.name}</i>
          <br />
          Address: {record.address}
          <br />
          ECC/CNC Ref. No.:{" "}
          <a
            href={`https://iis.emb.gov.ph/embis/`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {record.ecc_cnc}
          </a>
        </div>
      ),
      align: "left",
      width: "300px",
    },
    {
      title: "Industry Classification",
      key: "industry_class",
      ...getColumnSearchProps("industry_class"),
      render: (text, record) => (
        <div className="industry-label">{record.industry_class}</div>
      ),
      align: "left",
      width: "300px",
    },
    {
      title: "Permits/Clearances",
      width: "200px",
      key: "permits_clearances",
      render: (text, record) => (
        <div
          className="permits-clearances-container"
          style={{ fontSize: "11px" }}
        >
          {record.ecc_cnc &&
            ((record.permit_process === "ECC Online" ||
              record.permit_process === "ECC Manual") &&
            typeof record.ecc_cnc === "string" &&
            (record.ecc_cnc.includes("ECC-OL") ||
              record.ecc_cnc.includes("R3") ||
              record.ecc_cnc.includes("03") ||
              record.ecc_cnc.includes("III") ||
              record.ecc_cnc.includes("RO3") ||
              record.ecc_cnc.includes("ECC")) ? (
              <Tooltip
                title={
                  <div className="tooltip-content" style={{ fontSize: "11px" }}>
                    <div>ECC Information</div>
                    <div>Reference No.: {record.ecc_cnc}</div>
                    <div>Date Approved: {record.date_approved}</div>
                    <div>Date Amended: {record.date_amend}</div>
                  </div>
                }
                color="#0b5f74"
              >
                <Button
                  type="text"
                  className="custom-button-green"
                  size="small"
                >
                  ECC
                </Button>
              </Tooltip>
            ) : typeof record.ecc_cnc === "string" &&
              (record.ecc_cnc.includes("CNC") ||
                record.ecc_cnc.includes("R03")) ? (
              <Tooltip
                title={
                  <div className="tooltip-content" style={{ fontSize: "11px" }}>
                    <div>CNC Information</div>
                    <div>Code: {record.ecc_cnc}</div>
                    <div>Date Issued: {record.date_approved}</div>
                  </div>
                }
                color="#bc6e00"
              >
                <Button
                  type="text"
                  className="custom-button-yellow"
                  size="small"
                >
                  CNC
                </Button>
              </Tooltip>
            ) : null)}

          {record.pto_code && (
            <Tooltip
              title={
                <div style={{ fontSize: "11px" }}>
                  <div>PTO Information</div>
                  <div>Code: {record.pto_code}</div>
                  <div>Date Issued: {record.pto_issued}</div>
                  <div>Date of Expiration: {record.pto_expiration}</div>
                </div>
              }
              color="#643c6a"
            >
              <Button type="text" className="custom-button-blue" size="small">
                {typeof record.pto_code === "string" &&
                (record.pto_code.includes("POA") ||
                  record.pto_code.includes("PTO") ||
                  record.pto_code.includes("FLA"))
                  ? "PTO"
                  : record.pto_code}
              </Button>
            </Tooltip>
          )}

          {record.wwdp_code && (
            <Tooltip
              title={
                <div style={{ fontSize: "11px" }}>
                  <div>WWDP Information</div>
                  <div>Code: {record.wwdp_code}</div>
                  <div>Date Issued: {record.wwdp_issued}</div>
                  <div>Date of Expiration: {record.wwdp_expiration}</div>
                </div>
              }
              color="#b45248"
            >
              <Button type="text" className="custom-button-orange" size="small">
                {typeof record.wwdp_code === "string" &&
                record.wwdp_code.includes("DP")
                  ? "WWDP"
                  : record.wwdp_code}
              </Button>
            </Tooltip>
          )}

          {record.haz_id && (
            <Tooltip
              title={
                <div style={{ fontSize: "11px" }}>
                  <div>HWG ID Information</div>
                  <div>Code: {record.haz_id}</div>
                  <div>Date Issued: {record.haz_issued}</div>
                </div>
              }
              color="#415e20"
            >
              <Button
                type="text"
                className="custom-button-skyblue"
                size="small"
              >
                {typeof record.haz_id === "string" &&
                (record.haz_id.includes("GR") ||
                  record.haz_id.includes("M-GR") ||
                  record.pto_code.includes("OL-GR") ||
                  record.pto_code.includes("HW"))
                  ? "HWG ID"
                  : record.haz_id}
              </Button>
            </Tooltip>
          )}

          {record.tsd_ref_no && (
            <Tooltip
              title={
                <div style={{ fontSize: "11px" }}>
                  <div>TSD Information</div>
                  <div>Code: {record.tsd_ref_no}</div>
                  <div>Date of Expiration: {record.tsd_expiration}</div>
                </div>
              }
              color="#542c14"
            >
              <Button type="text" className="custom-button-brown" size="small">
                {typeof record.tsd_ref_no === "string" &&
                (record.tsd_ref_no.includes("TR") ||
                  record.tsd_ref_no.includes("OL-TR"))
                  ? "TSD ID"
                  : record.tsd_ref_no}
              </Button>
            </Tooltip>
          )}

          {record.tp_trc_ref_no && (
            <Tooltip
              title={
                <div style={{ fontSize: "11px" }}>
                  <div>TP/TRC Information</div>
                  <div>Code: {record.tp_trc_ref_no}</div>
                  <div>Date of Expiration: {record.tp_trc_expiration}</div>
                </div>
              }
              color="#242726"
            >
              <Button type="text" className="custom-button-stone" size="small">
                {typeof record.tp_trc_ref_no === "string" &&
                (record.tp_trc_ref_no.includes("TR") ||
                  record.tp_trc_ref_no.includes("OL-TP") ||
                  record.tp_trc_ref_no.includes("OL-PTT"))
                  ? "TP/TRC ID"
                  : record.tp_trc_ref_no}
              </Button>
            </Tooltip>
          )}

          {record.chemical_code && (
            <Tooltip
              title={
                <div>
                  <div>Chemical Permit/s Information</div>
                  <table>
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Element</th>
                        <th>Code</th>
                        <th>Permit Issued</th>
                        <th>Permit Expiration</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>{record.chemical_code.split("-")[0]}</td>
                        <td>{record.chemical_code.split("-")[2]}</td>
                        <td>{record.chemical_code}</td>
                        <td>{record.chem_permit_issued}</td>
                        <td>{record.chem_permit_exp}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              }
              color="#5e5d3e"
            >
              <Button type="text" className="custom-button-ash" size="small">
                {typeof record.chemical_code === "string" &&
                (record.chemical_code.includes("CCOr") ||
                  record.chemical_code.includes("CCOi") ||
                  record.chemical_code.includes("OL") ||
                  record.chemical_code.includes("PCL") ||
                  record.chemical_code.includes("SQI"))
                  ? "Chemical Permits"
                  : record.chemical_code}
              </Button>
            </Tooltip>
          )}

          {record.pco_no && (
            <Tooltip
              title={
                <div style={{ fontSize: "11px" }}>
                  <div>PCO Information</div>
                  <div>Code: {record.pco_no}</div>
                  <div>Name: {record.pco_name}</div>
                  <div>Tel. No: {record.pco_tel_no}</div>
                  <div>PCO Validity: {record.pco_validity}</div>
                </div>
              }
              color="#243d57"
            >
              <Button type="text" className="custom-button-slate" size="small">
                {typeof record.pco_no === "string" &&
                (record.pco_no.includes("PCO") ||
                  record.pco_no.includes("PCC") ||
                  record.pco_no.includes("A-PCO"))
                  ? "PCO ID"
                  : record.pco_no}
              </Button>
            </Tooltip>
          )}
        </div>
      ),
    },
    {
      title: "Section/Unit Incharged",
      key: "section_incharge",
      ...getColumnSearchProps("section_incharge"),
      render: (text, record) => {
        const textWidth = measureTextWidth(record.section_incharge);
        const backgroundColor = sectionBackgroundColor(record.section_incharge);

        return (
          <div
            className="industry-label"
            style={{
              backgroundColor: backgroundColor,
              padding: "5px",
              width: `${textWidth + 5}px`, // Add some padding for better appearance
              display: "inline-block",
              overflow: "hidden",
              whiteSpace: "nowrap",
              borderRadius: "5px",
            }}
          >
            {record.section_incharge}
          </div>
        );
      },
      align: "left",
      width: "200px",
    },
    {
      title: "Remarks/Recommendations",
      key: "remarks_recommendations",
      ...getColumnSearchProps("remarks_recommendations"),
      render: (text, record) => (
        <div className="industry-label">{record.remarks_recommendations}</div>
      ),
      align: "left",
    },
    // {
    //   title: "Color",
    //   key: "color",
    //   render: (text, record) => {
    //     let colorValue = record.color;
    //     return (
    //       <div
    //         className="industry-label"
    //         style={{
    //           backgroundColor: colorValue,
    //           padding: "10px",
    //           width: "100%",
    //         }}
    //       >
    //         {colorValue || "No color"}
    //       </div>
    //     );
    //   },
    //   align: "left",
    //   width: "200px",
    // },
    {
      title: "IIS Transaction No.",
      key: "iis_no",
      ...getColumnSearchProps("iis_no"),
      render: (text, record) => (
        <div className="industry-label">
          <a
            href={`https://iis.emb.gov.ph/embis/dms/documents/tracker/`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {record.iis_no}
          </a>
        </div>
      ),
      align: "left",
      width: "200px",
    },
    {
      title: "Actions",
      key: "actions",
      align: "center",
      width: 200,
      render: (text, record) => (
        <div>
          <Tooltip title="View Details" style={{ fontSize: "11px" }}>
            <Button
              icon={<EyeOutlined />}
              onClick={() => showModal(record)}
              type="primary"
              className="btn-action"
              size="small"
            />
          </Tooltip>
        </div>
      ),
    },
  ];

  const formatIndustryDetails = (record) => {
    return `
      ${record.title || ""}
      Proponent Name: ${record.name || ""}, 
      Address: ${record.address || ""}
    `.trim();
  };

  const formatPermitsClearances = (record) => {
    const permits = [];

    if (record.ecc_cnc) {
      permits.push(`ECC/CNC Ref. No.: ${record.ecc_cnc}`);
    }

    if (record.pto_code) {
      permits.push(`PTO Code: ${record.pto_code}`);
    }

    if (record.wwdp_code) {
      permits.push(`WWDP Code: ${record.wwdp_code}`);
    }

    if (record.haz_id) {
      permits.push(`HWG ID Code: ${record.haz_id}`);
    }

    if (record.tsd_ref_no) {
      permits.push(`TSD ID Code: ${record.tsd_ref_no}`);
    }

    if (record.tp_trc_ref_no) {
      permits.push(`TP/TRC ID Code: ${record.tp_trc_ref_no}`);
    }

    if (record.chemical_code) {
      permits.push(`Chemical Code: ${record.chemical_code}`);
    }

    if (record.pco_no) {
      permits.push(`PCO Code: ${record.pco_no}`);
    }

    return permits.join("\n");
  };

  const extractTextContent = (element) => {
    if (typeof element === "string") {
      return element;
    }

    if (React.isValidElement(element)) {
      return React.Children.toArray(element.props.children)
        .map((child) =>
          typeof child === "string" ? child : extractTextContent(child)
        )
        .join("");
    }

    return "";
  };

  const handleExportPDF = (province) => {
    //console.log("Selected province:", province); // Debugging line
    const provinceName =
      typeof province === "object"
        ? province.name || "Unknown Province"
        : province;

    //console.log("Extracted province name:", provinceName); // Debugging line

    // Check if any checkboxes are selected
    if (selectedRowKeys.length === 0) {
      Swal.fire({
        title: "No Selections Made",
        text: "No data is selected. Do you want to export all data?",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Yes, Export All",
        cancelButtonText: "Cancel",
      }).then((result) => {
        if (result.isConfirmed) {
          exportAllData(provinceName);
        }
      });
      return;
    }

    exportSelectedData(provinceName);
  };

  // Function to export all data
  const exportAllData = (provinceName) => {
    const doc = new jsPDF({ orientation: "landscape", format: "a4" });

    // Customize title with province name
    doc.setFontSize(12);
    doc.text(`Province Data (${provinceName})`, 20, 20);

    // Define columns and data for the PDF
    const columns = [
      { title: "ID No.", dataKey: "id_no" },
      { title: "Industry Details", dataKey: "industryDetails" },
      { title: "Industry Classification", dataKey: "industry_class" },
      { title: "Permits/Clearances", dataKey: "permits_clearances" },
      { title: "Section/Unit Incharged", dataKey: "section_incharge" },
      { title: "Remarks/Recommendations", dataKey: "remarks_recommendations" },
    ];

    const data = filteredData.map((record) => ({
      id_no: record.id_no || "",
      industryDetails: formatIndustryDetails(record),
      industry_class: record.industry_class || "",
      permits_clearances: formatPermitsClearances(record),
      section_incharge: record.section_incharge || "",
      remarks_recommendations: record.remarks_recommendations || "",
    }));

    // Add autoTable to PDF
    doc.autoTable({
      startY: 30,
      columns: columns,
      body: data,
      theme: "striped",
      styles: { fontSize: 8, cellPadding: 3 },
      columnStyles: {
        id_no: { cellWidth: 15 },
        industryDetails: { cellWidth: 80 },
        industry_class: { cellWidth: 30 },
        permits_clearances: { cellWidth: 80 },
        section_incharge: { cellWidth: 30 },
      },
    });

    // Save the PDF
    doc.save(`Province Data (${provinceName}).pdf`);
  };

  const exportSelectedData = (provinceName) => {
    Swal.fire({
      title: "Export Selected Data",
      text: "Are you sure you want to export the selected data?",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, Export",
      cancelButtonText: "Cancel",
    }).then((result) => {
      if (result.isConfirmed) {
        const doc = new jsPDF({ orientation: "landscape", format: "a4" });

        // Customize title with province name
        doc.setFontSize(12);
        doc.text(`Province Data (${provinceName})`, 20, 20);

        // Define columns and data for the PDF
        const columns = [
          { title: "ID No.", dataKey: "id_no" },
          { title: "Industry Details", dataKey: "industryDetails" },
          { title: "Industry Classification", dataKey: "industry_class" },
          { title: "Permits/Clearances", dataKey: "permits_clearances" },
          { title: "Section/Unit Incharged", dataKey: "section_incharge" },
          {
            title: "Remarks/Recommendations",
            dataKey: "remarks_recommendations",
          },
        ];

        // Filter data based on selected checkboxes
        const data = filteredData
          .filter((record) => selectedRowKeys.includes(record.id_no))
          .map((record) => ({
            id_no: record.id_no || "",
            industryDetails: formatIndustryDetails(record),
            industry_class: record.industry_class || "",
            permits_clearances: formatPermitsClearances(record),
            section_incharge: record.section_incharge || "",
            remarks_recommendations: record.remarks_recommendations || "",
          }));

        // Add autoTable to PDF
        doc.autoTable({
          startY: 30,
          columns: columns,
          body: data,
          theme: "striped",
          styles: { fontSize: 8, cellPadding: 3 },
          columnStyles: {
            id_no: { cellWidth: 15 },
            industryDetails: { cellWidth: 80 },
            industry_class: { cellWidth: 30 },
            permits_clearances: { cellWidth: 70 },
            section_incharge: { cellWidth: 30 },
          },
        });

        // Save the PDF
        doc.save(`Province Data (${provinceName}).pdf`);
      }
    });
  };

  const handleRowSelect = (id_no) => {
    if (selectedRowKeys.includes(id_no)) {
      setSelectedRowKeys(selectedRowKeys.filter((key) => key !== id_no));
      const newColors = { ...selectedRowColors };
      delete newColors[id_no];
      setSelectedRowColors(newColors);
      localStorage.setItem("rowColors", JSON.stringify(newColors));
    } else {
      setSelectedRowKeys([...selectedRowKeys, id_no]);
      const newColors = { ...selectedRowColors };
      newColors[id_no] = selectedRowColors[id_no] || "#e6f7ff"; // default color
      setSelectedRowColors(newColors);
      localStorage.setItem("rowColors", JSON.stringify(newColors));
    }
  };

  const handleSelectAll = (checked) => {
    const allRowKeys = filteredData.map((item) => item.id_no);
    setSelectedRowKeys(checked ? allRowKeys : []);
  };

  const handleCheckboxChange = (e, id_no) => {
    const checked = e.target.checked;
    const newSelectedRowKeys = checked
      ? [...selectedRowKeys, id_no]
      : selectedRowKeys.filter((key) => key !== id_no);

    setSelectedRowKeys(newSelectedRowKeys);
  };

  const colors = [
    "#FCE5BB",
    "#FFE225",
    "#FFE225",
    "#39C665",
    "#d1c4e9",
    "#FF9B3E",
    "#936DDF",
    "#c8e6c9",
    "#ffffff",
  ];

  const handleColorClick = (selectedRowKeys, color) => {
    setSelectedRowColors((prevSelectedRowColors) => {
      const newSelectedRowColors = { ...prevSelectedRowColors };
      selectedRowKeys.forEach((rowKey) => {
        newSelectedRowColors[rowKey] = color;
      });
      return newSelectedRowColors;
    });

    // Update the colors in local storage after setting them
    setTimeout(() => {
      localStorage.setItem("rowColors", JSON.stringify(selectedRowColors));
    }, 0);
  };

  const handleClearColors = (selectedRowKeys) => {
    setSelectedRowColors((prevSelectedRowColors) => {
      const newSelectedRowColors = { ...prevSelectedRowColors };
      selectedRowKeys.forEach((rowKey) => {
        delete newSelectedRowColors[rowKey];
      });
      return newSelectedRowColors;
    });

    // Update the local storage after clearing colors
    setTimeout(() => {
      localStorage.setItem("rowColors", JSON.stringify(selectedRowColors));
    }, 0);
  };

  const handleSaveColors = () => {
    const colorUpdates = selectedRowKeys.map((id_no) => ({
      id_no,
      color: selectedRowColors[id_no],
    }));

    if (colorUpdates.length === 0) {
      notification.error({
        message: "No rows selected to update colors.",
      });
      return;
    }

    // Get the auth token (if you are using JWT, token could be stored in localStorage or a cookie)
    const authToken = localStorage.getItem("authToken");

    fetch("http://localhost:8081/api/update-color-universe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Add Authorization header if needed
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(colorUpdates),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Error updating colors: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        notification.success({
          message: "Industries marked successfully",
          description: `The selected industries have been marked.`,
          style: {
            fontSize: 11, // reduce the font size to 12px
          },
        });

        const storedData = localStorage.getItem("colorData");
        const updatedData = storedData ? JSON.parse(storedData) : {};
        colorUpdates.forEach((update) => {
          updatedData[update.id_no] = update.color;
        });
        localStorage.setItem("colorData", JSON.stringify(updatedData));
        console.log("Updated color data in storage:", updatedData);

        setSelectedRowKeys([]);
        setSelectedRowColors({});

        handleColorReload();
      })
      .catch((error) => {
        notification.error({
          message: `Error updating colors: ${error}`,
        });
        console.error("Error updating colors:", error);
      });
  };

  const colorMenu = (
    <Menu style={{ width: 150 }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          //width: "100px"
        }}
      >
        {colors.map((color) => (
          <button
            key={color}
            onClick={() => handleColorClick(selectedRowKeys, color)}
            style={{
              backgroundColor: color,
              height: 20,
              width: 40,
              borderRadius: 4,
              border: "none",
              margin: 2,
              cursor: "pointer",
              outline: selectedRowKeys.some(
                (rowKey) => selectedRowColors[rowKey] === color
              )
                ? "2px solid #B4B4B8"
                : "none",
              boxShadow: "0px 0px 4px rgba(0, 0, 0, 0.2)", // Add drop shadow
            }}
          />
        ))}
        <Button
          onClick={() => handleClearColors(selectedRowKeys)}
          type="text"
          size="small"
          style={{
            border: "1px solid #d9d9d9",
            borderRadius: 4,
            marginTop: 10,
          }}
        >
          Clear
        </Button>
        {/* Save Colors Button */}
        <Button
          type="primary"
          onClick={handleSaveColors}
          disabled={Object.keys(selectedRowColors).length === 0}
          size="small"
          style={{ borderRadius: 4, marginTop: 10 }}
        >
          Save
        </Button>
      </div>
    </Menu>
  );

  return (
    <div className={`header-panel ${theme}`}>
      <div className="header-content">
        <h3 className="header-title">{`${capitalizedProvinceName} Universe of Firms and Industries`}</h3>
        <Tooltip title="Reload Table">
          <Button
            type="primary"
            className="refresh-button"
            icon={<ReloadOutlined />}
            onClick={handleReload}
            loading={loading}
          ></Button>
        </Tooltip>
        <Tooltip title="Export Data">
          <Button
            type="primary"
            className="refresh-button"
            icon={<ExportOutlined />}
            onClick={() => handleExportPDF(capitalizedProvinceName)}
          ></Button>
        </Tooltip>
        <Tooltip title="Mark Row As">
          <Dropdown placement="bottomLeft" arrow overlay={colorMenu}>
            <Button
              type="primary"
              className="refresh-button"
              icon={<BgColorsOutlined />}
            ></Button>
          </Dropdown>
        </Tooltip>
        <Button type="primary" className="add-industry-button">
          Add Industry
        </Button>
      </div>

      <div className="search-pagination-container">
        <div className="search-header">
          <span className="industry-count">
            Industry Count: {formatNumber(filteredData.length)}
          </span>

          <div className="tag-search">
            <Input
              type="text"
              size="small"
              value={inputValue}
              onChange={handleInputChange}
              onPressEnter={handleInputConfirm}
              placeholder="search..."
              className="input-tag"
            />

            {/* Container for the selected tags */}
            <div className="tag-keyword-container">
              {selectedTags.map((tag) => (
                <Tag
                  key={tag}
                  closable
                  onClose={() => handleTagClose(tag)}
                  color="blue"
                  className="tag-keyword"
                >
                  {tag}
                </Tag>
              ))}
            </div>
          </div>

          <div className="pagination-container">
            <div className="pagination-dropdown">
              <label>Show:&nbsp;</label>
              <Select
                defaultValue={itemsPerPage}
                onChange={(value) => setItemsPerPage(Number(value))}
                disabled={loading}
              >
                <Option value={10}>10</Option>
                <Option value={50}>50</Option>
                <Option value={100}>100</Option>
              </Select>
              <label>&nbsp;entries</label>
            </div>

            {loading ? (
              <Spin size="small" />
            ) : (
              <Pagination
              simple={{
                readOnly: true,
              }}
                current={currentPage}
                total={filteredData.length}
                pageSize={itemsPerPage}
                showSizeChanger={false}
                onChange={(page) => setCurrentPage(page)}
                size="small"
                align="end"
              />
            )}
          </div>
        </div>
      </div>

      <Modal
        visible={modalVisible}
        title={
          <div className="modal-title-container">
            <span className="modal-title" style={{ whiteSpace: "normal" }}>
              Record ID: {selectedRecord?.id_no || "Unknown"}
            </span>
            <span
              className="modal-title"
              style={{
                whiteSpace: "normal",
                textAlign: "center",
                width: "50%",
              }}
            >
              {selectedRecord?.title || ""}
            </span>
            <span
              className="modal-title"
              style={{ whiteSpace: "normal", textAlign: "right" }}
            >
              {selectedRecord?.ecc_cnc || ""}
            </span>
          </div>
        }
        onCancel={handleCloseModal}
        width={1100}
        footer={null}
        onClose={handleCloseModal}
      >
        {selectedRecord && (
          <ProvinceModal
            record={selectedRecord}
            isEditing={isEditing}
            setIsEditing={setIsEditing}
            onToggleEdit={handleToggleEdit}
            onClose={handleCloseModal}
            handleReload={handleReload}
          />
        )}
      </Modal>

      <div style={{ position: "relative", padding: "5px" }}>
        {loading ? (
          <Spin tip="Processing Universe Data..." size="large">
            {<strong className="loading_title">...</strong>}
          </Spin>
        ) : (
          <Spin spinning={tableLoading}>
            <Table
              columns={columns}
              dataSource={filteredData}
              loading={tableLoading}
              pagination={{
                current: currentPage,
                pageSize: itemsPerPage,
                onChange: (page) => setCurrentPage(page),
              }}
              footer={() => (
                <span className="search-result-count">
                  Industry Count: {filteredSearch.length}
                </span>
              )}
              rowKey="id_no"
              size="small"
              className="custom-table"
              rowClassName={(record) => {
                const rowId = record.id_no;
                const colorValue =
                  selectedRowColors[rowId] || record.color || "";
                return "";
              }}
              onRow={(record) => ({
                onClick: () => {
                  handleRowClick(record);
                  handleRowSelect(record.id_no);
                },
                style: {
                  cursor: "pointer",
                  backgroundColor:
                    selectedRowColors[record.id_no] ||
                    record.color ||
                    "transparent",
                },
              })}
            />
          </Spin>
        )}
      </div>
    </div>
  );
};

export default Province;
