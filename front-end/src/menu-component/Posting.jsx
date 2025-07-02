import React, { useState, useEffect } from "react";
import {
  Form,
  Input,
  Button,
  Modal,
  Select,
  Radio,
  Space,
  Row,
  Col,
  Typography,
  DatePicker,
  Tooltip,
  Table,
} from "antd";
import {
  PlusCircleFilled,
  ExclamationCircleOutlined,
  InfoCircleFilled,
  WarningFilled,
  BellFilled,
} from "@ant-design/icons";
import "./posting.css";
import axios from "axios";
import Swal from "sweetalert2";
import moment from "moment";
import { CheckOutlined } from "@ant-design/icons";

const { Title } = Typography;
const { Option } = Select;

const Posting = () => {
  const [announcements, setAnnouncements] = useState([]);
  const [visible, setVisible] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    message: "",
    acknowledgement: false,
    iconType: "alerts",
  });
  const [senders, setSenders] = useState([]);
  const [iconType, setIconType] = useState("");
  const [clickedIcon, setClickedIcon] = useState("");
  const [editId, setEditId] = useState(""); // New state
  const [editing, setEditing] = useState(false);
  const [selectedPosting, setSelectedPosting] = useState(null);

  useEffect(() => {
    // Fetch senders from user collection API
    const fetchSenders = async () => {
      const response = await axios.get("http://10.14.77.107:8081/api/users"); // Replace with your API endpoint
      const sendersData = response.data;
      setSenders(sendersData);
    };
    fetchSenders();

    fetchAnnouncements();
  }, []);

  const fetchAnnouncements = async () => {
    try {
      const response = await axios.get("http://10.14.77.107:8081/api/postings");
      const announcementsData = response.data;
      setAnnouncements(announcementsData);
    } catch (error) {
      console.error("Error fetching announcements:", error);
    }
  };

  const handleStatusChange = async (id, status) => {
    console.log("Updating status for ID:", id); // Debugging log
    try {
      const response = await fetch(`http://10.14.77.107:8081/api/postings/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
        credentials: "include", // Include credentials
      });

      if (response.ok) {
        Swal.fire({
          title: "Success!",
          text: "Announcement status updated successfully.",
          icon: "success",
          confirmButtonText: "OK",
        });
        fetchAnnouncements(); // Refresh the announcements
      } else {
        const error = await response.json();
        console.error("Server response error:", error);
        Swal.fire({
          title: "Error",
          text: error.message || "Error updating status",
          icon: "error",
          confirmButtonText: "OK",
        });
      }
    } catch (error) {
      console.error("Network error:", error);
      Swal.fire({
        title: "Error",
        text: "Error updating status",
        icon: "error",
        confirmButtonText: "OK",
      });
    }
  };

  const showModal = () => {
    setVisible(true);
    setEditing(false); // Ensure we are not in editing mode
    setFormData({
      title: "",
      message: "",
      acknowledgement: false,
      iconType: "alerts",
      date: null,
    });
  };

  const handleCancel = () => {
    setVisible(false);
  };

  const handleFormChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setClickedIcon(e.target.value);
  };

  const handleIconChange = (value) => {
    setFormData({ ...formData, iconType: value });
  };

  const handleFormSubmit = async (values) => {
    try {
      const response = await fetch("http://10.14.77.107:8081/api/posting", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
        credentials: "include", // Include credentials
      });

      if (response.ok) {
        const result = await response.json();
        Swal.fire({
          title: "Success!",
          text: result.message,
          icon: "success",
          confirmButtonText: "OK",
        });

        setVisible(false); // Close the modal
        fetchAnnouncements(); // Refresh the announcements
      } else {
        const error = await response.json();
        console.error("Server response error:", error); // Log the error
        Swal.fire({
          title: "Error",
          text: error.message || "Error saving announcement",
          icon: "error",
          confirmButtonText: "OK",
        });
      }
    } catch (error) {
      console.error("Network error:", error); // Log network errors
      Swal.fire({
        title: "Error",
        text: "Error saving announcement",
        icon: "error",
        confirmButtonText: "OK",
      });
    }
  };

  const handleEdit = (record) => {
    setSelectedPosting(record);
    setFormData({
      title: record.title,
      message: record.message,
      acknowledgement: record.acknowledgement,
      iconType: record.iconType,
      date: moment(record.createdDate),
    });
    setVisible(true);
    setEditing(true);
  };

  const handleEditSubmit = async (values) => {
    try {
      const response = await fetch(
        `http://10.14.77.107:8081/api/postings/${selectedPosting._id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(values),
          credentials: "include", // Include credentials
        }
      );

      if (response.ok) {
        const result = await response.json();
        Swal.fire({
          title: "Success!",
          text: result.message,
          icon: "success",
          confirmButtonText: "OK",
        });

        setEditVisible(false); // Close the modal
        fetchAnnouncements(); // Refresh the announcements
      } else {
        const error = await response.json();
        console.error("Server response error:", error); // Log the error
        Swal.fire({
          title: "Error",
          text: error.message || "Error updating announcement",
          icon: "error",
          confirmButtonText: "OK",
        });
      }
    } catch (error) {
      console.error("Network error:", error); // Log network errors
      Swal.fire({
        title: "Error",
        text: "Error updating announcement",
        icon: "error",
        confirmButtonText: "OK",
      });
    }
  };

  const handleDelete = async (id) => {
    try {
      const response = await fetch(`http://10.14.77.107:8081/api/postings/${id}`, {
        method: "DELETE",
        credentials: "include", // Include credentials
      });

      if (response.ok) {
        const result = await response.json();
        Swal.fire({
          title: "Success!",
          text: result.message,
          icon: "success",
          confirmButtonText: "OK",
        });

        fetchAnnouncements(); // Refresh the announcements
      } else {
        const error = await response.json();
        console.error("Server response error:", error); // Log the error
        Swal.fire({
          title: "Error",
          text: error.message || "Error deleting announcement",
          icon: "error",
          confirmButtonText: "OK",
        });
      }
    } catch (error) {
      console.error("Network error:", error); // Log network errors
      Swal.fire({
        title: "Error",
        text: "Error deleting announcement",
        icon: "error",
        confirmButtonText: "OK",
      });
    }
  };

  const iconMap = {
    alerts: (
      <ExclamationCircleOutlined
        style={{ color: "rgb(236, 71, 71)" }}
        className="icon-button-alert"
      />
    ),
    information: (
      <InfoCircleFilled
        style={{ color: "rgb(54, 138, 223)" }}
        className="icon-button-info"
      />
    ),
    warning: (
      <WarningFilled style={{ color: "orange" }} className="icon-button-warn" />
    ),
    announcement: (
      <BellFilled
        style={{ color: "green" }}
        className="icon-button-announcement"
      />
    ),
  };

  const columns = [
    {
      title: "",
      dataIndex: "iconType",
      key: "iconType",
      align: "center",
      render: (iconType) => (
        <span style={{ fontSize: 20 }}>{iconMap[iconType]}</span>
      ),
    },
    {
      title: <div style={{ textAlign: "center" }}>Date</div>,
      dataIndex: "createdDate",
      key: "createdDate",
      align: "left",
      sorter: (a, b) => moment(a.createdDate) - moment(b.createdDate),
      render: (createdDate) =>
        moment(createdDate).format("MMMM DD, YYYY hh:mm a"),
    },
    {
      title: <div style={{ textAlign: "center" }}>Announcement</div>,
      key: "announcement",
      align: "left",
      render: (_, record) => {
        if (!record.message) {
          console.warn("Invalid message:", record);
        }
        return (
          <div>
            <Typography.Text strong>{record.title}</Typography.Text>
            <br />
            <Typography.Text>
              {(record.message || "").split("\n").map((line, index) => (
                <React.Fragment key={index}>
                  {line}
                  <br />
                </React.Fragment>
              ))}
            </Typography.Text>
          </div>
        );
      },
    },
    {
      title: <div style={{ textAlign: "center" }}>Status</div>,
      dataIndex: "status",
      key: "status",
      align: "center",
      filters: [
        { text: "Active", value: "active" },
        { text: "Inactive", value: "inactive" },
      ],
      onFilter: (value, record) => record.status === value,
      render: (_, record) => (
        <Select
          defaultValue={record.status || "active"}
          style={{ width: 120 }}
          onChange={(value) => handleStatusChange(record._id, value)}
          size="small"
        >
          <Option value="active">Active</Option>
          <Option value="inactive">Inactive</Option>
        </Select>
      ),
    },
    {
      title: <div style={{ textAlign: "center" }}>Action</div>,
      dataIndex: "action",
      key: "action",
      align: "center",
      render: (_, record) => (
        <Space size="middle">
          <Button
            type="primary"
            size="small"
            onClick={() => handleEdit(record)}
          >
            Edit
          </Button>
          <Button
            type="primary"
            danger
            size="small"
            onClick={() => {
              Swal.fire({
                title: "Are you sure?",
                text: "You won't be able to recover this announcement!",
                icon: "warning",
                showCancelButton: true,
                confirmButtonColor: "#3085d6",
                cancelButtonColor: "#d33",
                confirmButtonText: "Yes, delete it!",
              }).then((result) => {
                if (result.isConfirmed) {
                  handleDelete(record._id);
                }
              });
            }}
          >
            Delete
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div className="card">
      <div>
        <Title level={2} className="account-title">
          Announcement Gallery
        </Title>
        <Button type="primary" className="float-right" onClick={showModal}>
          <PlusCircleFilled /> Announce
        </Button>

        <Table columns={columns} dataSource={announcements} rowKey="_id" />

        <Modal
          title="Create an Announcement"
          open={visible}
          onCancel={handleCancel}
          footer={null}
          width={800}
        >
          <Form
            name="announcementForm"
            onFinish={handleFormSubmit}
            initialValues={formData}
            labelAlign="left"
            labelCol={{ span: 6 }}
            wrapperCol={{ span: 15 }}
          >
            <Form.Item
              label="Title"
              name="title"
              rules={[{ required: true, message: "Please enter a title" }]}
            >
              <Input placeholder="Announcement Title" />
            </Form.Item>

            <Form.Item
              label="Message"
              name="message"
              rules={[{ required: true, message: "Please enter a message" }]}
            >
              <Input.TextArea rows={6} placeholder="Type your message here" />
            </Form.Item>

            <Form.Item
              label="Date"
              name="date"
              rules={[{ required: true, message: "Please select a date" }]}
            >
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>

            <Form.Item label="User Acknowledgement">
              <Radio.Group name="acknowledgement" onChange={handleFormChange}>
                <Radio value={true}>Enable</Radio>
                <Radio value={false}>Disable</Radio>
              </Radio.Group>
            </Form.Item>

            <Form.Item label="Display Icon" name="iconType">
              <Space direction="vertical">
                <Row gutter={[16, 16]}>
                  <Col span={6}>
                    <Radio.Button
                      value="alerts"
                      onClick={handleIconChange}
                      className={`icon-button ${
                        iconType === "alerts" ? "checked" : ""
                      } ${clickedIcon === "alerts" ? "active" : ""}`}
                    >
                      <Tooltip title="Alerts">
                        <span style={{ fontSize: 30 }}>{iconMap.alerts}</span>
                        {iconType === "alerts" && <CheckOutlined />}
                      </Tooltip>
                    </Radio.Button>
                    <span className="icon-label">Alerts</span>
                  </Col>

                  <Col span={6}>
                    <Radio.Button
                      value="information"
                      onClick={handleIconChange}
                      className={`icon-button ${
                        iconType === "information" ? "checked" : ""
                      } ${clickedIcon === "information" ? "active" : ""}`}
                    >
                      <Tooltip title="Information">
                        <span style={{ fontSize: 30 }}>
                          {iconMap.information}
                        </span>
                        {iconType === "information" && <CheckOutlined />}
                      </Tooltip>
                    </Radio.Button>
                    <span className="icon-label">Information</span>
                  </Col>

                  <Col span={6}>
                    <Radio.Button
                      value="warning"
                      onClick={handleIconChange}
                      className={`icon-button ${
                        iconType === "warning" ? "checked" : ""
                      } ${clickedIcon === "warning" ? "active" : ""}`}
                    >
                      <Tooltip title="Warning">
                        <span style={{ fontSize: 30 }}>{iconMap.warning}</span>
                        {iconType === "warning" && <CheckOutlined />}
                      </Tooltip>
                    </Radio.Button>
                    <span className="icon-label">Warning</span>
                  </Col>

                  <Col span={6}>
                    <Radio.Button
                      value="announcement"
                      onClick={handleIconChange}
                      className={`icon-button ${
                        iconType === "announcement" ? "checked" : ""
                      } ${clickedIcon === "announcement" ? "active" : ""}`}
                    >
                      <Tooltip title="Announcement">
                        <span style={{ fontSize: 30 }}>
                          {iconMap.announcement}
                        </span>
                        {iconType === "announcement" && <CheckOutlined />}
                      </Tooltip>
                    </Radio.Button>
                    <span className="icon-label">Announcement</span>
                  </Col>
                </Row>
              </Space>
            </Form.Item>

            <Form.Item wrapperCol={{ offset: 6 }}>
              <Button type="primary" htmlType="submit">
                Save
              </Button>
            </Form.Item>
          </Form>
        </Modal>

        <Modal
          title="Edit Announcement"
          open={editVisible}
          onCancel={handleCancel}
          footer={null}
          width={800}
        >
          <Form
            name="editAnnouncementForm"
            onFinish={handleEditSubmit}
            initialValues={formData}
            labelAlign="left"
            labelCol={{ span: 6 }}
            wrapperCol={{ span: 15 }}
          >
            <Form.Item
              label="Title"
              name="title"
              rules={[{ required: true, message: "Please enter a title" }]}
            >
              <Input placeholder="Announcement Title" />
            </Form.Item>

            <Form.Item
              label="Message"
              name="message"
              rules={[{ required: true, message: "Please enter a message" }]}
            >
              <Input.TextArea rows={6} placeholder="Type your message here" />
            </Form.Item>

            <Form.Item
              label="Date"
              name="date"
              rules={[{ required: true, message: "Please select a date" }]}
            >
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>

            <Form.Item label="User Acknowledgement">
              <Radio.Group
                name="acknowledgement"
                value={formData.acknowledgement}
                onChange={(e) =>
                  setFormData({ ...formData, acknowledgement: e.target.value })
                }
              >
                <Radio value={true}>Required</Radio>
                <Radio value={false}>Not Required</Radio>
              </Radio.Group>
            </Form.Item>

            <Form.Item label="Icon Type" name="iconType">
              <Select
                onChange={handleIconChange}
                defaultValue={formData.iconType}
              >
                <Option value="alerts">Alerts</Option>
                <Option value="information">Information</Option>
                <Option value="warning">Warning</Option>
                <Option value="announcement">Announcement</Option>
              </Select>
            </Form.Item>

            <Form.Item>
              <Button type="primary" htmlType="submit">
                Update Announcement
              </Button>
            </Form.Item>
          </Form>
        </Modal>
      </div>
    </div>
  );
};

export default Posting;
