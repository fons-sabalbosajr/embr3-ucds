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
            {/* The class name stays `logo-ucds` — it is a style hook, and
                PurgeCSS matches it literally, so renaming it would drop the
                rule from the production bundle. */}
            <span>
              E-<span className="logo-ucds">Universe</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default Logo;