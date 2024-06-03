import React, { useState } from "react";
import { Form, Input, Button, Spin, message } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import "./login.css";
import homelogo from "./assets/emblogomenu.png";

const antIcon = <LoadingOutlined style={{ fontSize: 24 }} spin />;

const Login = () => {
  const [values, setValues] = useState({ email: "", password: "" });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setValues((prevValues) => ({ ...prevValues, [name]: value }));
  };

   // Use process.env.REACT_APP_BACKEND_URL to access the environment variable
   const backendUrl = 'http://localhost:8081' || 'https://embr3-ucds.onrender.com';

  const handleSubmit = async (values) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await axios.post(
        `${backendUrl}/login`, // Use the environment variable here
        {
          email: values.email,
          password: values.password,
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (response.data?.status === "success") {
        const token = response.data.token;
        localStorage.setItem("authToken", token); // Store JWT token in local storage

        message.success("Login successful!");
        navigate("/universe"); // Navigate to a protected route
      } else {
        setError("Login failed. Please try again."); // Handle unsuccessful login
      }
    } catch (error) {
      console.error("Error during login:", error);
      const errorMessage =
        error.response?.data?.error || "An unexpected error occurred.";
      setError(errorMessage);
    } finally {
      setIsLoading(false); // Stop loading animation
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
            Universe Central Database System
          </p>
          {error && <p style={{ color: "red" }}>{error}</p>}{" "}
          {/* Display error message */}
          <Form onFinish={handleSubmit} layout="vertical">
            <Form.Item
              name="email"
              label="Email"
              rules={[
                { type: "email", message: "Invalid email format" },
                { required: true, message: "Email is required" },
              ]}
            >
              <Input
                placeholder="Enter Email"
                value={values.email}
                onChange={handleChange}
              />
            </Form.Item>

            <Form.Item
              name="password"
              label="Password"
              rules={[{ required: true, message: "Password is required" }]}
            >
              <Input.Password
                placeholder="Enter Password"
                value={values.password}
                onChange={handleChange}
              />
            </Form.Item>

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                block
                disabled={isLoading}
                icon={isLoading ? antIcon : null}
              >
                {isLoading ? "Logging in..." : "Login"}
              </Button>
            </Form.Item>
            <Link to="/register">
              <Button block>Create Account</Button>
            </Link>
          </Form>
        </div>
      </div>
    </div>
  );
};

export default Login;