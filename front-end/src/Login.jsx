import React, { useState } from "react";
import { Form, Input, Button, Spin, message } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import "./login.css";
import homelogo from "./assets/emblogomenu.png";

const antIcon = <LoadingOutlined style={{ fontSize: 24 }} spin />;

const Login = () => {
  const [values, setValues] = useState({ username: "", password: "" });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setValues((prevValues) => ({ ...prevValues, [name]: value }));
  };

  // Use process.env.REACT_APP_BACKEND_URL to access the environment variable
  const backendUrl = "https://embr3-ucds.onrender.com";

  const handleSubmit = async (values) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await axios.post(
        `${backendUrl}/login`,
        {
          username: values.username,
          password: values.password,
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
          withCredentials: true,
        }
      );

      if (response.data?.status === "success") {
        const { token, permission } = response.data;
        localStorage.setItem("authToken", token);
        localStorage.setItem("permission", JSON.stringify(permission)); // Store permissions in localStorage

        message.success("Login successful!");
        navigate("/universe"); // Navigate to a protected route
      } else {
        setError("Login failed. Please try again.");
      }
    } catch (error) {
      console.error("Error during login:", error);
      const errorMessage =
        error.response?.data?.error || "An unexpected error occurred.";
      setError(errorMessage);
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
          {error && <p style={{ color: "red" }}>{error}</p>}{" "}
          {/* Display error message */}
          <Form onFinish={handleSubmit} layout="vertical">
            <Form.Item
              name="username"
              label="Username"
              rules={[{ required: true, message: "Username is required" }]}
            >
              <Input
                name="username" // Add this line
                placeholder="Enter Username"
                size="large"
                onChange={handleChange} // Ensure this line is present
              />
            </Form.Item>

            <Form.Item
              name="password"
              label="Password"
              rules={[{ required: true, message: "Password is required" }]}
            >
              <Input.Password
                name="password" // Add this line
                placeholder="Enter Password"
                size="large"
                onChange={handleChange} // Ensure this line is present
              />
            </Form.Item>

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                block
                size="large" // Adjust size here
                disabled={isLoading}
                icon={isLoading ? <LoadingOutlined spin /> : null}
              >
                {isLoading ? "Logging in..." : "Login"}
              </Button>
            </Form.Item>
            <Link to="/register">
              <Button block size="large">
                Create Account
              </Button>{" "}
              {/* Adjust size here */}
            </Link>
          </Form>
        </div>
      </div>
    </div>
  );
};

export default Login;
