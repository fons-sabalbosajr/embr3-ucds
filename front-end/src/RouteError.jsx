import React from "react";
import { useRouteError, useNavigate } from "react-router-dom";
import { Button, Result, Typography } from "antd";
import { ROUTES } from "./config/routes";

const { Paragraph, Text } = Typography;

/**
 * Route-level error boundary. Without one, any render-time throw replaces the
 * whole application with React Router's default developer screen.
 */
const RouteError = () => {
  const error = useRouteError();
  const navigate = useNavigate();
  const message = error?.message || String(error || "Unknown error");

  return (
    <Result
      status="error"
      title="Something went wrong on this page"
      subTitle="The page could not be displayed. Your data has not been changed."
      extra={[
        <Button type="primary" key="reload" onClick={() => window.location.reload()}>
          Reload page
        </Button>,
        <Button key="years" onClick={() => navigate(ROUTES.selectYear)}>
          Choose year container
        </Button>,
      ]}
      style={{ padding: "48px 16px" }}
    >
      <Paragraph>
        <Text type="secondary">Details: </Text>
        <Text code>{message}</Text>
      </Paragraph>
    </Result>
  );
};

export default RouteError;
