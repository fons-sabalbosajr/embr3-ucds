import React, { useState, useEffect } from "react";
import { Carousel, Button, Typography, Modal } from "antd";
import axios from "axios";
import moment from "moment";
import announcementIcon from "../../assets/announcement.png"; // ✅ Correct import
import "./bulletin.css";

const Bulletin = ({ theme = "dark" }) => {
  const [bulletins, setBulletins] = useState([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedBulletin, setSelectedBulletin] = useState({});
  const [dontShowAgainIds, setDontShowAgainIds] = useState(new Set());

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axios.get("http://localhost:8081/api/postings");
        const data = response.data;
        data.sort((a, b) => new Date(b.createdDate) - new Date(a.createdDate));
        setBulletins(data);
      } catch (error) {
        console.error("Error fetching postings:", error);
      }
    };
    fetchData();
  }, [dontShowAgainIds]);

  const handleView = async (record) => {
    setSelectedBulletin(record);
    setIsModalVisible(true);
    try {
      await axios.patch(`http://localhost:8081/api/postings/${record._id}`, {
        isRead: true,
      });
      setBulletins(
        bulletins.map((bulletin) =>
          bulletin._id === record._id ? { ...bulletin, isRead: true } : bulletin
        )
      );
    } catch (error) {
      console.error("Error marking bulletin as read:", error);
    }
  };

  const handleModalCancel = () => setIsModalVisible(false);

  const handleDontShowAgain = async () => {
    try {
      await axios.patch(
        `http://localhost:8081/api/postings/${selectedBulletin._id}`,
        { showAgain: false }
      );
      setDontShowAgainIds((prev) => new Set(prev).add(selectedBulletin._id));
      setIsModalVisible(false);
    } catch (error) {
      console.error("Error updating announcement status:", error);
    }
  };

  return (
    <div className={`bulletin-content ${theme}`}>
      <h3
          className="activity-title"
          style={{
            color: theme === "dark" ? "#ffffff" : "#000000", // Adjust title color based on theme
            fontSize: "16px",
          }}
        >
          Bulletin Board
        </h3>
      <div className="carousel-container">
        <Carousel autoplay effect="scrollx" className="bulletin-carousel">
          {bulletins.map(
            (bulletin) =>
              !dontShowAgainIds.has(bulletin._id) && (
                <div className="bulletin-item" key={bulletin._id}>
                  {/* Watermark Icon */}
                  <img
                    src={announcementIcon}
                    alt="Announcement"
                    className="bulletin-watermark-icon"
                  />

                  <div className="bulletin-inner">
                    <div className="bulletin-left">
                      <span className="bulletin-date">
                        {moment(bulletin.createdDate).format("MMMM DD, YYYY")}
                      </span>
                      <Typography.Title level={4} className="bulletin-title-text">
                        {bulletin.title}
                      </Typography.Title>
                      <Typography.Paragraph className="bulletin-message">
                        {bulletin.message}
                      </Typography.Paragraph>
                      <Button
                        type="primary"
                        onClick={() => handleView(bulletin)}
                        className="bulletin-button"
                      >
                        View Details
                      </Button>
                    </div>
                  </div>
                </div>
              )
          )}
        </Carousel>
      </div>

      {/* Modal for full bulletin view */}
      <Modal
        title="Bulletin Details"
        open={isModalVisible}
        onCancel={handleModalCancel}
        footer={[
          <Button
            key="dont-show"
            onClick={handleDontShowAgain}
            className="modal-btn bulletin-button"
          >
            Don't Show This Again
          </Button>,
          <Button key="close" onClick={handleModalCancel} className="modal-btn">
            Close
          </Button>,
        ]}
        className={`bulletin-modal ${theme}`}
      >
        <Typography.Text strong className="bulletin-title-text">
          {selectedBulletin.title}
        </Typography.Text>
        <br />
        <Typography.Text className="bulletin-message-text">
          {selectedBulletin.message}
        </Typography.Text>
      </Modal>
    </div>
  );
};

export default Bulletin;
