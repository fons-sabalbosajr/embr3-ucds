import { Button } from "antd";
import { useNavigate } from "react-router-dom";
import ErrorCard from "./ErrorCard";

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
    <ErrorCard
      kind="forbidden"
      code="403"
      title={module ? `${module} is not on your account` : "This part of the application is not on your account"}
      description={
        detail ||
        (module
          ? `Your account type does not include the ${module} module. If you need it, ask the system developer to change your account type under User Accounts.`
          : "Your account is not assigned to this part of the application. Ask the system developer if you need it.")
      }
      actions={[
        <Button type="primary" key="dash" onClick={() => navigate("/universe/dashboard")}>
          Back to dashboard
        </Button>,
        <Button key="back" onClick={() => navigate(-1)}>
          Go back
        </Button>,
      ]}
    />
  );
};

export default Forbidden;
