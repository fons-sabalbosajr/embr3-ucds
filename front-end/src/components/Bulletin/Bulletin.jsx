import React, { useState, useEffect } from "react";
import { Table, Button, Typography, Space, Modal, Badge } from "antd";
import { CheckCircleOutlined } from "@ant-design/icons";
import axios from "axios";
import moment from "moment";
import "./bulletin.css";

const Bulletin = () => {
  const [bulletins, setBulletins] = useState([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedBulletin, setSelectedBulletin] = useState({});
  const [showModalOnLoad, setShowModalOnLoad] = useState(false);
  const [dontShowAgainIds, setDontShowAgainIds] = useState(new Set());

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axios.get("https://embr3-ucds.onrender.com/api/postings");
        const data = response.data;
        // Sort bulletins by date from newest to oldest
        data.sort((a, b) => new Date(b.createdDate) - new Date(a.createdDate));
        setBulletins(data);

        // Check if there is a new announcement and set the state to show the modal
        const newAnnouncement = data.find(
          (bulletin) => !bulletin.isRead && !dontShowAgainIds.has(bulletin._id)
        );
        if (newAnnouncement) {
          setSelectedBulletin(newAnnouncement);
          setShowModalOnLoad(true);
        }
      } catch (error) {
        console.error("Error fetching postings:", error);
      }
    };

    fetchData();
  }, [dontShowAgainIds]);

  const columns = [
    {
      title: "Date",
      dataIndex: "createdDate",
      key: "createdDate",
      align: "left",
      width: 120,
      render: (createdDate, record) => (
        <div style={{ display: "flex", alignItems: "center" }}>
          {!record.isRead && !dontShowAgainIds.has(record._id) && (
            <Badge.Ribbon text="New" color="red" style={{ marginRight: 8 }} />
          )}
          <span className="data-label">
            {moment(createdDate).format("MMMM DD, YYYY hh:mm a")}
          </span>
        </div>
      ),
    },
    {
      title: "Announcement",
      key: "announcement",
      align: "left",
      render: (_, record) => (
        <div>
          <Typography.Text
            strong={!record.isRead}
            style={{ color: record.isRead ? "gray" : "black" }}
            className="data-title" // Conditional styling
          >
            {record.isRead ? (
              <>
                <CheckCircleOutlined
                  style={{ color: "green", marginRight: 8 }}
                />
                {record.title}
              </>
            ) : (
              record.title
            )}
          </Typography.Text>
          <br />
          <Typography.Text className="data-label">
            {record.message}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: "Action",
      key: "action",
      align: "left",
      render: (_, record) => (
        <Space size="middle">
          <Button
            type="primary"
            size="small"
            className="bulletin-button"
            onClick={() => handleView(record)}
          >
            View
          </Button>
        </Space>
      ),
    },
  ];

  const handleView = async (record) => {
    setSelectedBulletin(record);
    setIsModalVisible(true);
    try {
      await axios.patch(`https://embr3-ucds.onrender.com/api/postings/${record._id}`, {
        isRead: true,
      });
      // Update the bulletins state with the read status
      setBulletins(
        bulletins.map((bulletin) =>
          bulletin._id === record._id ? { ...bulletin, isRead: true } : bulletin
        )
      );
    } catch (error) {
      console.error("Error marking bulletin as read:", error);
      // Additional logging for debugging
      console.error(
        "Error details:",
        error.response ? error.response.data : error.message
      );
    }
  };

  const handleModalCancel = () => {
    setIsModalVisible(false);
    setShowModalOnLoad(false);
  };

  const handleDontShowAgain = async () => {
    try {
      await axios.patch(
        `https://embr3-ucds.onrender.com/api/postings/${selectedBulletin._id}`,
        { showAgain: false }
      );
      // Add the ID to the set of IDs that should not trigger the modal
      setDontShowAgainIds((prev) => new Set(prev).add(selectedBulletin._id));
      setIsModalVisible(false);
    } catch (error) {
      console.error("Error updating announcement status:", error);
    }
  };

  return (
    <div className="bulletin-content">
      <h3 className="bulletin-title">Bulletin Board</h3>
      <Table
        columns={columns}
        dataSource={bulletins}
        pagination={{ pageSize: 2 }} // Limit rows per page
        rowKey="_id" // Ensure unique key for rows
        size="small"
      />
      <Modal
        title="Bulletin Details"
        open={isModalVisible || showModalOnLoad}
        onCancel={handleModalCancel}
        footer={[
          <Button type="primary" key="dont-show" onClick={handleDontShowAgain}>
            Don't Show This Message Again
          </Button>,
          <Button key="cancel" onClick={handleModalCancel}>
            Close
          </Button>,
        ]}
      >
        <Typography.Text strong>{selectedBulletin.title}</Typography.Text>
        <br />
        <Typography.Text>{selectedBulletin.message}</Typography.Text>
      </Modal>
    </div>
  );
};

export default Bulletin;
