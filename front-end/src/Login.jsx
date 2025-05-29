import React, { useState } from "react";
import { Input, Button, ConfigProvider } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import CryptoJS from "crypto-js";
import "./login.css";
import homelogo from "./assets/UCDSInformation.png";

const Login = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  // Access the encryption key using Vite's import.meta.env
  const encryptionKey = import.meta.env.VITE_CRYPTOJS_ENCRYPTION_KEY;
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  
  
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
        const { password, ...safeProfile } = response.data;
        // No longer storing the full profile in localStorage
        navigate("/universe");
      } else {
        setError("Login failed. Please check your credentials.");
      }
    } catch (error) {
      console.error("Error during login:", error);
      if (error.response && error.response.data && error.response.data.message) {
        setError(error.response.data.message);
      } else {
        setError("Invalid username or password. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ConfigProvider
    >
      <div className="background-login">
        <div className="animated-circles-container">
          {[...Array(10)].map((_, i) => ( 
            <div key={i} className="circle"></div>
          ))}
        </div>
        <div className="login-form-wrapper"> {/* Renamed class */}
          <div className="login-card"> {/* Renamed class */}
            <div className="login-logo-container"> {/* New container for logo */}
              <img
                src={homelogo}
                alt="UCDS Logo"
                className="login-logo" /* Added class for styling, width/height in CSS */
              />
            </div>
            <div className="login-title-container"> {/* New container for titles */}
              <p className="login-title-main">
                ENVIRONMENTAL MANAGEMENT BUREAU REGION III
              </p>
              <p className="login-title-sub">
                Universe Centralized Database System
              </p>
            </div>

            {error && (
              <p className="login-error-message">{error}</p> /* Added class for styling */
            )}

            <Input
              placeholder="Enter Username"
              size="large"
              autoComplete="off"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{ marginBottom: "20px", fontSize:"14px" }} 
            />
            <Input.Password
              placeholder="Enter Password"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ marginBottom: "20px" }}
            />

            <Button
              type="primary"
              block
              size="large"
              icon={isLoading ? <LoadingOutlined spin /> : null}
              onClick={() => handleSubmit({username: username, password: password})} // Call handleSubmit with values
            >
              {isLoading ? "Logging in..." : "Login"}
            </Button>

            <div style={{ marginTop: "20px" }}>
              {/* Use div for consistent spacing around the link buttons */}

              <div style={{ marginTop: "10px" }}>
                <Link to="/register" style={{ display: 'block' }}> {/* Make Link block for Button to take full width */}
                  <Button block size="large">
                    Create Account
                  </Button>
                </Link>
              </div>

              <div style={{ marginBottom: 0, textAlign: 'center' }}> {/* Center link button, remove excess bottom margin */}
                  <Link to="/forgot-password">
                      <Button type="link">Forgot Password?</Button>
                  </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ConfigProvider>
  );
};

export default Login;
