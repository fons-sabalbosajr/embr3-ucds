import { useState, useEffect } from "react";
import {
  Avatar,
  Table,
  Input,
  Button,
  Select,
  Popover,
  List,
  Tag,
  Modal, Tabs
} from "antd";
import {
  SearchOutlined,
  DownloadOutlined,
  EllipsisOutlined,
  UserOutlined,
  EditOutlined,
  KeyOutlined,
} from "@ant-design/icons";
import axios from "axios";
import UserProfileModal from "./UserAccountModal";
import SignAccountModal from "./SignAccountModal";
import Swal from "sweetalert2";
import AvatarWithName from "../components/AvatarwithName";
import AccountPermission from "./AccountPermission";
import { API_URLS } from "../constants/apiUrls";
import "./useraccount.css";
import { API_BASE_URL } from "../config/api";

const { Option } = Select;
const { TabPane } = Tabs;

const UserAccounts = ({ theme = "dark" }) => {
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
  const [tableLoading, setTableLoading] = useState(false);
  const [isModalAccessVisible, setModalAccessVisible] = useState(false);
  const [selectedAccessUser, setSelectedAccessUser] = useState(null);
  const [isAccountPermissionVisible, setAccountPermissionVisible] =
    useState(false);
  const [refreshInterval, setRefreshInterval] = useState(1000);
  const [isEditProfileModalOpen, setEditProfileModalOpen] = useState(false);
  const [isEditAccessModalOpen, setEditAccessModalOpen] = useState(false);

  const fetchLoginStatuses = async () => {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/login-status`
      );
      return response.data; // Assuming this returns an array of login status objects
    } catch (error) {
      console.error("Error fetching login statuses:", error);
      return []; // Return an empty array in case of error
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersResponse, loginStatuses] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/users`, {
          params: { page: pagination.current, pageSize: pagination.pageSize },
        }),
        fetchLoginStatuses(), // Fetch login statuses separately
      ]);

      const users = usersResponse.data;

      const combinedData = users.map((user) => {
        const status = loginStatuses.find(
          (status) => status.username === user.username
        ); // Match based on username
        if (status) {
          if (status.isLoggedIn) {
            return { ...user, status: "online" };
          } else {
            return {
              ...user,
              status: getOfflineStatus(status.logoutTime), // Call the function to get the offline status
            };
          }
        }
        return { ...user, status: "offline" }; // Default to 'offline' if no status found
      });

      // Sort the combinedData array: online users first, then offline users
      combinedData.sort((a, b) => {
        if (a.status === "online" && b.status !== "online") {
          return -1; // a comes before b
        }
        if (a.status !== "online" && b.status === "online") {
          return 1; // b comes before a
        }
        return 0; // Keep the order for users with the same status
      });

      setUserData(combinedData);
      setFilteredUserData(combinedData);
      setPagination((prev) => ({ ...prev, total: combinedData.length }));
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserData = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/users`, {
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
      const response = await axios.get(" ${API_BASE_URL}/api/sign-up", {
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
        " ${API_BASE_URL}/api/online_users"
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

  const handleReload = async () => {
    try {
      setTableLoading(true);
      await fetchSignUpUsers();
    } catch (error) {
      console.error("Error reloading data:", error);
    } finally {
      setTableLoading(false);
    }
  };

  const handleRemoveUser = async (record) => {
    const result = await Swal.fire({
      title: "Are you sure?",
      text: `Do you want to remove user ${record.name}?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, remove it!",
      cancelButtonText: "No, cancel",
    });

    if (result.isConfirmed) {
      try {
        const response = await axios.delete(
          `${API_BASE_URL}/api/remove-user/${record._id}`
        );

        if (response.data.message === "User removed successfully") {
          Swal.fire("Removed!", "The user has been removed.", "success");

          //fetchSignUpUsers();
          handleReload();
        } else {
          Swal.fire("Error!", "Failed to remove the user.", "error");
        }
      } catch (error) {
        console.error("Error removing user:", error);
        Swal.fire("Error!", "Failed to remove the user.", "error");
      }
    }
  };

  const handleModalClose = () => {
    handleClose();
  };

  const handlePaginationChange = (pagination) => {
    setPagination(pagination);
  };

  const handlePermissionChange = (value) => {
    setSelectedPermission(value); // Set selected permission
  };

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

  const handleSearch = (value) => {
    console.log("Search:", value);
    filterAndSetData(selectedPermission, value); // Filter data based on selected permission and search value
  };

  const handleViewSignUpUser = (record) => {
    setSelectedSignUpUser(record); // Set the selected user
    setIsSignUpModalVisible(true); // Open the modal
  };

  const handleSignUpModalCancel = () => {
    setIsSignUpModalVisible(false); // Close the modal
    setSelectedSignUpUser(null); // Clear selected user
  };

  const handleExport = () => {
    console.log("Exporting...");
  };

  const handleEdit = (record) => {
    setSelectedUser(record);
    setEditProfileModalOpen(true);
  };

  const handleEditAccess = (user) => {
    setSelectedAccessUser(user);
    setModalAccessVisible(true);
  };

  const handleModalCancel = () => {
    setSelectedUser(null);
    setIsModalVisible(false); // Hide the modal
  };

  const rowClassName = (record) => {
    if (record.status === "approved") {
      return "disabled-row";
    }
    return "";
  };

  const handleClose = () => {
    setModalAccessVisible(false);
    setSelectedAccessUser(null);
  };

  const handlePermissionsUpdate = (updatedPermissions) => {
    // You can save the permissions to server here if needed
    //console.log("Updated Permissions:", updatedPermissions);
    handleClose();
  };

  useEffect(() => {
    fetchData();
    const intervalId = setInterval(fetchData, refreshInterval);
    return () => clearInterval(intervalId);
  }, [pagination.current, pagination.pageSize, refreshInterval]);

  useEffect(() => {
    fetchData();
  }, []);

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
    const intervalId = setInterval(async () => {
      const data = await fetchSignUpUsers();
      setSignUpUsers(data);
    }, refreshInterval);
    return () => clearInterval(intervalId);
  }, [refreshInterval, pagination.current, pagination.pageSize]);

  useEffect(() => {
    fetchSignUpUsers().then((data) => setSignUpUsers(data));
  }, []);

  useEffect(() => {
    fetchSignUpUsers();
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
      title: <span className="table-header">Name</span>,
      dataIndex: "name",
      key: "avatarName",
      render: (name, record) => {
        const isOnline = record.status === "online";

        return (
          <div className="user-name-cell">
            <AvatarWithName userHandle={record.username} />
            <div className="user-fullname-wrapper">
              <div className="user-fullname">{name}</div>
              <span
                className={`user-last-active ${
                  record.status === "online" ? "active-now" : "active-ago"
                }`}
              >
                {record.status === "online" ? "active now" : record.status}
              </span>
            </div>
          </div>
        );
      },
      align: "center",
      width: 250,
    },
    {
      title: <span className="table-header">Email</span>,
      dataIndex: "email",
      key: "email",
      render: (email) => <span className="user-email">{email}</span>,
      align: "center",
      ellipsis: true,
      width: 250,
    },
    {
      title: <span className="table-header">Position</span>,
      dataIndex: "division",
      key: "division",
      render: (division) => <span className="user-position">{division}</span>,
      align: "center",
      ellipsis: true,
      width: 180,
    },
    {
      title: "Permission",
      dataIndex: "permission",
      key: "permission",
      render: (permission) => {
        let bgColor = "";
        let textColor = "#fff";
        switch (permission) {
          case "viewer":
            bgColor = "#379777"; // Dark Gray
            break;
          case "contributor":
            bgColor = "#F4CE14"; // Dark Blue
            break;
          case "admin":
            bgColor = "#102E50"; // Dark Charcoal
            break;
          case "developer":
            bgColor = "#3A3960"; // Dark Purple
            break;
          default:
            bgColor = "#f0f0f0";
        }
        return (
          <span
            style={{
              backgroundColor: bgColor,
              color: textColor,
              padding: "2px 6px",
              borderRadius: "3px",
              display: "inline-block",
              fontSize: 11,
              minWidth: "60px",
              textAlign: "center",
              fontWeight: 500,
            }}
          >
            {permission}
          </span>
        );
      },
      align: "center",
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status) => {
        let bgColor = "";
        let textColor = "#fff";
        switch (status) {
          case "online":
            bgColor = "#5CB338";
            break;
          case "offline":
            bgColor = "#973131";
            break;
          default:
            bgColor = "#393E46";
        }
        return (
          <span
            style={{
              backgroundColor: bgColor,
              color: textColor,
              padding: "2px 6px",
              borderRadius: "3px",
              display: "inline-block",
              fontSize: 10,
              minWidth: "60px",
              textAlign: "center",
              fontWeight: 500,
            }}
          >
            {status}
          </span>
        );
      },
      align: "center",
    },
    {
      title: <span className="table-header">Action</span>,
      dataIndex: "action",
      key: "action",
      render: (_, record) => (
        <div className="action-buttons">
          <Button
            icon={<EditOutlined />}
            size="small"
            title="Edit Profile"
            onClick={() => handleEdit(record)}
            type="primary"
          />
          <Button
            icon={<KeyOutlined />}
            size="small"
            type="primary"
            title="Edit Access"
            onClick={() => handleEditAccess(record)}
            className="seagreen-btn"
          />
        </div>
      ),
      align: "center",
      width: 120,
    },
  ];

  const columnsSignup = [
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
      ellipsis: true,
      align: "left",
      width: 200,
      render: (name, record) => (
        <div
          style={{ display: "flex", alignItems: "center", maxWidth: "100%" }}
        >
          {record.avatar ? (
            <Avatar src={record.avatar} />
          ) : (
            <Avatar
              icon={<UserOutlined />}
              style={{ backgroundColor: "#87d068" }}
            >
              {name.charAt(0).toUpperCase()}{" "}
              {/* Fallback to first letter, capitalized */}
            </Avatar>
          )}
          <span
            style={{
              marginLeft: "8px",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {name}
          </span>
        </div>
      ),
    },
    {
      title: "Division",
      dataIndex: "division",
      key: "division",
      ellipsis: true,
      align: "left",
    },
    {
      title: "Position",
      dataIndex: "position",
      key: "position",
      ellipsis: true,
      align: "left",
    },
    {
      title: "Email",
      dataIndex: "email",
      key: "email",
      ellipsis: true,
      align: "left",
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
            try {
              const response = await axios.put(
                ` ${API_BASE_URL}/api/status/${record._id}`,
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
      align: "left",
    },
    {
      title: "Action",
      dataIndex: "action",
      key: "action",
      align: "left",
      render: (_, record) => (
        <Popover
          content={
            <List>
              <List.Item>
                <Button
                  type="text"
                  size="small"
                  onClick={() => handleViewSignUpUser(record)} // Open modal on click
                >
                  Approve
                </Button>
              </List.Item>
              <List.Item>
                <Button type="text" size="small">
                  Disapprove
                </Button>
              </List.Item>
              <List.Item>
                <Button
                  type="text"
                  size="small"
                  danger
                  onClick={() => handleRemoveUser(record)} // Assuming this function exists
                >
                  Remove
                </Button>
              </List.Item>
            </List>
          }
          placement="rightTop"
        >
          <Button icon={<EllipsisOutlined />} />
        </Popover>
      ),
    },
  ];

  return (
    <div className="accounts-container">
      <div className="card">
        <h2 className="account-title">User Accounts</h2>
        <div
          className="filter-options"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "0.1rem 0", // Reduced vertical padding
            marginBottom: "0.2rem", // Reduced margin for spacing between elements
            flexWrap: "wrap", // responsive fallback
          }}
        >
          {/* Grouped Search + Select */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "1rem",
              flexWrap: "wrap",
            }}
          >
            <Input.Search
              placeholder="Search Users"
              allowClear
              prefix={<SearchOutlined />}
              size="middle"
              onSearch={handleSearch}
              style={{ width: 250 }}
            />

            <Select
              defaultValue="all"
              style={{ width: 180 }}
              onChange={handlePermissionChange}
            >
              <Option value="all">All Permissions</Option>
              {permissions.map((permission) => (
                <Option key={permission} value={permission}>
                  {permission}
                </Option>
              ))}
            </Select>
          </div>

          {/* Export Button */}
          <Button
            type="default"
            icon={<DownloadOutlined />}
            onClick={handleExport}
          >
            Export
          </Button>
        </div>

        <Table
          columns={columns}
          dataSource={userData}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            pageSizeOptions: ["10", "50", "100"],
            size: "small", // smaller pagination UI
          }}
          onChange={handlePaginationChange}
          className={theme === "light" ? "light-theme-table" : ""}
        />
      </div>

      <Modal
        title="Account Details"
        open={isEditProfileModalOpen}
        onCancel={() => setEditProfileModalOpen(false)}
        footer={null}
        destroyOnClose
        width={800}
      >
        <UserProfileModal user={selectedUser} />
      </Modal>

      <Modal
        title="User Permission"
        open={isModalAccessVisible}
        footer={null}
        closable={true}
        onCancel={handleClose}
        width={800}
      >
        {selectedAccessUser && (
          <AccountPermission
            visible={isModalAccessVisible}
            onClose={handleModalClose}
            onPermissionsUpdate={handlePermissionsUpdate}
            userData={{
              name: selectedAccessUser.name,
              email: selectedAccessUser.email,
              division: selectedAccessUser.division,
              permission: selectedAccessUser.permission,
              username: selectedAccessUser.username,
              avatar: selectedAccessUser.avatar,
              status: selectedAccessUser.status, // if your AvatarWithName expects status
            }}            
          />
        )}
      </Modal>

      <div className="card">
        <h2 className="account-title">Signed Up Users</h2>
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
