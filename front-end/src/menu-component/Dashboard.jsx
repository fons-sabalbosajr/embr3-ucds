import React from "react";
import { Row, Col } from "antd";
import "./dashboard.css";
import UserStatus from "../components/UserStatus/UserStatus";
import Bulletin from "../components/Bulletin/Bulletin";
import Calendar from "../components/Calendar/SystemCalendar";
import Summary from "../components/History/History";
import Activity from "../components/Summary/Activity";

const Dashboard = ({ avatar, name, theme = "dark" }) => {
  const isDark = theme === "dark";

  const getCardClass = (baseClass = "card") =>
    `${baseClass} ${isDark ? "dark-theme" : "light-theme"}`;

  return (
    <div className={`dashboard-container ${isDark ? "dark-theme" : "light-theme"}`}>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={18}>
          <div className={getCardClass()}>
            <Bulletin />
          </div>
        </Col>
        <Col xs={24} lg={6}>
          <div
            className={getCardClass()}
            style={{ height: "100%", display: "flex", flexDirection: "column" }}
          >
            <UserStatus avatar={avatar} name={name} />
          </div>
        </Col>
      </Row>
      <Row gutter={[16, 16]} className="row-gap">
        <Col xs={24} lg={18}>
          <div className={getCardClass("card-bottom")}>
            <Calendar />
          </div>
        </Col>
        <Col xs={24} lg={6} className="right-column">
          <div className={getCardClass("card-bottom")}>
            <Activity />
          </div>
          <div className={getCardClass("card-changes")}>
            <Summary />
          </div>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;
