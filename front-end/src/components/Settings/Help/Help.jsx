import React, { useState } from "react";
import {
  FcStart,
  FcSettings,
  FcDisplay,
  FcPrivacy,
  FcFaq,
  FcSupport,
} from "react-icons/fc";
import "./help.css";

const helpTopics = [
  {
    id: 1,
    icon: <FcStart size={36} />,
    title: "Getting Started",
    desc: "Learn how to begin your journey.",
  },
  {
    id: 2,
    icon: <FcSettings size={36} />,
    title: "Account Settings",
    desc: "Manage your profile and preferences.",
  },
  {
    id: 3,
    icon: <FcDisplay size={36} />,
    title: "Interface",
    desc: "Customize and navigate the system UI.",
  },
  {
    id: 4,
    icon: <FcPrivacy size={36} />,
    title: "Trust and Safety",
    desc: "Understand security and privacy policies.",
  },
  {
    id: 5,
    icon: <FcFaq size={36} />,
    title: "F.A.Q",
    desc: "Find answers to common questions.",
  },
  {
    id: 6,
    icon: <FcSupport size={36} />,
    title: "System Setup",
    desc: "Configure the system for your needs.",
  },
];

const Help = ({ theme = "light" }) => {
  const [query, setQuery] = useState("");

  return (
    <div className={`help-container ${theme}`}>
      {/* Welcome Card */}
      <div className="help-welcome-card">
        <h2>Welcome to E-Universe Support</h2>
        <div className="help-search-box">
          <input
            type="text"
            placeholder="Type your question or issue here..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            onClick={() =>
              window.open(
                "https://embr3-ucds.netlify.app/",
                "_blank",
                "noopener,noreferrer"
              )
            }
          >
            Search
          </button>
        </div>
      </div>

      {/* Help Text */}
      <div className="help-text-section">
        <h3>Need help? We've got your back</h3>
        <small>Perhaps you can find answers in our collections</small>
      </div>

      {/* Help Topic Tiles */}
      <div className="help-tiles-container">
        {helpTopics.map((topic) => (
          <div
            key={topic.id}
            className="help-tile"
            onClick={() =>
              window.open(
                "https://embr3-ucds.netlify.app/",
                "_blank",
                "noopener,noreferrer"
              )
            }
          >
            <div className="help-tile-icon">{topic.icon}</div>
            <strong className="help-tile-title">{topic.title}</strong>
            <small className="help-tile-desc">{topic.desc}</small>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Help;
