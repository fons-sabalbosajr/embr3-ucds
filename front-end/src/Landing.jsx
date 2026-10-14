import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Button, Drawer, FloatButton } from "antd";
import {
  BulbFilled,
  BulbOutlined,
  MenuOutlined,
  DatabaseOutlined,
  SafetyCertificateOutlined,
  BarChartOutlined,
  TeamOutlined,
  FileSearchOutlined,
  CloudServerOutlined,
  ArrowRightOutlined,
} from "@ant-design/icons";
import AuthBrand from "./components/AuthBrand";
import { useTheme } from "./theme/ThemeProvider";
import embLogo from "./assets/emblogo.svg";
import databaseImage from "./assets/picbghome.png";
import announcement from "./assets/announcement.png";
import useWindowWidth from "./hooks/useWindowWith";
import { ROUTES } from "./config/routes";
import "./landing.css";

const MODULES = [
  {
    icon: <DatabaseOutlined />,
    title: "Universe Database",
    body: "A single consolidated register of establishments across Region III, replacing scattered per-unit spreadsheets.",
  },
  {
    icon: <SafetyCertificateOutlined />,
    title: "Permit Monitoring",
    body: "Track ECC, CNC, PTO, WWDP and hazardous waste permits with expiry visibility built in.",
  },
  {
    icon: <FileSearchOutlined />,
    title: "Survey & Validation",
    body: "Capture annual survey data and validate submissions against the master universe record.",
  },
  {
    icon: <BarChartOutlined />,
    title: "Planning & Reports",
    body: "Generate monitoring breakdowns and unit reports directly from live data, ready for export.",
  },
  {
    icon: <TeamOutlined />,
    title: "Sector Coverage",
    body: "Dedicated modules for healthcare, chemicals, TSD, TRC and ecological solid waste management.",
  },
  {
    icon: <CloudServerOutlined />,
    title: "Records & Documents",
    body: "File, track and open scanned records, each traceable to the firm it belongs to.",
  },
];

