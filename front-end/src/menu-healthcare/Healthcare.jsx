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
} from "@ant-design/icons";
import Highlighter from "react-highlight-words";
import "./healthcare.css";

const Healthcare = ({ theme, currentUser }) => {
  const [loading, setLoading] = useState(false);
  const [buttonColor, setButtonColor] = useState("primary");
  const [searchText, setSearchText] = useState("");
  const [searchedColumn, setSearchedColumn] = useState("");
  const [inputVisible, setInputVisible] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [filteredData, setFilteredData] = useState([]);
  const [tags, setTags] = useState([]); // State to store tags
  const [initialState, setInitialState] = useState(new Map()); // Define initialState and setInitialState
  const searchInput = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const response = await fetch("http://localhost:8081/api/healthcare", {
          method: "GET",
          credentials: "include",
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText);
        }

        const result = await response.json();
        const sortedResult = result.sort((a, b) => {
          if (a.name && b.name) {
            return a.name.localeCompare(b.name);
          }
          return 0;
        }); // Sort by name
        setFilteredData(sortedResult);

        // Store initial states
        const stateMap = new Map();
        sortedResult.forEach((item) => {
          stateMap.set(item._id, {
            name: item.name,
            age: item.age,
            address: item.address,
          });
        });
        setInitialState(stateMap);
      } catch (error) {
        console.error("Error fetching healthcare data:", error.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleReload = async () => {
    setLoading(true);
    try {
      const response = await fetch("http://localhost:8081/api/healthcare", {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }

      const result = await response.json();
      const sortedResult = result.sort((a, b) => {
        if (a.name && b.name) {
          return a.name.localeCompare(b.name);
        }
        return 0;
      }); // Sort by name
      setFilteredData(sortedResult);
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
      setFilteredData(filtered);
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
    setFilteredData(filtered);
  };

  const handleInputConfirm = () => {
    if (inputValue) {
      // Add the input value as a tag
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
      setFilteredData(filtered);
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
    setFilteredData(filtered.length > 0 ? filtered : filteredData);
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

  const columns = [
    {
      title: "ID No",
      dataIndex: "id_no",
      key: "id_no",
    },
    {
      title: "Project Details",
      key: "project_details",
      align: "left",
      render: (text, record) => (
        <div>
          <div>{record.name}</div>
          <div style={{ fontWeight: "bold" }}>{record.title}</div>
          <div>
            <a href={record.ecc_cnc} target="_blank" rel="noopener noreferrer">
              {record.ecc_cnc}
            </a>
          </div>
          <div>{record.address}</div>
        </div>
      ),
    },
    {
      title: "Industry Classification",
      dataIndex: "industry_class",
      key: "industry_class",
      align: "left",
    },
    {
      title: "Permit/Clearances",
      key: "permit_clearances",
      render: (text, record) => (
        <div>
          {record.ecc_value && "ECC "}
          {record.cnc_value && "CNC "}
          {record.pto_code && "PTO "}
          {record.wwdp_code && "WWDP "}
          {record.haz_id && "HAZWASTE "}
          {record.pco_np && "PCO "}
        </div>
      ),
    },
    {
      title: "Monitoring Status",
      key: "monitoring_status",
      render: (text, record) => (
        <div>
          <a href={record.iis_no} target="_blank" rel="noopener noreferrer">
            {record.iis_no}
          </a>
          <div>{record.date_monitored}</div>
          <div>{record.date_routed}</div>
          <div>{record.date_signed}</div>
          <div>{record.pismu_tracking}</div>
        </div>
      ),
    },
    {
      title: "Remarks/Recommendations",
      dataIndex: "remarks",
      key: "remarks",
    },
    {
      title: "Action",
      key: "action",
      render: (text, record) => (
        <Button type="primary" icon={<EyeOutlined />}>
          View
        </Button>
      ),
    },
  ];

  return (
    <div className={`header-panel ${theme}`}>
      <div className="header-content">
        <h3 className="header-title">Universe of Industries (Healthcare)</h3>

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
          className="refresh-button"
          icon={<ExportOutlined />}
          title="Export Data"
        />

        <Button
          type="primary"
          className="add-industry-button"
          style={{
            backgroundColor: buttonColor === "primary" ? "#1890ff" : "#03396c",
          }}
        >
          Add Industry
        </Button>
      </div>

      <div className="healthcare-table-header">
        <span>Total Rows: {filteredData.length}</span>
        <div
          style={{ display: "flex", alignItems: "center", marginLeft: "5px" }}
        >
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
      </div>

      <Table columns={columns} dataSource={filteredData} loading={loading} />
    </div>
  );
};

export default Healthcare;
