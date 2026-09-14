import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { Button, Form, Input, Result } from "antd";
import { LockOutlined } from "@ant-design/icons";
import { message } from "./shared/feedback";
import { API_BASE_URL } from "./config/api";
import { ROUTES } from "./config/routes";
import AuthShell, { AuthError } from "./components/AuthShell";

const HomeResetPassword = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // The username of the account that was reset, so the sign-in page can be
  // prefilled: the reset was addressed by email, and "invalid username or
  // password" after a successful reset is usually the username.
  const [done, setDone] = useState(null);

  const token = new URLSearchParams(location.search).get("token");

  useEffect(() => {
    if (!token) {
      message.error("This password reset link is not valid.");
      navigate(ROUTES.forgotPassword, { replace: true });
    }
  }, [token, navigate]);

  const handleSubmit = async ({ newPassword }) => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.post(`${API_BASE_URL}/reset-password`, { token, newPassword });
      if (response.status === 200) setDone({ username: response.data?.username || "" });
    } catch (err) {
      console.error("Reset password error:", err);
      setError(
        err.response?.data?.error ||
          "The password could not be reset. The link may have expired — request a new one."
      );
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <AuthShell>
        <Result
          status="success"
          title="Password updated"
          subTitle={
            done.username ? (
              <>
                Your new password is in effect. Sign in as <strong>{done.username}</strong> (or with your
                email address) and use the new password even if your browser offers a saved one.
              </>
            ) : (
              "Your new password is in effect. Sign in with it to continue."
            )
          }
          extra={
            <Link to={ROUTES.login} state={{ username: done.username }}>
              <Button type="primary" size="large">
                Sign in
              </Button>
            </Link>
          }
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Choose a new password"
      intro="Use at least 8 characters. Avoid something you use elsewhere."
      footer={
        <>
          Link expired? <Link to={ROUTES.forgotPassword}>Request a new one</Link>
        </>
      }
    >
      <AuthError>{error}</AuthError>

      <Form onFinish={handleSubmit} layout="vertical" requiredMark={false}>
        <Form.Item
          label="New password"
          name="newPassword"
          rules={[
            { required: true, message: "Enter a new password." },
            { min: 8, message: "Use at least 8 characters." },
          ]}
        >
          <Input.Password
            size="large"
            prefix={<LockOutlined />}
            placeholder="New password"
            autoComplete="new-password"
            autoFocus
          />
        </Form.Item>

        <Form.Item
          label="Confirm new password"
          name="confirmPassword"
          dependencies={["newPassword"]}
          rules={[
            { required: true, message: "Confirm your new password." },
            ({ getFieldValue }) => ({
              validator: (_, value) =>
                !value || getFieldValue("newPassword") === value
                  ? Promise.resolve()
                  : Promise.reject(new Error("The passwords do not match.")),
            }),
          ]}
        >
          <Input.Password
            size="large"
            prefix={<LockOutlined />}
            placeholder="Confirm new password"
            autoComplete="new-password"
          />
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit" block size="large" loading={loading}>
            {loading ? "Updating…" : "Update password"}
          </Button>
        </Form.Item>
      </Form>
    </AuthShell>
  );
};

export default HomeResetPassword;
