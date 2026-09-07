import { Button, Result } from "antd";
import { useNavigate } from "react-router-dom";

/**
 * Shown when a signed-in user reaches something outside their domain.
 *
 * The API returns 403 for the same request regardless of what the client
 * renders — this page exists so the user gets an explanation instead of a
 * blank screen or a failed fetch.
 */
const Forbidden = ({ module, detail }) => {
  const navigate = useNavigate();

  return (
    <Result
      status="403"
      title="You do not have access to this module"
      subTitle={
        detail ||
        (module
          ? `Your account is not assigned to the ${module} module. Ask an administrator if you need it.`
          : "Your account is not assigned to this part of the application.")
      }
      extra={
        <Button type="primary" onClick={() => navigate("/universe/dashboard")}>
          Back to dashboard
        </Button>
      }
    />
  );
};

export default Forbidden;
