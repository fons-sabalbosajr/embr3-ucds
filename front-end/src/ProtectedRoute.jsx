import React, { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import axios from "axios";
import { API_BASE_URL } from "./config/api";
import { ROUTES } from "./config/routes";
import PageLoading from "./shared/components/PageLoading";

const ProtectedRoute = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await axios.get(
          `${API_BASE_URL}/auth-check`, // Updated endpoint
          { withCredentials: true }
        );

        // Assuming that a successful response means the user is authenticated
        if (response.status === 200) {
          setIsAuthenticated(true); // User is authenticated
        }
      } catch (error) {
        // If there's an error, the user is not authenticated
        setIsAuthenticated(false);
      }
    };

    checkAuth();
  }, []);

  // If the authentication status is still loading
  if (isAuthenticated === null) {
    return <PageLoading tip="Checking your session" />;
  }

  // A tab that is not signed in — a new tab opened on an application link —
  // signs in, then goes where it was headed (Login follows ?next=).
  const next = `${window.location.pathname}${window.location.search}`;
  return isAuthenticated ? (
    <Outlet />
  ) : (
    <Navigate to={next.startsWith(ROUTES.app) ? `${ROUTES.login}?next=${encodeURIComponent(next)}` : ROUTES.login} replace />
  );
};

export default ProtectedRoute;
