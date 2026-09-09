import { Outlet } from "react-router-dom";
import Forbidden from "../shared/components/Forbidden";

/**
 * Renders children only for the listed roles.
 *
 * The companion to DomainGuard, for screens that a domain does not describe —
 * the records share configuration is infrastructure, not a business domain, so
 * "who may see it" is a role question rather than a domain one.
 *
 * Like DomainGuard this is a courtesy, not a control: every route behind these
 * screens applies requireDeveloper on the server, and the sensitive ones also
 * require an emailed code. Hiding the screen only avoids showing someone a
 * page that would refuse them.
 */
const RoleGuard = ({ roles, user, children }) => {
  const role = user?.permission ?? user?.role;

  // Entitlement has not arrived yet — render nothing rather than flashing a
  // "forbidden" page at a user who does in fact have access.
  if (!role) return null;

  if (!roles.includes(role)) {
    return (
      <Forbidden
        module="Developer Settings"
        detail="This area is limited to developers."
      />
    );
  }

  return children ?? <Outlet />;
};

export default RoleGuard;
