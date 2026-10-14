import React from "react";
import "./logo.css";
// The Bureau's seal is E-Universe's official logo, as on the public pages.
import embLogo from "../assets/emblogo.svg";

const Logo = ({ theme, collapsed }) => {
  return (
    <div className={`logo${collapsed ? " collapsed" : ""}`}>
      <div className="logo-icon-row">
        <img
          src={embLogo}
          alt="E-Universe — Environmental Management Bureau"
          className={`logo-icon-img${collapsed ? " collapsed" : ""}`}
        />
        {!collapsed && (
          <div
            className={`logo-icon-text ${theme === "light" ? "light-theme" : "dark-theme"}`}
          >
            {/* The class name stays `logo-ucds` — it is a style hook, and
                PurgeCSS matches it literally, so renaming it would drop the
                rule from the production bundle. It now carries the accent on
                the "E" rather than on "Universe". */}
            <span className="logo-wordmark">
              <span className="logo-ucds">E</span>-Universe
            </span>
            <span className="logo-tagline">
              Unified Information & Records Management System
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default Logo;
