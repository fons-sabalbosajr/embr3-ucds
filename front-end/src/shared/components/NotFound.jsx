import { Button } from "antd";
import { useLocation, useNavigate } from "react-router-dom";
import ErrorCard from "./ErrorCard";

/** An address inside the application that no screen answers to. */
const NotFound = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <ErrorCard
      kind="notfound"
      code="404"
      title="There is no page at this address"
      description="The link may be out of date, or the screen may have moved. The sidebar lists everything your account can open."
      details={pathname}
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

export default NotFound;
