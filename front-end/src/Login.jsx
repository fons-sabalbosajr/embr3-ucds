import React, { useState } from "react";
import { Form, Input, Button } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import CryptoJS from "crypto-js"; // Import the crypto-js library
import "./login.css";
import homelogo from "./assets/UCDSInformation.png";

const Login = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  // Access the encryption key using Vite's import.meta.env
  const encryptionKey = import.meta.env.VITE_CRYPTOJS_ENCRYPTION_KEY;

  const handleSubmit = async (values) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await axios.post(
        "http://localhost:8081/login",
        {
          username: values.username,
          password: values.password,
        },
        {
          withCredentials: true,
        }
      );

      if (response.data.status === "success") {
        // Encrypt the username and permission before saving to localStorage
        const encryptedUsername = CryptoJS.AES.encrypt(
          response.data.username,
          encryptionKey
        ).toString();

        const encryptedPermission = CryptoJS.AES.encrypt(
          JSON.stringify(response.data.permission),
          encryptionKey
        ).toString();

        // Save encrypted values in localStorage
        localStorage.setItem("username", encryptedUsername);
        localStorage.setItem("permission", encryptedPermission);

        // Navigate to the /universe page
        navigate("/universe");
      } else {
        setError("Login failed. Please try again.");
      }
    } catch (error) {
      console.error("Error during login:", error);
      setError("Invalid username or password.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="background-login">
      <div className="background-form">
        <div className="form">
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <img src={homelogo} width="100" height="100" alt="Logo" />
          </div>
          <p className="centered">
            <br />
            ENVIRONMENTAL MANAGEMENT BUREAU REGION III
            <br />
            Universe Centralized Database System
          </p>
          {error && <p style={{ color: "red" }}>{error}</p>}
          <Form onFinish={handleSubmit} layout="vertical">
            <Form.Item
              name="username"
              label="Username"
              rules={[{ required: true, message: "Username is required" }]}
            >
              <Input placeholder="Enter Username" size="large" />
            </Form.Item>

            <Form.Item
              name="password"
              label="Password"
              rules={[{ required: true, message: "Password is required" }]}
            >
              <Input.Password placeholder="Enter Password" size="large" className="password-login" />
            </Form.Item>

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                block
                size="large"
                disabled={isLoading}
                icon={isLoading ? <LoadingOutlined spin /> : null}
              >
                {isLoading ? "Logging in..." : "Login"}
              </Button>
            </Form.Item>

            <Link to="/register">
              <Button block size="large">Create Account</Button>
            </Link>

            {/* Added Forgot Password Button */}
            <Link to="/forgot-password">
              <Button type="link" block>Forgot Password?</Button>
            </Link>
          </Form>
        </div>
      </div>
    </div>
  );
};

export default Login;
