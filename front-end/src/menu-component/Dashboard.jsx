import React from "react";
import { Row, Col } from "antd";
import "./dashboard.css";
import UserStatus from "../components/UserStatus/UserStatus";
import Bulletin from "../components/Bulletin/Bulletin";
import Calendar from "../components/Calendar/SystemCalendar";
import Summary from "../components/History/History";
import Activity from "../components/Summary/Activity";


const Dashboard = ({ avatar, name }) => {
  return (
    <div className="dashboard-container">
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={17}>
          <div className="card">
            <Bulletin />
          </div>
        </Col>
        <Col xs={24} lg={7}>
          <div className="card">
            <UserStatus avatar={avatar} name={name} />
          </div>
        </Col>
      </Row>
      <Row gutter={[16, 16]} className="row-gap">
        <Col xs={24} lg={17}>
          <div className="card-bottom">
            <Calendar />
          </div>
        </Col>
        <Col xs={24} lg={7} className="right-column">
          <div className="card-bottom">
            {/* <Activity /> */}
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
