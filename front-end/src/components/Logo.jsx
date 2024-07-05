import React from "react";
import "./logo.css";
import embLogo from "../../src/assets/emblogomenu.png";

const Logo = ({ theme, collapsed }) => {
  return (
    <div className={`logo ${collapsed ? "collapsed" : ""}`}>
      <div className={`logo-icon ${collapsed ? "collapsed" : ""}`}>
        <img
          src={embLogo} // Use the imported image
          alt="logo"
          className="logo-icon-img"
        />
        {!collapsed && (
          <div
            className={`logo-icon-text ${
              theme === "light" ? "light-theme" : "dark-theme"
            }`}
          >
            EMBR3 UCDS
          </div>
        )}
      </div>
    </div>
  );
};

export default Logo;
