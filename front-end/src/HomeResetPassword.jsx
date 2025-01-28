import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Input, Button, Form, message } from 'antd';
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
    <div className="background-login">
      <div className="background-form">
        <div className="form">
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
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

          <Form onFinish={handleSubmit} layout="vertical">
            <Form.Item
              label="New Password"
              name="newPassword"
              rules={[
                { required: true, message: 'Please input your new password!' },
                { min: 6, message: 'Password must be at least 6 characters long.' }
              ]}
            >
              <Input.Password
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                size="large"
              />
            </Form.Item>

            <Form.Item
              label="Confirm New Password"
              name="confirmPassword"
              rules={[{ required: true, message: 'Please confirm your new password!' }]}
            >
              <Input.Password
                value={confirmPassword}
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

            <Button block size="large" onClick={() => navigate('/login')}>
              Back to Login
            </Button>
          </Form>
        </div>
      </div>
    </div>
  );
}

export default HomeResetPassword