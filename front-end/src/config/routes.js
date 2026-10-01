// Public route paths, defined in one place so the site prefix can change
// without hunting through components. The authenticated application lives
// under /universe and is unaffected by this prefix.

export const SITE_BASE = "/e-universe";

export const ROUTES = {
  landing: SITE_BASE,
  login: `${SITE_BASE}/login`,
  register: `${SITE_BASE}/register`,
  forgotPassword: `${SITE_BASE}/forgot-password`,
  resetPassword: `${SITE_BASE}/reset-password`,
  selectYear: "/select-year",
  app: "/universe",
};

export default ROUTES;
