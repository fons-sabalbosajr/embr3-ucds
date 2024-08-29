import React from 'react';
import { Navigate, Outlet } from 'react-router-dom'; // Outlet is used to render child routes

// Helper function to check if user is authenticated
const isAuthenticated = () => {
  const token = localStorage.getItem("authToken");
  // Add additional logic for token validation if needed
  return Boolean(token); // Return true if token exists
};

const ProtectedRoute = () => {
  return isAuthenticated() ? <Outlet /> : <Navigate to="/login" replace />;
};

export default ProtectedRoute;
