import React, {
  createContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import axios from "axios";

export const DataContext = createContext();

export const DataProvider = ({ children }) => {
  const [dataCache, setDataCache] = useState({});
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [currentProvince, setCurrentProvince] = useState("Aurora"); // Default province
  const loaded = useRef(false);

  // Function to fetch data for a specific province
  const fetchData = useCallback(async (province) => {
    if (!province) {
      console.warn("No province specified for fetchData.");
      return null;
    }
  
    //console.log(`Fetching data for province: ${province}`);
    try {
      setLoading(true);
      setProgress(0);
  
      const response = await axios.get(
        "http://localhost:8081/api/get-province-data",
        {
          params: { province, _nocache: Date.now() },
        }
      );
  
      if (response.status >= 200 && response.status < 300) {
        const fetchedData = response.data;
  
        //console.log("Fetched data:", fetchedData);
  
        // Update state
        setData(fetchedData);
        setDataCache((prevCache) => ({
          ...prevCache,
          [province]: fetchedData, // Cache the data for the province
        }));
  
        setLoading(false);
        setProgress(100);
  
        // Return the fetched data
        return fetchedData;
      } else {
        throw new Error(`Unexpected response status: ${response.status}`);
      }
    } catch (err) {
      console.error("Error fetching data:", err);
      setError("Failed to fetch data. Please check the server or province.");
      setLoading(false);
      return null;
    }
  }, []);
  
  

  // Fetch data when `currentProvince` changes
  useEffect(() => {
    if (currentProvince && !loaded.current) {
      loaded.current = true;
      fetchData(currentProvince);
    }
  }, [currentProvince, fetchData]);

  return (
    <DataContext.Provider
      value={{
        data,
        loading,
        progress,
        error,
        currentProvince,
        setCurrentProvince,
        fetchData,
      }}
    >
      {children}
    </DataContext.Provider>
  );
};
