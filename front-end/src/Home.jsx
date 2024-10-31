import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "antd";
import { MenuOutlined, CloseOutlined } from "@ant-design/icons";
import homelogo from "./assets/emblogomenu.png";
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
        <div className="menu_icon" onClick={toggleMenu}>
          {menuOpen ? <CloseOutlined /> : <MenuOutlined />}
        </div>
        <ul className={`menu_container ${menuOpen ? "open" : ""}`}>
          <li>
            <a href="https://embr3-ucds.netlify.app" className="menu_item">About EMB-UCDS</a>
          </li>
          <li>
            <a href="https://embr3-ucds.netlify.app" className="menu_item">Programs</a>
          </li>
          <li>
            <a href="https://embr3-ucds.netlify.app" className="menu_item">Contacts</a>
          </li>
          <li>
            <a href="/login" className="menu_item signup">Log in</a>
          </li>
        </ul>
      </nav>

      <div className="home-content">
        <div className="text-content">
          <h1>Universe <span className="highlight">Centralized Database System</span></h1>
          <p className="subheading">
            A harmonization of different firms and industries within DENR-EMB Region III Monitoring Plan.
          </p>
          <div className="button_container">
            <Link to="/login">
              <Button type="primary" className="btn-learn-more">
                Get Started
              </Button>
            </Link>
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