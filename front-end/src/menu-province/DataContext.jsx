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
  const [currentProvince, setCurrentProvince] = useState(""); // Default province
  const loaded = useRef(false);

  const fetchData = useCallback(
    async (province) => {
      if (!province) {
        console.warn("No province specified for fetchData.");
        return null;
      }

      try {
        setLoading(true);
        setProgress(0);

        // Check if data is already cached
        if (dataCache[province]) {
          setData(dataCache[province]);
          setLoading(false);
          setProgress(100);
          return dataCache[province];
        }

        const response = await axios.get(
          "http://10.14.77.107:8081/api/get-province-data",
          {
            params: { province, _nocache: Date.now() },
          }
        );

        if (response.status >= 200 && response.status < 300) {
          const fetchedData = response.data;

          // Log the raw fetched data to check for unexpected values like XX-1, XX-2
          //console.log("Raw Fetched Data:", fetchedData);

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

          // Cache the sorted data for future use
          setData(sortedData);
          setDataCache((prevCache) => ({
            ...prevCache,
            [province]: sortedData, // Cache the sorted data for the province
          }));

          setLoading(false);
          setProgress(100);

          // Return the sorted data
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
