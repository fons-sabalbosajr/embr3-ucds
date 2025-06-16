import React, { useState, useEffect, useRef } from "react";
import {
  DatePicker,
  Select,
  Table,
  Button,
  ConfigProvider,
  Spin,
  Tooltip,
  Input,
  Space,
} from "antd";
import { ExportOutlined, SearchOutlined } from "@ant-design/icons";
import { Highlighter } from "react-highlight-words";
import "./extractdata.css";

const ExtractData = () => {
  const { RangePicker } = DatePicker;
  const { Option } = Select;

  const provinces = [
    { value: "All", label: "All" },
    { value: "Aurora", label: "Aurora" },
    { value: "Bataan", label: "Bataan" },
    { value: "Bulacan", label: "Bulacan" },
    { value: "Nueva Ecija", label: "Nueva Ecija" },
    { value: "Pampanga", label: "Pampanga" },
    { value: "Tarlac", label: "Tarlac" },
    { value: "Zambales", label: "Zambales" },
  ];

  const [searchKeyword, setSearchKeyword] = useState("");
  const [selectedProvince, setSelectedProvince] = useState("All");
  const [dateRange, setDateRange] = useState([]);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [searchedColumn, setSearchedColumn] = useState("");
  const searchInput = useRef(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch(
          "http://10.14.77.100:8081/api/extract-province-data",
          {
            method: "GET",
            params: {
              keyword: searchKeyword,
            },
          }
        );
        const data = await response.json();
        setData(data);
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };
    fetchData();
  }, [searchKeyword]);

  const handleProvinceChange = (value) => {
    setSelectedProvince(value);
  };

  const handleDateRangeChange = (dates) => {
    setDateRange(dates);
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
            close
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
      record[dataIndex]?.toString().toLowerCase().includes(value.toLowerCase()),
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

  const columns = [
    {
      title: "ID No",
      dataIndex: "id_no",
      key: "id_no",
      align: "left",
      ...getColumnSearchProps("id_no"),
    },
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
      align: "left",
      ...getColumnSearchProps("name"),
    },
    {
      title: "Title",
      dataIndex: "title",
      key: "title",
      align: "left",
      ...getColumnSearchProps("title"),
    },
    {
      title: "Industry Type",
      dataIndex: "industry_type",
      key: "industry_type",
      align: "left",
      ...getColumnSearchProps("industry_type"),
    },
    {
      title: "Province",
      dataIndex: "province",
      key: "province",
      align: "left",
      ...getColumnSearchProps("province"),
    },
  ];

  const handleGenerateClick = async () => {
    try {
      setLoading(true);

      const queryParams = new URLSearchParams({
        keyword: searchKeyword,
        startDate: dateRange[0] ? dateRange[0].format("MM/DD/YYYY") : "",
        endDate: dateRange[1] ? dateRange[1].format("MM/DD/YYYY") : "",
      });

      if (selectedProvince !== "All") {
        queryParams.append("province", selectedProvince);
      } else {
        // Remove the province parameter if "All" is selected
        delete queryParams.keyword;
      }

      const response = await fetch(
        `http://10.14.77.100:8081/api/extract-province-data?${queryParams.toString()}`,
        {
          method: "GET",
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Error response:", errorData);
        return;
      }

      const newData = await response.json();

      if (Array.isArray(newData)) {
        setData(newData);
      } else {
        console.error("Invalid data format. Expected an array.");
        setData([]);
      }
    } catch (error) {
      console.error(error);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ConfigProvider
      theme={{
        token: {
          fontSize: 10,
        },
      }}
    >
      <div className="container">
        <div className="header">
          <h2 className="header-extract">Extract Data</h2>
          <div className="right-align">
            <RangePicker
              className="date-picker"
              popupStyle={{ fontSize: 10 }}
              needConfirm
              placement="topRight"
              value={dateRange}
              onChange={handleDateRangeChange}
            />
            <Select
              className="select"
              placeholder="Select Province"
              value={selectedProvince}
              onChange={handleProvinceChange}
              defaultValue="All"
            >
              {provinces.map((province) => (
                <Option value={province.value}>{province.label}</Option>
              ))}
            </Select>
            <Button
              type="primary"
              className="button-gen"
              onClick={handleGenerateClick}
            >
              Generate
            </Button>
            <Tooltip title="Export data">
              <Button type="primary" className="button-export">
                <ExportOutlined />
              </Button>
            </Tooltip>
          </div>
        </div>
        <Table
          columns={columns}
          dataSource={data}
          className="table"
          rowKey="id_no"
          loading={{
            spinning: loading,
            indicator: (
              <div
                style={{
                  position: "absolute",
                  top: "30%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  textAlign: "center",
                  width: "200px",
                  fontSize: "11px",
                }}
              >
                <Spin tip="Processing Data..." size="medium">
                  <strong className="loading_title">...</strong>
                </Spin>
              </div>
            ),
          }}
        />
      </div>
    </ConfigProvider>
  );
};

export default ExtractData;
