import { useState, useEffect } from "react";
import { Avatar, Table, Input, Button, Select, Popover, List } from "antd";
import {
  SearchOutlined,
  DownloadOutlined,
  PlusOutlined,
  EllipsisOutlined,
  UserOutlined
} from "@ant-design/icons";
import axios from "axios";
import "./useraccount.css";
import UserProfileModal from "./UserAccountModal";

const { Option } = Select;

const UserAccounts = () => {
  const [userData, setUserData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [popoverVisible, setPopoverVisible] = useState(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
  });


  const fetchUserData = async () => {
    try {
      const response = await axios.get("http://localhost:8081/api/users", {
        params: {
          page: pagination.current,
          pageSize: pagination.pageSize,
        },
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching user data:", error);
      return [];
    }
  };

  const fetchLoginStatus = async () => {
    try {
      const response = await axios.get("http://localhost:8081/api/online_users");
      const allStatuses = response.data.onlineUsers;

      // Extract the latest status for each user based on the name
      const latestStatuses = allStatuses.reduce((acc, status) => {
        if (!acc[status.name] || new Date(status.loginTime) > new Date(acc[status.name].loginTime)) {
          acc[status.name] = status;
        }
        return acc;
      }, {});

      return latestStatuses;
    } catch (error) {
      console.error("Error fetching login status:", error);
      return {};
    }
  };

  const getOfflineStatus = (logoutTime) => {
    const logoutDate = new Date(logoutTime);
    const currentDate = new Date();
    const diffMs = currentDate - logoutDate;
    const diffHrs = diffMs / (1000 * 60 * 60);

    if (diffHrs < 12) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffHrs);
      if (diffMins < 60) {
        return `active ${diffMins} min ago`;
      } else {
        return `active ${diffHours} hr ago`;
      }
    } else {
      return 'offline';
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [users, loginStatuses] = await Promise.all([fetchUserData(), fetchLoginStatus()]);

        const combinedData = users.map(user => {
          const status = loginStatuses[user.name];
          if (status && status.isLoggedIn) {
            return { ...user, status: 'online' };
          } else if (status) {
            return { ...user, status: getOfflineStatus(status.logoutTime) };
          } else {
            return { ...user, status: 'offline' }; // Default to 'offline' if no status found
          }
        });

        const sortedData = combinedData.sort((a, b) => {
          if (a.status === 'online' && b.status !== 'online') {
            return -1;
          }
          if (a.status !== 'online' && b.status === 'online') {
            return 1;
          }
          return 0;
        });

        setUserData(sortedData);
        setPagination(prev => ({
          ...prev,
          total: sortedData.length,
        }));
      } catch (error) {
        console.error("Error fetching data:", error);
      }
      setLoading(false);
    };

    fetchData();
  }, [pagination.current, pagination.pageSize]);


  const columns = [
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
      ellipsis: true,
      render: (name, record) => (
        <div style={{ display: "flex", alignItems: "center" }}>
          {record.avatar ? (
            <Avatar src={record.avatar} />
          ) : (
            <Avatar icon={<UserOutlined />} style={{ backgroundColor: '#87d068' }}>{name.charAt(0)}</Avatar>
          )}
          <span style={{ marginLeft: "8px" }}>{name}</span>
        </div>
      ),
    },
    {
      title: "Email Address",
      dataIndex: "email",
      key: "email",
      ellipsis: true,
    },
    {
      title: "Designation/Position",
      dataIndex: "designation",
      key: "designation",
      ellipsis: true,
    },
    {
      title: "Permission",
      dataIndex: "permission",
      key: "permission",
      ellipsis: true,
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: status => (
        <span style={{ color: status === 'online' ? 'green' : status.includes('active') ? 'orange' : 'red' }}>
        {status}
      </span>
      ),
    },
    {
      title: "Action",
      dataIndex: "action",
      key: "action",
      render: (_, record) => (
        <Popover
          content={
            <List>
              <List.Item>
                <Button type="text" size="small" onClick={() => handleEdit(record)}>Edit Profile</Button>
              </List.Item>
              <List.Item>
                <Button type="text" size="small">Evaluate</Button>
              </List.Item>
            </List>
          }
          trigger="click"
          //visible={popoverVisible}
          //onVisibleChange={setPopoverVisible}
        >
          <Button icon={<EllipsisOutlined />} />
        </Popover>
      ),
    },
  ];

  const handlePaginationChange = (pagination) => {
    setPagination(pagination);
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

  const handleEdit = (record) => {
    setSelectedUser(record);
    setIsModalVisible(true);
    setPopoverVisible(false);
  };

  const handleModalCancel = () => {
    setSelectedUser(null);
    setIsModalVisible(false); // Hide the modal
  };

  return (
    <div className="user-accounts-container">
      <h2 className="user-title">User Accounts</h2>
      <div className="filter-options">
        <div className="filter-input">
          <Input
            placeholder="Search Users"
            allowClear
            prefix={<SearchOutlined />}
            size="medium"
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
          showSizeChanger: true,
          pageSizeOptions: ["10", "50", "100"]
         }}
        loading={loading}
        onChange={handlePaginationChange}
      />
      <UserProfileModal
        user={selectedUser}
        visible={isModalVisible}
        onCancel={handleModalCancel}
      />
    </div>
  );
};

export default UserAccounts;
