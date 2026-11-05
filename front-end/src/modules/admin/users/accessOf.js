// ---------------------------------------------------------------------------
// What an account reaches, worked out from its document (as /api/users returns
// it): for the Manage access dialog, and the summary on the User Accounts table.
//
// Mirrors server/services/authorization.js, accessRequestService.js and
// portalService.sourcesFor. The server is the authority; this only explains.
// ---------------------------------------------------------------------------

import { holdsCapability } from "../../../shared/accountTypes";

const DEFAULT_MODULES = {
  developer: ["ucds", "erms", "admin"],
  admin: ["ucds", "erms", "admin"],
  records: ["erms"],
  planning: ["ucds"],
  viewer: ["ucds"],
};

/** The types whose modules can be changed: the others hold every one. */
export const CAN_ENTER_MODULES = ["planning", "records", "viewer"];

const typeOf = (account) => String(account?.permission || "viewer").toLowerCase();

/** The modules an account enters: its own list if it has one, otherwise its type's. */
export function modulesOf(account) {
  const type = typeOf(account);
  if (type === "developer" || type === "admin") return DEFAULT_MODULES[type];
  const own = Array.isArray(account?.domains) ? account.domains.filter((d) => ["ucds", "erms", "admin"].includes(d)) : [];
  return own.length ? own : DEFAULT_MODULES[type] || ["ucds"];
}

const PROVINCE_KEYS = ["aurora", "bataan", "bulacan", "nuevaEcija", "pampanga", "tarlac", "zambales"];
const CAPABILITY_KEYS = ["canManageData", "canGenerateData", "canViewDataHistory", "canAccessRangePicker", "canRemoveMenuItems", "canViewAdminPanel"];

/** The counts on the User Accounts table, and what keeps the account from working. */
export function accessSummary(account) {
  const type = typeOf(account);
  const every = type === "developer" || type === "admin";
  const modules = modulesOf(account);
  const entersUcds = modules.includes("ucds");
  const years = Array.isArray(account?.assignedYears) ? account.assignedYears.length : 0;
  const provinces = PROVINCE_KEYS.filter((k) => account?.[k] === "view" || account?.[k] === "readWrite" || account?.[k] === true).length;
  const problems = [];
  if (!every && entersUcds && !years) problems.push("No year assigned: can sign in, but cannot enter the Universe Central DB.");
  if (!every && entersUcds && !provinces) problems.push("No province: sees no rows of the register.");
  return {
    modules,
    every,
    years: every ? "all" : years,
    provinces: every ? "all" : provinces,
    actions: type === "developer" ? "all" : CAPABILITY_KEYS.filter((k) => holdsCapability(account, k)).length,
    storage: type === "developer" ? "all" : type === "viewer" ? 0 : Array.isArray(account?.nasContainers) ? account.nasContainers.length : type === "records" ? 1 : 0,
    problems,
  };
}

const UNIT_LABEL = { records: "Records", legal: "Legal Services", laboratory: "Laboratory" };

/** What follows from the type and modules: { key, icon, name, on, detail }. */
export function automaticAccess(account, veraRoles) {
  const type = typeOf(account);
  const modules = modulesOf(account);
  const developer = type === "developer";
  const legacyAdmin = type === "admin";
  const unit = type === "records" ? account?.ermsUnit || "records" : null;
  const inRecordsUnit = developer || (legacyAdmin && modules.includes("erms")) || unit === "records";
  const fromEstablishment = modules.includes("ucds") && (type === "planning" || /\bPEMU\b/i.test(`${account?.office || ""} ${account?.division || ""}`));
  const desk = developer || (legacyAdmin && modules.includes("erms")) ? "all three units" : unit ? UNIT_LABEL[unit] : null;
  const vera = (Array.isArray(veraRoles) ? veraRoles : []).find((r) => r.role === type);

  return [
    {
      key: "sign-in",
      icon: "sign",
      name: "Sign in",
      on: true,
      detail: `With the username ${account?.username || ""} or the account's email address, in any capitals.`,
    },
    {
      key: "records-unit",
      icon: "documents",
      name: "Open Records scans directly",
      on: inRecordsUnit,
      detail: inRecordsUnit ? "As the Records Unit: any document on a record it can read." : "Anyone outside the Records Unit asks in the Document Portal.",
    },
    {
      key: "establishment",
      icon: "documents",
      name: "Open a firm's documents from its record",
      on: fromEstablishment || inRecordsUnit,
      detail: fromEstablishment
        ? "The Documents tab in the Universe Central DB, in its provinces. Planning Admins and accounts of a PEMU office."
        : inRecordsUnit
          ? "As the Records Unit."
          : "For Planning Admins and accounts of a PEMU office.",
    },
    {
      key: "desk",
      icon: "desk",
      name: "Decide Document Portal requests",
      on: Boolean(desk),
      detail: desk ? `The desk, for ${desk}.` : "For the unit that keeps the document.",
    },
    {
      key: "ai",
      icon: "ai",
      name: "VERA answers from the AI model",
      on: vera ? vera.model !== false : true,
      detail: vera ? "Set per account type in Admin Settings › VERA Assistant." : "On unless switched off for this type in Admin Settings › VERA Assistant.",
    },
    {
      key: "figures",
      icon: "figures",
      name: "VERA quotes live figures and searches records",
      on: vera ? vera.figures !== false : true,
      detail: "Only what this account may already see. Set per account type in Admin Settings › VERA Assistant.",
    },
  ];
}
