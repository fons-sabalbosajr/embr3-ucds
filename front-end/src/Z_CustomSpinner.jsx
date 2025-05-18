import React from "react";
import { Spin, Card, Button } from "antd";
import { ExclamationCircleOutlined } from "@ant-design/icons";
import "./zcustomspinner.css";

const Z_CustomSpinner = ({ loading, errorMessage, onRetry }) => {
  // Function to handle opening Gmail compose window in Google Chrome
  const handleSupportClick = () => {
    const mailtoLink = "https://mail.google.com/mail/u/0/?tab=rm&ogbl#inbox?compose=new&to=emb.idms@gmail.com&subject=Support Request&body=Please describe your issue here.";
    window.open(mailtoLink, "_blank"); // Opens the link in a new tab or window
  };

  return (
    <div className="spinner-overlay">
      {loading ? (
        <Spin size="large" tip="Loading, please wait..." />
      ) : (
        errorMessage && (
          <Card className="spinner-card" variant={false}>
            <ExclamationCircleOutlined style={{ fontSize: '50px', color: '#ff4d4f' }} />
            <div className="error-text">{errorMessage}</div>
            <div className="spinner-actions">
              <Button type="primary" size="large" onClick={onRetry}>Retry</Button>
            </div>
            <div className="support-info">
              <p>If the issue persists, please contact our support team:</p>
              <Button type="link" className="support-link" onClick={handleSupportClick}>
                emb.idms@gmail.com
              </Button>
            </div>
          </Card>
        )
      )}
    </div>
  );
};

export default Z_CustomSpinner;
