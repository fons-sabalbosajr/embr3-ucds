import { Layout, theme as antdTheme } from "antd";

// ---------------------------------------------------------------------------
// The application footer, under every screen after sign-in.
//
// Slim and fixed under the content area (which scrolls on its own), so it
// is always in view without taking room from tables. Coloured from the theme
// tokens, so it follows the light/dark choice like the content above it.
// The same wording as the sign-in pages' note, so the application signs
// itself the same way on both sides of the login.
// ---------------------------------------------------------------------------

const AppFooter = () => {
  const { token } = antdTheme.useToken();
  const year = new Date().getFullYear();
  return (
    <Layout.Footer
      className="app-footer"
      style={{
        background: token.colorBgContainer,
        borderTop: `1px solid ${token.colorBorderSecondary}`,
        color: token.colorTextTertiary,
      }}
    >
      <span>
        © {year} Environmental Management Bureau · Regional Office III
      </span>
      <span className="app-footer-right">
        <strong style={{ color: token.colorTextSecondary }}>E-Universe</strong>
        <span aria-hidden="true">·</span>
        Unified Information and Records Management System
      </span>
    </Layout.Footer>
  );
};

export default AppFooter;
