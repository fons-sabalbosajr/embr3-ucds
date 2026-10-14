import { Button } from "antd";
import { HomeOutlined } from "@ant-design/icons";
import { useLocation, useNavigate } from "react-router-dom";
import ErrorCard from "./ErrorCard";
import { subsystemOf } from "../subsystems";

/** An address inside the application that no screen answers to — sent back to the subsystem it was in. */
const NotFound = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const where = subsystemOf(pathname);

  return (
    <ErrorCard
      kind="notfound"
      code="404"
      subsystem={where}
      title="There is no page at this address"
      description={`The link may be out of date, or the page may have moved within ${where.name}. The sidebar lists everything your account can open.`}
      details={pathname}
      actions={[
        <Button type="primary" key="home" icon={<HomeOutlined />} onClick={() => navigate(where.home)}>
          {where.homeLabel}
        </Button>,
        <Button key="back" onClick={() => navigate(-1)}>
          Go back
        </Button>,
      ]}
    />
  );
};

export default NotFound;
