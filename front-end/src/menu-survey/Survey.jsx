import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
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
  Pagination, // Import Pagination
  Progress, // Import Progress
  Modal,
} from "antd";
import {
  ReloadOutlined,
  ExportOutlined,
  BgColorsOutlined,
  SearchOutlined,
  EyeOutlined,
  SaveOutlined,
  MonitorOutlined,
  GlobalOutlined,
  CheckCircleFilled,
  TagsOutlined, // Import TagsOutlined
} from "@ant-design/icons";
import "./survey.css";
import axios from "axios";
import Highlighter from "react-highlight-words";
import debounce from "lodash.debounce";
import SurveyModal from "./SurveyModal";
import AddSurvey from "./actions/AddSurvey";
import CryptoJS from "crypto-js";

const { Option } = Select;

const Survey = ({ theme, currentUser }) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [searchedColumn, setSearchedColumn] = useState("");
  const [filteredData, setFilteredData] = useState([]); // Initialize as empty array
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [uniqueUnits, setUniqueUnits] = useState([]);
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [selectedColor, setSelectedColor] = useState(null);
  const [colorMenuVisible, setColorMenuVisible] = useState(false);
  const [selectedRowColors, setSelectedRowColors] = useState({});
  const [filterValue, setFilterValue] = useState("");
  const [industryClasses, setIndustryClasses] = useState([]);
  const [modifiedRows, setModifiedRows] = useState({});
  const [ignoreRowSelection, setIgnoreRowSelection] = useState(false);
  const [selectedRows, setSelectedRows] = useState({});
  const [initialState, setInitialState] = useState(new Map());
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [viewedRecord, setViewedRecord] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedSurvey, setSelectedSurvey] = useState("Survey 2025");
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [buttonColor, setButtonColor] = useState("primary");
  const [progress, setProgress] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const encryptionKey = import.meta.env.VITE_CRYPTOJS_ENCRYPTION_KEY;

  const formatNumber = (number) => {
    return new Intl.NumberFormat("en-US").format(number);
  };

  const fetchData = async (year) => {
    setLoading(true);
    setProgress(0);
    let progressInterval = null;

    try {
      progressInterval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 10, 90));
      }, 200);

      const response = await fetch(
        `http://localhost:8081/api/surveys/${year}`,
        {
          method: "GET",
          credentials: "include",
        }
      );

      if (progressInterval) clearInterval(progressInterval);
      progressInterval = null;

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }

      const result = await response.json();

      const normalizedResult = result.map((item) => ({
        id_no: item.id_no ?? null,
        survey_eia: item.survey_eia === true ? "✔" : item.survey_eia || "",
        survey_air: item.survey_air === true ? "✔" : item.survey_air || "",
        survey_water:
          item.survey_water === true ? "✔" : item.survey_water || "",
        survey_haz: item.survey_haz === true ? "✔" : item.survey_haz || "",
        survey_chem: item.survey_chem === true ? "✔" : item.survey_chem || "",
        project_title: item.project_title ?? "N/A",
        project_type: item.project_type ?? "N/A",
        project_subtype: item.project_subtype ?? "N/A",
        industry_class: item.industry_class ?? "N/A",
        psic_code: item.psic_code ?? "N/A",
        mbu_area: item.mbu_area === true ? "✔" : item.mbu_area || "",
        employee_no: item.employee_no ?? "N/A",
        bod: item.bod ?? "N/A",
        waterbody: item.waterbody ?? "N/A",
        long: item.long ?? "N/A",
        lat: item.lat ?? "N/A",
        cong_district: item.cong_district ?? "N/A",
        address: item.address ?? "N/A",
        street: item.street ?? "N/A",
        brgy: item.brgy ?? "N/A",
        city: item.city ?? "N/A",
        province: item.province ?? "N/A",
        resp_unit: item.resp_unit ?? "N/A",
        handler: item.handler ?? "N/A",
        iis_no: item.iis_no ?? "N/A",
        date_surveyed: item.date_surveyed ?? "N/A",
        date_routed: item.date_routed ?? "N/A",
        date_signed: item.date_signed ?? item.date_report_signed ?? "N/A",
        total_days: item.total_days ?? "N/A",
        track_report_unit:
          item.track_report_unit === true ? "✔" : item.track_report_unit || "",
        track_report_planning:
          item.track_report_planning === true
            ? "✔"
            : item.track_report_planning || "",
        remarks: item.remarks ?? "N/A",
        docket_no: item.docket_no ?? "N/A",
        date_approved_legal: item.date_approved_legal ?? "N/A",
        v_pd1586: item.v_pd1586 ?? "N/A",
        penalty_amount: item.penalty_amount ?? "N/A",
        penalty_or_number: item.penalty_or_number ?? "N/A",
        daysDfDa: item.daysDfDa ?? "N/A",
        updated_by: item.updated_by ?? "N/A",
        color: item.color ?? "#ffffff",
      }));

      const sortedResult = normalizedResult.sort((a, b) => a.id_no - b.id_no);

      setData(sortedResult);
      // setFilteredData(sortedResult); // Filtering will be handled by useEffect

      const uniqueUnits = [
        ...new Set(sortedResult.map((item) => item.resp_unit)),
      ];

      const stateMap = new Map();
      sortedResult.forEach((item) => {
        stateMap.set(item.id_no, {
          survey_eia: item.survey_eia,
          survey_air: item.survey_air,
          survey_water: item.survey_water,
          survey_haz: item.survey_haz,
          survey_chem: item.survey_chem,
          color: item.color,
        });
      });

      setInitialState(stateMap);
      setUniqueUnits(uniqueUnits);
      setSelectedKeys([]);
    } catch (error) {
      console.error("Error fetching survey data:", error.message);
      if (progressInterval) clearInterval(progressInterval);
      setProgress(100);
    } finally {
      if (progressInterval) clearInterval(progressInterval);
      setProgress(100);
      setTimeout(() => {
        setLoading(false);
        setProgress(0);
      }, 500);
    }
  };

  const handlePageChange = (page, newPageSize) => {
    setCurrentPage(page);
    if (newPageSize) setPageSize(newPageSize);
  };

  const handlePageSizeChange = (value) => {
    setPageSize(value);
    setCurrentPage(1);
  };

  useEffect(() => {
    if (selectedSurvey) {
      const year = selectedSurvey.replace("Survey ", "");
      fetchData(year);
    }
  }, [selectedSurvey]);

  // Decrypt rowColors from localStorage
  useEffect(() => {
    const storedColors = localStorage.getItem("rowColors");

    if (storedColors) {
      try {
        const decryptedBytes = CryptoJS.AES.decrypt(
          storedColors,
          encryptionKey
        );
        const decryptedColors = decryptedBytes.toString(CryptoJS.enc.Utf8);
        const rowColors = JSON.parse(decryptedColors);
        setSelectedRowColors(rowColors);
      } catch (error) {
        console.error("Error decrypting or parsing rowColors:", error);
        setSelectedRowColors({});
      }
    }
  }, [encryptionKey]); // Added encryptionKey to dependency array

  useEffect(() => {
    if (data && data.length > 0) {
      const rowColors = {};
      data.forEach((row) => {
        rowColors[row.id_no] = row.color;
      });

      const encryptedRowColors = CryptoJS.AES.encrypt(
        JSON.stringify(rowColors),
        encryptionKey
      ).toString();

      localStorage.setItem("rowColors", encryptedRowColors);
    }
  }, [data, encryptionKey]); // Added encryptionKey to dependency array

  useEffect(() => {
    const uniqueIndustryClasses = [
      ...new Set(data.map((item) => item.industry_class)),
    ];
    setIndustryClasses(uniqueIndustryClasses);
  }, [data]);

  // Search functionality for each column
  let searchInput = null; // Changed from const to let
  const handleSearch = (selectedKeys, confirm, dataIndex) => {
    confirm();
    setSearchText(selectedKeys[0]);
    setSearchedColumn(dataIndex);
  };

  const handleSearchKeyWord = debounce((e) => {
    setSearchText(e.target.value);
  }, 300);

  const handleFilterChange = (value) => {
    setFilterValue(value);
  };

  // Centralized useEffect for all filtering
  useEffect(() => {
    if (!data || !currentUser || !currentUser.provinceStringPermissions) {
      setFilteredData([]);
      return;
    }

    const allowedProvinceKeys = Object.entries(
      currentUser.provinceStringPermissions
    )
      .filter(
        ([key, permission]) =>
          permission === "view" || permission === "readWrite"
      )
      .map(([key]) => key.toLowerCase().replace(/ /g, "").replace(/_/g, ""));

    let currentFilteredData = data.filter((record) => {
      if (!record.province) return false;
      const normalizedRecordProvince = record.province
        .toLowerCase()
        .replace(/ /g, "")
        .replace(/_/g, "");
      return allowedProvinceKeys.includes(normalizedRecordProvince);
    });

    if (selectedKeys.length > 0) {
      currentFilteredData = currentFilteredData.filter((record) => {
        const recordValue = record.resp_unit;
        if (typeof recordValue === "string" && recordValue !== null) {
          const normalizedRecordValue = recordValue.toLowerCase();
          const lowerSelectedKeys = selectedKeys.map((key) =>
            key.toLowerCase()
          );
          return lowerSelectedKeys.some(
            (key) =>
              normalizedRecordValue.includes(key) ||
              key.includes(normalizedRecordValue)
          );
        }
        return false;
      });
    }

    if (searchText) {
      const lowerSearchText = searchText.toLowerCase();
      currentFilteredData = currentFilteredData.filter((item) =>
        Object.values(item).some((value) =>
          String(value).toLowerCase().includes(lowerSearchText)
        )
      );
    }

    if (filterValue) {
      currentFilteredData = currentFilteredData.filter(
        (item) => item.industry_class === filterValue
      );
    }

    setFilteredData(currentFilteredData);
    setCurrentPage(1);
  }, [data, currentUser, selectedKeys, searchText, filterValue]);

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
    onFilter: (value, record) => {
      const searchTextValue = value.toLowerCase();
      return (
        record.project_title.toLowerCase().includes(searchTextValue) ||
        (record.address &&
          record.address.toLowerCase().includes(searchTextValue)) ||
        (record.date_surveyed &&
          new Date(record.date_surveyed)
            .toLocaleDateString()
            .toLowerCase()
            .includes(searchTextValue)) ||
        (record.resp_unit &&
          record.resp_unit.toLowerCase().includes(searchTextValue)) ||
        (record.iis_no && record.iis_no.toLowerCase().includes(searchTextValue))
      );
    },
    onFilterDropdownVisibleChange: (visible) => {
      if (visible) {
        setTimeout(() => searchInput?.select(), 100); // Added optional chaining
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

    uniqueUnits.forEach((unit) => {
      if (unit !== undefined && unit !== null) {
        const normalizedUnit = unit.toLowerCase();
        if (!normalizedUnits.has(normalizedUnit)) {
          normalizedUnits.add(normalizedUnit);
          displayUnits.push(unit);
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
      fetchData(selectedSurvey.replace("Survey ", "")); // Refetch data
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
      );
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
      if (!record._id) {
        notification.error({
          message: "Error",
          description: "Record ID is missing.",
        });
        return;
      }
      if (!modifiedRows[record.id_no]?.modifiedApplicableLaws) {
        notification.info({
          message: "No Changes",
          description: "No applicable laws were modified for this record.",
        });
        return;
      }

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

      await fetchData(selectedSurvey.replace("Survey ", ""));
      setModifiedRows({});
    } catch (error) {
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
    record[field] = checked ? "✔" : "";

    const updatedData = data.map((item) => {
      if (item.id_no === record.id_no) {
        return { ...item, [field]: record[field] }; // Ensure to update the item correctly
      }
      return item;
    });

    setData(updatedData);
    // setFilteredData(updatedData); // Let the main useEffect handle filtering

    setModifiedRows((prevModifiedRows) => ({
      ...prevModifiedRows,
      [record.id_no]: {
        ...(prevModifiedRows[record.id_no] || {}), // Preserve other modified fields
        [field]: record[field],
        modifiedApplicableLaws: true, // Indicate that applicable laws were modified
      },
    }));
  };

  const handleToggleEdit = () => {
    setIsEditing(!isEditing);
  };

  const handleCloseModal = () => {
    setIsModalVisible(false);
    // setIsLogChecked(false); // This might not be needed here
  };

  const handleView = (record) => {
    setViewedRecord(record);
    setIsModalVisible(true);
  };

  const handleReload = () => {
    fetchData(selectedSurvey.replace("Survey ", ""));
  };

  const responsibleUnitBackgroundColor = (unit) => {
    if (!unit) return "transparent";
    switch (unit.toUpperCase()) {
      case "PEMU_AURORA":
        return "#F0F3FF";
      case "PEMU_BATAAN":
        return "#FCE5BB";
      case "PEMU_BULACAN":
        return "#FCE5BB";
      case "PEMU_NUEVA ECIJA":
        return "#FFE225";
      case "PEMU_PAMPANGA":
        return "#FFE225";
      case "PEMU_TARLAC":
        return "#39C665";
      case "PEMU_ZAMBALES":
        return "#d1c4e9";
      case "MBU":
        return "#FF9B3E";
      case "TCHWMS":
        return "#936DDF";
      case "AWECMES":
        return "#c8e6c9";
      case "EMED":
        return "#FFD09B";
      case "CPD":
        return "#D2E0FB";
      default:
        return "transparent";
    }
  };

  const measureTextWidth = (text) => {
    if (!text) return 0;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    context.font = "10px Arial"; // Match font size used in render
    const metrics = context.measureText(text);
    return metrics.width;
  };

  const darkenColor = (color, percent) => {
    if (!color || color === "transparent") return "gray"; // Handle transparent case
    const num = parseInt(color.slice(1), 16),
      amt = Math.round(2.55 * percent),
      R = (num >> 16) + amt,
      G = ((num >> 8) & 0x00ff) + amt,
      B = (num & 0x0000ff) + amt;
    return `#${(
      0x1000000 +
      (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
      (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
      (B < 255 ? (B < 1 ? 0 : B) : 255)
    )
      .toString(16)
      .slice(1)}`;
  };

  const showAddModal = () => {
    setIsAddModalVisible(true);
  };

  const handleAddCancel = () => {
    setIsAddModalVisible(false);
  };

  const paginatedData = useMemo(() => {
    return filteredData.slice(
      (currentPage - 1) * pageSize,
      currentPage * pageSize
    );
  }, [filteredData, currentPage, pageSize]);

  const columns = [
    {
      title: "ID No.",
      dataIndex: "id_no",
      key: "id_no",
      ...getColumnSearchProps("id_no"),
      align: "center",
      width: 75,
    },
    {
      title: "Applicable Laws",
      key: "applicable_laws",
      align: "center",
      width: 120,
      render: (_, record) => {
        return (
          <div className="checkbox-container">
            {[
              "survey_eia",
              "survey_air",
              "survey_water",
              "survey_haz",
              "survey_chem",
            ].map((field) => (
              <div key={field} className={`checkbox-wrapper ${field}`}>
                <Checkbox
                  checked={record[field] === "✔" || record[field] === true}
                  onChange={(e) =>
                    handleCheckboxChange(field, e.target.checked, record)
                  }
                />
                <span className="checkbox-label">
                  {field.replace("survey_", "").toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        );
      },
    },
    {
      title: "Project Title",
      dataIndex: "project_title",
      key: "project_title",
      ...getColumnSearchProps("project_title"),
      align: "center",
      width: 250,
      render: (text, record) => (
        <div>
          <div className="industry-label">
            <strong className="title">{text || "N/A"}</strong>
            <p style={{ fontStyle: "italic" }}>{record.address || "N/A"}</p>
            <p>Date Surveyed: {record.date_surveyed || "N/A"}</p>
            <p>Responsible Unit: {record.resp_unit || "N/A"}</p>
          </div>
        </div>
      ),
    },
    {
      title: "Industry Class",
      dataIndex: "industry_class",
      key: "industry_class",
      align: "center",
      width: 150,
      ...getColumnSearchProps("industry_class"),
    },
    {
      title: "Responsible Unit",
      dataIndex: "resp_unit",
      key: "resp_unit",
      align: "center",
      width: 150,
      ...getColumnFilterProps(
        "resp_unit",
        uniqueResponsibleUnits,
        selectedKeys,
        setSelectedKeys
      ),
      render: (text, record) => {
        const backgroundColor = responsibleUnitBackgroundColor(
          record.resp_unit
        );
        const textWidth = measureTextWidth(record.resp_unit);
        const darkerBackgroundColor = darkenColor(backgroundColor, -50);

        return (
          <Tooltip
            title={
              <div style={{ fontSize: "10px" }}>
                {" "}
                {/* Adjusted font size */}
                <div>Responsible Unit: {record.resp_unit || "N/A"}</div>
                <div>Handler: {record.handler || "N/A"}</div>
              </div>
            }
            color={darkerBackgroundColor}
          >
            <div
              style={{
                backgroundColor: backgroundColor,
                padding: "5px",
                borderRadius: "4px",
                color: backgroundColor !== "transparent" ? "black" : "inherit",
                width: `${textWidth + 20}px`, // Added padding to width
                minWidth: "80px", // Ensure a minimum width
                display: "inline-block",
                whiteSpace: "nowrap",
                cursor: "pointer",
                fontSize: "10px", // Ensure consistent font size
                textAlign: "center", // Center text
              }}
            >
              {record.resp_unit || "N/A"}
            </div>
          </Tooltip>
        );
      },
    },
    {
      title: "Remarks",
      dataIndex: "remarks",
      key: "remarks",
      align: "center",
      ...getColumnSearchProps("remarks"),
      width: 150,
    },
    {
      title: "Survey Status",
      key: "survey_status", // Changed key for clarity
      ...getColumnSearchProps("iis_no"), // Assuming iis_no is the primary search field here
      render: (_, record) => (
        <div className="industry-label">
          {" "}
          {/* Reused industry-label for consistent styling */}
          {record.date_surveyed && (
            <p>
              <Tooltip title="Date Surveyed">
                <MonitorOutlined style={{ marginRight: 8, color: "#1890ff" }} />
                {record.date_surveyed}
              </Tooltip>
            </p>
          )}
          {record.date_routed && (
            <p>
              <Tooltip title="Date Routed to IIS">
                <GlobalOutlined style={{ marginRight: 8, color: "#52c41a" }} />
                {record.date_routed}
              </Tooltip>
            </p>
          )}
          {record.date_signed && (
            <p>
              <Tooltip title="Date Report Signed">
                <CheckCircleFilled
                  style={{ marginRight: 8, color: "#faad14" }}
                />
                {record.date_signed}
              </Tooltip>
            </p>
          )}
          {record.iis_no && record.iis_no !== "N/A" && (
            <p className="survey-iis-label">
              <span>
                <Tooltip title="IIS Transaction No.">
                  <TagsOutlined style={{ color: "#1890ff", marginRight: 8 }} />
                </Tooltip>
                {record.iis_no.split(/\s+/)[0] && (
                  <a
                    href={`https://iis.emb.gov.ph/embis/dms/documents/tracker/?trn_no=${encodeURIComponent(
                      record.iis_no.split(/\s+/)[0].trim()
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="iis-link survey-iis-link"
                    style={{ color: "#1890ff", textDecoration: "none" }}
                  >
                    {record.iis_no.split(/\s+/)[0].trim()}
                  </a>
                )}
              </span>
              {record.iis_no.split(/\s+/).map(
                (iis, index) =>
                  index > 0 && (
                    <span
                      key={index}
                      style={{
                        display: "block",
                        lineHeight: "1.2",
                        marginLeft: "26px",
                      }}
                    >
                      <a
                        href={`https://iis.emb.gov.ph/embis/dms/documents/tracker/?trn_no=${encodeURIComponent(
                          iis.trim()
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="iis-link survey-iis-link"
                        style={{ color: "#1890ff", textDecoration: "none" }}
                      >
                        {iis.trim()}
                      </a>
                    </span>
                  )
              )}
            </p>
          )}
        </div>
      ),
      width: 150,
      align: "center",
    },
    {
      title: "Actions",
      key: "actions",
      align: "center",
      width: 100,
      render: (_, record) => (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Button
            icon={<EyeOutlined />}
            onClick={() => handleView(record)}
            aria-label="View"
            size="small"
            className="btn-action"
            type="primary"
          />
          <Button
            type="primary"
            aria-label="Save"
            size="small"
            onClick={() => handleSave(record)}
            className="btn-modify"
            disabled={!modifiedRows[record.id_no]?.modifiedApplicableLaws} // Disable if not modified
          >
            <span style={{ position: "relative", display: "inline-block" }}>
              <SaveOutlined />
              {modifiedRows[record.id_no]?.modifiedApplicableLaws && (
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
              )}
            </span>
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className={`survey-container-card ${theme}-theme`}>
      <div className="header-content-survey">
        <h3 className="header-title-survey">Survey Data ({selectedSurvey})</h3>
        <div className="header-action-buttons">
          <Select
            value={selectedSurvey}
            onChange={(value) => {
              setSelectedSurvey(value);
              fetchData(value.replace("Survey ", ""));
            }}
            className="survey-year-dropdown"
          >
            <Select.Option value="Survey 2025">Survey 2025</Select.Option>
            <Select.Option value="Survey 2024">Survey 2024</Select.Option>
          </Select>
          <Tooltip title="Reload Table">
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              onClick={() => fetchData(selectedSurvey.replace("Survey ", ""))}
              loading={loading && progress < 100} // Show loading on button if fetching
            />
          </Tooltip>
          <Tooltip title="Export Data">
            <Button
              type="primary"
              className="action-button"
              icon={<ExportOutlined />}
              //onClick={() => handleExportPDF(capitalizedProvinceName)} // Add export functionality
            />
          </Tooltip>
          <Tooltip title="Mark Row As">
            <Dropdown
              overlay={colorMenu} // Use overlay prop for AntD v5+
              open={colorMenuVisible}
              onOpenChange={(visible) => setColorMenuVisible(visible)}
              placement="bottomLeft"
            >
              <Button
                type="primary"
                className="action-button"
                icon={<BgColorsOutlined />}
              />
            </Dropdown>
          </Tooltip>
          <Button
            type="primary"
            className="add-survey-button"
            onClick={showAddModal}
          >
            Add Survey Data
          </Button>
          <AddSurvey visible={isAddModalVisible} onCancel={handleAddCancel} />
        </div>
      </div>

      <div className="filter-container">
        <div className="total-rows">
          Industry Count: {formatNumber(filteredData.length)}
        </div>
        <div className="filter-controls-group">
          <Input
            placeholder="Search keyword here..."
            prefix={<SearchOutlined />}
            onChange={handleSearchKeyWord}
            className="search-input-survey global-search-input"
            allowClear
          />
          <div className="custom-select-input">
            <ConfigProvider
              theme={{
                components: { Select: { fontSize: 12 } },
              }}
            >
              <Select
                placeholder="Filter by Industry Class"
                value={filterValue}
                onChange={handleFilterChange}
                className="select-input"
                allowClear
              >
                <Option value="">All Industry Classes</Option>
                {industryClasses.map((industryClass) => (
                  <Option key={industryClass} value={industryClass}>
                    {industryClass}
                  </Option>
                ))}
              </Select>
            </ConfigProvider>
          </div>

          <div className="survey-pagination-controls">
            <Pagination
              simple
              current={currentPage}
              total={filteredData.length}
              pageSize={pageSize}
              onChange={handlePageChange}
              size="small"
              className="custom-pagination"
            />
          </div>
        </div>
      </div>

      <Modal
        open={isModalVisible}
        title={
          <div className="modal-title-container">
            <span className="modal-title">
              ID No.: {viewedRecord?.id_no || "Unknown"}
            </span>
            <span className="modal-title">
              {viewedRecord?.project_title || ""}
            </span>
            <span className="modal-iis">
              <a
                href={`https://iis.emb.gov.ph/embis/dms/documents/tracker/?trn_no=${encodeURIComponent(
                  viewedRecord?.iis_no || ""
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
            // onToggleEdit={handleToggleEdit} // This prop might not be needed if SurveyModal handles its own edit state
            // onClose={handleCloseModal} // This prop might not be needed if SurveyModal handles its own close
            handleReload={handleReload}
            centered
            currentUser={currentUser}
            theme={theme} // Pass theme to SurveyModal
          />
        )}
      </Modal>

      <div className="survey-table">
        {loading && progress < 100 ? (
          <div className="loading-progress-container">
            <span>Loading Survey Data ({selectedSurvey})...</span> <br />
            <Progress
              percent={progress}
              status="active"
              style={{ width: "50%" }}
            />
          </div>
        ) : (
          <Table
            rowSelection={{
              selectedRowKeys,
              onChange: (newSelectedRowKeys) => {
                setSelectedRowKeys(newSelectedRowKeys);
              },
              getCheckboxProps: (record) => ({
                name: record.name, // This might be incorrect, should be record.project_title or similar
                checked: selectedRows[record.id_no],
                onChange: (e) => {
                  // This onChange logic for rowSelection seems complex and might conflict with handleRowSelect
                  // Consider simplifying or ensuring it works as intended.
                  if (e.target.checked) {
                    setSelectedRows((prevSelectedRows) => ({
                      ...prevSelectedRows,
                      [record.id_no]: true,
                    }));
                  } else {
                    // Handle uncheck if needed
                  }
                },
              }),
            }}
            size="small"
            scroll={{ y: 950 }}
            className="custom-table"
            columns={columns}
            dataSource={paginatedData}
            rowKey="id_no"
            pagination={false}
            onRow={(record) => ({
              onClick: () => {
                handleRowClick(record);
                handleRowSelect(record.id_no);
              },
              style: {
                cursor: "pointer",
                ...((selectedRowColors[record.id_no] || record.color) && {
                  backgroundColor:
                    selectedRowColors[record.id_no] || record.color,
                }),
              },
              // badge prop is not standard for onRow, this might be custom logic
              // badge:
              //   modifiedRows && modifiedRows[record.id_no] ? (
              //     <Badge status="warning" />
              //   ) : null,
            })}
          />
        )}
      </div>
    </div>
  );
};

export default Survey;
