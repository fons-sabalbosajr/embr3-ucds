import React, { useState } from "react";
import { Form, Input, Button, Checkbox } from "antd";
import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { loginUser } from "./api/authService";
import { ROUTES } from "./config/routes";
import { API_BASE_URL } from "./config/api";
import AuthShell, { AuthError } from "./components/AuthShell";
import { setSessionToken, getRememberedUsername, setRememberedUsername } from "./shared/sessionToken";
import { refreshPushRegistration } from "./shared/notifications/devicePush";
import { useYear } from "./context/YearContext";

const Login = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const { refresh: refreshYears } = useYear();
  // Set by the reset-password page after a successful reset.
  const location = useLocation();
  const query = new URLSearchParams(location.search);
  // ?user= and ?next= come from a device notice clicked for an account with
  // no tab open (public/sw.js): the account filled in, and the page it
  // concerns opened after signing in. Only an application path is followed.
  const presetUsername = location.state?.username || query.get("user") || "";
  const next = /^\/e-universe(\/|$)/.test(query.get("next") || "") && !/\/\//.test(query.get("next")) ? query.get("next") : null;
  // The account last signed in here with "Remember me", filled in for the next time.
  const rememberedUsername = getRememberedUsername();
  const initialUsername = presetUsername || rememberedUsername;

  const handleSubmit = async ({ username, password, remember }) => {
    setIsLoading(true);
    setError(null);
    try {
      const responseData = await loginUser(username.trim(), password, remember === true);
      if (responseData.status === "success") {
        // This tab is now this account, whatever the browser's other tabs do
        // (see shared/sessionToken). Set before the check below so it is sent.
        // Remembered, new tabs and a reopened browser start as it too.
        setSessionToken(responseData.sessionToken || null, {
          remember: remember === true,
          until: responseData.sessionExpiresAt,
        });
        setRememberedUsername(remember === true ? username.trim() : "");
        // A device that takes notices now takes this account's.
        refreshPushRegistration();
        const check = await fetch(`${API_BASE_URL}/auth-check`, { credentials: "include" }).catch(() => null);
        if (!check || check.status === 401) {
          setError(
            `Signed in, but this browser did not keep the session. Open the application by the same address the server uses (${API_BASE_URL.replace(/:d+$/, "")}), not localhost, and try again.`
          );
          return;
        }
        // A year container must be chosen before the application opens. The
        // server picks one for accounts that hold every year (Developer,
        // Administrator), who then go straight in and switch from the header.
        if (responseData.activeYear) {
          // The year context last asked while signed out; let it learn the
          // container the server chose before the guard looks at it.
          await refreshYears();
          navigate(next || ROUTES.appHome);
        } else {
          navigate(ROUTES.selectYear);
        }
      } else {
        setError("Sign-in failed. Check your username and password.");
      }
    } catch (err) {
      // authService throws the response body, which carries `error`. A
      // refused password is an answer, shown on the form; only a failure to
      // reach the server or an unexpected one is worth the console.
      if (!err?.error) console.error("Error during login:", err);
      setError(err?.error || err?.message || "Invalid username or password. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell
      title="Sign in"
      footer={
        <>
          Need an account?{" "}
          <Link to={ROUTES.register}>Request access</Link>
        </>
      }
    >
      <AuthError>{error}</AuthError>

      <Form
        layout="vertical"
        onFinish={handleSubmit}
        requiredMark={false}
        initialValues={{ username: initialUsername, remember: Boolean(rememberedUsername) }}
      >
        <Form.Item
          name="username"
          label="Username or email"
          rules={[{ required: true, whitespace: true, message: "Enter your username or email address." }]}
        >
          <Input
            size="large"
            prefix={<UserOutlined />}
            placeholder="Username or email address"
            autoComplete="username"
            autoFocus={!initialUsername}
          />
        </Form.Item>

        <Form.Item
          name="password"
          label="Password"
          rules={[{ required: true, message: "Enter your password." }]}
        >
          <Input.Password
            size="large"
            prefix={<LockOutlined />}
            placeholder="Password"
            autoComplete="current-password"
            autoFocus={Boolean(initialUsername)}
          />
        </Form.Item>

        <Form.Item
          name="remember"
          valuePropName="checked"
          // extra="Stay signed in on this browser for 14 days. Leave unticked on a shared computer."
        >
          <Checkbox>Remember me</Checkbox>
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit" block size="large" loading={isLoading}>
            {isLoading ? "Signing in…" : "Sign in"}
          </Button>
        </Form.Item>
      </Form>

      <div className="auth-card-links">
        <Link to={ROUTES.forgotPassword}>Forgot your password?</Link>
      </div>
    </AuthShell>
  );
};

export default Login;
