import React from "react";
import { Modal, Row, Col, Button } from "antd";
import NiceAvatar, { genConfig } from "react-nice-avatar";

const AvatarSelectionModal = ({ visible, onCancel, onSelectAvatar }) => {
  const avatars = Array.from({ length: 8 }, () => genConfig());

  const handleAvatarSelect = (avatarUrl) => {
    onSelectAvatar(avatarUrl); // Pass selected avatar URL to parent component
    onCancel(); // Close the modal after selecting an avatar
  };

  return (
    <Modal
      title="Select Avatar"
      visible={visible}
      onCancel={onCancel}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          Cancel
        </Button>
      ]}
    >
      <Row gutter={[16, 16]} justify="center">
        {avatars.map((config, index) => (
          <Col key={index}>
            <NiceAvatar style={{ width: 100, height: 100 }} {...config} />
            <Button
              type="primary"
              onClick={() => handleAvatarSelect(config.url)} // Pass selected avatar URL
              style={{ marginTop: 10 }}
            >
              Select
            </Button>
          </Col>
        ))}
      </Row>
    </Modal>
  );
};

export default AvatarSelectionModal;
