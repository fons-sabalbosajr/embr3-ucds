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
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [selectedRows, setSelectedRows] = useState([]);
  const [contextMenu, setContextMenu] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [currentRecord, setCurrentRecord] = useState(null);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [editedRecord, setEditedRecord] = useState(null);
  const [filter, setFilter] = useState(null);
  const [responsibleUnit, setResponsibleUnit] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await fetch("https://embr3-ucds.onrender.com/api/surveys", {
        method: 'GET',
        credentials: 'include' 
      });
  
      if (!response.ok) {
        const errorText = await response.text(); 
        throw new Error(errorText);
      }
  
      const result = await response.json();
      setData(result);
      setFilteredData(result);
  
      const uniqueIndustryClasses = [
        ...new Set(result.map((item) => item.industry_class)),
      ];
      setIndustryClasses(uniqueIndustryClasses);
  
      const uniqueResponsibleUnits = [
        ...new Set(result.map((item) => item.resp_unit)),
      ];
      setResponsibleUnits(uniqueResponsibleUnits);
  
      // Store initial states
      const stateMap = new Map();
      result.forEach((item) => {
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
    const lowerSearch = typeof search === 'string' ? search.toLowerCase() : '';
    
    const filtered = data.filter((item) => {
      const matchSearch = Object.values(item).some(
        (val) =>
          typeof val === 'string' && val.toLowerCase().includes(lowerSearch)
      );
      const matchFilter = filter ? item.industry_class === filter : true;
      const matchResponsibleUnit = responsibleUnit
        ? item.resp_unit === responsibleUnit
        : true;
      return matchSearch && matchFilter && matchResponsibleUnit;
    });
    
    setFilteredData(filtered);
  };

  const handleTableChange = (pagination) => {
    setPagination(pagination);
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
      console.log("Updated colors:", newColors);
      return newColors;
    });

    try {
      await fetch("https://embr3-ucds.onrender.com/api/update-color", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Include Authorization header if using tokens
          // "Authorization": `Bearer ${token}`,
        },
        credentials: "include", // Include this if you use sessions
        body: JSON.stringify({ id_no: selectedRow.id_no, color }),
      });
      notification.success({
        message: "Industry marked successfully",
        description: `The "${selectedRow.project_title}" has been marked.`,
      });
    } catch (error) {
      notification.error({
        message: "Error",
        description: "Failed to update color",
      });
      console.error("Error updating color:", error);
    }
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
                (selectedRow &&
                  selectedColor &&
                  selectedColor[selectedRow.id_no]) === color
                  ? "2px solid #B4B4B8"
                  : "none",
            }}
          />
        ))}
      </div>
    </Menu>
  );

  const handleCheckboxChange = (field, value, record) => {
    const updatedData = data.map((item) =>
      item.id_no === record.id_no
        ? { ...item, [field]: value ? "✔" : "" }
        : item
    );
    setData(updatedData);
    setFilteredData(updatedData);

    // Track modified rows
    setModifiedRows((prev) => {
      const newModifiedRows = new Set(prev);
      const original = initialState.get(record.id_no);
      const hasChanges = original && original[field] !== (value ? "✔" : "");
      if (hasChanges) {
        newModifiedRows.add(record.id_no);
      } else {
        newModifiedRows.delete(record.id_no);
      }
      return newModifiedRows;
    });
  };

  const handleUpdate = async (record) => {
    try {
      // Update the record
      await axios.put(`https://embr3-ucds.onrender.com/api/survey/${record._id}`, {
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


  const columns = [
    {
      title: "No.",
      dataIndex: "id_no",
      key: "id_no",
      align: "left",
      render: (text) => <div className="industry-label">{text}</div>,
    },
    {
      title: "Applicable Laws",
      dataIndex: "applicable_laws",
      key: "applicable_laws",
      align: "left",
      width: 200,
      render: (text, record) => (
        <div className="checkbox-container">
          <div className={`checkbox-wrapper eia`}>
            <Checkbox
              checked={record.survey_eia === "✔"}
              onChange={(e) =>
                handleCheckboxChange("survey_eia", e.target.checked, record)
              }
            />
            <span className="checkbox-label">EIA</span>
          </div>
          <div className={`checkbox-wrapper air`}>
            <Checkbox
              checked={record.survey_air === "✔"}
              onChange={(e) =>
                handleCheckboxChange("survey_air", e.target.checked, record)
              }
            />
            <span className="checkbox-label">AIR</span>
          </div>
          <div className={`checkbox-wrapper water`}>
            <Checkbox
              checked={record.survey_water === "✔"}
              onChange={(e) =>
                handleCheckboxChange("survey_water", e.target.checked, record)
              }
            />
            <span className="checkbox-label">WATER</span>
          </div>
          <div className={`checkbox-wrapper haz`}>
            <Checkbox
              checked={record.survey_haz === "✔"}
              onChange={(e) =>
                handleCheckboxChange("survey_haz", e.target.checked, record)
              }
            />
            <span className="checkbox-label">HAZ</span>
          </div>
          <div className={`checkbox-wrapper chem`}>
            <Checkbox
              checked={record.survey_chem === "✔"}
              onChange={(e) =>
                handleCheckboxChange("survey_chem", e.target.checked, record)
              }
            />
            <span className="checkbox-label">CHEMICAL</span>
          </div>
        </div>
      ),
    },
    {
      title: "Project Title",
      dataIndex: "project_title",
      key: "project_title",
      align: "left",
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
    },
    {
      title: "Industry Class",
      dataIndex: "industry_class",
      key: "industry_class",
      align: "left",
      render: (text) => <div className="industry-label">{text}</div>,
    },
    {
      title: "Responsible Unit",
      dataIndex: "resp_unit",
      key: "resp_unit",
      align: "left",
      render: (text) => <div className="industry-label">{text}</div>,
    },
    {
      title: "Status/Remarks",
      dataIndex: "remarks",
      key: "remarks",
      align: "left",
      render: (text) => <div className="industry-label">{text}</div>,
    },
    {
      title: "Actions",
      key: "actions",
      width: 200,
      align: "left",
      render: (text, record) => (
        <div>
          <Tooltip title="View Info">
            <Button onClick={() => showModal(record)} className="btn-action" size="small">
              <EyeOutlined />
            </Button>
          </Tooltip>
          <Tooltip title="Mark Row As">
            <Dropdown overlay={colorMenu} placement="bottomLeft" arrow>
              <Button className="btn-action" size="small">
                <BgColorsOutlined />
              </Button>
            </Dropdown>
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
                className="btn-action" size="small"
              />
            </Badge>
          </Tooltip>
        </div>
      ),
    },
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
          className="search-input"
        />
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
              onChange={handleTableChange}
              onRow={(record) => ({
                onClick: () => setSelectedRow(record),
                onContextMenu: (e) => handleRowContextMenu(e, record),
              })}
              rowClassName={(record) => {
                const color = selectedColor[record.id_no];
                return color ? `row-color-${color.replace("#", "")}` : "";
              }}
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
