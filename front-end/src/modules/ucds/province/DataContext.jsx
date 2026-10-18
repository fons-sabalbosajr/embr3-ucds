import React, {
  createContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import axios from "axios";
import { API_BASE_URL } from "../../../config/api";

export const DataContext = createContext();

export const DataProvider = ({ children }) => {
  const [dataCache, setDataCache] = useState({});
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [currentProvince, setCurrentProvince] = useState(""); // Default province
  const loaded = useRef(false);
  // The request in flight per province, so overlapping callers share it.
  const inFlight = useRef({});

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

      // One request per province at a time. The screen, this provider's own
      // effect and a reload could each ask for the same province before the
      // first answer arrived, and each fetched the whole province — 2 to 8 MB
      // — again. Callers that overlap now share the request in flight.
      if (!inFlight.current[province]) {
        inFlight.current[province] = axios
          .get(`${API_BASE_URL}/api/get-province-data`, {
            params: { province, _nocache: Date.now() },
            headers: {
              "Cache-Control": "no-cache", // Force HTTP no-cache
            },
          })
          .finally(() => {
            delete inFlight.current[province];
          });
      }
      const response = await inFlight.current[province];

      if (response.status >= 200 && response.status < 300) {
        const fetchedData = response.data;

        // Serials are PREFIX-number ("AU-0012") or, for the 2027 healthcare
        // and permit lists, PREFIX-PROVINCE-number ("HC-BU-0012"): the number
        // is always the last part, the rest is the series.
        const splitSortKey = (sortKey) => {
          const m = /^(.*)-(\d+)$/.exec(String(sortKey || ""));
          return m ? [m[1], parseInt(m[2], 10)] : [String(sortKey || ""), 0];
        };
        const formatSortKey = (sortKey) => {
          if (typeof sortKey !== "string") return sortKey;
          const [series, n] = splitSortKey(sortKey);
          return /^(.*)-(\d+)$/.test(sortKey) ? `${series}-${n}` : sortKey;
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
            const [seriesA, numA] = splitSortKey(a.sort_key);
            const [seriesB, numB] = splitSortKey(b.sort_key);
            // One series after another (HC-AU before HC-BA…), each in order.
            // A province page has one main series, so this is its old order.
            return seriesA === seriesB ? numA - numB : (a.id_no || 0) - (b.id_no || 0);
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
        // Forget every province's rows. Called when the year container
        // changes: the cache is keyed by province only, and the next screen
        // must fetch the new year's rows rather than reuse the old ones.
        clearCache: () => {
          setDataCache({});
          setData([]);
        },
      }}
    >
      {children}
    </DataContext.Provider>
  );
};
