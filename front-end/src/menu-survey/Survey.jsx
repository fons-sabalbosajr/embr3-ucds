import React, { useState, useEffect } from "react";
import {
  Table,
  Button,
  Spin,
  Input,
  Select,
  Modal,
  Checkbox,
  Tooltip,
  Badge,
  message,
  Menu,
  Dropdown,
  notification,
  ConfigProvider,
} from "antd";
import {
  ReloadOutlined,
  SearchOutlined,
  EyeOutlined,
  SaveOutlined,
  BgColorsOutlined,
  MoreOutlined,
} from "@ant-design/icons";
import "./survey.css";
import { useNavigate } from "react-router-dom";
import SurveyModal from "./SurveyModal";
import axios from "axios";

const { Option } = Select;

const Survey = ({ theme }) => {
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [filterValue, setFilterValue] = useState("");
  const [responsibleUnits, setResponsibleUnits] = useState([]);
  const [selectedResponsibleUnit, setSelectedResponsibleUnit] = useState("");
  const [loading, setLoading] = useState(true);
  const [industryClasses, setIndustryClasses] = useState([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
  const [selectedRow, setSelectedRow] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [modifiedRows, setModifiedRows] = useState(new Set());
  const [initialState, setInitialState] = useState(new Map());
  const [selectedColor, setSelectedColor] = useState({});
  const [contextMenu, setContextMenu] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [editedRecord, setEditedRecord] = useState(null);
  const [filter, setFilter] = useState(null);
  const [responsibleUnit, setResponsibleUnit] = useState(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await fetch("http://localhost:8081/api/surveys", {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }

      const result = await response.json();
      const sortedResult = result.sort((a, b) => a.id_no - b.id_no); // Sort by id_no
      setData(sortedResult);
      setFilteredData(sortedResult);

      const uniqueIndustryClasses = [
        ...new Set(sortedResult.map((item) => item.industry_class)),
      ];
      setIndustryClasses(uniqueIndustryClasses);

      const uniqueResponsibleUnits = [
        ...new Set(sortedResult.map((item) => item.resp_unit)),
      ];
      setResponsibleUnits(uniqueResponsibleUnits);

      // Store initial states
      const stateMap = new Map();
      sortedResult.forEach((item) => {
        stateMap.set(item.id_no, {
          survey_eia: item.survey_eia,
          survey_air: item.survey_air,
          survey_water: item.survey_water,
          survey_haz: item.survey_haz,
          survey_chem: item.survey_chem,
          color: item.color, // Include the color field
        });
      });
      setInitialState(stateMap);
    } catch (error) {
      console.error("Error fetching survey data:", error.message);
    } finally {
      setLoading(false);
      setTableLoading(false);
    }
  };
  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedRecord) {
      setEditedRecord({ ...selectedRecord });
    }
  }, [selectedRecord]);

  const handleSearch = (e) => {
    const value = e.target.value;
    setSearchText(value);
    filterData(value, filterValue, selectedResponsibleUnit);
  };

  const handleFilterChange = (value) => {
    setFilterValue(value);
    filterData(searchText, value, selectedResponsibleUnit);
  };

  const handleResponsibleUnitChange = (value) => {
    setSelectedResponsibleUnit(value);
    filterData(searchText, filterValue, value);
  };

  const filterData = (search, filter, responsibleUnit) => {
    // Ensure search is a string
    const lowerSearch = typeof search === "string" ? search.toLowerCase() : "";

    const filtered = data.filter((item) => {
      const matchSearch = Object.values(item).some(
        (val) =>
          typeof val === "string" && val.toLowerCase().includes(lowerSearch)
      );
      const matchFilter = filter ? item.industry_class === filter : true;
      const matchResponsibleUnit = responsibleUnit
        ? item.resp_unit === responsibleUnit
        : true;
      return matchSearch && matchFilter && matchResponsibleUnit;
    });

    setFilteredData(filtered);
  };


  const handleUpdate = async (record) => {
    try {
      // Update the record
      await axios.put(`http://localhost:8081/api/survey/${record._id}`, {
        survey_eia: record.survey_eia,
        survey_air: record.survey_air,
        survey_water: record.survey_water,
        survey_haz: record.survey_haz,
        survey_chem: record.survey_chem,
      });

      // Notify user of success
      notification.success({
        message: "Update Successfully!",
        description: `Data updated for ${record.project_title} successfully.`,
      });

      // Clear modifications after update
      setModifiedRows((prev) => {
        const updated = new Set(prev);
        updated.delete(record.id_no);
        return updated;
      });
    } catch (error) {
      // Handle errors
      notification.error({
        message: "Update Failed",
        description: `Failed to update data for ${record.id_no}.`,
      });
      console.error("Error updating record:", error);
    }
  };

  const handleDiscardChanges = () => {
    // Clear modifications when discarding changes
    setModifiedRows((prev) => {
      const updated = new Set(prev);
      updated.delete(selectedRow?.serial_no);
      return updated;
    });
    setModalVisible(false);
    setIsEditing(false);
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
      await fetchData();
      // Pass searchText directly to filterData
      filterData(searchText, filter, responsibleUnit);
      // Note: Make sure `filter` and `responsibleUnit` are defined
    } catch (error) {
      console.error("Error reloading data:", error);
    } finally {
      setTableLoading(false);
    }
  };

  // Handle right-click to show context menu
  const handleRowContextMenu = (e, record) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      top: e.clientY,
      left: e.clientX,
      record,
    });
  };

  const formatNumber = (number) => {
    return new Intl.NumberFormat("en-US").format(number);
  };

  const idColumn = {
    title: "No.",
    dataIndex: "id_no",
    key: "id_no",
    align: "center",
    width: "50px", 
    render: (text) => <div className="industry-label">{text}</div>,
  };
  
  const projectTitleColumn = {
    title: "Project Title",
    dataIndex: "project_title",
    key: "project_title",
    align: "left",
    width: "400px",
    render: (text, record) => (
      <div>
        <strong className="industry-label">{text}</strong>
        <div className="industry-label">
          <p style={{ fontStyle: "italic" }}>{record.address}</p>
          <p>Date Surveyed: {record.date_surveyed}</p>
          <p>Responsible Unit: {record.resp_unit}</p>
          <p>
            IIS No.:{" "}
            <a
              href={`https://iis.emb.gov.ph/embis`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {record.iis_no}
            </a>
          </p>
        </div>
      </div>
    ),
  };
  
  const industryClassColumn = {
    title: "Industry Class",
    dataIndex: "industry_class",
    key: "industry_class",
    align: "left",
    render: (text) => <div className="industry-label">{text}</div>,
  };
  
  const responsibleUnitColumn = {
    title: "Responsible Unit",
    dataIndex: "resp_unit",
    key: "resp_unit",
    align: "left",
    render: (text) => <div className="industry-label">{text}</div>,
  };
  
  const statusRemarksColumn = {
    title: "Status/Remarks",
    dataIndex: "remarks",
    key: "remarks",
    align: "left",
    render: (text) => <div className="industry-label">{text}</div>,
  };
  
  const actionsColumn = {
    title: "Actions",
    key: "actions",
    width: "150px",
    align: "left",
    render: (text, record) => (
      <div>
        <Tooltip title="View Info">
          <Button
            onClick={() => showModal(record)}
            className="btn-action"
            size="small"
          >
            <EyeOutlined />
          </Button>
        </Tooltip>
        <Tooltip title="Update">
          <Badge
            count={modifiedRows.has(record.id_no) ? 1 : 0}
            style={{ backgroundColor: "#f5222d", marginRight: "10px" }}
          >
            <Button
              onClick={() => handleUpdate(record)}
              type="primary"
              icon={<SaveOutlined />}
              className="btn-action"
              size="small"
            />
          </Badge>
        </Tooltip>
      </div>
    ),
  };
  
  const columns = [
    idColumn,
    projectTitleColumn,
    industryClassColumn,
    responsibleUnitColumn,
    statusRemarksColumn,
    actionsColumn,
  ];
  return (
    <div className={`header-panel ${theme}`}>
      <div className="header-content">
        <h3 className="header-title">Survey Template</h3>
        <Button
          className="refresh-button"
          icon={<ReloadOutlined />}
          onClick={fetchData}
        ></Button>
        <Button type="primary" className="add-industry-button">
          Add Industry
        </Button>
      </div>

      <div className="filter-container">
        <div className="total-rows">
          Industry Count: {formatNumber(filteredData.length)}
        </div>
        <Input
          placeholder="Search..."
          prefix={<SearchOutlined />}
          value={searchText}
          onChange={handleSearch}
          className="search-input-survey"
        />
        <div className="custom-select-input">
          <ConfigProvider
            theme={{
              components: {
                Select: {
                  fontSize: 12,
                },
              },
            }}
          >
            <Select
              placeholder="Select Industry Class"
              value={filterValue}
              onChange={handleFilterChange}
              className="select-input"
            >
              <Option value="">All Industry Classification</Option>
              {industryClasses.map((industryClass) => (
                <Option key={industryClass} value={industryClass}>
                  {industryClass}
                </Option>
              ))}
            </Select>
          </ConfigProvider>
        </div>

        <div className="custom-select-input">
          <ConfigProvider
            theme={{
              components: {
                Select: {
                  fontSize: 12,
                },
              },
            }}
          >
            <Select
              placeholder="Select Responsible Unit"
              value={selectedResponsibleUnit}
              onChange={handleResponsibleUnitChange}
              className="select-input-unit"
            >
              <Option value="">All Units/Sections</Option>
              {responsibleUnits.map((unit) => (
                <Option key={unit} value={unit}>
                  {unit}
                </Option>
              ))}
            </Select>
          </ConfigProvider>
        </div>
      </div>

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
              rowKey="id_no"
              pagination={pagination}
              onRow={(record) => ({
                onClick: () => {
                  setSelectedRow(selectedRow === record ? null : record);
                },
                onContextMenu: (e) => handleRowContextMenu(e, record),
              })}
              size="small"
              className="custom-table"
            />
          </Spin>
        )}
      </div>

      <Modal
        visible={modalVisible}
        title={
          <div className="modal-title-container">
            <span className="modal-title">
              Firm No.: {selectedRow?.id_no || "Unknown"}
            </span>
            <span className="modal-title">
              {selectedRow?.project_title || ""}
            </span>
            <span className="modal-title">
              <a
                href={`https://iis.emb.gov.ph/embis`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {selectedRow?.iis_no || ""}
              </a>
            </span>
          </div>
        }
        width={1300}
        footer={null}
        onCancel={handleDiscardChanges}
        onClose={handleCloseModal}
      >
        {selectedRow && (
          <SurveyModal
            record={selectedRecord}
            isEditing={isEditing}
            setIsEditing={setIsEditing}
            onToggleEdit={handleToggleEdit}
            onClose={handleCloseModal}
            handleReload={handleReload}
            centered
          />
        )}
      </Modal>
    </div>
  );
};

export default Survey;
