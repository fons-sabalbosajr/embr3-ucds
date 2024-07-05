import { useState, useEffect } from "react";
import { Avatar, Table, Input, Button, Select, Popover, List, Tag } from "antd";
import {
  SearchOutlined,
  DownloadOutlined,
  PlusOutlined,
  EllipsisOutlined,
  UserOutlined,
  CloseCircleOutlined,
  CameraOutlined
} from "@ant-design/icons";
import axios from "axios";
import "./useraccount.css";
import UserProfileModal from "./UserAccountModal";
import SignAccountModal from "./SignAccountModal";
import Swal from "sweetalert2";
import NiceAvatar from "react-nice-avatar";
import AvatarWithName from "../components/AvatarwithName";

const { Option } = Select;

const UserAccounts = () => {
  const [userData, setUserData] = useState([]);
  const [filteredUserData, setFilteredUserData] = useState([]);
  const [signUpUsers, setSignUpUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingSignUp, setLoadingSignUp] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [popoverVisible, setPopoverVisible] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [selectedPermission, setSelectedPermission] = useState("all");
  const [selectedSignUpUser, setSelectedSignUpUser] = useState(null);
  const [isSignUpModalVisible, setIsSignUpModalVisible] = useState(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
  });


  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await axios.get("http://localhost:8081/api/users", {
        params: {
          page: pagination.current,
          pageSize: pagination.pageSize,
        },
      });
      setUserData(response.data);
      setPagination((prev) => ({
        ...prev,
        total: response.data.length,
      }));
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [pagination.current, pagination.pageSize]);

  useEffect(() => {
    const uniquePermissions = new Set();
    userData.forEach((user) => {
      if (user.permission) {
        uniquePermissions.add(user.permission);
      }
    });
    setPermissions(Array.from(uniquePermissions));
  }, [userData]);

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

  const fetchSignUpUsers = async () => {
    try {
      const response = await axios.get("http://localhost:8081/api/sign-up", {
        params: {
          page: pagination.current,
          pageSize: pagination.pageSize,
        },
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching sign-up users:", error);
      return [];
    }
  };

  const fetchLoginStatus = async () => {
    try {
      const response = await axios.get(
        "http://localhost:8081/api/online_users"
      );
      const allStatuses = response.data.onlineUsers;

      // Extract the latest status for each user based on the name
      const latestStatuses = allStatuses.reduce((acc, status) => {
        if (
          !acc[status.name] ||
          new Date(status.loginTime) > new Date(acc[status.name].loginTime)
        ) {
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
      return "offline";
    }
  };

  useEffect(() => {
    const uniquePermissions = new Set();
    userData.forEach((user) => {
      if (user.permission) {
        uniquePermissions.add(user.permission);
      }
    });
    setPermissions(Array.from(uniquePermissions));
  }, [userData]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setLoadingSignUp(true);
      try {
        const [users, loginStatuses, signUpUsersData] = await Promise.all([
          fetchUserData(),
          fetchLoginStatus(),
          fetchSignUpUsers(),
        ]);

        const combinedData = users.map((user) => {
          const status = loginStatuses[user.name];
          if (status && status.isLoggedIn) {
            return { ...user, status: "online" };
          } else if (status) {
            return { ...user, status: getOfflineStatus(status.logoutTime) };
          } else {
            return { ...user, status: "offline" }; // Default to 'offline' if no status found
          }
        });

        const sortedData = combinedData.sort((a, b) => {
          if (a.status === "online" && b.status !== "online") {
            return -1;
          }
          if (a.status !== "online" && b.status === "online") {
            return 1;
          }
          return 0;
        });

        setUserData(sortedData);
        setSignUpUsers(signUpUsersData);
        setPagination((prev) => ({
          ...prev,
          total: sortedData.length,
        }));
      } catch (error) {
        console.error("Error fetching data:", error);
      }
      setLoading(false);
      setLoadingSignUp(false);
    };

    fetchData();
  }, [pagination.current, pagination.pageSize]);

  const columns = [
    {
      title: "Name",
      dataIndex: "name", // Assuming `name` is a field in your data
      key: "avatarName",
      render: (name, record) => (
        <AvatarWithName avatar={record.avatar} name={name} />
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
      dataIndex: "division",
      key: "division",
      ellipsis: true,
    },
    {
      title: "Permission",
      dataIndex: "permission",
      key: "permission",
      ellipsis: true,
      render: (permission) => {
        let color = "";
        switch (permission) {
          case "viewer":
            color = "#FBA834"; // Light Green
            break;
          case "contributor":
            color = "#387ADF"; // Dark Yellow
            break;
          case "admin":
            color = "#333A73"; // Orange
            break;
          case "developer":
            color = "#800000"; // Maroon
            break;
          default:
            color = "gray"; // Default color
        }
        return (
          <span
            style={{
              backgroundColor: color,
              color: "white",
              padding: "4px 8px",
              borderRadius: "4px",
              display: "inline-block",
              fontSize: 12,
            }}
          >
            {permission}
          </span>
        );
      },
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status) => {
        let color = "";
        switch (status) {
          case "online":
            color = "green";
            break;
          case "offline":
            color = "red";
            break;
          default:
            color = "gray";
            break;
        }
        return (
          <span
            style={{
              backgroundColor: color,
              color: "white",
              padding: "4px 8px",
              borderRadius: "4px",
              display: "inline-block",
              fontSize: 12,
            }}
          >
            {status}
          </span>
        );
      },
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
                <Button
                  type="text"
                  size="small"
                  onClick={() => handleEdit(record)}
                >
                  Edit Profile
                </Button>
              </List.Item>
              <List.Item>
                <Button type="text" size="small">
                  Evaluate
                </Button>
              </List.Item>
            </List>
          }
          placement="rightTop" // Placement of the popover
        >
          <Button icon={<EllipsisOutlined />} />
        </Popover>
      ),
    },
  ];

  const columnsSignup = [
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
            <Avatar
              icon={<UserOutlined />}
              style={{ backgroundColor: "#87d068" }}
            >
              {name.charAt(0)}
            </Avatar>
          )}
          <span style={{ marginLeft: "8px" }}>{name}</span>
        </div>
      ),
    },
    {
      title: "Division",
      dataIndex: "division",
      key: "division",
      ellipsis: true,
    },
    {
      title: "Position",
      dataIndex: "position",
      key: "position",
      ellipsis: true,
    },
    {
      title: "Email",
      dataIndex: "email",
      key: "email",
      ellipsis: true,
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status, record) => {
        const handleChangeStatus = async (value) => {
          if (value === status) return; // No change

          const result = await Swal.fire({
            title: "Confirm Status Change",
            text: `Are you sure you want to change status to '${value}'?`,
            icon: "question",
            showCancelButton: true,
            confirmButtonText: "Yes",
            cancelButtonText: "No",
          });

          if (result.isConfirmed) {
            // Call backend API to update status
            try {
              const response = await axios.put(
                `http://localhost:8081/api/status/${record._id}`,
                { status: value }
              );
              if (
                response.data.message ===
                "Status updated successfully in sign-up collection"
              ) {
                Swal.fire({
                  icon: "success",
                  title: "Success!",
                  text: "Status updated successfully.",
                });
                // You can update your local data or fetch fresh data as needed
              } else {
                Swal.fire({
                  icon: "error",
                  title: "Error!",
                  text: "Failed to update status.",
                });
              }
            } catch (error) {
              console.error("Error updating status:", error);
              Swal.fire({
                icon: "error",
                title: "Error!",
                text: "Failed to update status. Please try again later.",
              });
            }
          }
        };

        return (
          <Select
            defaultValue={status}
            style={{ width: 120 }}
            onChange={handleChangeStatus}
          >
            <Option value="pending">
              <Tag color="orange">Pending</Tag>
            </Option>
            <Option value="approved">
              <Tag color="green">Approved</Tag>
            </Option>
            <Option value="rejected">
              <Tag color="red">Rejected</Tag>
            </Option>
          </Select>
        );
      },
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
                <Button
                  type="text"
                  size="small"
                  onClick={() => handleViewSignUpUser(record)}
                >
                  Approve
                </Button>
              </List.Item>
              <List.Item>
                <Button type="text" size="small">
                  Disapproved
                </Button>
              </List.Item>
            </List>
          }
          placement="rightTop" // Placement of the popover
        >
          <Button icon={<EllipsisOutlined />} />
        </Popover>
      ),
    },
  ];

  const handlePaginationChange = (pagination) => {
    setPagination(pagination);
  };

  const handlePermissionChange = (value) => {
    setSelectedPermission(value); // Set selected permission
  };

  const handleSearch = (value) => {
    console.log("Search:", value);
    filterAndSetData(selectedPermission, value); // Filter data based on selected permission and search value
  };

  // Function to filter data based on permission and search value
  const filterAndSetData = (permission, searchValue = "") => {
    const filteredData = userData.filter(
      (user) =>
        (permission === "all" || user.permission === permission) &&
        (user.name.toLowerCase().includes(searchValue.toLowerCase()) ||
          user.email.toLowerCase().includes(searchValue.toLowerCase()) ||
          (user.designation &&
            user.designation.toLowerCase().includes(searchValue.toLowerCase())))
    );
    setFilteredUserData(filteredData);
  };

  const handleViewSignUpUser = (record) => {
    setSelectedSignUpUser(record);
    setIsSignUpModalVisible(true);
  };

  const handleExport = () => {
    console.log("Exporting...");
  };

  const handleAddUser = () => {
    console.log("Adding new user...");
  };

  const handleEvaluate = () => {
    // Your evaluate function here
    setPopoverVisible(null); // Close the popover
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

  const handleSignUpModalCancel = () => {
    setSelectedSignUpUser(null);
    setIsSignUpModalVisible(false);
  };

  const rowClassName = (record) => {
    if (record.status === "approved") {
      return "disabled-row"; // CSS class to apply to disabled rows
    }
    return "";
  };

  return (
    <div>
      {/* Original User Accounts Container */}
      <div className="user-accounts-container">
        <h2 className="account-title">User Accounts</h2>
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
              {/* Dynamically render permission options */}
              {permissions.map((permission) => (
                <Option key={permission} value={permission}>
                  {permission}
                </Option>
              ))}
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
          </div>
        </div>
        <Table
          columns={columns}
          dataSource={userData} // Replace with your user accounts data
          pagination={{
            ...pagination,
            showSizeChanger: true,
            pageSizeOptions: ["10", "50", "100"],
          }}
          loading={loading}
          onChange={handlePaginationChange}
        />
        {/* UserProfileModal component can be used here for detailed view/edit */}
        <UserProfileModal
          user={selectedUser}
          visible={isModalVisible}
          onCancel={handleModalCancel}
        />
      </div>

      {/* Container for Users Needing Approval */}
      <div className="signed-up-container">
        <h2 className="account-title">Registering Users</h2>
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
          </div>
        </div>
        <Table
          columns={columnsSignup}
          dataSource={signUpUsers}
          pagination={{
            showSizeChanger: true,
            pageSizeOptions: ["10", "50", "100"],
          }}
          loading={loadingSignUp}
          onChange={handlePaginationChange}
          rowClassName={rowClassName}
        />
        <SignAccountModal
          user={selectedSignUpUser}
          visible={isSignUpModalVisible}
          onCancel={handleSignUpModalCancel}
        />
      </div>
    </div>
  );
};

export default UserAccounts;
