// ---------------------------------------------------------------------------
// Which part of E-Universe an address belongs to — its subsystem — with the
// page that is its home and the colour it is known by. Used where a screen
// has to speak about "where you are" without knowing who drew it: the error
// screens (shared/components/ErrorCard, RouteError) send a person back to
// the subsystem they were in, not to a dashboard their account may not have.
// ---------------------------------------------------------------------------

const SUBSYSTEMS = [
  {
    key: "portal",
    match: /^\/e-universe\/document-portal/,
    name: "Document Portal",
    detail: "Requests for scanned documents",
    home: "/e-universe/document-portal",
    homeLabel: "Back to the Document Portal",
    color: "#0b5f74",
    public: true,
  },
  {
    key: "erms-legal",
    match: /^\/universe\/erms\/legal(\/|$)|^\/universe\/erms\/upload-tally\/legal/,
    name: "ERMS · Legal Services",
    detail: "Legal Services Unit records",
    home: "/universe/erms/legal/dashboard",
    homeLabel: "Back to Legal Services",
    color: "#4a2250",
  },
  {
    key: "erms-laboratory",
    match: /^\/universe\/erms\/laboratory(\/|$)|^\/universe\/erms\/upload-tally\/laboratory/,
    name: "ERMS · Laboratory",
    detail: "Environmental Laboratory records",
    home: "/universe/erms/laboratory/dashboard",
    homeLabel: "Back to the Laboratory",
    color: "#415e20",
  },
  {
    key: "erms",
    match: /^\/universe\/erms(\/|$)/,
    name: "ERMS · Records",
    detail: "Electronic Records Management System",
    home: "/universe/erms/dashboard",
    homeLabel: "Back to ERMS Records",
    color: "#b45248",
  },
  {
    key: "admin",
    match: /^\/universe\/(admin|accounts|activity-log)(\/|$)/,
    name: "Admin Settings",
    detail: "Accounts and configuration",
    home: "/universe/admin",
    homeLabel: "Back to Admin Settings",
    color: "#542c14",
  },
  {
    key: "storage",
    match: /^\/universe\/storage(\/|$)/,
    name: "Storage",
    detail: "Shared storage containers",
    home: "/universe/storage",
    homeLabel: "Back to Storage",
    color: "#0a4959",
  },
  {
    key: "ucds",
    match: /^\/universe(\/|$)/,
    name: "Universe Central DB",
    detail: "Register of regulated establishments",
    home: "/universe",
    homeLabel: "Back to E-Universe",
    color: "#0b5f74",
  },
];

const FALLBACK = {
  key: "e-universe",
  name: "E-Universe",
  detail: "Unified Information and Records Management System",
  home: "/e-universe",
  homeLabel: "Back to E-Universe",
  color: "#0b5f74",
  public: true,
};

/** The subsystem an address belongs to. `/universe` lands each account on its own home. */
export function subsystemOf(pathname = typeof window !== "undefined" ? window.location.pathname : "") {
  const path = String(pathname || "");
  return SUBSYSTEMS.find((s) => s.match.test(path)) || FALLBACK;
}