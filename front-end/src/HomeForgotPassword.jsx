import React, { useState } from "react";
import { Form, Input, Button, message } from "antd";
import axios from "axios";
import { Link } from "react-router-dom";
import homelogo from "./assets/UCDSInformation.png";
import "./login.css";

const HomeResetPassword = () => {
  const [isLoading, setIsLoading] = useState(false);

  const handleResetRequest = async (values) => {
    setIsLoading(true);
    try {
      const response = await axios.post("http://localhost:8081/request-password-reset", {
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
    <div className="background-login">
      <div className="background-form">
        <div className="form">
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
            <img src={homelogo} width="100" height="100" alt="Logo" />
          </div>
          <p className="centered">
            <br />
            ENVIRONMENTAL MANAGEMENT BUREAU REGION III
            <br />
            Universe Central Database System
            <br />
            Reset Your Password
          </p>

          <Form onFinish={handleResetRequest} layout="vertical">
            <Form.Item
              name="email"
              label="Registered Email"
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

            <Link to="/login">
              <Button block size="large">Back to Login</Button>
            </Link>
          </Form>
        </div>
      </div>
    </div>
  );
};

export default HomeResetPassword;
