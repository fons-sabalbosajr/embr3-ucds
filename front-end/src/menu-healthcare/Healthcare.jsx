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
  const searchInput = useRef(null);
  const inputRef = useRef(null);

  const handleReload = async () => {
    setLoading(true);
    // Fetch data logic here
    setLoading(false); // End loading animation
  };

  const handleSearch = (selectedKeys, confirm, dataIndex) => {
    confirm();
    setSearchText(selectedKeys[0]);
    setSearchedColumn(dataIndex);
  };

  const handleReset = (clearFilters) => {
    clearFilters();
    setSearchText("");
  };

  const handleInputChange = (e) => {
    setInputValue(e.target.value);
  };

  const handleInputConfirm = () => {
    if (inputValue) {
      const filtered = data.filter((item) =>
        Object.values(item).some((val) =>
          String(val).toLowerCase().includes(inputValue.toLowerCase())
        )
      );
      setFilteredData(filtered);
    } else {
      setFilteredData(data);
    }
    setInputVisible(false);
    setInputValue("");
  };

  const handleRemoveKeyword = () => {
    setFilteredData(data);
    setInputValue("");
  };

  const getColumnSearchProps = (dataIndex) => ({
    filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => (
      <div className="healthcare-custom-filter-dropdown">
        <Input
          ref={searchInput}
          placeholder={`Search ${dataIndex}`}
          value={selectedKeys[0]}
          onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
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
          <Button onClick={() => handleReset(clearFilters)} size="small" className="healthcare-custom-filter-button">
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
        ? record[dataIndex].toString().toLowerCase().includes(value.toLowerCase())
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
      title: "Name",
      dataIndex: "name",
      key: "name",
      ...getColumnSearchProps("name"),
    },
    {
      title: "Age",
      dataIndex: "age",
      key: "age",
      ...getColumnSearchProps("age"),
    },
    {
      title: "Address",
      dataIndex: "address",
      key: "address",
      ...getColumnSearchProps("address"),
    },
    // Add more columns as needed
  ];

  const data = [
    {
      key: "1",
      name: "John Brown",
      age: 32,
      address: "New York No. 1 Lake Park",
    },
    {
      key: "2",
      name: "Jim Green",
      age: 42,
      address: "London No. 1 Lake Park",
    },
    {
      key: "3",
      name: "Joe Black",
      age: 32,
      address: "Sidney No. 1 Lake Park",
    },
    // Add more data as needed
  ];

  useEffect(() => {
    setFilteredData(data);
  }, []);

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
        <div style={{ display: "flex", alignItems: "center", marginLeft: "16px" }}>
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
          {inputValue && (
            <Tag
              closable
              onClose={handleRemoveKeyword}
              className="healthcare-search-keyword"
              color="blue"
            >
              {inputValue}
            </Tag>
          )}
        </div>
      </div>

      <Table columns={columns} dataSource={filteredData} loading={loading} />
    </div>
  );
};

export default Healthcare;
