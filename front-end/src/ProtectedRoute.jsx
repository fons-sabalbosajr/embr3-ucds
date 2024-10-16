import React, { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import axios from 'axios';

const ProtectedRoute = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await axios.get('https://embr3-ucds.onrender.com/auth/check', { withCredentials: true });
        setIsAuthenticated(response.data.isAuthenticated);
      } catch (error) {
        setIsAuthenticated(false);
      }
    };

    checkAuth();
  }, []);

  // If the authentication status is still loading
  if (isAuthenticated === null) {
    return <div>Loading...</div>; // You can replace this with a loading spinner
  }

  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
};

export default ProtectedRoute;
