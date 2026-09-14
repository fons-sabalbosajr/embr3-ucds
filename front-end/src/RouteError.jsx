import { useNavigate, useRouteError } from "react-router-dom";
import { Button } from "antd";
import ErrorCard from "./shared/components/ErrorCard";
import { ROUTES } from "./config/routes";

/**
 * Route-level error boundary. Without one, any render-time throw replaces the
 * whole application with React Router's default developer screen.
 */
const RouteError = () => {
  const error = useRouteError();
  const navigate = useNavigate();
  const message = error?.message || String(error || "Unknown error");
  const stack = error?.stack && error.stack !== message ? error.stack : null;

  return (
    <ErrorCard
      kind="error"
      code="page error"
      title="This page could not be displayed"
      description="Something went wrong while drawing it. Nothing you entered has been changed. Reloading usually clears it; if it keeps happening, copy the technical details and send them to the system developer."
      details={stack ? `${message}\n\n${stack}` : message}
      actions={[
        <Button type="primary" key="reload" onClick={() => window.location.reload()}>
          Reload page
        </Button>,
        <Button key="back" onClick={() => navigate(-1)}>
          Go back
        </Button>,
        <Button key="years" type="text" onClick={() => navigate(ROUTES.selectYear)}>
          Choose year container
        </Button>,
      ]}
    />
  );
};

export default RouteError;
