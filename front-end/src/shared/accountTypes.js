// ---------------------------------------------------------------------------
// Account types, as people see them.
//
// The stored values (`permission` on the account) are unchanged — accounts
// keep working — only the words are new. "viewer" was never a good name for
// the people who do the encoding. Mirrors ROLE_LABELS in
// server/services/authorization.js; the server is the authority.
// ---------------------------------------------------------------------------

export const ACCOUNT_TYPES = [
  {
    value: "developer",
    label: "Developer",
    description: "Everything: UCDS, ERMS, administration, the NAS and every storage container.",
    color: "purple",
  },
  {
    value: "planning",
    label: "Planning Admin",
    description: "UCDS, and the storage containers the Developer designates.",
    color: "blue",
  },
  {
    value: "records",
    label: "ERMS User",
    description: "ERMS for one unit — Records, Legal Services or Laboratory — set as the System on the account, with that unit's storage container. No year container to choose.",
    color: "geekblue",
  },
  {
    value: "viewer",
    label: "Encoder",
    description: "UCDS only, within the year containers assigned. No storage access.",
    color: "green",
  },
];

/** Kept for accounts that already hold it; not offered for new ones. */
export const LEGACY_TYPES = [
  { value: "admin", label: "Administrator (legacy)", description: "UCDS, ERMS and administration. Reassign to one of the four types.", color: "gold" },
];

const ALL = [...ACCOUNT_TYPES, ...LEGACY_TYPES];

export const accountType = (permission) =>
  ALL.find((t) => t.value === String(permission || "").toLowerCase()) || {
    value: String(permission || ""),
    label: permission || "Unknown",
    description: "",
    color: "default",
  };

export const accountTypeLabel = (permission) => accountType(permission).label;

const ERMS_SYSTEM_LABEL = { records: "ERMS Records", legal: "ERMS Legal", laboratory: "ERMS Laboratory" };

/**
 * The account type as the header shows it. An ERMS User is named by the
 * subsystem they work in — "ERMS Laboratory", not just "ERMS User" — from
 * the System set on the account (/api/auth/me's ermsUnit).
 */
export const accountTypeFor = (permission, ermsUnit) => {
  const type = accountType(permission);
  return type.value === "records" && ERMS_SYSTEM_LABEL[ermsUnit] ? { ...type, label: ERMS_SYSTEM_LABEL[ermsUnit] } : type;
};

/**
 * A capability added after accounts existed is held by these types until it
 * is switched either way on the account. Mirrors ROLE_DEFAULT_CAPABILITIES in
 * server/services/authorization.js; the server is the authority.
 */
const ROLE_DEFAULT_CAPABILITIES = { canRemoveMenuItems: ["admin", "planning"] };

/** Whether an account document (as /api/users returns it) holds a capability. */
export const holdsCapability = (account, key) => {
  const type = String(account?.permission || "").toLowerCase();
  if (type === "developer") return true;
  const nested = account?.capabilities && typeof account.capabilities === "object" ? account.capabilities : {};
  if (account?.[key] === true || nested[key] === true) return true;
  // Switched off on the account, or a capability with no default: not held.
  if (typeof account?.[key] === "boolean" || key in nested || !ROLE_DEFAULT_CAPABILITIES[key]) return false;
  return ROLE_DEFAULT_CAPABILITIES[key].includes(type);
};

/** Types that may hold storage containers at all. */
export const STORAGE_TYPES = new Set(["developer", "planning", "records", "admin"]);
