import React, { useState, useEffect } from "react";
import {
  Table,
  Button,
  Spin,
  Tooltip,
  Dropdown,
  notification,
  Input,
  Checkbox,
  Menu,
  ConfigProvider,
  Select,
  Badge,
  Modal,
} from "antd";
import {
  ReloadOutlined,
  ExportOutlined,
  BgColorsOutlined,
  SearchOutlined,
  EyeOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import "./survey.css";
import axios from "axios";
import Highlighter from "react-highlight-words";
import debounce from "lodash.debounce";
import SurveyModal from "./SurveyModal";

const Survey = ({ theme }) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [searchedColumn, setSearchedColumn] = useState("");
  const [filteredData, setFilteredData] = useState(data);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [uniqueUnits, setUniqueUnits] = useState([]);
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [selectedColor, setSelectedColor] = useState(null);
  const [colorMenuVisible, setColorMenuVisible] = useState(false);
  const storedColors = localStorage.getItem("rowColors");
  const rowColors = storedColors ? JSON.parse(storedColors) : {};
  const [selectedRowColors, setSelectedRowColors] = useState({});
  const [filterValue, setFilterValue] = useState("");
  const [industryClasses, setIndustryClasses] = useState([]);
  const [isModified, setIsModified] = useState(false);
  const [modifiedRows, setModifiedRows] = useState({});
  const [ignoreRowSelection, setIgnoreRowSelection] = useState(false);
  const [selectedRows, setSelectedRows] = useState({});
  const [initialState, setInitialState] = useState(new Map());
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [viewedRecord, setViewedRecord] = useState(null);
  const [isEditing, setIsEditing] = useState(false);

  const formatNumber = (number) => {
    return new Intl.NumberFormat("en-US").format(number);
  };

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

      const uniqueUnits = [
        ...new Set(sortedResult.map((item) => item.resp_unit)),
      ];

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

      setUniqueUnits(uniqueUnits);
      setSelectedKeys([]);
    } catch (error) {
      console.error("Error fetching survey data:", error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const filteredData = data.filter((record) => {
      const recordValue = record.resp_unit;
      if (typeof recordValue === "string" && recordValue !== null) {
        const normalizedRecordValue = recordValue.toLowerCase();
        const filteredSelectedKeys = selectedKeys.map((key) =>
          key.toLowerCase()
        );
        return (
          filteredSelectedKeys.length === 0 ||
          filteredSelectedKeys.some(
            (key) =>
              normalizedRecordValue.includes(key) ||
              key.includes(normalizedRecordValue)
          )
        );
      }
      return false;
    });
    setFilteredData(filteredData);
  }, [selectedKeys, data]);

  useEffect(() => {
    if (data && data.length > 0) {
      const rowColors = {};
      data.forEach((row) => {
        rowColors[row.id_no] = row.color;
      });
      localStorage.setItem("rowColors", JSON.stringify(rowColors));
    }
  }, [data]);

  useEffect(() => {
    const uniqueIndustryClasses = [
      ...new Set(data.map((item) => item.industry_class)),
    ];
    setIndustryClasses(uniqueIndustryClasses);
  }, [data]);

  useEffect(() => {
    setFilteredData(data);
  }, [data]);

  // Search functionality for each column
  let searchInput = null;
  const handleSearch = (selectedKeys, confirm, dataIndex) => {
    confirm();
    setSearchText(selectedKeys[0]);
    setSearchedColumn(dataIndex);
  };

  const handleSearchKeyWord = debounce((e) => {
    const searchText = e.target.value.toLowerCase();
    const filteredData = data.filter((item) => {
      return Object.values(item).some((value) => {
        return String(value).toLowerCase().includes(searchText);
      });
    });
    setFilteredData(filteredData);
  }, 500);

  const handleFilterChange = (value) => {
    setFilterValue(value);
    const filteredData = data.filter((item) => {
      return item.industry_class === value || value === "";
    });
    setFilteredData(filteredData);
  };

  const handleReset = (clearFilters) => {
    clearFilters();
    setSearchText("");
  };

  const getColumnSearchProps = (dataIndex) => ({
    filterDropdown: ({
      setSelectedKeys,
      selectedKeys,
      confirm,
      clearFilters,
    }) => (
      <div style={{ padding: 8 }}>
        <Input
          ref={(node) => {
            searchInput = node;
          }}
          placeholder={`Search ${dataIndex}`}
          value={selectedKeys[0]}
          onChange={(e) =>
            setSelectedKeys(e.target.value ? [e.target.value] : [])
          }
          onPressEnter={() => handleSearch(selectedKeys, confirm, dataIndex)}
          style={{ marginBottom: 8, display: "block" }}
        />
        <Button
          type="primary"
          onClick={() => handleSearch(selectedKeys, confirm, dataIndex)}
          icon={<SearchOutlined />}
          size="small"
          style={{ width: 90, marginRight: 8 }}
        >
          Search
        </Button>
        <Button
          onClick={() => handleReset(clearFilters)}
          size="small"
          style={{ width: 90 }}
        >
          Reset
        </Button>
      </div>
    ),
    filterIcon: (filtered) => (
      <SearchOutlined style={{ color: filtered ? "#1890ff" : undefined }} />
    ),
    // Modify the onFilter method to search across multiple fields
    onFilter: (value, record) => {
      const searchText = value.toLowerCase();
      return (
        record.project_title.toLowerCase().includes(searchText) ||
        (record.address && record.address.toLowerCase().includes(searchText)) ||
        (record.date_surveyed &&
          new Date(record.date_surveyed)
            .toLocaleDateString()
            .toLowerCase()
            .includes(searchText)) ||
        (record.resp_unit &&
          record.resp_unit.toLowerCase().includes(searchText)) ||
        (record.iis_no && record.iis_no.toLowerCase().includes(searchText))
      );
    },
    onFilterDropdownVisibleChange: (visible) => {
      if (visible) {
        setTimeout(() => searchInput.select(), 100);
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

  const getColumnFilterProps = (
    dataIndex,
    uniqueUnits,
    selectedKeys,
    setSelectedKeys
  ) => {
    const normalizedUnits = new Set();
    const displayUnits = [];

    // Populate unique display units while avoiding duplicates (case insensitive)
    uniqueUnits.forEach((unit) => {
      if (unit !== undefined && unit !== null) {
        const normalizedUnit = unit.toLowerCase();
        if (!normalizedUnits.has(normalizedUnit)) {
          normalizedUnits.add(normalizedUnit); // Keep the normalized value
          displayUnits.push(unit); // Add to display array
        }
      }
    });

    return {
      filterDropdown: ({ confirm, clearFilters }) => (
        <div style={{ padding: 8, maxHeight: "200px", overflowY: "auto" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {displayUnits.map((unit) => (
              <Checkbox
                key={unit}
                checked={selectedKeys.includes(unit)}
                onChange={(e) => {
                  const newKeys = e.target.checked
                    ? [...selectedKeys, unit]
                    : selectedKeys.filter((key) => key !== unit);
                  setSelectedKeys(newKeys);
                }}
              >
                {unit}
              </Checkbox>
            ))}
          </div>
          <div style={{ marginTop: "8px" }}>
            <Button
              type="primary"
              onClick={() => {
                confirm();
              }}
              icon={<SearchOutlined />}
              size="small"
              style={{ width: 90, marginRight: 8 }}
            >
              Filter
            </Button>
            <Button
              onClick={() => {
                clearFilters();
                setSelectedKeys([]);
              }}
              size="small"
              style={{ width: 90 }}
            >
              Reset
            </Button>
          </div>
        </div>
      ),

      onFilter: (value, record) => {
        const recordValue = record[dataIndex];
        if (typeof recordValue === "string" && recordValue !== null) {
          const normalizedRecordValue = recordValue.toLowerCase();
          const filteredSelectedKeys = selectedKeys.map((key) =>
            key.toLowerCase()
          );
          return (
            filteredSelectedKeys.length === 0 ||
            filteredSelectedKeys.some(
              (key) =>
                normalizedRecordValue.includes(key) ||
                key.includes(normalizedRecordValue)
            )
          );
        }
        return false;
      },
      render: (text) => <div className="industry-label">{text}</div>,
    };
  };

  const updateRowColors = async (ids, color) => {
    setLoading(true);
    try {
      const promises = ids.map((id) => {
        return fetch(`http://localhost:8081/api/surveys/${id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ color }),
          credentials: "include",
        });
      });

      const responses = await Promise.all(promises);
      const results = await Promise.all(
        responses.map((response) => {
          if (response.ok) {
            return response.json();
          } else {
            throw new Error(`Error updating row color: ${response.statusText}`);
          }
        })
      );
      //console.log("Row colors updated:", results);
      fetchData();
    } catch (error) {
      console.error("Error updating row colors:", error.message);
    } finally {
      setLoading(false);
    }
  };

  const colors = [
    "#FCE5BB",
    "#FFE225",
    "#FFF4EA",
    "#39C665",
    "#d1c4e9",
    "#FF9B3E",
    "#936DDF",
    "#c8e6c9",
    "#ffffff",
  ];

  const handleColorClick = (color) => {
    setSelectedColor(color);
  };

  const handleSaveColor = () => {
    if (
      Array.isArray(selectedRowKeys) &&
      selectedRowKeys.length > 0 &&
      selectedColor
    ) {
      updateRowColors(
        selectedRowKeys.map((id) => id.toString()),
        selectedColor
      ); // Update the row colors
      notification.success({
        message: "Data marked successfully",
        description: `The selected data have been marked.`,
      });
    }
  };

  const handleClearColors = () => {
    setSelectedColor(null);
  };

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
            onClick={() => handleColorClick(color)}
            style={{
              backgroundColor: color,
              height: 20,
              width: 40,
              borderRadius: 4,
              border: "none",
              margin: 2,
              cursor: "pointer",
              outline: selectedColor === color ? "2px solid #B4B4B8" : "none",
              boxShadow: "0px 0px 4px rgba(0, 0, 0, 0.2)",
            }}
          />
        ))}
        <Button
          onClick={handleClearColors}
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
        <Button
          type="primary"
          onClick={handleSaveColor}
          disabled={selectedColor === null}
          size="small"
          style={{ borderRadius: 4, marginTop: 10 }}
        >
          Save
        </Button>
      </div>
    </Menu>
  );

  const handleSave = async (record) => {
    try {
      // Check if the record has an ID
      if (!record._id) {
        // Ensure you use _id
        notification.error({
          message: "Error",
          description: "Record ID is missing.",
        });
        return;
      }

      // Prepare the payload with only the updated fields
      const payload = {};
      if (record.modifiedApplicableLaws) {
        if (record.survey_eia !== initialState.get(record.id_no).survey_eia) {
          payload.survey_eia = record.survey_eia === "✔" ? true : false;
        }
        if (record.survey_air !== initialState.get(record.id_no).survey_air) {
          payload.survey_air = record.survey_air === "✔" ? true : false;
        }
        if (
          record.survey_water !== initialState.get(record.id_no).survey_water
        ) {
          payload.survey_water = record.survey_water === "✔" ? true : false;
        }
        if (record.survey_haz !== initialState.get(record.id_no).survey_haz) {
          payload.survey_haz = record.survey_haz === "✔" ? true : false;
        }
        if (record.survey_chem !== initialState.get(record.id_no).survey_chem) {
          payload.survey_chem = record.survey_chem === "✔" ? true : false;
        }
      }

      // Call the API using _id
      const response = await axios.put(
        `http://localhost:8081/api/survey/${record._id}`,
        payload
      );

      if (response.data.message === "Update successful!") {
        notification.success({
          message: "Update Successfully!",
          description: "Data updated successfully.",
        });
      } else if (response.data.message === "No changes made") {
        notification.info({
          message: "No Changes Made",
          description: "No changes were made to the data.",
        });
      }

      // Call fetchData to refresh the data
      await fetchData();

      // Clear modifications after update
      setModifiedRows({});
    } catch (error) {
      // Log the error response if available
      if (error.response) {
        console.error("Error updating record:", error.response.data);
      } else {
        console.error("Error updating record:", error);
      }

      notification.error({
        message: "Update Failed",
        description: "Failed to update data.",
      });
    }
  };

  const handleRowClick = async (record) => {
    if (!selectedRowKeys.includes(record.id_no)) {
      setSelectedRowKeys([...selectedRowKeys, record.id_no]);
    } else {
      setSelectedRowKeys(selectedRowKeys.filter((key) => key !== record.id_no));
    }
  };

  const handleRowSelect = (id) => {
    const updatedSelectedRowKeys = [...selectedRowKeys];
    if (updatedSelectedRowKeys.includes(id)) {
      updatedSelectedRowKeys.splice(updatedSelectedRowKeys.indexOf(id), 1);
    } else {
      updatedSelectedRowKeys.push(id);
    }
    setSelectedRowKeys(updatedSelectedRowKeys);
  };

  const uniqueResponsibleUnits = [
    ...new Set(data.map((item) => item.resp_unit)),
  ];

  const handleCheckboxChange = (field, checked, record) => {
    setIgnoreRowSelection(true);

    // Update the field in the record to "✔" if checked, otherwise ""
    record[field] = checked ? "✔" : "";

    // Log the changes for debugging purposes
    console.log(
      `ID_No: ${record.id_no}, IIS No: ${record.iis_no}, ${field} Checked: ${
        checked ? "✔" : ""
      }`
    );

    // Update the data array with the modified record
    const updatedData = data.map((item) => {
      if (item.id_no === record.id_no) {
        return record;
      }
      return item;
    });

    // Set the updated data
    setData(updatedData);
    setFilteredData(updatedData);

    // Mark the record as modified
    if (checked) {
      setModifiedRows((prevModifiedRows) => ({
        ...prevModifiedRows,
        [record.id_no]: {
          ...prevModifiedRows[record.id_no],
          [field]: "✔",
        },
      }));
    } else {
      setModifiedRows((prevModifiedRows) => ({
        ...prevModifiedRows,
        [record.id_no]: {
          ...prevModifiedRows[record.id_no],
          [field]: "",
        },
      }));
    }
  };

  const handleToggleEdit = () => {
    setIsEditing(!isEditing);
  };

  const handleCloseModal = () => {
    setIsModalVisible(false);
    setIsLogChecked(false); // Reset the isLogChecked state
  };

  const handleView = (record) => {
    // Set the viewed record and show the modal
    setViewedRecord(record);
    setIsModalVisible(true);
  };

  const handleReload = () => {
    fetchData();
  };

  // Define table columns
  const columns = [
    {
      title: "ID No.",
      dataIndex: "id_no",
      key: "id_no",
      ...getColumnSearchProps("id_no"),
      align: "left",
      width: 75,
      fixed: "left",
    },
    {
      title: "Applicable Laws",
      dataIndex: "applicable_laws",
      key: "applicable_laws",
      align: "left",
      width: 100,
      render: (text, record) => {
        // Define a function to log checkbox states
        const logCheckboxStates = (field, checked) => {
          const logMessage = {
            ID_No: record.id_no,
            EIA: record.survey_eia,
            AIR: record.survey_air,
            WATER: record.survey_water,
            HAZ: record.survey_haz,
            CHEMICAL: record.survey_chem,
            [field]: checked,
          };
          console.log(logMessage);
        };

        return (
          <div className="checkbox-container">
            <div className={`checkbox-wrapper eia`}>
              <Checkbox
                checked={
                  record.survey_eia === "✔" || record.survey_eia === true
                }
                onChange={(e) => {
                  handleCheckboxChange("survey_eia", e.target.checked, record);
                  logCheckboxStates("EIA", e.target.checked);
                  record.modifiedApplicableLaws = true; // Mark as modified
                }}
              />
              <span className="checkbox-label">EIA</span>
            </div>
            <div className={`checkbox-wrapper air`}>
              <Checkbox
                checked={
                  record.survey_air === "✔" || record.survey_air === true
                }
                onChange={(e) => {
                  handleCheckboxChange("survey_air", e.target.checked, record);
                  logCheckboxStates("AIR", e.target.checked);
                  record.modifiedApplicableLaws = true; // Mark as modified
                }}
              />
              <span className="checkbox-label">AIR</span>
            </div>
            <div className={`checkbox-wrapper water`}>
              <Checkbox
                checked={
                  record.survey_water === "✔" || record.survey_water === true
                }
                onChange={(e) => {
                  handleCheckboxChange(
                    "survey_water",
                    e.target.checked,
                    record
                  );
                  logCheckboxStates("WATER", e.target.checked);
                  record.modifiedApplicableLaws = true; // Mark as modified
                }}
              />
              <span className="checkbox-label">WATER</span>
            </div>
            <div className={`checkbox-wrapper haz`}>
              <Checkbox
                checked={
                  record.survey_haz === "✔" || record.survey_haz === true
                }
                onChange={(e) => {
                  handleCheckboxChange("survey_haz", e.target.checked, record);
                  logCheckboxStates("HAZ", e.target.checked);
                  record.modifiedApplicableLaws = true; // Mark as modified
                }}
              />
              <span className="checkbox-label">HAZ</span>
            </div>
            <div className={`checkbox-wrapper chem`}>
              <Checkbox
                checked={
                  record.survey_chem === "✔" || record.survey_chem === true
                }
                onChange={(e) => {
                  handleCheckboxChange("survey_chem", e.target.checked, record);
                  logCheckboxStates("CHEMICAL", e.target.checked);
                  record.modifiedApplicableLaws = true; // Mark as modified
                }}
              />
              <span className="checkbox-label">CHEMICAL</span>
            </div>
          </div>
        );
      },
    },
    {
      title: "Project Title",
      dataIndex: "project_title",
      ...getColumnSearchProps("project_title"),
      key: "project_title",
      align: "left",
      width: 300,
      fixed: "left",
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
                href={`https://iis.emb.gov.ph/embis/dms/documents/tracker/?trn_no=${encodeURIComponent(
                  record.iis_no
                )}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {record.iis_no || ""}
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
      width: 200,
      fixed: "left",
      ...getColumnSearchProps("industry_class"),
    },
    {
      title: "Responsible Unit",
      dataIndex: "resp_unit",
      key: "resp_unit",
      align: "left",
      width: 200,
      fixed: "left",
      ...getColumnFilterProps(
        "resp_unit",
        uniqueResponsibleUnits,
        selectedKeys,
        setSelectedKeys
      ),
    },
    {
      title: "Remarks",
      dataIndex: "remarks",
      key: "remarks",
      align: "left",
      ...getColumnSearchProps("remarks"),
    },
    {
      title: "Actions",
      key: "actions",
      align: "left",
      width: 100,
      fixed: "right",
      render: (text, record) => (
        <div style={{ display: "flex", alignItems: "center" }}>
          <Button
            icon={<EyeOutlined />}
            onClick={() => handleView(record)}
            aria-label="View"
            size="small"
            className="btn-action"
          />
          <Button
            type="primary"
            aria-label="Save"
            size="small"
            onClick={() => handleSave(record)}
            className="btn-modify"
          >
            <span style={{ position: "relative", display: "inline-block" }}>
              <SaveOutlined />
              {modifiedRows && modifiedRows[record.id_no] ? (
                <span
                  style={{
                    position: "absolute",
                    top: -5,
                    right: -10,
                    backgroundColor: "red",
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                  }}
                />
              ) : null}
            </span>
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className={`header-panel ${theme}`}>
      <div className="header-content">
        <h3 className="header-title">Survey Template</h3>
        <Tooltip title="Reload Table">
          <Button
            type="primary"
            className="refresh-button"
            icon={<ReloadOutlined />}
            onClick={fetchData}
            loading={loading}
          />
        </Tooltip>
        <Tooltip title="Export Data">
          <Button
            type="primary"
            className="refresh-button"
            icon={<ExportOutlined />}
            //onClick={() => handleExportPDF(capitalizedProvinceName)}
          />
        </Tooltip>
        <Tooltip title="Mark Row As">
          <Dropdown
            overlay={colorMenu}
            open={colorMenuVisible}
            onOpenChange={(visible) => setColorMenuVisible(visible)}
            placement="bottomLeft"
          >
            <Button
              type="primary"
              className="refresh-button"
              icon={<BgColorsOutlined />}
            />
          </Dropdown>
        </Tooltip>
        <Button type="primary" className="add-industry-button">
          Add Industry
        </Button>
      </div>

      <div className="filter-container">
        <div className="total-rows">
          Industry Count: {formatNumber(filteredData.length)}
        </div>
        <div className="filter-inputs">
          <Input
            placeholder="Search..."
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value);
              handleSearchKeyWord(e);
            }}
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
        </div>
      </div>

      <Modal
        visible={isModalVisible}
        title={
          <div className="modal-title-container">
            <span className="modal-title">
              ID No.: {viewedRecord?.id_no || "Unknown"}
            </span>
            <span className="modal-title">
              {viewedRecord?.project_title || ""}
            </span>
            <span className="modal-title">
              <a
                href={`https://iis.emb.gov.ph/embis/dms/documents/tracker/?trn_no=${encodeURIComponent(
                  viewedRecord?.iis_no
                )}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {viewedRecord?.iis_no || ""}
              </a>
            </span>
          </div>
        }
        width={1000}
        footer={null}
        onCancel={() => setIsModalVisible(false)}
      >
        {viewedRecord && (
          <SurveyModal
            record={viewedRecord}
            isEditing={isEditing}
            setIsEditing={setIsEditing}
            onToggleEdit={handleToggleEdit}
            onClose={handleCloseModal}
            handleReload={handleReload}
            centered
          />
        )}
      </Modal>

      {/* Table for displaying survey data */}
      <div className="survey-table">
        {loading ? (
          <Spin size="large" />
        ) : (
          <Table
            rowSelection={{
              selectedRowKeys,
              onChange: (newSelectedRowKeys) => {
                setSelectedRowKeys(newSelectedRowKeys);
              },
              getCheckboxProps: (record) => ({
                name: record.name,
                checked: selectedRows[record.id_no],
                onChange: (e) => {
                  if (e.target.checked) {
                    setSelectedRows((prevSelectedRows) => ({
                      ...prevSelectedRows,
                      [record.id_no]: true,
                    }));
                  } else {
                  }
                },
              }),
            }}
            size="small"
            className="custom-table"
            columns={columns}
            dataSource={filteredData}
            rowKey="id_no"
            pagination={{ pageSize: 10 }}
            rowClassName={(record) => {
              const rowId = record.id_no;
              const colorValue = selectedRowColors[rowId] || record.color || "";
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
              badge:
                modifiedRows && modifiedRows[record.id_no] ? (
                  <Badge status="warning" />
                ) : null,
            })}
          />
        )}
      </div>
    </div>
  );
};

export default Survey;
