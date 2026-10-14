import { useNavigate, useRouteError } from "react-router-dom";
import { Button } from "antd";
import { HomeOutlined, ReloadOutlined } from "@ant-design/icons";
import ErrorCard from "./shared/components/ErrorCard";
import { subsystemOf } from "./shared/subsystems";

/**
 * Route-level error boundary. Without one, any render-time throw replaces the
 * whole application with React Router's default developer screen.
 *
 * It takes the application's frame with it, so it is drawn on a page of its
 * own, named for the subsystem the person was in, with the way back to it.
 */
const RouteError = () => {
  const error = useRouteError();
  const navigate = useNavigate();
  const where = subsystemOf();
  const message = error?.message || error?.statusText || String(error || "Unknown error");
  const stack = error?.stack && error.stack !== message ? error.stack : null;
  const notFound = error?.status === 404;

  return (
    <ErrorCard
      fullPage
      subsystem={where}
      kind={notFound ? "notfound" : "error"}
      code={notFound ? "404" : "page error"}
      title={notFound ? "There is no page at this address" : `${where.name} could not show this page`}
      description={
        notFound
          ? "The link may be out of date, or the page may have moved."
          : "Something went wrong while drawing it. Nothing you entered has been changed. Reloading usually clears it; if it keeps happening, copy the technical details and send them to the system developer."
      }
      details={stack ? `${message}\n\n${stack}` : message}
      actions={[
        <Button type="primary" key="reload" icon={<ReloadOutlined />} onClick={() => window.location.reload()}>
          Reload page
        </Button>,
        <Button key="home" icon={<HomeOutlined />} onClick={() => window.location.assign(where.home)}>
          {where.homeLabel}
        </Button>,
        <Button key="back" type="text" onClick={() => navigate(-1)}>
          Go back
        </Button>,
      ]}
    />
  );
};

export default RouteError;
