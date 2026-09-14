import React, { useState } from "react";
import { Form, Input, Button, Result } from "antd";
import { MailOutlined } from "@ant-design/icons";
import axios from "axios";
import { Link } from "react-router-dom";
import { API_BASE_URL } from "./config/api";
import { ROUTES } from "./config/routes";
import AuthShell, { AuthError } from "./components/AuthShell";

const HomeForgotPassword = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sentTo, setSentTo] = useState(null);

  const handleResetRequest = async ({ email }) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await axios.post(`${API_BASE_URL}/request-password-reset`, {
        email: email.trim(),
      });
      if (response.data.status === "success") {
        setSentTo(email.trim());
      } else {
        setError(response.data.message || "The reset link could not be sent.");
      }
    } catch (err) {
      console.error("Reset password error:", err);
      setError(err.response?.data?.error || "Something went wrong. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  };

  if (sentTo) {
    return (
      <AuthShell>
        <Result
          status="success"
          icon={<MailOutlined />}
          title="Check your inbox"
          subTitle={
            <>
              If <strong>{sentTo}</strong> is registered to an account, a link to choose a new
              password is on its way. The link works for one hour. If it does not arrive, check
              your spam folder or try again.
            </>
          }
          extra={
            <Link to={ROUTES.login}>
              <Button type="primary" size="large">
                Back to sign in
              </Button>
            </Link>
          }
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Forgot your password?"
      intro="Enter the email address registered to your account and we will send you a link to choose a new one."
      footer={
        <>
          Remembered it? <Link to={ROUTES.login}>Back to sign in</Link>
        </>
      }
    >
      <AuthError>{error}</AuthError>

      <Form onFinish={handleResetRequest} layout="vertical" requiredMark={false}>
        <Form.Item
          name="email"
          label="Registered email address"
          rules={[
            { required: true, message: "Enter your registered email address." },
            { type: "email", message: "Enter a valid email address." },
          ]}
        >
          <Input
            size="large"
            prefix={<MailOutlined />}
            placeholder="name@denr.gov.ph"
            autoComplete="email"
            inputMode="email"
            autoFocus
          />
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit" block size="large" loading={isLoading}>
            {isLoading ? "Sending…" : "Send reset link"}
          </Button>
        </Form.Item>
      </Form>
    </AuthShell>
  );
};

export default HomeForgotPassword;
