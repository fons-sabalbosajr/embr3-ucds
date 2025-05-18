import React, { useState, useEffect, useMemo } from "react";
import {
  Modal,
  Table,
  Spin,
  Tag,
  Tooltip,
  Input,
  Button,
  Space,
  Select,
  Pagination,
  message,
} from "antd";
import {
  SearchOutlined,
  EditOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import {
  storeData,
  getCachedData,
  isCacheExpired,
} from "../../../data/utils/indexedDB";
import axios from "axios";

const { Option } = Select;

const permitTypes = ["PTO", "WWDP", "PCO"];
const tagColorMap = {
  PTO: "green",
  WWDP: "blue",
  PCO: "orange",
};
const idPrefixes = [
  { label: "Aurora", value: "AU" },
  { label: "Bataan", value: "BA" },
  { label: "Bulacan", value: "BU" },
  { label: "Nueva Ecija", value: "NE" },
  { label: "Pampanga", value: "PA" },
  { label: "Tarlac", value: "TA" },
  { label: "Zambales", value: "ZA" },
];

const PermitMonitoringModal = ({ visible, onClose, provinceAccess }) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [permitsFilter, setPermitsFilter] = useState(null);
  const [idPrefixFilter, setIdPrefixFilter] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [isReloading, setIsReloading] = useState(false);
  const [selectedPrefixes, setSelectedPrefixes] = React.useState([]);
  const [page, setPage] = React.useState(1);
  const [totalCount, setTotalCount] = React.useState(0);

  const fetchPermits = React.useCallback(async () => {
    try {
      const prefixQuery = selectedPrefixes.join(","); // convert array to CSV string

      const res = await fetch(
        `http://localhost:8081/api/permits-summary?page=${page}&pageSize=${pageSize}&prefixes=${prefixQuery}`
      );
      if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);

      const json = await res.json();

      setData(json.data);
      setTotalCount(json.total);
    } catch (err) {
      console.error("Error fetching permits:", err);
    }
  }, [page, pageSize, selectedPrefixes]);

  useEffect(() => {
    if (visible) {
      fetchPermits();
    }
  }, [
    visible,
    currentPage,
    pageSize,
    searchText,
    permitsFilter,
    idPrefixFilter,
  ]);

  const filteredData = React.useMemo(() => {
    if (!searchText.trim()) return data;

    const lowerSearch = searchText.toLowerCase();

    return data.filter(
      (item) =>
        (item.id_no && item.id_no.toLowerCase().includes(lowerSearch)) ||
        (item.title && item.title.toLowerCase().includes(lowerSearch))
    );
  }, [data, searchText]);

  const getColumnSearchProps = (dataIndex, placeholder) => ({
    filterDropdown: ({
      setSelectedKeys,
      selectedKeys,
      confirm,
      clearFilters,
    }) => (
      <div style={{ padding: 8 }}>
        <Input
          placeholder={placeholder}
          value={selectedKeys[0]}
          onChange={(e) =>
            setSelectedKeys(e.target.value ? [e.target.value] : [])
          }
          onPressEnter={() => confirm()}
          style={{ width: 188, marginBottom: 8, display: "block" }}
        />
        <Space>
          <Button
            type="primary"
            onClick={() => confirm()}
            size="small"
            style={{ width: 90 }}
          >
            Search
          </Button>
          <Button
            onClick={() => clearFilters()}
            size="small"
            style={{ width: 90 }}
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
  });

  const handlePageChange = (page, size) => {
    setCurrentPage(page);
    setPageSize(size);
  };

  const handlePageSizeChange = (current, size) => {
    setPageSize(size);
    setCurrentPage(1); // Reset to the first page when page size changes
  };

  const handleReload = async () => {
    setIsReloading(true);
    const hide = message.loading("Refreshing data...", 0);
    try {
      await fetchPermits();
      message.success("Permit data updated.");
    } catch (error) {
      message.error("Failed to reload data.");
    } finally {
      hide();
      setIsReloading(false);
    }
  };

  const columns = [
    {
      title: "ID No",
      dataIndex: "id_no",
      key: "id_no",
      align: "left",
      width: 75,
      sorter: (a, b) => {
        const [prefixA, numA] = a.id_no.split("-");
        const [prefixB, numB] = b.id_no.split("-");
        if (prefixA === prefixB) {
          return parseInt(numA, 10) - parseInt(numB, 10); // Compare numeric parts
        }
        return prefixA.localeCompare(prefixB); // Compare prefixes alphabetically
      },
      filterDropdown: () => (
        <Select
          allowClear
          placeholder="Filter by prefix"
          style={{ width: 160 }}
          onChange={(val) => setIdPrefixFilter(val)}
          value={idPrefixFilter}
        >
          {idPrefixes.map(({ label, value }) => (
            <Option key={value} value={value}>
              {label}
            </Option>
          ))}
        </Select>
      ),
      filterIcon: () => <SearchOutlined />,
      // Assuming getColumnSearchProps is a function to handle search logic
      ...getColumnSearchProps("id_no", "Search ID No"),
    },
    {
      title: "Project Title",
      dataIndex: "title",
      key: "title",
      align: "left",
      width: 200,
      ...getColumnSearchProps("title", "Search Title"),
    },
    {
      title: "ECC/CNC Reference No",
      dataIndex: "ecc_cnc",
      key: "ecc_cnc",
      align: "left",
      width: 200,
      ...getColumnSearchProps("ecc_cnc", "Search ECC/CNC"),
    },
    {
      title: "Permits Expired",
      dataIndex: "permits",
      key: "permits",
      align: "center",
      width: 160,
      filters: permitTypes.map((p) => ({ text: p, value: p })),
      onFilter: (value, record) => record.permits.some((p) => p.type === value), // Filtering across all permits
      render: (permits) =>
        permits.map((p) => {
          const now = new Date();
          const expiryDate = new Date(p.expiry);
          const isExpired = expiryDate < now;
          const isNearExpiry =
            !isExpired && (expiryDate - now) / (1000 * 60 * 60 * 24) <= 30;

          const tagColor = isExpired
            ? "red"
            : isNearExpiry
            ? "orange"
            : "green";

          const tooltipText = isExpired
            ? `Permit has expired on ${expiryDate.toLocaleDateString()}`
            : isNearExpiry
            ? `Permit will be expired on ${expiryDate.toLocaleDateString()}`
            : `Permit is valid until ${expiryDate.toLocaleDateString()}`;

          return (
            <Tooltip key={p.type} title={tooltipText}>
              <Tag color={tagColor}>{p.type}</Tag>
            </Tooltip>
          );
        }),
    },
    {
      title: "Action",
      key: "action",
      align: "center",
      width: 80,
      render: (_, record) => (
        <Tooltip title="Update">
          <Button
            type="primary"
            icon={<EditOutlined />}
            size="small"
            onClick={() => alert(`Update clicked for ${record.id_no}`)}
            style={{
              backgroundColor: "#1890ff",
              borderColor: "#1890ff",
              color: "#fff",
            }}
          />
        </Tooltip>
      ),
    },
  ];

  return (
    <Modal
      title="Permit Monitoring"
      open={visible}
      onCancel={onClose}
      footer={null}
      width={1000}
      style={{ maxHeight: "75vh", overflow: "hidden" }}
    >
      {/* Header controls */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        {/* Search */}
        <Input
          placeholder="Search ID No or Title"
          prefix={<SearchOutlined />}
          allowClear
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{ maxWidth: 300 }}
        />
        <Button
          type="default"
          icon={<ReloadOutlined />}
          loading={isReloading}
          onClick={handleReload}
          style={{
            borderColor: "#1890ff",
            color: "#1890ff",
            fontWeight: "bold",
          }}
        >
          Reload
        </Button>

        {/* Pagination Controls */}
        <Pagination
          current={currentPage}
          pageSize={pageSize}
          total={total}
          showSizeChanger
          pageSizeOptions={["10", "20", "50", "100"]}
          onChange={handlePageChange}
          onShowSizeChange={handlePageSizeChange}
          size="small"
          showTotal={(total, range) =>
            `${range[0]}-${range[1]} of ${total} items`
          }
        />
      </div>

      {/* Table */}
      <Spin spinning={loading} tip="Loading permits..." size="small">
        <Table
          dataSource={filteredData}
          columns={columns}
          rowKey="id_no"
          bordered
          size="small"
          pagination={false}
          scroll={{ x: "max-content", y: "500px" }}
        />
      </Spin>
    </Modal>
  );
};

export default PermitMonitoringModal;
