import { Outlet } from "react-router-dom";
import Forbidden from "../shared/components/Forbidden";

/**
 * Renders children only when the user holds the given domain.
 *
 * This is a courtesy, not a control. The API applies requireDomain() to every
 * route behind these screens, so a user who reaches one another way is refused
 * there. Hiding it here just avoids a page that would only fail to load.
 *
 * Two forms, because a domain with many routes should not repeat the guard on
 * every one of them:
 *
 *   wrapping one element   <DomainGuard domain="erms" user={u}><Records /></DomainGuard>
 *   as a layout route      <Route element={<DomainGuard domain="ucds" user={u} />}>
 *                            <Route path="survey" element={<Survey />} />
 *                            …
 *                          </Route>
 */
const DomainGuard = ({ domain, user, children }) => {
  const domains = user?.domains;

  // Entitlement has not arrived yet — render nothing rather than flashing a
  // "forbidden" page at a user who does in fact have access.
  if (!Array.isArray(domains)) return null;

  if (!domains.includes(domain)) {
    return <Forbidden module={domain.toUpperCase()} />;
  }

  // No children means it is being used as a layout route, so the matched child
  // route renders through the outlet.
  return children ?? <Outlet />;
};

export default DomainGuard;
