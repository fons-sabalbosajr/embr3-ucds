import React, { useState } from "react";
import { Form, Input, Button, message, ConfigProvider } from "antd";
import axios from "axios";
import { Link } from "react-router-dom";
import "./login.css";
import { API_BASE_URL } from "./config/api";
import { ROUTES } from "./config/routes";
import AuthBrand from "./components/AuthBrand";

const HomeForgotPassword = () => {
  const [isLoading, setIsLoading] = useState(false);

  const handleResetRequest = async (values) => {
    setIsLoading(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/request-password-reset`, {
        email: values.email,  // Ensure you're sending the correct field
      });
  
      if (response.data.status === "success") {
        message.success("A password reset link has been sent to your email.");
      } else {
        message.error(response.data.message || "Reset request failed.");
      }
    } catch (error) {
      console.error("Reset password error:", error);
      message.error("Something went wrong. Try again later.");
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <ConfigProvider theme={{}}>
      <div className="background-login">
        <div className="animated-circles-container">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="circle"></div>
          ))}
        </div>
        <div className="login-form-wrapper">
          <div className="login-card">
            <div className="login-logo-container">
              <AuthBrand size="md" />
            </div>
            <div className="login-title-container">
              <p className="login-title-main">
                ENVIRONMENTAL MANAGEMENT BUREAU REGION III
              </p>
              <p className="login-title-sub">
                Universe Centralized Database System
              </p>
              <h3 className="form-title" style={{marginTop: "15px", color: "var(--grad-clr1)"}}>
                Forgot Password
              </h3>
            </div>

            <Form onFinish={handleResetRequest} layout="vertical">
              <Form.Item
                name="email"
                label="Registered Email Address"
                rules={[
                  { required: true, message: "Please enter your registered email." },
                  { type: "email", message: "Enter a valid email address." },
                ]}
              >
                <Input placeholder="Enter your email" size="large" />
              </Form.Item>

              <Form.Item>
                <Button
                  type="primary"
                  htmlType="submit"
                  block
                  size="large"
                  loading={isLoading}
                >
                  {isLoading ? "Sending Reset Link..." : "Send Reset Link"}
                </Button>
              </Form.Item>

              <Form.Item style={{marginBottom: 0}}>
                <Link to={ROUTES.login}>
                  <Button block size="large">Back to Login</Button>
                </Link>
              </Form.Item>
            </Form>
          </div>
        </div>
      </div>
    </ConfigProvider>
  );
};

export default HomeForgotPassword; // Renamed export to match filename convention if intended
