import { useState, useEffect } from "react";
import { Table, Input, Button, Select } from "antd";
import {
  SearchOutlined,
  DownloadOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import axios from "axios";
import "./useraccount.css";

const { Option } = Select;

const UserAccounts = () => {
  const [userData, setUserData] = useState([]);
  const [loading, setLoading] = useState(false);
  
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
  });

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const response = await axios.get("http://localhost:8081/api/users", {
          params: {
            page: pagination.current,
            pageSize: pagination.pageSize,
          },
        });
        setUserData(response.data);
        setPagination({
          ...pagination,
          total: response.headers["x-total-count"],
        });
      } catch (error) {
        console.error("Error fetching user data:", error);
      }
    };

    fetchUserData();
  }, []);

  // Define columns for the table
  const columns = [
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
    },
    {
      title: "Email Address",
      dataIndex: "email",
      key: "email",
    },
    {
      title: "Designation",
      dataIndex: "designation",
      key: "designation",
    },
    {
      title: "Position",
      dataIndex: "position",
      key: "position",
    },
    {
      title: "Permission",
      dataIndex: "permission",
      key: "permission",
    },
    {
      title: "Action",
      dataIndex: "action",
      key: "action",
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
    },
  ];

  const handlePaginationChange = (newPagination) => {
    setPagination(newPagination);
  };

  const handleSearch = (value) => {
    console.log("Search:", value);
  };

  const handlePermissionChange = (value) => {
    console.log("Permission Filter:", value);
  };

  const handleExport = () => {
    console.log("Exporting...");
  };

  const handleAddUser = () => {
    console.log("Adding new user...");
  };

  const handlePageSizeChange = (value) => {
    setPagination({
      ...pagination,
      pageSize: value,
    });
  }

  return (
    <div className="user-accounts-container">
      <h2 className="user-title">User Accounts</h2>
      <div className="filter-options">
        <div className="filter-input">
          <Input
            placeholder="Search Users"
            allowClear
            prefix={<SearchOutlined />} // Replace enter button with search icon
            size="medium" // Set the size to large
            onSearch={handleSearch}
            className="search-filter"
          />
          <Select
            defaultValue="All Permissions"
            style={{ width: 150 }}
            onChange={handlePermissionChange}
          >
            <Option value="all">All Permissions</Option>
            {/* Add other permission options */}
          </Select>
        </div>
        <div className="action-buttons">
          <Button
            type="text"
            className="export"
            icon={<DownloadOutlined />}
            onClick={handleExport}
          >
            Export
          </Button>
          <Button
            type="primary"
            className="add-user"
            icon={<PlusOutlined />}
            onClick={handleAddUser}
          >
            Add User
          </Button>
        </div>
      </div>
      <Table
        columns={columns}
        dataSource={userData}
        pagination={{
          ...pagination,
          showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
        }}
        loading={loading}
        onChange={handlePaginationChange}
      />
      <Select defaultValue={pagination.pageSize} onChange={handlePageSizeChange}>
          {[10, 20, 50, 100].map((pageSize) => (
            <Option key={pageSize} value={pageSize}>{pageSize}</Option>
          ))}
        </Select>
    </div>
  );
};

export default UserAccounts;
