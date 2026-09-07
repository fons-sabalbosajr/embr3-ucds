import React, { createContext, useState, useEffect } from 'react';

// Export `decodeJWT` for other components to use
export const decodeJWT = (token) => {
  if (!token) {
    throw new Error('No token provided');
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }

  const base64Url = parts[1]; // The payload is the second part
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/'); // Convert from base64url to base64
  const decodedData = atob(base64); // Decode base64 to string
  const jsonData = JSON.parse(decodedData); // Parse JSON string to object

  return jsonData;
};

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false); // Authentication state
  const [user, setUser] = useState(null); // User information state

  useEffect(() => {
    const token = localStorage.getItem('authToken'); // Retrieve token from local storage

    if (token) {
      try {
        const decodedToken = decodeJWT(token); // Decode the JWT
        const isTokenExpired = decodedToken.exp * 1000 < Date.now(); // Check token expiration time

        if (!isTokenExpired) {
          setIsAuthenticated(true); // Set authentication status
          setUser(decodedToken); // Store user information
        } else {
          console.warn('Token has expired');
          localStorage.removeItem('authToken'); // Remove expired token
          setIsAuthenticated(false);
          setUser(null); // Clear user information
        }
      } catch (error) {
        console.error("Error decoding JWT:", error.message);
        setIsAuthenticated(false);
        setUser(null); // Clear user information on error
      }
    }
  }, []); // Only run on mount

  const logOut = () => {
    localStorage.removeItem('authToken'); // Remove token
    setIsAuthenticated(false); // Update authentication status
    setUser(null); // Clear user information
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, logOut }}>
      {children}
    </AuthContext.Provider>
  );
};
