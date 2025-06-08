import React, { useState, useEffect, useCallback, useMemo } from "react";
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
  const [debouncedSearchText, setDebouncedSearchText] = useState("");
  const [selectedPermitTypes, setSelectedPermitTypes] = useState([]); // For client-side "Permits Status" filter
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [isReloading, setIsReloading] = useState(false);
  const [selectedPrefixes, setSelectedPrefixes] = useState([]);
  const [clientSideColumnFilters, setClientSideColumnFilters] = useState({});
  const [editingPermitKey, setEditingPermitKey] = useState(null); // e.g., "AU-00001_PTO"
  const [editingPermitDate, setEditingPermitDate] = useState(""); // YYYY-MM-DD format
  const [editingPermitCodeValue, setEditingPermitCodeValue] = useState(""); // New state for the code

  // Debounce search text
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchText(searchText);
      setCurrentPage(1); // Reset to page 1 on new search
    }, 500); // 500ms delay

    return () => {
      clearTimeout(handler);
    };
  }, [searchText]);

  const fetchPermits = useCallback(async () => {
    if (!visible) return;
    setLoading(true);
    try {
      const alwaysFilterByExpiryOnServer = true;
      const prefixQuery = selectedPrefixes.join(",");
      const permitTypesQuery = selectedPermitTypes.join(","); // Get selected permit types

      const res = await fetch(
        `http://localhost:8081/api/permits-summary?page=${currentPage}&pageSize=${pageSize}&prefixes=${prefixQuery}&searchText=${debouncedSearchText}&filterEstablishmentsByExpiryStatus=${alwaysFilterByExpiryOnServer}&permitTypesFilter=${permitTypesQuery}`
      );
      if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);

      const json = await res.json();

      setData(json.data);
      setTotal(json.total);
    } catch (err) {
      console.error("Error fetching permits:", err);
      message.error("Failed to fetch permits.");
      setData([]); // Clear data on error
      setTotal(0);   // Reset total on error
    } finally {
      setLoading(false);
      setIsReloading(false);
    }
  }, [visible, currentPage, pageSize, selectedPrefixes, debouncedSearchText, selectedPermitTypes]); // Added selectedPermitTypes


  useEffect(() => {
    if (visible) {
      fetchPermits();
    }
  }, [visible, fetchPermits]);

  // Simplified getColumnSearchProps, primarily for UI consistency if needed, actual search is server-side
  const getColumnSearchProps = (dataIndex, placeholderText) => ({
    filterDropdown: ({
      setSelectedKeys,
      selectedKeys,
      confirm,
      clearFilters,
    }) => (
      <div style={{ padding: 8 }}>
        <Input
          placeholder={placeholderText}
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
            onClick={() => {
              clearFilters();
              confirm(); // Apply the cleared filter
            }}
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
    filteredValue: clientSideColumnFilters[dataIndex] ? [clientSideColumnFilters[dataIndex]] : null,
  });

  const handlePageChange = (page, size) => {
    setCurrentPage(page);
    if (size && pageSize !== size) {
      setPageSize(size);
    }
  };

  const handleTableChange = (pagination, filters, sorter) => {
    const newSelectedPermitTypes = filters.permits || [];
    if (JSON.stringify(newSelectedPermitTypes) !== JSON.stringify(selectedPermitTypes)) {
      setSelectedPermitTypes(newSelectedPermitTypes);
      setCurrentPage(1); // Reset page when permit type filter changes
    }
    const newClientFilters = { title: filters.title?.[0], ecc_cnc: filters.ecc_cnc?.[0] };
    setClientSideColumnFilters(newClientFilters);
  };

  const handlePageSizeChange = (current, size) => {
    setPageSize(size);
    setCurrentPage(1);
  };

  const handleEditPermit = (record, permit) => {
    setEditingPermitKey(`${record.sort_key}_${permit.type}`);
    const expiry = new Date(permit.expiry);
    // Format for <input type="date" /> which expects YYYY-MM-DD
    setEditingPermitDate(expiry.toISOString().split('T')[0]);
    setEditingPermitCodeValue(permit.code || "");
  };

  const handleCancelEdit = () => {
    setEditingPermitKey(null);
    setEditingPermitDate("");
    setEditingPermitCodeValue(""); // Reset code value
  };

  const handleSavePermit = async (record, permitType) => {
    if (!editingPermitDate) {
      message.error("Expiry date cannot be empty.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`http://localhost:8081/api/permits-summary/update-expiry`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sort_key: record.sort_key,
          permitType: permitType,
          newExpiryDate: editingPermitDate, // Send as YYYY-MM-DD
          newPermitCode: editingPermitCodeValue,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP error! Status: ${response.status}`);
      }
      message.success("Permit expiry updated successfully.");
      setEditingPermitKey(null);
      setEditingPermitDate("");
      setEditingPermitCodeValue("");
      fetchPermits(); // Refetch data to show updated information
    } catch (err) {
      console.error("Error saving permit expiry:", err);
      message.error(`Failed to update permit: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: "ID No",
      dataIndex: "sort_key",
      key: "sort_key",
      align: "left",
      width: 75,
      sorter: (a, b) => {
        const [prefixA, numAStr] = (a.sort_key || "").split("-");
        const [prefixB, numBStr] = (b.sort_key || "").split("-");
        const numA = parseInt(numAStr, 10);
        const numB = parseInt(numBStr, 10);
        if (prefixA === prefixB) {
          return (isNaN(numA) ? 0 : numA) - (isNaN(numB) ? 0 : numB);
        }
        return prefixA.localeCompare(prefixB);
      },
      filterDropdown: () => (
        <Select
          mode="multiple"
          allowClear
          placeholder="Filter by prefix"
          style={{ width: 200, padding: 8 }}
          value={selectedPrefixes}
          onChange={(values) => {
            setSelectedPrefixes(values);
            setCurrentPage(1); // Reset to page 1 on filter change
          }}

        >
          {idPrefixes.map(({ label, value }) => (
            <Option key={value} value={value}>
              {label} ({value})
            </Option>
          ))}
        </Select>
      ),
      filterIcon: () => <SearchOutlined style={{ color: selectedPrefixes.length > 0 ? "#1890ff" : undefined }} />,
    },
    {
      title: "Project Title",
      dataIndex: "title",
      key: "title",
      align: "left",
      width: 200,
      ...getColumnSearchProps("title", "Search Project Title"),
    },
    {
      title: "ECC/CNC Reference No",
      dataIndex: "ecc_cnc",
      key: "ecc_cnc",
      align: "left",
      width: 200,
      ...getColumnSearchProps("ecc_cnc", "Search ECC/CNC No."),
    },
    {
      title: "Permits Expired",
      dataIndex: "permits",
      key: "permits",
      align: "center",
      width: 160,
      filters: permitTypes.map((p) => ({ text: p, value: p })),
      filteredValue: selectedPermitTypes,
      render: (permitsArray = []) => {
        // Filter out permits not in selected types (for rendering only)
        let permitsToDisplay = selectedPermitTypes.length
          ? permitsArray.filter((p) => selectedPermitTypes.includes(p.type))
          : permitsArray;

        return permitsToDisplay.length > 0 ? (
          permitsToDisplay.map((p, i) => {
            const expiryDate = new Date(p.expiry);
            const tagColor = p.isExpired
              ? "red"
              : p.isNearExpiry
                ? "yellow"
                : "green";

            const tooltipText = p.isExpired
              ? `Permit has expired on ${expiryDate.toLocaleDateString()}`
              : p.isNearExpiry
                ? `Permit will be expired on ${expiryDate.toLocaleDateString()}`
                : `Permit is valid until ${expiryDate.toLocaleDateString()}`;

            return (
              <Tooltip key={`${p.type}-${i}`} title={tooltipText}>
                <Tag color={tagColor}>{p.type}</Tag>
              </Tooltip>
            );
          })
        ) : (
          <Tag color="default">—</Tag>
        );
      },
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
        <div style={{ display: 'flex', alignItems: 'center', flexGrow: 1 }}>
          <Input
            placeholder="Search ID, Title, ECC/CNC..."
            prefix={<SearchOutlined />}
            allowClear
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ maxWidth: 300, marginRight: 8 }} // Added marginRight
          />
          <span style={{ fontSize: '11px', color: '#888' }}> {/* Reduced font size and removed marginLeft */}
            {loading ? 'Searching...' : `Total permits found: ${total}`}
          </span>
        </div>
        {/* Pagination Controls */}
        <Pagination
          simple
          current={currentPage}
          pageSize={pageSize}
          total={total}
          showSizeChanger
          pageSizeOptions={["10", "20", "50", "100"]}
          onChange={handlePageChange}
          onShowSizeChange={handlePageSizeChange}
          size="small"

        />
      </div>

      {/* Table */}
      <Spin spinning={loading} tip="Loading permits..." size="small">
        <Table
          dataSource={data}
          columns={columns}
          rowKey="sort_key" // Assuming sort_key is unique and what API returns
          bordered
          size="small"
          pagination={false}
          scroll={{ x: "max-content", y: "500px" }}
          onChange={handleTableChange}
          locale={{
            emptyText: loading ? 'Loading data...' : 'No permits found.',
          }}
          expandable={{
            expandedRowRender: record => (
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {record.permits?.map(p => {
                  const expiryDate = new Date(p.expiry);
                  // Format date as MM/DD/YYYY
                  const formattedDate = `${String(expiryDate.getMonth() + 1).padStart(2, '0')}/${String(expiryDate.getDate()).padStart(2, '0')}/${expiryDate.getFullYear()}`;
                  return (
                    <li
                      key={`${p.type}-${p.expiry}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '4px 0',
                        justifyContent: 'center',
                        fontSize: '11px' // Reduced font size
                      }}
                    >
                      {editingPermitKey === `${record.sort_key}_${p.type}` ? (
                        <>
                          <span style={{ minWidth: '70px', textAlign: 'right', marginRight: '5px' }}>{p.type} Code:</span>
                          <Input
                            value={editingPermitCodeValue}
                            onChange={(e) => setEditingPermitCodeValue(e.target.value)}
                            size="small"
                            style={{ width: '150px', marginRight: '10px' }}
                            placeholder="Permit Code"
                          />
                          <span style={{ minWidth: '50px', textAlign: 'right', marginRight: '5px' }}>Expiry:</span>
                          <Input
                            type="date"
                            value={editingPermitDate}
                            onChange={(e) => setEditingPermitDate(e.target.value)}
                            size="small"
                            style={{ width: '130px', marginRight: '8px' }}
                          />
                          <Space>
                            <Button
                              type="primary"
                              size="small"
                              onClick={() => handleSavePermit(record, p.type)}
                              loading={loading && editingPermitKey === `${record.sort_key}_${p.type}`}
                            >
                              Save
                            </Button>
                            <Button size="small" onClick={handleCancelEdit}>
                              Cancel
                            </Button>
                          </Space>
                        </>
                      ) : (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>

                            <span style={{ flexGrow: 1 }}>
                              {p.type} {p.code ? `(${p.code})` : ''} - {formattedDate}
                            </span>
                            <Space>
                              <Button
                                size="small"
                                type="primary"
                                onClick={() => handleEditPermit(record, p)}
                              >
                                Edit
                              </Button>
                            </Space>
                          </div>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            ),
          }}
        />
      </Spin>
    </Modal>
  );
};

export default PermitMonitoringModal;
