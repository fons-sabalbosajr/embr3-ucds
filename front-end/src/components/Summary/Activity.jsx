import React, { useEffect, useState } from "react";
import { Button, Card, Row, Col, Spin } from "antd";
import axios from "axios";
import "./activity.css";

const Activity = () => {
  const [encodedFirms, setEncodedFirms] = useState(0);
  const [updatedFirms, setUpdatedFirms] = useState(0);
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch firm counts
        const firmCountResponse = await axios.get("/api/firm-count");
        setEncodedFirms(firmCountResponse.data.encodedFirms);
        setUpdatedFirms(firmCountResponse.data.updatedFirms);

        // Fetch recent activity data
        const recentActivityResponse = await axios.get(
          "http://localhost:8081/api/recent-activity"
        );
        setRecentActivity(recentActivityResponse.data);
      } catch (error) {
        console.error("There was an error fetching the data!", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return (
    <>
    <div>
      <Card className="activity-container">
        <h3 className="activity-title">Your Activities</h3>

        <div className="metrics-container">
          <Row className="metric-row">
            <Col span={12} className="metric-col">
              <div className="metric-label">Encoded Firms</div>
            </Col>
            <Col span={12} className="metric-col">
              <div className="metric-value">{encodedFirms}</div>
            </Col>
          </Row>
          <Row className="metric-row">
            <Col span={12} className="metric-col">
              <div className="metric-label">Updated Firms</div>
            </Col>
            <Col span={12} className="metric-col">
              <div className="metric-value">{updatedFirms}</div>
            </Col>
          </Row>

          <h4 className="recent-activity-title">Your Recent Activity</h4>
          {loading ? (
            <Spin />
          ) : (
            <Row className="activity-row">
              {recentActivity.slice(0, 5).map((activity, index) => (
                <Col span={24} key={index} className="activity-col">
                  <Card className="activity-card">
                    <p><strong>Date:</strong> {new Date(activity.timestamp).toLocaleString("en-US", {
                      month: "2-digit",
                      day: "2-digit",
                      year: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                      hour12: true,
                    })}</p>
                    <p><strong>Action:</strong> {activity.actionType}</p>
                    <p><strong>User:</strong> {activity.username}</p>
                  </Card>
                </Col>
              ))}
            </Row>
          )}
        </div>
      </Card>
    </div>
  </>
  );
};

export default Activity;
