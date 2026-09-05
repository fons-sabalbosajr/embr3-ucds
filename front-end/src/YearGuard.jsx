import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useYear } from "./context/YearContext";
import { ROUTES } from "./config/routes";
import Z_CustomSpinner from "./Z_CustomSpinner";

/**
 * Keeps the application out of an undefined year context.
 *
 * This is a usability guard, not a security boundary — the backend rejects
 * year-scoped requests with 409/403 regardless of what the client renders.
 */
const YearGuard = () => {
  const { activeYear, loading } = useYear();

  if (loading) return <Z_CustomSpinner />;
  if (!activeYear) return <Navigate to={ROUTES.selectYear} replace />;

  return <Outlet />;
};

export default YearGuard;
