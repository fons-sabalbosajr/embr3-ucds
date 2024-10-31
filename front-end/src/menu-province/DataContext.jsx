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
  const [currentProvince, setCurrentProvince] = useState("Aurora");
  const loaded = useRef(false);

  // Function to fetch data for a specific province
  const fetchData = useCallback(async (province) => {
    try {
      setLoading(true);
      setProgress(0);

      // Append a unique query parameter to force cache busting
      const response = await axios.get(
        "http://localhost:8081/api/get-province-data",
        {
          params: { province, _nocache: Date.now() },
        }
      );

      if (response.status >= 200 && response.status < 300) {
        const fetchedData = response.data;

        setData(fetchedData);
        setDataCache((prevCache) => ({
          ...prevCache,
          [province]: fetchedData, // Store the data in the cache
        }));

        setLoading(false);
        setProgress(100);
      } else {
        throw new Error(`Unexpected response status: ${response.status}`);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      setError("Failed to fetch data");
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentProvince && !loaded.current) {
      loaded.current = true;
      fetchData(currentProvince);
    }
  }, [currentProvince, loaded.current]);

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
