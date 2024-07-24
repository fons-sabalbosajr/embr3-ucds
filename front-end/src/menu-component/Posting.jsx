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

const { Title } = Typography;
const { Option } = Select;

const Posting = () => {
  const [announcements, setAnnouncements] = useState([]);
  const [visible, setVisible] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    message: "",
    acknowledgement: false,
    iconType: "alerts",
  });
  const [senders, setSenders] = useState([]);
  const [iconType, setIconType] = useState("");
  const [clickedIcon, setClickedIcon] = useState("");

  useEffect(() => {
    // Fetch senders from user collection API
    // Replace with your actual API call
    const fetchSenders = async () => {
      const response = await axios.get(" http://localhost:8081/api/users"); // Replace with your API endpoint
      const sendersData = response.data;
      setSenders(sendersData);
    };
    fetchSenders();

    const fetchAnnouncements = async () => {
      const response = await axios.get(" http://localhost:8081/api/postings");
      const announcementsData = response.data;
      setAnnouncements(announcementsData);
    };
    fetchAnnouncements();
  }, []);

  const showModal = () => {
    setVisible(true);
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
      const response = await fetch(" http://localhost:8081/api/posting", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
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
        fetchAnnouncements();
      } else {
        const error = await response.json();
        Swal.fire({
          title: "Error",
          text: error.message,
          icon: "error",
          confirmButtonText: "OK",
        });
      }
    } catch (error) {
      Swal.fire({
        title: "Error",
        text: "Error saving announcement",
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
      <WarningFilled
        style={{ color: "orange" }}
        className="icon-buttton-warn"
      />
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
      title: "Icon",
      dataIndex: "iconType",
      key: "iconType",
      align: "left", // Align contents to the left
      render: (iconType) => (
        <span style={{ fontSize: 30 }}>{iconMap[iconType]}</span> // Adjust the font size as needed
      ),
    },
    {
      title: "Date",
      dataIndex: "createdDate",
      key: "createdDate",
      align: "left",
      render: (createdDate) => moment(createdDate).format("MMMM DD, YYYY hh:mm a"),
    },
    {
      title: "Announcement",
      key: "announcement",
      align: "left",
      render: (_, record) => (
        <div>
          <Typography.Text strong>{record.title}</Typography.Text>
          <br />
          <Typography.Text>{record.message}</Typography.Text>
        </div>
      ),
    },
    {
      title: "Action",
      dataIndex: "action",
      key: "action",
      align: "left",
      render: (_, record) => (
        <Space size="middle">
          <Button type="primary">Edit</Button>
          <Button type="primary" danger>
            Delete
          </Button>
        </Space>
      ),
    },
  ];


  return (
    <div>
      <div className="user-accounts-container">
        <Title level={2} className="account-title">
          Announcement Gallery
        </Title>
        <Button type="primary" className="float-right" onClick={showModal}>
          <PlusCircleFilled /> Announce
        </Button>

        <Table columns={columns} dataSource={announcements} rowKey="_id" />

        <Modal
          title="Create an Announcement"
          visible={visible}
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
            <Form.Item wrapperCol={{ span: 24 }}>
              <Button type="primary" htmlType="submit">
                Save
              </Button>
              <Button
                type="default"
                onClick={handleCancel}
                style={{ marginLeft: 16 }}
              >
                Cancel
              </Button>
            </Form.Item>
          </Form>
        </Modal>
      </div>
    </div>
  );
};

export default Posting;
