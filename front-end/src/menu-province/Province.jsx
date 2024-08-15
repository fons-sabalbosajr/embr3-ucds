import React, { useState, useEffect, useContext } from "react";
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
} from "antd";
import {
  SearchOutlined,
  EyeOutlined,
  ReloadOutlined,
  BgColorsOutlined,
} from "@ant-design/icons";
import "./province.css";
import ProvinceModal from "./ProvinceModal";
import { DataContext } from "./DataContext";
import Swal from "sweetalert2";
import { darken } from "polished";

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
  const [filteredData, setFilteredData] = useState([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [editedRecord, setEditedRecord] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);
  const [selectedColor, setSelectedColor] = useState({});
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [hoveredRow, setHoveredRow] = useState(null);

  const getDarkerColor = (color) => darken(0.1, color);

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
    const filtered = filterData(data, searchTerm);
    setFilteredData(filtered);
  }, [data, searchTerm]);

  useEffect(() => {
    setTableLoading(loading);
  }, [loading]);

  useEffect(() => {
    if (selectedRecord) {
      setEditedRecord({ ...selectedRecord });
    }
  }, [selectedRecord]);

  useEffect(() => {
    // Load color data from localStorage
    const storedColors = localStorage.getItem("rowColors");
    if (storedColors) {
      setSelectedColor(JSON.parse(storedColors));
    }
  }, []);

  const filterData = (data, searchTerm) => {
    return data.filter((item) =>
      Object.values(item).some(
        (value) =>
          typeof value === "string" &&
          value.toLowerCase().includes(searchTerm.toLowerCase())
      )
    );
  };

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

  const handleClick = async (color) => {
    if (!selectedRow) {
      console.error("Selected row is not set");
      return;
    }

    if (!selectedRow.id_no) {
      console.error("Selected row id_no is missing:", selectedRow);
      return;
    }

    // Update the local state
    setSelectedColor((prevColors) => {
      const newColors = { ...prevColors, [selectedRow.id_no]: color };
      localStorage.setItem("rowColors", JSON.stringify(newColors));
      return newColors;
    });

    try {
      await fetch("https://embr3-ucds.onrender.com/api/update-color-universe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // Include this if you use sessions
        body: JSON.stringify({ id_no: selectedRow.id_no, color }),
      });
      notification.success({
        message: "Industry marked successfully",
        description: `The "${selectedRow.title}" has been marked.`,
      });
    } catch (error) {
      notification.error({
        message: "Error",
        description: "Failed to update color",
      });
      console.error("Error updating color:", error);
    }
  };

  // Handle row click with selection
  const handleRowClick = (record) => {
    const newSelectedRowKeys = selectedRowKeys.includes(record.id_no)
      ? selectedRowKeys.filter((key) => key !== record.id_no)
      : [...selectedRowKeys, record.id_no];

    setSelectedRowKeys(newSelectedRowKeys);
    setSelectedRow(record);
  };

  // Handle checkbox change
  const handleCheckboxChange = (e, id_no) => {
    const checked = e.target.checked;
    const newSelectedRowKeys = checked
      ? [...selectedRowKeys, id_no]
      : selectedRowKeys.filter((key) => key !== id_no);

    setSelectedRowKeys(newSelectedRowKeys);
  };

  // Handle select all checkbox
  const handleSelectAll = (checked) => {
    const allRowKeys = filteredData.map((item) => item.id_no);
    setSelectedRowKeys(checked ? allRowKeys : []);
  };

  const darkenColor = (color, factor) => {
    let colorHex = color.replace("#", "");
    let r = parseInt(colorHex.substring(0, 2), 16);
    let g = parseInt(colorHex.substring(2, 4), 16);
    let b = parseInt(colorHex.substring(4, 6), 16);

    r = Math.max(0, Math.min(255, Math.floor(r * factor)));
    g = Math.max(0, Math.min(255, Math.floor(g * factor)));
    b = Math.max(0, Math.min(255, Math.floor(b * factor)));

    return `#${((1 << 24) + (r << 16) + (g << 8) + b)
      .toString(16)
      .slice(1)
      .toUpperCase()}`;
  };

  const colors = [
    "#e8dff5",
    "#fce1e4",
    "#fcf4dd",
    "#ddedea",
    "#daeaf6",
    "#EEEEEE",
  ];

  const colorMenu = (
    <Menu style={{ width: 150 }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
        }}
      >
        {colors.map((color) => (
          <button
            key={color}
            onClick={() => handleClick(color)}
            style={{
              backgroundColor: color,
              height: 20,
              width: 40,
              borderRadius: 4,
              border: "none",
              margin: 2,
              cursor: "pointer",
              outline:
                (selectedRow && selectedColor[selectedRow.id_no]) === color
                  ? "2px solid #B4B4B8"
                  : "none",
            }}
          />
        ))}
      </div>
    </Menu>
  );

  const columns = [
    {
      title: <Checkbox onChange={(e) => handleSelectAll(e.target.checked)} />,
      align: "center",
      render: (text, record) => (
        <div
          onClick={() => handleRowClick(record)}
          style={{ cursor: "pointer" }}
        >
          <Checkbox
            checked={selectedRowKeys.includes(record.id_no)}
            onChange={(e) => handleCheckboxChange(e, record.id_no)}
          />
        </div>
      ),
    },
    {
      title: "ID No.",
      dataIndex: "id_no",
      key: "id_no",
      align: "left",
      width: "100px",
      render: (text) => <div className="industry-label">{text}</div>,
    },
    {
      title: "Industry Details",
      key: "industryDetails",
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
            href="#"
            onClick={(e) => {
              e.preventDefault(); // Prevent default anchor behavior
              showModal(record); // Open the modal
            }}
          >
            {record.ecc_cnc}
          </a>
        </div>
      ),
      align: "left",
      width: "500px",
    },
    {
      title: "Industry Classification",
      key: "industry_class",
      render: (text, record) => (
        <div className="industry-label">{record.industry_class}</div>
      ),
      align: "left",
      width: "200px",
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
      render: (text, record) => (
        <div className="industry-label">{record.section_incharge}</div>
      ),
      align: "left",
      width: "200px",
    },
    {
      title: "Remarks/Recommendations",
      key: "remarks_recommendations",
      render: (text, record) => (
        <div className="industry-label">{record.remarks_recommendations}</div>
      ),
      align: "left",
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
          <Tooltip title="Mark Row As">
            <Dropdown overlay={colorMenu} placement="bottomLeft" arrow>
              <Button className="btn-action" size="small">
                <BgColorsOutlined />
              </Button>
            </Dropdown>
          </Tooltip>
        </div>
      ),
    },
  ];

  return (
    <div className={`header-panel ${theme}`}>
      <div className="header-content">
        <h3 className="header-title">{`${capitalizedProvinceName} Universe of Firms and Industries`}</h3>
        <Button
          className="refresh-button"
          icon={<ReloadOutlined />}
          onClick={handleReload}
          loading={loading}
        ></Button>
        <Button type="primary" className="add-industry-button">
          Add Industry
        </Button>
      </div>

      <div className="search-pagination-container">
        <div className="total-rows">
          <span>Industry Count: {formatNumber(filteredData.length)}</span>
        </div>
        <div className="input-search">
          <Input
            placeholder="Search..."
            prefix={<SearchOutlined />}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            disabled={loading} // Disable while loading
          />
        </div>

        <div className="pagination-controls">
          <div className="pagination-dropdown">
            <label>Show:&nbsp;</label>
            <Select
              defaultValue={itemsPerPage}
              onChange={(value) => setItemsPerPage(Number(value))}
              disabled={loading} // Disable while loading
            >
              <Option value={10}>10</Option>
              <Option value={50}>50</Option>
              <Option value={100}>100</Option>
            </Select>
            <label>&nbsp;entries</label>
          </div>
        </div>

        <div className="pagination">
          {loading ? (
            <Spin size="small" /> // Spin animation during loading
          ) : (
            <Pagination
              simple
              current={currentPage}
              total={filteredData.length}
              pageSize={itemsPerPage}
              showSizeChanger={false}
              onChange={(page) => setCurrentPage(page)}
            />
          )}
        </div>
      </div>

      <Modal
        visible={modalVisible}
        title={
          <div className="modal-title-container">
            <span className="modal-title">
              Record ID: {selectedRecord?.id_no || "Unknown"}
            </span>
            <span className="modal-title">{selectedRecord?.title || ""}</span>
            <span className="modal-title">{selectedRecord?.ecc_cnc || ""}</span>
          </div>
        }
        onCancel={handleCloseModal}
        width={1300}
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
              rowClassName={(record) => {
                const color = selectedColor[record.id_no];
                return color ? `row-color-${color.replace("#", "")}` : "";
              }}
              rowKey="id_no"
              size="small"
              className="custom-table"
              onRow={(record) => ({
                onClick: () => handleRowClick(record),
                style: {
                  backgroundColor: selectedRowKeys.includes(record.id_no)
                    ? "#e6f7ff"
                    : "transparent",
                  cursor: "pointer",
                },
                onMouseEnter: (e) => {
                  const color = selectedColor[record.id_no] || "#FFFFFF";
                  e.currentTarget.style.backgroundColor = darkenColor(
                    color,
                    0.9
                  );
                },
                onMouseLeave: (e) => {
                  e.currentTarget.style.backgroundColor =
                    selectedRowKeys.includes(record.id_no)
                      ? "#e6f7ff"
                      : "transparent";
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
