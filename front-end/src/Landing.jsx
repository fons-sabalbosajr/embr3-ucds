/* eslint-disable react/prop-types -- the application does not use PropTypes */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Drawer, Tooltip, theme as antdTheme } from "antd";
import {
  ArrowRightOutlined,
  AuditOutlined,
  BarChartOutlined,
  BulbFilled,
  BulbOutlined,
  CheckOutlined,
  CloudServerOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  FileSearchOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  FormOutlined,
  LockOutlined,
  MenuOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { useTheme } from "./theme/ThemeProvider";
import embLogo from "./assets/emblogo.svg";
import bagongPilipinas from "./assets/bagongpilipinas.png";
import useWindowWidth from "./hooks/useWindowWith";
import { ROUTES } from "./config/routes";
import "./landing.css";

// ---------------------------------------------------------------------------
// The public landing page.
//
// It is built from the same identity as the application behind it: the hero
// uses the navigation surfaces (--eu-sider-bg, --eu-header-bg, --eu-accent,
// set by ThemeProvider from the person's accent), which stay dark in both
// themes exactly as the sidebar and the sign-in page do, and the sections
// below take Ant Design's live tokens, so they follow light and dark mode
// without a second palette.
//
// The preview in the hero is a drawing of the real shell (sidebar, header,
// dashboard tiles, the province chart), not a screenshot: it follows the
// accent, and it shows no figures, because a number on a public page reads
// as a fact about the register.
//
// Motion is CSS only: no animation library on the path to the sign-in page.
// Everything is still under prefers-reduced-motion. Class names are written
// out whole, never assembled from pieces, because PurgeCSS drops a rule whose
// class it cannot find literally in the source (postcss.config.js).
// ---------------------------------------------------------------------------

const MODULES = [
  {
    icon: <DatabaseOutlined />,
    title: "Universe Central DB",
    body: "A single consolidated register of establishments across Region III, replacing scattered per-unit spreadsheets.",
  },
  {
    icon: <SafetyCertificateOutlined />,
    title: "Permit Monitoring",
    body: "Track ECC, CNC, PTO, WWDP and hazardous waste permits, with expiry visibility built in.",
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
    body: "File, track and open scanned records through ERMS, each traceable to the firm it belongs to.",
  },
];

const STEPS = [
  {
    icon: <FormOutlined />,
    title: "Encode",
    body: "Provincial units and divisions file establishments, permits and monitoring results where they work.",
  },
  {
    icon: <AuditOutlined />,
    title: "Validate",
    body: "Duplicates are caught, every edit is attributed, and each firm stays one record.",
  },
  {
    icon: <FileTextOutlined />,
    title: "Report",
    body: "Breakdowns, accomplishment reports and exports come straight from the live register.",
  },
];

const CHECKS = [
  "Role-based access down to individual provincial datasets",
  "Full activity history for every edit, with attribution",
  "Duplicate detection so one firm never becomes two records",
  "Live updates across sessions as colleagues work",
];

// The preview's sidebar, as the real one reads.
const SIDER = [
  { icon: <DashboardOutlined />, label: "Dashboard", cls: "lp-win-item is-active" },
  { icon: <DatabaseOutlined />, label: "Universe Central DB", cls: "lp-win-item" },
  { icon: <FolderOpenOutlined />, label: "ERMS", cls: "lp-win-item" },
  { icon: <SettingOutlined />, label: "Settings", cls: "lp-win-item" },
];

const TILES = ["Establishments", "With a permit", "ECC / CNC"];

// Bar heights are a drawing, not data: no figures are shown.
const PROVINCES = [
  { name: "Aurora", h: 28 },
  { name: "Bataan", h: 52 },
  { name: "Bulacan", h: 92 },
  { name: "N. Ecija", h: 64 },
  { name: "Pampanga", h: 80 },
  { name: "Tarlac", h: 48 },
  { name: "Zambales", h: 40 },
];

const ROWS = [
  { w: "lp-skel lp-skel-70", tag: "ECC", cls: "lp-tag lp-tag-ok" },
  { w: "lp-skel lp-skel-55", tag: "PTO", cls: "lp-tag lp-tag-info" },
  { w: "lp-skel lp-skel-80", tag: "Renewal", cls: "lp-tag lp-tag-warn" },
];

const SECTIONS = ["modules", "platform", "about"];

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Counts up to `to` the first time it scrolls into view. */
const CountUp = ({ to, duration = 1400 }) => {
  const ref = useRef(null);
  const [value, setValue] = useState(() => (prefersReducedMotion() ? to : 0));

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || typeof IntersectionObserver === "undefined") {
      setValue(to);
      return undefined;
    }
    let frame;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        const start = performance.now();
        const tick = (now) => {
          const t = Math.min(1, (now - start) / duration);
          setValue(Math.round(to * (1 - Math.pow(1 - t, 3))));
          if (t < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.6 }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [to, duration]);

  return <span ref={ref}>{value.toLocaleString()}</span>;
};

