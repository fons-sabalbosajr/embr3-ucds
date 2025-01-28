import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import { Button } from "antd";
import { MenuOutlined, CloseOutlined } from "@ant-design/icons";
import homelogo from "./assets/UCDSInformation.png";
import databaseImage from "./assets/picbghome.png";
import "./home.css";

const Home = () => {
  const [menuOpen, setMenuOpen] = useState(false);

  const toggleMenu = () => {
    setMenuOpen((prev) => !prev);
  };

  return (
    <div className="home-container">
      <nav className="navbar">
        <div className="logo_container">
          <img src={homelogo} alt="Logo" className="logo" />
        </div>
        <button
          className="menu_icon"
          onClick={toggleMenu}
          aria-label="Toggle menu"
        >
          {menuOpen ? <CloseOutlined /> : <MenuOutlined />}
        </button>
        <ul className={`menu_container ${menuOpen ? "open" : ""}`}>
          <li>
            <NavLink to="https://embr3-ucds.netlify.app" className="menu_item" activeClassName="active">
              About EMB-UCDS
            </NavLink>
          </li>
          <li>
            <NavLink to="https://embr3-ucds.netlify.app" className="menu_item" activeClassName="active">
              Programs
            </NavLink>
          </li>
          <li>
            <NavLink to="https://embr3-ucds.netlify.app" className="menu_item" activeClassName="active">
              Contacts
            </NavLink>
          </li>
          <li>
            <NavLink to="/login" className="menu_item signup" activeClassName="active">
              Log in
            </NavLink>
          </li>
        </ul>
      </nav>

      <div className="home-content">
        <div className="text-content">
          <h1>
            Universe <span className="highlight">Centralized Database System</span>
          </h1>
          <p className="subheading">
            A harmonization of different firms and industries within DENR-EMB Region III Monitoring Plan.
          </p>
          <div className="button_container">
            <NavLink to="/login">
              <Button type="primary" className="btn-learn-more">
                Get Started
              </Button>
            </NavLink>
          </div>
        </div>
        <div className="image-content">
          <img src={databaseImage} alt="Database Illustration" className="illustration" />
        </div>
      </div>
    </div>
  );
};

export default Home;
