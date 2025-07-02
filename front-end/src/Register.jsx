import React, { useState } from "react";
import { Form, Input, Button, ConfigProvider } from "antd";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import emailjs from "emailjs-com";
import homelogo from "./assets/UCDSInformation.png";
import { LoadingOutlined } from "@ant-design/icons";
import "./register.css";

const Register = () => {
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const MySwal = withReactContent(Swal);

  // Environment variables
  const serviceId = "service_0etqm0f";
  const templateId = "template_inuuzin";
  const publicKey = "bgYF-06ZE7QHB5_lJ";


  // Function to send email using emailjs-com
  const sendEmail = async (formData) => {
    if (!serviceId || !templateId || !publicKey) {
      console.error("Missing EmailJS configuration");
      MySwal.fire({
        icon: "error",
        title: "Configuration Error",
        text: "EmailJS configuration is missing. Please contact support.",
      });
      return;
    }

    try {
      const response = await emailjs.send(serviceId, templateId, formData, publicKey);
      console.log("Email sent successfully:", response);
    } catch (error) {
      console.error("Error sending email:", error);
      MySwal.fire({
        icon: "error",
        title: "Email Sending Failed",
        text: "There was an issue sending the email. Please try again later.",
      });
    }
  };

  const onFinish = async (values) => {
    setIsLoading(true);

    try {
      const response = await axios.post(
        "http://10.14.77.107:8081/register",
        {
          name: values.name,
          division: values.division,
          position: values.position,
          email: values.email,
        },
        { withCredentials: true }
      );

      if (response.status === 201) {
        // Prepare the email form data for system email
        const formData = {
          to_email: "emb.idms@gmail.com", // System email address
          from_name: values.name,
          to_name: "Admin", // Optional, use if needed in your template
          name: values.name,
          division: values.division,
          position: values.position,
          email: values.email,
        };

        // Send the email
        await sendEmail(formData);

        MySwal.fire({
          icon: "info",
          title: "Registration submitted for approval",
          text: "Your account registration has been submitted for admin approval. You will receive further instructions via email once approved.",
        }).then(() => {
          navigate("/login"); // Navigate to login page after registration submission
        });
      } else {
        MySwal.fire({
          icon: "error",
          title: "Registration failed",
          text: "Please try again later.",
        });
      }
    } catch (error) {
      console.error("Error response:", error.response);
      MySwal.fire({
        icon: "error",
        title: "Registration failed",
        text:
          error.response?.data.error ||
          "An unexpected error occurred. Please try again later.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ConfigProvider theme={{}}>
      <div className="background-login"> {/* Use same class as login page for background */}
        <div className="animated-circles-container">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="circle"></div>
          ))}
        </div>
        <div className="login-form-wrapper"> {/* Use same class for centering */}
          <div className="login-card"> {/* Use same card styling */}
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
              <h3 className="form-title" style={{marginTop: "15px", color: "var(--grad-clr1)"}}>SIGN-UP</h3> {/* Re-styled title */}
            </div>

            <Form layout="vertical" onFinish={onFinish}>
              <Form.Item
                name="name"
                label="Full Name"
                rules={[{ required: true, message: "Please enter your full name" }]}
              >
                <Input placeholder="Enter Full Name" size="large" />
              </Form.Item>

              <Form.Item
                name="division"
                label="Division/Section"
                rules={[
                  {
                    required: true,
                    message: "Please enter your division/section",
                  },
                ]}
              >
                <Input placeholder="Enter Division/Section" size="large" />
              </Form.Item>

              <Form.Item
                name="position"
                label="Position"
                rules={[
                  { required: true, message: "Please enter your position" },
                ]}
              >
                <Input placeholder="Enter Position" size="large" />
              </Form.Item>

              <Form.Item
                name="email"
                label="Email Address"
                rules={[
                  { required: true, message: "Email is required" },
                  { type: "email", message: "Invalid email format" },
                ]}
              >
                <Input placeholder="Enter Email Address" size="large" />
              </Form.Item>

              <Form.Item>
                <p className="terms-text"> {/* Added class for styling */}
                  By signing up, you agree to our Terms and Conditions.
                </p>
                <Button
                  type="primary"
                  htmlType="submit"
                  block
                  size="large"
                  disabled={isLoading}
                  icon={isLoading ? <LoadingOutlined spin /> : null}
                  // className="btn-sign-up" // Rely on .ant-btn-primary styling
                >
                  {isLoading ? "Signing Up..." : "Sign Up"}
                </Button>
              </Form.Item>
              <Form.Item style={{marginBottom: 0}}> {/* Ensure consistent spacing */}
                <Link to="/login">
                  <Button block size="large"> {/* This will get default button styling */}
                    Back to Log In
                  </Button>
                </Link>
              </Form.Item>
            </Form>
          </div>
        </div>
      </div>
    </ConfigProvider>
  );
};

export default Register;