const Landing = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  // The same theme as the rest of the application. This page used to keep a
  // private light/dark flag and its own ConfigProvider with a fixed green
  // primary, so the choice was lost on navigation and the buttons here did
  // not match the ones a click later.
  const { isDark: isDarkMode, toggleMode: toggleTheme } = useTheme();
  const width = useWindowWidth();
  const isMobile = width <= 768;

  const toggleMenu = () => setMenuOpen((prev) => !prev);

  const navLinks = (
    <>
      <li>
        <a href="#modules" onClick={() => setMenuOpen(false)}>
          Modules
        </a>
      </li>
      <li>
        <a href="#platform" onClick={() => setMenuOpen(false)}>
          Platform
        </a>
      </li>
      <li>
        {/* Public: ask the Records Unit for a scanned document, no account needed. */}
        <Link to={ROUTES.documentPortal} onClick={() => setMenuOpen(false)}>
          Document Portal
        </Link>
      </li>
      <li>
        <a href="#about" onClick={() => setMenuOpen(false)}>
          About
        </a>
      </li>
    </>
  );

  return (
    <>
      <div className={`ucds-landing ${isDarkMode ? "dark-theme" : "light-theme"}`}>
        <header className="ucds-header">
          <div className="ucds-brand">
            <img src={embLogo} alt="EMB Region III seal" />
            <span className="ucds-brand-text">
              <span className="ucds-brand-name">EMBR R3 E-Universe</span>
              <span className="ucds-brand-sub">
                Unified Information and Records Management System
              </span>
            </span>
          </div>

          {!isMobile && <ul className="ucds-nav">{navLinks}</ul>}

          <div className="ucds-header-cta">
            {!isMobile && (
              <Link to={ROUTES.register}>
                <Button type="text">Request access</Button>
              </Link>
            )}
            <Link to={ROUTES.login}>
              <Button type="primary">Log in</Button>
            </Link>
            {isMobile && (
              <button className="menu_icon" onClick={toggleMenu} aria-label="Toggle menu">
                <MenuOutlined />
              </button>
            )}
          </div>
        </header>

        <Drawer title="Menu" placement="right" onClose={toggleMenu} open={menuOpen}>
          <ul className="ucds-nav" style={{ flexDirection: "column", alignItems: "flex-start", gap: 18 }}>
            {navLinks}
            <li>
              <Link to={ROUTES.register} onClick={() => setMenuOpen(false)}>
                Request access
              </Link>
            </li>
          </ul>
        </Drawer>

        {/* ---------- Hero ---------- */}
        <section className="ucds-hero">
          <div>
            <span className="ucds-eyebrow">
              Environmental Management Bureau &middot; Region III
            </span>
            <h1>
              One record for every <span className="accent">regulated establishment</span> in
              Central Luzon.
            </h1>
            <p className="ucds-lede">
              UCDS harmonises monitoring data from every division and provincial unit into a
              single authoritative database &mdash; so permits, surveys and compliance history
              for a firm all resolve to the same record.
            </p>

            <div className="ucds-hero-actions">
              <Link to={ROUTES.login}>
                <Button type="primary" size="large">
                  Log in to UCDS <ArrowRightOutlined />
                </Button>
              </Link>
              <Link to={ROUTES.register}>
                <Button size="large">Request an account</Button>
              </Link>
              <Link to={ROUTES.documentPortal}>
                <Button size="large">Request a document</Button>
              </Link>
            </div>

            <div className="ucds-stats">
              <div>
                <div className="ucds-stat-value">7</div>
                <div className="ucds-stat-label">Provinces covered</div>
              </div>
              <div>
                <div className="ucds-stat-value">6</div>
                <div className="ucds-stat-label">Sector modules</div>
              </div>
              <div>
                <div className="ucds-stat-value">1</div>
                <div className="ucds-stat-label">Source of truth</div>
              </div>
            </div>
          </div>

          <div className="ucds-hero-visual">
            <img src={databaseImage} alt="Centralised database illustration" />
            <div className="ucds-float-card one">
              <span className="dot" />
              Live permit status
            </div>
            <div className="ucds-float-card two">
              <span className="dot" />
              Region-wide coverage
            </div>
          </div>
        </section>

        {/* ---------- Modules ---------- */}
        <section className="ucds-section alt" id="modules">
          <div className="ucds-section-inner">
            <div className="ucds-section-head">
              <h2>Built around how the Bureau actually works</h2>
              <p>
                Each division keeps its own workflow, while the underlying establishment record
                stays shared and consistent.
              </p>
            </div>

            <div className="ucds-grid">
              {MODULES.map((m) => (
                <article className="ucds-card" key={m.title}>
                  <span className="ucds-card-icon">{m.icon}</span>
                  <h3>{m.title}</h3>
                  <p>{m.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- Platform ---------- */}
        <section className="ucds-section" id="platform">
          <div className="ucds-split">
            <div>
              <h2>From scattered spreadsheets to one governed record</h2>
              <p className="ucds-lede" style={{ marginBottom: 0 }}>
                Monitoring data used to live in per-unit files that drifted apart over time. UCDS
                consolidates them, keeps an audit trail of every change, and enforces who may
                view or edit each province.
              </p>
              <ul className="ucds-checklist">
                <li>
                  <span className="tick">&#10003;</span>
                  Role-based access down to individual provincial datasets
                </li>
                <li>
                  <span className="tick">&#10003;</span>
                  Full activity history for every edit, with attribution
                </li>
                <li>
                  <span className="tick">&#10003;</span>
                  Duplicate detection so one firm never becomes two records
                </li>
                <li>
                  <span className="tick">&#10003;</span>
                  Live updates across sessions as colleagues work
                </li>
              </ul>
            </div>

            <div className="ucds-split-visual">
              <img src={announcement} alt="UCDS reporting interface" />
            </div>
          </div>
        </section>

        {/* ---------- CTA ---------- */}
        <section className="ucds-cta" id="about">
          <div className="ucds-cta-inner">
            <h2>Access is limited to authorised EMB Region III personnel</h2>
            <p>
              Accounts are issued per division and provincial unit. If you handle monitoring data
              for the Bureau and do not yet have access, submit a request and your section head
              will be notified for approval.
            </p>
            <Link to={ROUTES.login}>
              <Button type="primary" size="large">
                Proceed to log in
              </Button>
            </Link>
          </div>
        </section>

        {/* ---------- Footer ---------- */}
        <footer className="ucds-footer">
          <div className="ucds-footer-inner">
            <div className="ucds-footer-brand">
              <AuthBrand size="sm" showText={false} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  E-Universe &mdash; Unified Information and Records Management System
                </div>
                <div className="ucds-footer-note">
                  Environmental Management Bureau, Regional Office III &mdash; Department of
                  Environment and Natural Resources
                </div>
              </div>
            </div>
            <div className="ucds-footer-note">
              Diosdado Macapagal Government Center, Maimpis, City of San Fernando, Pampanga
            </div>
          </div>
          <div className="ucds-footer-bottom">
            &copy; {new Date().getFullYear()} DENR &ndash; Environmental Management Bureau Region
            III. For official use only.
          </div>
        </footer>

        <FloatButton
          type="primary"
          icon={isDarkMode ? <BulbFilled /> : <BulbOutlined />}
          tooltip={isDarkMode ? "Light theme" : "Dark theme"}
          onClick={toggleTheme}
          style={{ right: 24, bottom: 24 }}
        />
      </div>
    </>
  );
};

export default Landing;
