import React, { useState } from "react";
import { Form, Input, Button } from "antd";
import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { loginUser } from "./api/authService";
import { ROUTES } from "./config/routes";
import { API_BASE_URL } from "./config/api";
import AuthShell, { AuthError } from "./components/AuthShell";

const Login = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  // Set by the reset-password page after a successful reset.
  const presetUsername = useLocation().state?.username || "";

  const handleSubmit = async ({ username, password }) => {
    setIsLoading(true);
    setError(null);
    try {
      const responseData = await loginUser(username.trim(), password);
      if (responseData.status === "success") {
        // The server accepted the password; make sure the browser kept the
        // session before moving on. It does not when the app is opened by a
        // different host than the API (localhost vs the LAN address, say):
        // the cookie is cross-site and dropped, and the next screen would
        // bounce back here with a bare "unauthorized". Say what happened.
        const check = await fetch(`${API_BASE_URL}/auth-check`, { credentials: "include" }).catch(() => null);
        if (!check || check.status === 401) {
          setError(
            `Signed in, but this browser did not keep the session. Open the application by the same address the server uses (${API_BASE_URL.replace(/:d+$/, "")}), not localhost, and try again.`
          );
          return;
        }
        // A year container must be chosen before the application opens; the
        // server clears any previous selection on sign-in.
        navigate(ROUTES.selectYear);
      } else {
        setError("Sign-in failed. Check your username and password.");
      }
    } catch (err) {
      console.error("Error during login:", err);
      // authService throws the response body, which carries `error`.
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
        initialValues={{ username: presetUsername }}
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
            autoFocus={!presetUsername}
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
            autoFocus={Boolean(presetUsername)}
          />
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
