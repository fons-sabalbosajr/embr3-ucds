import Forbidden from "../shared/components/Forbidden";

/**
 * Renders children only when the user holds the given domain.
 *
 * This is a courtesy, not a control. The API applies requireDomain() to every
 * route behind these screens, so a user who reaches one another way is refused
 * there. Hiding it here just avoids a page that would only fail to load.
 *
 * Usage:  <DomainGuard domain="erms" user={currentUser}><Records /></DomainGuard>
 */
const DomainGuard = ({ domain, user, children }) => {
  const domains = user?.domains;

  // Entitlement has not arrived yet — render nothing rather than flashing a
  // "forbidden" page at a user who does in fact have access.
  if (!Array.isArray(domains)) return null;

  if (!domains.includes(domain)) {
    return <Forbidden module={domain.toUpperCase()} />;
  }

  return children;
};

export default DomainGuard;
