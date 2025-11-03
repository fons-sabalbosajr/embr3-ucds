import React from "react";
import "./logo.css";
import embLogo from "../assets/UCDSInformation.png";

const Logo = ({ theme, collapsed }) => {
  return (
    <div className={`logo${collapsed ? " collapsed" : ""}`}>
      <div className="logo-icon-row">
        <img
          src={embLogo}
          alt="logo"
          className={`logo-icon-img${collapsed ? " collapsed" : ""}`}
        />
        {!collapsed && (
          <div
            className={`logo-icon-text ${theme === "light" ? "light-theme" : "dark-theme"}`}
          >
            <span>
              EMBR3&nbsp;<span className="logo-ucds">UCDS</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default Logo;