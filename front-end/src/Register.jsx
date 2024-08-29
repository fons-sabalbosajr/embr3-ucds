import React, { useState } from "react";
import { Form, Input, Button } from "antd";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import emailjs from "emailjs-com";
import homelogo from "./assets/emblogomenu.png";
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
        "http://localhost:8081/register",
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
            Universe Centralized Database System
          </p>
          <h3 className="centered">SIGN-UP</h3>

          <Form layout="vertical" onFinish={onFinish}>
            <Form.Item
              name="name"
              label="Name"
              rules={[{ required: true, message: "Please enter your name" }]}
            >
              <Input placeholder="Enter Name" size="large" />
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
              label="Email"
              rules={[
                { required: true, message: "Email is required" },
                { type: "email", message: "Invalid email format" },
              ]}
            >
              <Input placeholder="Enter Email" size="large" />
            </Form.Item>

            <Form.Item>
              <p>By signing up, you agree to our Terms and Conditions.</p>
              <Button
                type="primary"
                htmlType="submit"
                block
                size="large"
                disabled={isLoading}
                icon={isLoading ? <LoadingOutlined spin /> : null}
                className="btn-sign-up"
              >
                {isLoading ? "Signing Up..." : "Sign Up"}
              </Button>
            </Form.Item>
            <Link to="/login">
              <Button block size="large">
                Back to Log In
              </Button>
            </Link>
          </Form>
        </div>
      </div>
    </div>
  );
};

export default Register;