/** The miniature E-Universe window in the hero. */
const AppPreview = () => (
  <div className="lp-window" aria-hidden="true">
    <div className="lp-window-bar">
      <span className="lp-window-dot" />
      <span className="lp-window-dot" />
      <span className="lp-window-dot" />
      <span className="lp-window-url">
        <LockOutlined /> e-universe / home
      </span>
    </div>

    <div className="lp-window-body">
      <aside className="lp-win-sider">
        <div className="lp-win-logo">
          <img src={embLogo} alt="" />
          <span>
            <b>E</b>-Universe
          </span>
        </div>
        {SIDER.map((item, i) => (
          <div key={item.label} className={item.cls} style={{ "--d": `${700 + i * 90}ms` }}>
            {item.icon}
            <span>{item.label}</span>
          </div>
        ))}
      </aside>

      <div className="lp-win-main">
        <div className="lp-win-header">
          <span className="lp-win-title">Dashboard</span>
          <span className="lp-win-year">2027</span>
        </div>

        <div className="lp-win-tiles">
          {TILES.map((label, i) => (
            <div key={label} className="lp-win-tile" style={{ "--d": `${900 + i * 120}ms` }}>
              <span className="lp-win-tile-label">{label}</span>
              <span className="lp-skel lp-skel-40" />
              <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="lp-spark">
                <polyline points={i === 1 ? "0,22 18,18 34,20 52,12 70,14 86,6 100,8" : i === 2 ? "0,18 16,20 32,14 50,16 66,9 84,11 100,4" : "0,24 20,16 38,18 54,10 72,12 88,5 100,6"} />
              </svg>
            </div>
          ))}
        </div>

        <div className="lp-win-panel">
          <div className="lp-win-panel-title">Establishments by province</div>
          <div className="lp-win-bars">
            {PROVINCES.map((p, i) => (
              <div key={p.name} className="lp-win-bar" style={{ "--h": `${p.h}%`, "--d": `${1100 + i * 80}ms` }}>
                <span className="lp-win-bar-fill" />
                <em>{p.name}</em>
              </div>
            ))}
          </div>
        </div>

        <div className="lp-win-rows">
          {ROWS.map((r, i) => (
            <div key={r.tag} className="lp-win-row" style={{ "--d": `${1500 + i * 110}ms` }}>
              <span className="lp-win-avatar" />
              <span className={r.w} />
              <span className={r.cls}>{r.tag}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

const Landing = () => {
  const { isDark, toggleMode } = useTheme();
  const { token } = antdTheme.useToken();
  const width = useWindowWidth();
  const isMobile = width <= 860;

  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState("");
  const rootRef = useRef(null);
  const progressRef = useRef(null);
  const visualRef = useRef(null);

  // Header state and the reading-progress bar, on one passive listener. The
  // bar is written straight to the element so scrolling never re-renders.
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      setScrolled(y > 24);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (progressRef.current) progressRef.current.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  // Reveal on scroll: anything marked data-reveal gets is-visible once, the
  // first time it comes into view. Without the observer, or with reduced
  // motion, everything is shown at once.
  useEffect(() => {
    const nodes = rootRef.current?.querySelectorAll("[data-reveal]") || [];
    if (prefersReducedMotion() || typeof IntersectionObserver === "undefined") {
      nodes.forEach((n) => n.classList.add("is-visible"));
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );
    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, []);

  // Which section the nav should mark as current.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setActive(entry.target.id);
      },
      { rootMargin: "-45% 0px -50% 0px" }
    );
    SECTIONS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const goTo = useCallback((event, id) => {
    event.preventDefault();
    setMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  }, []);

  // The preview leans toward the pointer. Mouse and pen only: on touch it
  // would fight the scroll.
  const onPointerMove = useCallback((event) => {
    const el = visualRef.current;
    if (!el || event.pointerType === "touch" || prefersReducedMotion()) return;
    const rect = el.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    el.style.setProperty("--ry", `${(x * 10).toFixed(2)}deg`);
    el.style.setProperty("--rx", `${(-y * 8).toFixed(2)}deg`);
  }, []);
  const onPointerLeave = useCallback(() => {
    visualRef.current?.style.setProperty("--ry", "-8deg");
    visualRef.current?.style.setProperty("--rx", "4deg");
  }, []);

  // Live tokens, published once for the stylesheet, as AuthShell does.
  const surface = {
    "--lp-bg": token.colorBgLayout,
    "--lp-card": token.colorBgContainer,
    "--lp-text": token.colorText,
    "--lp-text-2": token.colorTextSecondary,
    "--lp-text-3": token.colorTextTertiary,
    "--lp-border": token.colorBorderSecondary,
    "--lp-fill": token.colorFillQuaternary,
    "--lp-radius": `${token.borderRadiusLG}px`,
  };

  const navLinks = (
    <>
      {[
        ["modules", "Modules"],
        ["platform", "Platform"],
      ].map(([id, label]) => (
        <li key={id}>
          <a href={`#${id}`} className={active === id ? "lp-nav-link is-active" : "lp-nav-link"} onClick={(e) => goTo(e, id)}>
            {label}
          </a>
        </li>
      ))}
      <li>
        {/* Public: ask the Records Unit for a scanned document, no account needed. */}
        <Link to={ROUTES.documentPortal} className="lp-nav-link" onClick={() => setMenuOpen(false)}>
          Document Portal
        </Link>
      </li>
      <li>
        <a href="#about" className={active === "about" ? "lp-nav-link is-active" : "lp-nav-link"} onClick={(e) => goTo(e, "about")}>
          About
        </a>
      </li>
    </>
  );

  const themeLabel = isDark ? "Switch to light theme" : "Switch to dark theme";

  return (
    <div ref={rootRef} className={`lp ${isDark ? "dark-theme" : "light-theme"}`} style={surface}>
      <div className="lp-progress" ref={progressRef} aria-hidden="true" />

      {/* ---------- Header ---------- */}
      <header className={scrolled ? "lp-header is-scrolled" : "lp-header"}>
        <a href="#top" className="lp-brand" onClick={(e) => goTo(e, "top")} aria-label="E-Universe, back to top">
          <img src={embLogo} alt="" className="lp-brand-seal" />
          <span className="lp-brand-text">
            <span className="lp-brand-name">
              <b>E</b>-Universe
            </span>
            <span className="lp-brand-sub">Unified Information and Records Management System</span>
          </span>
        </a>

        {!isMobile && <ul className="lp-nav">{navLinks}</ul>}

        <div className="lp-header-cta">
          <Tooltip title={themeLabel}>
            <Button
              type="text"
              shape="circle"
              className="lp-icon-btn"
              aria-label={themeLabel}
              icon={isDark ? <BulbFilled /> : <BulbOutlined />}
              onClick={toggleMode}
            />
          </Tooltip>
          {!isMobile && (
            <Link to={ROUTES.register}>
              <Button type="text" className="lp-text-btn">
                Request access
              </Button>
            </Link>
          )}
          <Link to={ROUTES.login}>
            <Button type="primary" className="lp-shine">
              Log in
            </Button>
          </Link>
          {isMobile && (
            <Button
              type="text"
              shape="circle"
              className="lp-icon-btn"
              aria-label="Open menu"
              icon={<MenuOutlined />}
              onClick={() => setMenuOpen(true)}
            />
          )}
        </div>
      </header>

      <Drawer title="E-Universe" placement="right" width={280} onClose={() => setMenuOpen(false)} open={menuOpen}>
        <ul className="lp-nav lp-nav-drawer">
          {navLinks}
          <li>
            <Link to={ROUTES.register} className="lp-nav-link" onClick={() => setMenuOpen(false)}>
              Request access
            </Link>
          </li>
        </ul>
      </Drawer>

      {/* ---------- Hero ---------- */}
      <section className="lp-hero" id="top">
        <div className="lp-hero-bg" aria-hidden="true">
          <span className="lp-aurora lp-aurora-1" />
          <span className="lp-aurora lp-aurora-2" />
          <span className="lp-aurora lp-aurora-3" />
          <span className="lp-grid" />
        </div>

        <div className="lp-hero-inner">
          <div className="lp-hero-copy">
            <div className="lp-seals lp-enter" style={{ "--d": "0ms" }}>
              <img src={embLogo} alt="Environmental Management Bureau" className="lp-seal" />
              <span className="lp-seal-divider" aria-hidden="true" />
              <img src={bagongPilipinas} alt="Bagong Pilipinas" className="lp-seal" />
              <span className="lp-seals-text">
                <span>Republic of the Philippines</span>
                <strong>Department of Environment and Natural Resources</strong>
                <span>Environmental Management Bureau · Region III</span>
              </span>
            </div>

            <span className="lp-eyebrow lp-enter" style={{ "--d": "120ms" }}>
              <span className="lp-pulse" /> E-Universe for EMB Region III
            </span>

            <h1 className="lp-enter" style={{ "--d": "220ms" }}>
              One record for every <span className="lp-gradient-text">regulated establishment</span> in Central Luzon.
            </h1>

            <p className="lp-lede lp-enter" style={{ "--d": "340ms" }}>
              E-Universe brings monitoring data from every division and provincial unit into a single, governed database, so a
              firm&rsquo;s permits, surveys, records and compliance history all resolve to the same record.
            </p>

            <div className="lp-hero-actions lp-enter" style={{ "--d": "460ms" }}>
              <Link to={ROUTES.login}>
                <Button type="primary" size="large" className="lp-shine lp-cta-btn">
                  Log in to E-Universe <ArrowRightOutlined className="lp-arrow" />
                </Button>
              </Link>
              <Link to={ROUTES.register}>
                <Button size="large" ghost className="lp-ghost-btn">
                  Request an account
                </Button>
              </Link>
            </div>

            <div className="lp-stats lp-enter" style={{ "--d": "580ms" }}>
              <div className="lp-stat">
                <span className="lp-stat-value">
                  <CountUp to={7} />
                </span>
                <span className="lp-stat-label">Provinces covered</span>
              </div>
              <div className="lp-stat">
                <span className="lp-stat-value">
                  <CountUp to={6} />
                </span>
                <span className="lp-stat-label">Sector modules</span>
              </div>
              <div className="lp-stat">
                <span className="lp-stat-value">
                  <CountUp to={1} />
                </span>
                <span className="lp-stat-label">Source of truth</span>
              </div>
            </div>
          </div>

          <div
            className="lp-hero-visual lp-enter"
            style={{ "--d": "300ms" }}
            ref={visualRef}
            onPointerMove={onPointerMove}
            onPointerLeave={onPointerLeave}
          >
            <div className="lp-tilt">
              <AppPreview />
              <div className="lp-chip lp-chip-1">
                <span className="lp-pulse" /> Live updates across sessions
              </div>
              <div className="lp-chip lp-chip-2">
                <SafetyCertificateOutlined /> Permit expiry tracked
              </div>
              <div className="lp-chip lp-chip-3">
                <LockOutlined /> Role-based access
              </div>
            </div>
          </div>
        </div>

        <a href="#modules" className="lp-scroll-cue" onClick={(e) => goTo(e, "modules")} aria-label="Scroll to modules">
          <span />
        </a>
      </section>

      {/* ---------- Modules ---------- */}
      <section className="lp-section lp-section-modules" id="modules">
        <div className="lp-section-inner">
          <div className="lp-section-head" data-reveal>
            <span className="lp-kicker">Modules</span>
            <h2>Built around how the Bureau actually works</h2>
            <p>Each division keeps its own workflow, while the underlying establishment record stays shared and consistent.</p>
          </div>

          <div className="lp-grid-cards">
            {MODULES.map((m, i) => (
              // The reveal sits on a wrapper so its transform and delay never
              // fight the card's own hover lift.
              <div className="lp-card-wrap" key={m.title} data-reveal style={{ "--d": `${(i % 3) * 110}ms` }}>
                <article className="lp-card">
                  <span className="lp-card-icon">{m.icon}</span>
                  <h3>{m.title}</h3>
                  <p>{m.body}</p>
                </article>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Platform ---------- */}
      <section className="lp-section lp-section-platform" id="platform">
        <div className="lp-section-inner lp-split">
          <div data-reveal>
            <span className="lp-kicker">Platform</span>
            <h2>From scattered spreadsheets to one governed record</h2>
            <p className="lp-body">
              Monitoring data used to live in per-unit files that drifted apart over time. E-Universe consolidates them, keeps an
              audit trail of every change, and enforces who may view or edit each province.
            </p>
            <ul className="lp-checklist">
              {CHECKS.map((c, i) => (
                <li key={c} data-reveal style={{ "--d": `${150 + i * 110}ms` }}>
                  <span className="lp-tick">
                    <CheckOutlined />
                  </span>
                  {c}
                </li>
              ))}
            </ul>
          </div>

          <ol className="lp-steps" data-reveal>
            {STEPS.map((s, i) => (
              <li key={s.title} className="lp-step" style={{ "--d": `${200 + i * 180}ms` }}>
                <span className="lp-step-icon">{s.icon}</span>
                <div>
                  <span className="lp-step-num">Step {i + 1}</span>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------- Document Portal band ---------- */}
      <section className="lp-band">
        <div className="lp-band-inner" data-reveal>
          <div>
            <h2>Need a copy of a scanned document?</h2>
            <p>Ask the Records Unit through the Document Portal. No account needed.</p>
          </div>
          <Link to={ROUTES.documentPortal}>
            <Button size="large" className="lp-band-btn">
              Open the Document Portal <ArrowRightOutlined className="lp-arrow" />
            </Button>
          </Link>
        </div>
      </section>

      {/* ---------- Access ---------- */}
      <section className="lp-section lp-section-access" id="about">
        <div className="lp-cta" data-reveal>
          <div className="lp-cta-glow" aria-hidden="true" />
          <div className="lp-seals lp-seals-center">
            <img src={embLogo} alt="Environmental Management Bureau" className="lp-seal" />
            <span className="lp-seal-divider" aria-hidden="true" />
            <img src={bagongPilipinas} alt="Bagong Pilipinas" className="lp-seal" />
          </div>
          <h2>Access is limited to authorised EMB Region III personnel</h2>
          <p>
            Accounts are issued per division and provincial unit. If you handle monitoring data for the Bureau and do not yet have
            access, submit a request and your section head will be notified for approval.
          </p>
          <div className="lp-cta-actions">
            <Link to={ROUTES.login}>
              <Button type="primary" size="large" className="lp-shine lp-cta-btn">
                Proceed to log in <ArrowRightOutlined className="lp-arrow" />
              </Button>
            </Link>
            <Link to={ROUTES.register}>
              <Button size="large" ghost className="lp-ghost-btn">
                Request access
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="lp-footer">
        <div className="lp-flag" aria-hidden="true" />
        <div className="lp-footer-inner">
          <div className="lp-footer-brand">
            <div className="lp-seals">
              <img src={embLogo} alt="Environmental Management Bureau" className="lp-seal" />
              <span className="lp-seal-divider" aria-hidden="true" />
              <img src={bagongPilipinas} alt="Bagong Pilipinas" className="lp-seal" />
            </div>
            <div>
              <div className="lp-footer-title">
                <b>E</b>-Universe &mdash; Unified Information and Records Management System
              </div>
              <div className="lp-footer-note">
                Environmental Management Bureau, Regional Office III &mdash; Department of Environment and Natural Resources
              </div>
            </div>
          </div>
          <div className="lp-footer-links">
            <Link to={ROUTES.login}>Log in</Link>
            <Link to={ROUTES.register}>Request access</Link>
            <Link to={ROUTES.documentPortal}>Document Portal</Link>
          </div>
        </div>
        <div className="lp-footer-bottom">
          <span>Diosdado Macapagal Government Center, Maimpis, City of San Fernando, Pampanga</span>
          <span>
            &copy; {new Date().getFullYear()} DENR &ndash; Environmental Management Bureau Region III. For official use only.
          </span>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
