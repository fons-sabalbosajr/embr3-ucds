import React, { useState } from "react";
import { Form, Input, Button } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import "./login.css";
import homelogo from "./assets/emblogomenu.png";


const Login = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

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

      console.log("API Response:", response.data); 
  
      if (response.data.status === "success") {
        console.log("Navigation to /universe triggered"); // Debugging output
        localStorage.setItem("username", response.data.username);
        localStorage.setItem("permission", JSON.stringify(response.data.permission));
  
        // Optional delay to ensure session is established
        setTimeout(() => {
          navigate("/universe");
        }, 500); 
      } else {
        setError("Login failed. Please try again.");
      }
    } catch (error) {
      console.error("Error during login:", error);
      setError("An unexpected error occurred. Please try again.");
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
              <Input.Password placeholder="Enter Password" size="large" />
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
              <Button block size="large">
                Create Account
              </Button>
            </Link>
          </Form>
        </div>
      </div>
    </div>
  );
};

export default Login;
