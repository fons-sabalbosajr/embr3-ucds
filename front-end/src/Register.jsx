import React, { useState } from "react";
import { Form, Input, Button } from "antd";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { modal } from "./shared/feedback";
import { API_BASE_URL } from "./config/api";
import { ROUTES } from "./config/routes";
import AuthShell, { AuthError } from "./components/AuthShell";

// The request is recorded and the notification emails are sent by the server.
// This page used to send the administrator's email itself through EmailJS
// from the browser, which meant a public key in the bundle, a second mail
// system to configure, and — because it was never configured — a
// "Configuration Error" dialog for everyone who registered.

const Register = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const onFinish = async (values) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await axios.post(
        `${API_BASE_URL}/register`,
        {
          name: values.name.trim(),
          division: values.division.trim(),
          position: values.position.trim(),
          email: values.email.trim(),
        },
        { withCredentials: true }
      );

      if (response.status === 201) {
        modal.success({
          title: "Request submitted",
          content:
            "Your access request has been sent to the system administrator. " +
            "You will receive your account details by email once it is approved.",
          okText: "Back to sign in",
          onOk: () => navigate(ROUTES.login),
        });
      } else {
        setError("The request could not be submitted. Please try again later.");
      }
    } catch (err) {
      console.error("Error response:", err.response);
      setError(
        err.response?.data?.error || "An unexpected error occurred. Please try again later."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell
      width={460}
      title="Request access"
      intro="Accounts are issued to EMB Region III personnel. Tell us who you are and the administrator will set one up."
      footer={
        <>
          Already have an account? <Link to={ROUTES.login}>Sign in</Link>
        </>
      }
    >
      <AuthError>{error}</AuthError>

      <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
        <Form.Item
          name="name"
          label="Full name"
          rules={[{ required: true, whitespace: true, message: "Enter your full name." }]}
        >
          <Input size="large" placeholder="e.g. Juan D. dela Cruz" autoComplete="name" autoFocus />
        </Form.Item>

        <Form.Item
          name="division"
          label="Division / Section"
          rules={[{ required: true, whitespace: true, message: "Enter your division or section." }]}
        >
          <Input size="large" placeholder="e.g. Clearance and Permitting Division" />
        </Form.Item>

        <Form.Item
          name="position"
          label="Position"
          rules={[{ required: true, whitespace: true, message: "Enter your position." }]}
        >
          <Input size="large" placeholder="e.g. Environmental Management Specialist II" autoComplete="organization-title" />
        </Form.Item>

        <Form.Item
          name="email"
          label="Email address"
          extra="Your account details will be sent here."
          rules={[
            { required: true, message: "Enter your email address." },
            { type: "email", message: "Enter a valid email address." },
          ]}
        >
          <Input size="large" placeholder="name@denr.gov.ph" autoComplete="email" inputMode="email" />
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit" block size="large" loading={isLoading}>
            {isLoading ? "Submitting…" : "Submit request"}
          </Button>
        </Form.Item>
      </Form>
    </AuthShell>
  );
};

export default Register;
