import React, { createContext, useContext, useState, useEffect } from "react";
import axios from "axios";

const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchUserData = async (userHandle) => {
    try {
      const response = await axios.get(`http://10.14.77.107:8081/api/users?username=${userHandle}`);
      if (response.data && response.data.length > 0) {
        setUserData(response.data[0]);
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Example userHandle; replace with actual dynamic value
    const userHandle = "asabalbosa"; // Replace this with dynamic user handle if available
    fetchUserData(userHandle);
  }, []);

  return (
    <UserContext.Provider value={{ userData, setUserData, loading }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);
