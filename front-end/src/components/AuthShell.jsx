import React from "react";
import { Link } from "react-router-dom";
import { Button, Tooltip, theme as antdTheme } from "antd";
import { BulbFilled, BulbOutlined } from "@ant-design/icons";
import AuthBrand from "./AuthBrand";
import { useTheme } from "../theme/ThemeProvider";
import { ROUTES } from "../config/routes";
import "./authshell.css";

// ---------------------------------------------------------------------------
// The frame every public account page sits in: sign in, request access,
// forgot password, reset password.
//
// Each page used to carry its own copy of the background, the floating
// circles, the card and the titles, with a stylesheet that pinned the card
// white and overrode Ant Design's inputs with !important. In dark mode that
// gave a white card with dark inputs on it. The card now takes its colours
// from the same tokens the components use, so it is right in both modes by
// construction, and the background is built from the navigation surfaces so
// the page belongs to the same application as the shell behind it.
// ---------------------------------------------------------------------------

const CIRCLES = 10;

const AuthShell = ({ title, intro, children, width = 420, footer, assistant }) => {
  const { token } = antdTheme.useToken();
  const { isDark, toggleMode } = useTheme();

  // Published as variables so the stylesheet can use them without every
  // element carrying an inline style, and without a second colour palette.
  const surface = {
    "--auth-card-bg": token.colorBgElevated,
    "--auth-card-border": token.colorBorderSecondary,
    "--auth-text": token.colorText,
    "--auth-text-soft": token.colorTextSecondary,
    "--auth-text-faint": token.colorTextTertiary,
    "--auth-link": token.colorLink,
    "--auth-link-hover": token.colorLinkHover,
    "--auth-error-bg": token.colorErrorBg,
    "--auth-error-border": token.colorErrorBorder,
    "--auth-error-text": token.colorErrorText,
    "--auth-radius": `${token.borderRadiusLG}px`,
    "--auth-width": `${width}px`,
  };

  return (
    <div className="auth-shell" style={surface}>
      <div className="auth-shell-backdrop" aria-hidden="true">
        {Array.from({ length: CIRCLES }, (_, i) => (
          <span key={i} className="auth-shell-circle" />
        ))}
      </div>

      <main className="auth-shell-main">
        <section className="auth-card" aria-labelledby={title ? "auth-card-title" : undefined}>
          <Tooltip title={isDark ? "Switch to light theme" : "Switch to dark theme"}>
            <Button
              type="text"
              shape="circle"
              className="auth-card-theme"
              aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
              icon={isDark ? <BulbFilled /> : <BulbOutlined />}
              onClick={toggleMode}
            />
          </Tooltip>

          <header className="auth-card-head">
            <Link to={ROUTES.landing} className="auth-card-brand" aria-label="Back to the public site">
              <AuthBrand size="md" />
            </Link>
            <p className="auth-card-product">E-Universe</p>
            <p className="auth-card-tagline">Unified Information and Records Management System</p>
            {title && (
              <h1 id="auth-card-title" className="auth-card-title">
                {title}
              </h1>
            )}
            {intro && <p className="auth-card-intro">{intro}</p>}
          </header>

          <div className="auth-card-body">{children}</div>

          {footer && <footer className="auth-card-foot">{footer}</footer>}
        </section>

        <p className="auth-shell-note">
          Environmental Management Bureau · Regional Office III · For official use only
        </p>
      </main>
      {/* VERA's sign-in page surface, passed in by each page so shared layout
          does not import the VERA module. It shows only when an administrator
          has turned it on (Admin Settings › VERA Assistant). */}
      {assistant}
    </div>
  );
};

/** Inline error, styled from the error tokens rather than a fixed red. */
export const AuthError = ({ children }) =>
  children ? (
    <div className="auth-card-error" role="alert">
      {children}
    </div>
  ) : null;

export default AuthShell;
