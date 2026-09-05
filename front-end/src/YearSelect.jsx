import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Empty, Result, Spin } from "antd";
import { DatabaseOutlined, LogoutOutlined } from "@ant-design/icons";
import AuthBrand from "./components/AuthBrand";
import { useYear } from "./context/YearContext";
import { logoutUserService } from "./api/universeService";
import { ROUTES } from "./config/routes";
import "./yearselect.css";

/** Year Container Selection — shown after login, before the application. */
const YearSelect = () => {
  const { years, loading, error, selectYear, refresh, role } = useYear();
  const [entering, setEntering] = useState(null);
  const [failed, setFailed] = useState(null);
  const navigate = useNavigate();

  const handleSelect = async (year) => {
    setEntering(year);
    setFailed(null);
    try {
      await selectYear(year);
      navigate(ROUTES.app, { replace: true });
    } catch (e) {
      // A container can be revoked or archived between listing and selection.
      setFailed(e?.response?.data?.error || `Unable to open the ${year} container.`);
      refresh();
    } finally {
      setEntering(null);
    }
  };

  const handleSignOut = async () => {
    try {
      await logoutUserService();
    } catch {
      /* signing out locally regardless */
    }
    navigate(ROUTES.login, { replace: true });
  };

  return (
    <div className="yearselect">
      <div className="yearselect-panel">
        <header className="yearselect-head">
          <AuthBrand size="md" showText={false} className="yearselect-logo" />
          <h1>Universe of Firms</h1>
          <h2>Central Database System</h2>
          <p className="yearselect-instruction">Select year container</p>
        </header>

        {loading && (
          <div className="yearselect-state">
            <Spin size="large" />
            <p>Loading your year containers…</p>
          </div>
        )}

        {!loading && error && (
          <Result
            status="warning"
            title="Could not load year containers"
            subTitle={error}
            extra={<Button onClick={refresh}>Try again</Button>}
          />
        )}

        {!loading && !error && years.length === 0 && (
          <div className="yearselect-state">
            <Empty
              description={
                <>
                  <strong>No year containers assigned</strong>
                  <p className="yearselect-empty-hint">
                    Your account has no year containers assigned yet. Ask a system
                    administrator to grant access.
                  </p>
                </>
              }
            />
          </div>
        )}

        {!loading && !error && years.length > 0 && (
          <>
            {failed && <div className="yearselect-error">{failed}</div>}
            <div className="yearselect-grid">
              {years.map((y) => (
                <button
                  type="button"
                  key={y.year}
                  className="yearselect-card"
                  onClick={() => handleSelect(y.year)}
                  disabled={entering !== null}
                  aria-label={`Open the ${y.year} data container`}
                >
                  <DatabaseOutlined className="yearselect-card-icon" />
                  <span className="yearselect-card-year">{y.year}</span>
                  <span className="yearselect-card-label">
                    {(y.label || `${y.year} Data`).replace(String(y.year), "").trim() || "Data"}
                  </span>
                  {entering === y.year && <Spin size="small" className="yearselect-card-spin" />}
                </button>
              ))}
            </div>
          </>
        )}

        <footer className="yearselect-foot">
          {role && <span className="yearselect-role">Signed in as {role}</span>}
          <Button type="text" icon={<LogoutOutlined />} onClick={handleSignOut}>
            Sign out
          </Button>
        </footer>
      </div>
    </div>
  );
};

export default YearSelect;
