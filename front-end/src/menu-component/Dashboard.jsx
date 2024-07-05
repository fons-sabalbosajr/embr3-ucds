import React from "react";
import { Row, Col } from "antd";
import "./dashboard.css";
import UserStatus from "../components/UserStatus/UserStatus";
import Bulletin from "../components/Bulletin/Bulletin";
import Calendar from "../components/Calendar/SystemCalendar";
import Summary from "../components/Summary/Summary";
import History from "../components/Summary/History";

const Dashboard = ({ avatar, name }) => {
  return (
    <>
      <Row gutter={[16, 16]}>
        <Col span={5} push={19}>
          <div className="card">
            <div className="card-body-bulletin">
              <UserStatus avatar={avatar} name={name} />
            </div>
          </div>
        </Col>
        <Col span={19} pull={5}>
          <div className="card">
            <div className="card-body-users">
              <Bulletin />
            </div>
          </div>
        </Col>
      </Row>

      <Row gutter={[16, 16]} className="row-gap">
        <Col span={7} push={17}>
          <div className="card">
            <div className="card-body-calendar">
              <Summary />
              <History />
            </div>
          </div>
        </Col>
        <Col span={17} pull={7}>
          <div className="card">
            <div className="card-history">
            <Calendar />
            </div>
          </div>
        </Col>
      </Row>
    </>
  );
};

export default Dashboard;
