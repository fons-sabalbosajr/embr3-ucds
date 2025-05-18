import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Input, Button, Form, message, ConfigProvider } from 'antd';
import homelogo from "./assets/UCDSInformation.png";
import "./login.css";

const HomeResetPassword = () => {
    const location = useLocation();
    const navigate = useNavigate();

     // State for password input and error handling
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Extract token from the URL
  const token = new URLSearchParams(location.search).get('token');

  useEffect(() => {
    if (!token) {
      message.error('Invalid token.');
      navigate('/');
    }
  }, [token, navigate]);

  const handleSubmit = async () => {
    if (newPassword !== confirmPassword) {
      message.error('Passwords do not match.');
      return;
    }

    try {
      setLoading(true);
      const response = await axios.post('http://localhost:8081/reset-password', {
        token,
        newPassword
      });

      if (response.status === 200) {
        message.success('Password reset successful.');
        navigate('/login'); // Redirect user to login after successful password reset
      }
    } catch (error) {
      setLoading(false);
      message.error('Error resetting password. Please try again.');
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
              <img
                src={homelogo}
                alt="UCDS Logo"
                className="login-logo"
              />
            </div>
            <div className="login-title-container">
              <p className="login-title-main">
                ENVIRONMENTAL MANAGEMENT BUREAU REGION III
              </p>
              <p className="login-title-sub">
                Universe Centralized Database System
              </p>
              <h3 className="form-title" style={{marginTop: "15px", color: "var(--grad-clr1)"}}>
                Reset Your Password
              </h3>
            </div>

            <Form onFinish={handleSubmit} layout="vertical">
              <Form.Item
                label="New Password"
                name="newPassword" // Name prop is good for Form.Item
                rules={[
                  { required: true, message: 'Please input your new password!' },
                  { min: 6, message: 'Password must be at least 6 characters long.' }
                ]}
              >
                <Input.Password
                  value={newPassword} // Keep controlled component if preferred
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  size="large"
                />
              </Form.Item>

              <Form.Item
                label="Confirm New Password"
                name="confirmPassword" // Name prop is good for Form.Item
                rules={[{ required: true, message: 'Please confirm your new password!' }]}
              >
                <Input.Password
                  value={confirmPassword} // Keep controlled component if preferred
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  size="large"
                />
              </Form.Item>

              <Form.Item>
                <Button
                  type="primary"
                  htmlType="submit"
                  block
                  size="large"
                  loading={loading}
                >
                  {loading ? 'Resetting Password...' : 'Reset Password'}
                </Button>
              </Form.Item>

              <Form.Item style={{marginBottom: 0}}>
                <Button block size="large" onClick={() => navigate('/login')}>
                  Back to Login
                </Button>
              </Form.Item>
            </Form>
          </div>
        </div>
      </div>
    </ConfigProvider>
  );
}

export default HomeResetPassword;