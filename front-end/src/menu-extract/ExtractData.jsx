import React, { useState, useEffect, useRef } from "react";
import {
  DatePicker,
  Select,
  Table,
  Button,
  Spin,
  Tooltip,
  Input,
  Space,
  message,
} from "antd";
import { ExportOutlined, SearchOutlined } from "@ant-design/icons";
import Highlighter from "react-highlight-words";
import axios from "axios";
import { API_BASE } from "../config/api";
import "./extractdata.css";

const ExtractData = ({ theme }) => {
  const { RangePicker } = DatePicker;

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
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    // initial auto-load
    handleGenerateClick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    filterDropdownProps: {
      onOpenChange: (open) => {
        if (open) setTimeout(() => searchInput.current?.select(), 100);
      },
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
      }

      const { data: newData } = await axios.get(`${API_BASE}/extract-province-data`, {
        params: Object.fromEntries(queryParams),
        withCredentials: true,
      });

      if (Array.isArray(newData)) {
        setData(newData);
        message.success(`Loaded ${newData.length} record(s)`);
      } else {
        message.error("Invalid data format. Expected an array.");
        setData([]);
      }
    } catch (error) {
      console.error(error);
      message.error(error?.message || "Failed to load extract data");
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const exportCsv = () => {
    if (!data?.length) return message.info("No data to export");
    const keys = Array.from(
      data.reduce((set, row) => {
        Object.keys(row || {}).forEach((k) => set.add(k));
        return set;
      }, new Set(["id_no", "name", "title", "industry_type", "province"]))
    );
    const escape = (v) => {
      if (v === null || v === undefined) return "";
      const s = String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const header = keys.join(",");
    const lines = data.map((row) => keys.map((k) => escape(row[k])).join(","));
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const prov = selectedProvince === "All" ? "ALL" : selectedProvince.replace(/\s+/g, "-");
    const dateTag = dateRange?.length === 2 && dateRange[0] && dateRange[1]
      ? `${dateRange[0].format("YYYYMMDD")}-${dateRange[1].format("YYYYMMDD")}`
      : "all-dates";
    a.href = url;
    a.download = `extract-${prov}-${dateTag}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
      <div className={`container ${theme === 'dark' ? 'dark' : 'light'}`}>
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
              options={provinces}
            />
            <Button
              type="primary"
              className="button-gen"
              onClick={handleGenerateClick}
              disabled={loading}
            >
              Generate
            </Button>
            <Tooltip title="Export data">
              <Button type="primary" className="button-export" onClick={exportCsv} disabled={!data?.length}>
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
          pagination={{
            current: currentPage,
            pageSize,
            total: data.length,
            showSizeChanger: true,
            pageSizeOptions: ["10", "20", "50", "100"],
            onChange: (page, ps) => { setCurrentPage(page); setPageSize(ps); },
            showTotal: (t, range) => `${range[0]}-${range[1]} of ${t}`,
          }}
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
  );
};

export default ExtractData;
