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
} from "antd";
import {
  SearchOutlined,
  EyeOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import "./province.css";
import ProvinceModal from "./ProvinceModal";
import { DataContext } from "./DataContext";
import Swal from "sweetalert2";

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
  const [isLoading, setIsLoading] = useState(false);
  const [editedRecord, setEditedRecord] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [rowColors, setRowColors] = useState({});

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
      setEditedRecord({ ...selectedRecord }); // Initialize editedRecord with selectedRecord
    }
  }, [selectedRecord]);

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
    if (isEditing && editedRecord !== selectedRecord) {
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



  const getRowClassName = (record) => {
    const color = rowColors[record.id_no];
    return color ? `row-${color}` : '';
  };

  const columns = [
    {
      title: "ID No.",
      dataIndex: "id_no",
      key: "id_no",
      width: 100,
    },
    {
      title: "Industry Details",
      key: "industryDetails",
      render: (text, record) => (
        <>
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
        </>
      ),
      align: "left",
    },
    {
      title: "Industry Classification",
      key: "industry_class",
      render: (text, record) => <>{record.industry_class}</>,
      align: "left",
    },
    {
      title: "Permits/Clearances",
      key: "permits_clearances",
      render: (text, record) => (
        <div className="permits-clearances-container">
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
                  <div className="tooltip-content">
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
                  <div className="tooltip-content">
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
                <div>
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
                <div>
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
                <div>
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
                <div>
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
                <div>
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
                <div>
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
      render: (text, record) => <>{record.section_incharge}</>,
      align: "left",
    },
    {
      title: "Remarks/Recommendations",
      key: "remarks_recommendations",
      render: (text, record) => <>{record.remarks_recommendations}</>,
      align: "left",
    },
    {
      title: "Actions",
      key: "actions",
      align: "left",
      width: 200,
      render: (text, record) => (
        <div>
          <Tooltip title="View Details">
            <Button
              icon={<EyeOutlined />}
              onClick={() => showModal(record)}
              type="primary"
              className="btn-action"
            />
          </Tooltip>
          {/* <Tooltip title="Mark Row">
            <Dropdown overlay={colorMenu(record)} trigger={["click"]} overlayClassName="custom-dropdown-menu">
              <Button className="btn-action">
                <TagsOutlined />
              </Button>
            </Dropdown>
          </Tooltip> */}
        </div>
      ),
    },
  ];

  return (
    <div className={`header-panel ${theme}`}>
      <div className="header-content">
        <h2>{`${capitalizedProvinceName} Universe of Firms and Industries`}</h2>
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
          <strong>Industry Count: {formatNumber(filteredData.length)}</strong>
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
              loading={loading}
              pagination={{
                current: currentPage,
                pageSize: itemsPerPage,
                onChange: (page) => setCurrentPage(page),
              }}
              // onRow={(record) => ({
              //   onClick: () => showModal(record),
              // })}
              rowClassName={getRowClassName}
              rowKey="id_no"
            />
          </Spin>
        )}
      </div>
    </div>
  );
};

export default Province;
