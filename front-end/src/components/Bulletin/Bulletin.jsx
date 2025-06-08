import React, { useState, useEffect } from "react";
import { Carousel, Button, Typography, Modal } from "antd";
import axios from "axios";
import moment from "moment";
import announcementIcon from "../../assets/announcement.png";
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

        const activeBulletins = data
          .filter((item) => item.status === "active")
          .sort((a, b) => new Date(b.createdDate) - new Date(a.createdDate));

        setBulletins(activeBulletins);
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
      setBulletins((prev) =>
        prev.map((item) =>
          item._id === record._id ? { ...item, isRead: true } : item
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

  const getGradientClass = (iconType) => {
    switch (iconType.toLowerCase()) {
      case "information":
        return "gradient-information"; // Blue gradient
      case "announcement":
        return "gradient-announcement"; // Yellow gradient
      case "alerts":
        return "gradient-alerts"; // Red gradient
      case "warning":
        return "gradient-warning"; // Orange gradient
      default:
        return "gradient-default"; // Gray gradient
    }
  };

  const getButtonClass = (iconType) => {
    switch (iconType.toLowerCase()) {
      case "information":
        return "button-information"; // Blue button
      case "announcement":
        return "button-announcement"; // Green button
      case "alerts":
        return "button-alerts"; // Red button
      case "warning":
        return "button-warning"; // Orange button
      default:
        return "button-default"; // Gray button
    }
  };

  return (
    <div
      className={`bulletin-container ${
        theme === "dark" ? "bulletin-dark" : "bulletin-light"
      }`}
    >
      <Carousel autoplay effect="fade" className="bulletin-carousel">
        {bulletins.slice(0, 5).map((bulletin) => {
          const gradientClass = getGradientClass(
            bulletin.iconType || "default"
          );
          const buttonClass = getButtonClass(bulletin.iconType || "default");
          return (
            <div
              key={bulletin._id}
              className={`bulletin-slide ${gradientClass}`} // Apply gradient class
            >
              {/* Bulletin Content */}
              <div className="bulletin-left">
                <Typography.Title level={3} className="bulletin-title">
                  {bulletin.title}
                </Typography.Title>
                <Typography.Text className="bulletin-date">
                  {moment(bulletin.createdDate).format("MMMM DD, YYYY")}
                </Typography.Text>
                <Typography.Paragraph className="bulletin-message">
                  <span
                    dangerouslySetInnerHTML={{
                      __html: bulletin.message.replace(/\n/g, "<br />"),
                    }}
                  />
                </Typography.Paragraph>
                <Button
                  className={`bulletin-button ${buttonClass}`} // Apply button class
                  onClick={() => handleView(bulletin)}
                >
                  Learn More
                </Button>
              </div>
              <div className="bulletin-image">
                <img
                  src={announcementIcon}
                  alt="announcement"
                  className="bulletin-image-element"
                />
              </div>
            </div>
          );
        })}
      </Carousel>
      {/* Modal for full bulletin view */}
      <Modal
        title="Bulletin Details"
        open={isModalVisible}
        onCancel={handleModalCancel}
        footer={[
          <Button
            key="dont-show"
            onClick={handleDontShowAgain}
            className={`modal-btn bulletin-button ${
              theme === "dark" ? "button-dark" : "button-light"
            }`}
          >
            Don't Show This Again
          </Button>,
          <Button
            key="close"
            onClick={handleModalCancel}
            className={`modal-btn ${
              theme === "dark" ? "button-dark" : "button-light"
            }`}
          >
            Close
          </Button>,
        ]}
        className={`bulletin-modal ${
          theme === "dark" ? "modal-dark" : "modal-light"
        }`}
      >
        <div className="modal-details-card">
          <Typography.Paragraph className="modal-message">
            <span
              dangerouslySetInnerHTML={{
                __html: (selectedBulletin.message || "").replace(/\n/g, "<br />"),
              }}
            />
          </Typography.Paragraph>
        </div>
      </Modal>
    </div>
  );
};

export default Bulletin;
