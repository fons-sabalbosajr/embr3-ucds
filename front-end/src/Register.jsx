import React, { useState } from "react";
import { Form, Input, Button, message } from "antd";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import homelogo from "./assets/emblogomenu.png";
import { LoadingOutlined } from "@ant-design/icons";

const Register = () => {
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const onFinish = async (values) => {
    setIsLoading(true); // Start loading animation
    try {
      const response = await axios.post(
        "http://localhost:8081/register" ||
          "https://embr3-ucds.onrender.com/register",
        {
          name: values.name,
          username: values.username,
          email: values.email,
          password: values.password,
        }
      );

      if (response.status === 201) {
        // Status code for successful creation
        message.success("Registration successful!");
        navigate("/login"); // Navigate to login page after successful registration
      } else {
        message.error("Registration failed. Please try again."); // Catch-all for unexpected status
      }
    } catch (error) {
      if (error.response) {
        message.error(
          `Registration failed: ${error.response.data.error || "Unknown error"}`
        );
      } else if (error.request) {
        // No response from server
        message.error(
          "No response from server. Please check your network connection."
        );
      } else {
        // Other unexpected errors
        message.error(`Error during registration: ${error.message}`);
      }
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
            ENVIRONMENTAL MANAGEMENT BUREAU REGION III <br />
            Universe Central Database System
          </p>
          <h3 className="centered">SIGN-UP</h3>

          <Form layout="vertical" onFinish={onFinish}>
            <Form.Item
              name="name"
              label="Name"
              rules={[{ required: true, message: "Please enter your name" }]}
            >
              <Input placeholder="Enter Name" />
            </Form.Item>

            <Form.Item
              name="username"
              label="Username"
              rules={[
                { required: true, message: "Please enter your username" },
              ]}
            >
              <Input placeholder="Enter Username" />
            </Form.Item>

            <Form.Item
              name="email"
              label="Email"
              rules={[
                { required: true, message: "Email is required" },
                { type: "email", message: "Invalid email format" },
              ]}
            >
              <Input placeholder="Enter Email" />
            </Form.Item>

            <Form.Item
              name="password"
              label="Password"
              rules={[{ required: true, message: "Password is required" }]}
            >
              <Input.Password placeholder="Enter Password" />
            </Form.Item>

            <Form.Item
              name="confirmPassword"
              label="Confirm Password"
              rules={[
                { required: true, message: "Please confirm your password" },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue("password") === value) {
                      return Promise.resolve();
                    }
                    return Promise.reject(
                      new Error("The two passwords do not match")
                    );
                  },
                }),
              ]}
            >
              <Input.Password placeholder="Confirm Password" />
            </Form.Item>

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                block
                disabled={isLoading} // Disable button while loading
                icon={isLoading ? <LoadingOutlined spin /> : null} // Loading icon
              >
                {isLoading ? "Signing Up..." : "Sign Up"}
              </Button>
            </Form.Item>

            <p>By signing up, you agree to our Terms and Conditions.</p>

            <Link to="/login">
              <Button block>Back to Log In</Button>
            </Link>
          </Form>
        </div>
      </div>
    </div>
  );
};

export default Register;
