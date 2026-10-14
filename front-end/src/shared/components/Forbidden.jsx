import { Button } from "antd";
import { HomeOutlined } from "@ant-design/icons";
import { useLocation, useNavigate } from "react-router-dom";
import ErrorCard from "./ErrorCard";
import { subsystemOf } from "../subsystems";

/**
 * Shown when a signed-in user reaches something outside their domain.
 *
 * The API returns 403 for the same request regardless of what the client
 * renders — this page exists so the user gets an explanation instead of a
 * blank screen or a failed fetch. "Back" goes to E-Universe's own landing,
 * which takes each account to the home its account has.
 */
const Forbidden = ({ module, detail }) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const where = subsystemOf(pathname);

  return (
    <ErrorCard
      kind="forbidden"
      code="403"
      subsystem={where}
      title={module ? `${module} is not on your account` : "This part of E-Universe is not on your account"}
      description={
        detail ||
        (module
          ? `Your account type does not include ${module}. If you need it, ask the system developer to change your account type under User Accounts.`
          : "Your account is not assigned to this part of E-Universe. Ask the system developer if you need it.")
      }
      actions={[
        <Button type="primary" key="home" icon={<HomeOutlined />} onClick={() => navigate("/universe")}>
          Go to my home page
        </Button>,
        <Button key="back" onClick={() => navigate(-1)}>
          Go back
        </Button>,
      ]}
    />
  );
};

export default Forbidden;
