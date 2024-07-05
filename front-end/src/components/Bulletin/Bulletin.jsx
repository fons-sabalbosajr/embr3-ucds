import React, { useState, useEffect } from "react";
import { Table, Button, Input, Typography, Space } from 'antd';
import {
  PlusCircleFilled,
  ExclamationCircleOutlined,
  InfoCircleFilled,
  WarningFilled,
  BellFilled,
} from "@ant-design/icons";
import axios from "axios";
import moment from "moment";
import "./bulletin.css";

const { Search } = Input;

const Bulletin = () => {
  const [bulletins, setBulletins] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axios.get("http://localhost:8081/api/postings");
        const data = response.data;
        setBulletins(data);
      } catch (error) {
        console.error("Error fetching postings:", error);
      }
    };
  
    fetchData();
  }, []);



  const iconMap = {
    alerts: <ExclamationCircleOutlined style={{ color: "rgb(236, 71, 71)" }} />,
    information: <InfoCircleFilled style={{ color: "rgb(54, 138, 223)" }} />,
    warning: <WarningFilled style={{ color: "orange" }} />,
    announcement: <BellFilled style={{ color: "green" }} />,
  };


  const columns = [
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
      key: "action",
      align: "left",
      render: (_, record) => (
        <Space size="middle">
          <Button type="primary" size="small" className="bulletin-button">View</Button>
        </Space>
      ),
    },
  ];

  return (
    <div className="bulletin-content">
      <h2 className="calendar-title">Bulletin Table</h2>
      {/* <div className="search-bar">
        <Search placeholder="Search..." style={{ width: 200, marginBottom: 20 }} />
      </div> */}
      <Table columns={columns} dataSource={bulletins} pagination={{ pageSize: 5 }} />
    </div>
  );
};

export default Bulletin;
