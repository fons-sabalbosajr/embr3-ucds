import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import { Button, Drawer, ConfigProvider, FloatButton, theme } from "antd";
import { BulbOutlined, BulbFilled, MenuOutlined } from "@ant-design/icons";
import homelogo from "./assets/UCDSInformation.png";
import databaseImage from "./assets/picbghome.png";
import useWindowWidth from "./hooks/useWindowWith";
import "./home.css";

const Home = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const width = useWindowWidth();
  const isMobile = width <= 768;

  const toggleMenu = () => setMenuOpen((prev) => !prev);
  const toggleTheme = () => setIsDarkMode((prev) => !prev);

  const renderMenu = () => (
    <ul className="menu_container">
      <li>
        <NavLink to="https://embr3-ucds.netlify.app" className="menu_item">
          About EMB-UCDS
        </NavLink>
      </li>
      <li>
        <NavLink to="https://embr3-ucds.netlify.app" className="menu_item">
          Programs
        </NavLink>
      </li>
      <li>
        <NavLink to="https://embr3-ucds.netlify.app" className="menu_item">
          Contacts
        </NavLink>
      </li>
      <li>
        <NavLink to="/login" className="menu_item signup">
          Log in
        </NavLink>
      </li>
    </ul>
  );

  return (
    <ConfigProvider
      theme={{
        algorithm: isDarkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
      }}
    >
      <div
        className={`home-container ${
          isDarkMode ? "dark-theme" : "light-theme"
        }`}
      >
        <nav className="navbar">
          <div className="logo_container">
            <img src={homelogo} alt="Logo" className="logo" />
          </div>
          {isMobile ? (
            <button
              className="menu_icon"
              onClick={toggleMenu}
              aria-label="Toggle menu"
            >
              <MenuOutlined />
            </button>
          ) : (
            renderMenu()
          )}
          <FloatButton
            icon={isDarkMode ? <BulbFilled /> : <BulbOutlined />}
            tooltip={
              isDarkMode ? "Light Theme" : "Dark Theme"
            }
            onClick={toggleTheme}
            style={{
              right: 24,
              bottom: 24,
              backgroundColor: isDarkMode ? "#9ddf85" : "#548547",
              color: isDarkMode ? "#141414" : "#fff",
            }}
          />
        </nav>

        <Drawer
          title="Menu"
          placement="right"
          onClose={toggleMenu}
          open={menuOpen}
          style={{ padding: 0 }}
        >
          {renderMenu()}
        </Drawer>

        <div className="home-content">
          <div className="text-content">
            <h1>
              Universe{" "}
              <span className="highlight">Centralized Database System</span>
            </h1>
            <p className="subheading">
              A harmonization of different firms and industries within DENR-EMB
              Region III Monitoring Plan.
            </p>
            <div className="button_container">
              <NavLink to="/login">
                <Button type="primary" className="get-started">Get Started</Button>
              </NavLink>
            </div>
          </div>
          <div className="image-content">
            <img
              src={databaseImage}
              alt="Database Illustration"
              className="illustration"
            />
          </div>
        </div>
      </div>
    </ConfigProvider>
  );
};

export default Home;
