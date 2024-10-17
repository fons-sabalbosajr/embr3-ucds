import React, { useEffect, useState } from "react";
import { Card, Row, Col, Spin, Tag, Tooltip } from "antd";
import axios from "axios";
import "./activity.css";

const Activity = () => {
  const [encodedFirms, setEncodedFirms] = useState(0);
  const [updatedFirms, setUpdatedFirms] = useState(0);
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState(null);
  const [hoveredData, setHoveredData] = useState({});

  // Function to fetch user details by username
  const fetchUserByUsername = async (username) => {
    try {
      const response = await axios.get(`https://embr3-ucds.onrender.com/api/users`, {
        params: { username }, // This sends the username as a query parameter
      });
      return response.data.length > 0 ? response.data[0] : null; // Return the first user or null if not found
    } catch (error) {
      console.error("Error fetching user:", error);
      return null; // Return null on error
    }
  };

  // Function to fetch UCDS data by ID
  const fetchUCDSDataByECC = async (ecc_cnc) => {
    try {
      const response = await axios.get(`https://embr3-ucds.onrender.com/api/ucds`, {
        params: { ecc_cnc }, // Assuming the API can filter by ecc_cnc
      });
      return response.data.length > 0 ? response.data[0] : null;
    } catch (error) {
      console.error("Error fetching UCDS data:", error);
      return null;
    }
  };

  // Function to fetch survey data by IIS number
  const fetchSurveyData = async (iis_no) => {
    try {
      const response = await axios.get(`https://embr3-ucds.onrender.com/api/surveys`, {
        params: { iis_no },
      });
      return response.data.length > 0 ? response.data[0] : null;
    } catch (error) {
      console.error("Error fetching survey data:", error);
      return null;
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch firm counts
        const firmCountResponse = await axios.get("https://embr3-ucds.onrender.com/api/firm-count");
        setEncodedFirms(firmCountResponse.data.count); // Set the total count of documents
  
        // Fetch recent activity data
        const ucdsResponse = await axios.get("https://embr3-ucds.onrender.com/api/ucds-log");
        const surveyResponse = await axios.get("https://embr3-ucds.onrender.com/api/survey-log");
  
        // Count the number of modified records in ucds-log and survey-log
        const modifiedUcdsCount = ucdsResponse.data.filter((log) => log.actionType === "Modified").length;
        const modifiedSurveyCount = surveyResponse.data.filter((log) => log.actionType === "Modified").length;
  
        // Set the updated firms count
        setUpdatedFirms(modifiedUcdsCount + modifiedSurveyCount);
  
        // Combine logs for recent activity
        const combinedRecentActivity = [
          ...ucdsResponse.data.map((log) => ({
            timestamp: log.dateActed,
            actionType: log.actionType,
            username: log.userActed, // Assuming this is the username
            ecc_cnc: log.ecc_cnc, // Add ECC CNC
          })),
          ...surveyResponse.data.map((log) => {
            const ecc_cnc = log.newValue.split("\n")[0].trim(); // Extract ECC CNC from newValue
            return {
              timestamp: log.dateActed,
              actionType: log.actionType,
              username: log.userActed, // Assuming this is the username
              ecc_cnc: ecc_cnc, // Add ECC CNC
            };
          }),
        ];
  
        // Sort by timestamp and take the latest 5 entries
        const sortedActivity = combinedRecentActivity
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
          .slice(0, 5);
  
        // Set recent activity data
        setRecentActivity(sortedActivity);
      } catch (error) {
        console.error("There was an error fetching the data!", error);
      } finally {
        setLoading(false);
      }
    };
  
    fetchData();
  }, []);

  useEffect(() => {
    const username = localStorage.getItem("username"); // Get username from local storage
    if (username) {
      fetchUserByUsername(username).then((user) => {
        if (user) {
          setUserData(user); // Store user data
        }
      });
    }
  }, []);

  // Function to determine the tag class based on action type
  const getTagClass = (actionType) => {
    switch (actionType) {
      case "Create":
        return "tag-create";
      case "Initial Data":
        return "tag-add";
      case "Modified":
        return "tag-update";
      case "Delete":
        return "tag-delete";
      default:
        return "";
    }
  };

  const handleHover = async (ecc_cnc) => {
    const ucdsData = await fetchUCDSDataByECC(ecc_cnc);
    setHoveredData(ucdsData);
  };

  return (
    <div>
      <Card className="activity-container">
        <h3 className="activity-title">Summary</h3>

        <div className="metrics-container">
          <Row className="metric-row" gutter={[16, 16]}>
            <Col span={12} className="metric-col">
              <div className="metric-label" style={{ fontSize: "11px" }}>
                Encoded Firms
              </div>
            </Col>
            <Col span={12} className="metric-col">
              <div className="metric-value" style={{ fontSize: "11px" }}>
                {encodedFirms}
              </div>
            </Col>
          </Row>
          <Row className="metric-row" gutter={[16, 16]}>
            <Col span={12} className="metric-col">
              <div className="metric-label" style={{ fontSize: "11px" }}>
                Updated Firms
              </div>
            </Col>
            <Col span={12} className="metric-col">
              <div className="metric-value" style={{ fontSize: "11px" }}>
                {updatedFirms}
              </div>
            </Col>
          </Row>

          <h4 className="recent-activity-title">Your Recent Activity</h4>
          {loading ? (
            <Spin />
          ) : recentActivity.length >= 2 ? ( // Check if there are at least 2 records
            <Row className="activity-row">
              {recentActivity.slice(0, 2).map(
                (
                  activity,
                  index // Only display the first 2 records
                ) => (
                  <Col span={24} key={index} className="activity-col">
                    <Card className="activity-card" size="small">
                      <div className="activity-row">
                        <p className="activity-text">
                          <strong className="label-activity">Date:</strong>{" "}
                          {new Date(activity.timestamp).toLocaleString(
                            "en-US",
                            {
                              month: "2-digit",
                              day: "2-digit",
                              year: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                              hour12: true,
                            }
                          )}
                        </p>
                      </div>
                      <div className="activity-row">
                        <p className="activity-text">
                          <strong className="label-activity">Action:</strong>
                          <Tag className={getTagClass(activity.actionType)}>
                            {activity.actionType}
                          </Tag>
                        </p>
                      </div>
                      <div className="activity-row">
                        <p className="activity-text">
                          <strong className="label-activity">User :</strong>{" "}
                          {userData ? userData.name : activity.username}{" "}
                        </p>
                      </div>
                      <div className="activity-row">
                        <p className="activity-text">
                          <strong className="label-activity">Ref. No. :</strong>{" "}
                          <span
                            onMouseEnter={() => handleHover(activity.ecc_cnc)}
                            onMouseLeave={() => setHoveredData({})}
                          >
                            {activity.ecc_cnc}
                          </span>
                          {hoveredData && (
                            <Tooltip
                              title={
                                <div>
                                  <p>
                                    <strong>UCDS Data:</strong>
                                  </p>
                                  <p>{hoveredData.ucdsData}</p>
                                </div>
                              }
                            >
                              <i className="fas fa-info-circle" />
                            </Tooltip>
                          )}
                        </p>
                      </div>
                    </Card>
                  </Col>
                )
              )}
            </Row>
          ) : (
            <p>No recent activity to display.</p> // Message when there are fewer than 2 records
          )}
        </div>
      </Card>
    </div>
  );
};

export default Activity;
