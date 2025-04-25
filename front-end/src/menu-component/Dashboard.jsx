import React from "react";
import { Row, Col } from "antd";
import "./dashboard.css";
import UserStatus from "../components/UserStatus/UserStatus";
import Bulletin from "../components/Bulletin/Bulletin";
import Calendar from "../components/Calendar/SystemCalendar";
import Summary from "../components/History/History";
import Activity from "../components/Summary/Activity";

const Dashboard = ({ avatar, name, theme = "dark" }) => {
  return (
    <div className="dashboard-container">
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={18}>
          <div className="card">
          <Bulletin theme={theme} />
          </div>
        </Col>
        <Col xs={24} lg={6}>
          <div className="card" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
            <UserStatus avatar={avatar} name={name} theme={theme} />
          </div>
        </Col>
      </Row>
      <Row gutter={[16, 16]} className="row-gap">
        <Col xs={24} lg={18}>
          <div className="card-bottom">
            <Calendar theme={theme}/>
          </div>
        </Col>
        <Col xs={24} lg={6} className="right-column">
          <div className="card-bottom">
            <Activity />
          </div>
          <div className="card-changes">
            <Summary />
          </div>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;
