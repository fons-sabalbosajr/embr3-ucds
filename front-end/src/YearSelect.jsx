import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Empty, Result, Spin, Tooltip } from "antd";
import { DatabaseOutlined, LockOutlined, LogoutOutlined } from "@ant-design/icons";
import AuthBrand from "./components/AuthBrand";
import { useYear } from "./context/YearContext";
import { logoutUserService } from "./api/universeService";
import { clearSessionToken } from "./shared/sessionToken";
import { pausePushForSignOut } from "./shared/notifications/devicePush";
import { ROUTES } from "./config/routes";
import "./yearselect.css";

/** Year Container Selection — shown after login, before the application. */
const YearSelect = () => {
  const { years, loading, error, selectYear, refresh, role } = useYear();
  const [entering, setEntering] = useState(null);
  const [failed, setFailed] = useState(null);
  const navigate = useNavigate();

  // YearProvider wraps the router, so it mounts once and fetches the list
  // immediately — which on the login page is before there is a session, and
  // answers 401 with an empty list. Login then navigates here client-side, so
  // nothing remounts and nothing refetches, and a user signing in from a fresh
  // browser is told they have no year containers at all.
  //
  // The picker is what needs current data, so it asks for it whenever it is
  // shown rather than trusting whatever the provider happened to load first.
  useEffect(() => {
    refresh();
  }, [refresh]);

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
    await pausePushForSignOut();
    try {
      await logoutUserService();
    } catch {
      /* signing out locally regardless */
    }
    // After the request: it carried this tab's token to name the session.
    clearSessionToken();
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
              {[...years]
                .sort((a, b) => a.year - b.year)
                .map((y) => {
                  // The API says whether a container has opened; a year that
                  // has not arrived is shown so the timeline is visible, but
                  // cannot be entered. The server refuses it too.
                  const open = y.open !== false;
                  return (
                    <Tooltip
                      key={y.year}
                      title={open ? null : `Opens in January ${y.year}`}
                      placement="top"
                    >
                      <button
                        type="button"
                        className={`yearselect-card${open ? "" : " is-upcoming"}`}
                        // Not the `disabled` attribute for an upcoming year: a
                        // disabled element gets no pointer events, so the
                        // tooltip explaining why it is locked would never show.
                        onClick={open ? () => handleSelect(y.year) : undefined}
                        disabled={open && entering !== null}
                        aria-disabled={!open}
                        aria-label={
                          open
                            ? `Open the ${y.year} data container`
                            : `The ${y.year} data container opens in January ${y.year}`
                        }
                      >
                        {open ? (
                          <DatabaseOutlined className="yearselect-card-icon" />
                        ) : (
                          <LockOutlined className="yearselect-card-icon" />
                        )}
                        <span className="yearselect-card-year">{y.year}</span>
                        <span className="yearselect-card-label">
                          {open
                            ? (y.label || `${y.year} Data`).replace(String(y.year), "").trim() || "Data"
                            : "Upcoming"}
                        </span>
                        {entering === y.year && <Spin size="small" className="yearselect-card-spin" />}
                      </button>
                    </Tooltip>
                  );
                })}
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
