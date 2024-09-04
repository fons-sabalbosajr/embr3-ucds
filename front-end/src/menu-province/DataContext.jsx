import React, { createContext, useState, useEffect } from "react";
import axios from "axios";

// Define a context for sharing data
export const DataContext = createContext();

export const DataProvider = ({ children }) => {
  const [dataCache, setDataCache] = useState({});
  const [data, setData] = useState([]); 
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [currentProvince, setCurrentProvince] = useState("Aurora");

  // Function to fetch data for a specific province
  const fetchData = async (province) => {
    try {
      setProgress(10);
      setLoading(true);

      // Append a unique query parameter to force cache busting
      const response = await axios.get(
      'http://localhost:8081/api/get-province-data', {
        params: { province, _nocache: Date.now() },
      });

      if (response.status >= 200 && response.status < 300) {
        const fetchedData = response.data;

        setProgress(50);
        setData(fetchedData);

        setDataCache((prevCache) => ({
          ...prevCache,
          [province]: fetchedData, // Store the data in the cache
        }));

        setProgress(75);

        setTimeout(() => {
          setLoading(false);
          setProgress(100);
        }, 1000);
      } else {
        throw new Error(`Unexpected response status: ${response.status}`);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      setError("Failed to fetch data");
      setLoading(false);
    }
  };

  // Fetch data when the province changes
  useEffect(() => {
    fetchData(currentProvince); // Fetch with the current province
  }, [currentProvince]); // Dependency on currentProvince

  return (
    <DataContext.Provider
      value={{
        data,
        loading,
        progress,
        error,
        currentProvince,
        setCurrentProvince,
        fetchData
      }}
    >
      {children}
    </DataContext.Provider>
  );
};
