import React, {
  createContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import axios from "axios";
import { API_BASE_URL } from "../config/api";

export const DataContext = createContext();

export const DataProvider = ({ children }) => {
  const [dataCache, setDataCache] = useState({});
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [currentProvince, setCurrentProvince] = useState(""); // Default province
  const loaded = useRef(false);

 const fetchData = useCallback(
  async (province, forceReload = false) => {
    if (!province) {
      console.warn("No province specified for fetchData.");
      return null;
    }

    try {
      setLoading(true);
      setProgress(0);

      // ✅ Bypass cache if forceReload is true
      if (!forceReload && dataCache[province]) {
        setData(dataCache[province]);
        setLoading(false);
        setProgress(100);
        return dataCache[province];
      }

      const response = await axios.get(
        `${API_BASE_URL}/api/get-province-data`,
        {
          params: { province, _nocache: Date.now() },
          headers: {
            "Cache-Control": "no-cache", // Force HTTP no-cache
          },
        }
      );

      if (response.status >= 200 && response.status < 300) {
        const fetchedData = response.data;

        const formatSortKey = (sortKey) => {
          if (typeof sortKey !== "string") return sortKey;
          const [prefix, numberPart] = sortKey.split("-");
          return `${prefix}-${parseInt(numberPart, 10)}`;
        };

        const sortedData = fetchedData
          .filter((item) => {
            const key = item.sort_key;
            return (
              typeof key === "string" &&
              !key.startsWith("XX-") &&
              key.includes("-")
            );
          })
          .sort((a, b) => {
            const numA = parseInt(a.sort_key?.split("-")[1] || "0", 10);
            const numB = parseInt(b.sort_key?.split("-")[1] || "0", 10);
            return numA - numB;
          })
          .map((item) => ({
            ...item,
            formatted_sort_key: formatSortKey(item.sort_key),
          }));

        setData(sortedData);

        // ✅ Refresh the cache
        setDataCache((prevCache) => ({
          ...prevCache,
          [province]: sortedData,
        }));

        setLoading(false);
        setProgress(100);
        return sortedData;
      } else {
        throw new Error(`Unexpected response status: ${response.status}`);
      }
    } catch (err) {
      console.error("Error fetching data:", err);
      setError("Failed to fetch data. Please check the server or province.");
      setLoading(false);
      return null;
    }
  },
  [dataCache]
);


  // Fetch data when `currentProvince` changes
  useEffect(() => {
    if (currentProvince) {
      fetchData(currentProvince); // Fetch data whenever currentProvince changes
    }
  }, [currentProvince, fetchData]); // Remove `loaded.current` to allow re-fetching

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
