import axios from "axios";

const API_BASE_URL = "http://10.14.77.107:8081/api";

/**
 * Fetches all monitored dates.
 * @returns {Promise<Array>} A promise that resolves to an array of monitored dates.
 */
export const fetchMonitoredDates = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/monitored_dates`);
    return response.data.monitoredDates || [];
  } catch (error) {
    console.error("Error fetching monitored dates:", error);
    throw error; // Re-throw to be handled by the calling component
  }
};

/**
 * Fetches all daily notices.
 * @returns {Promise<Array>} A promise that resolves to an array of daily notices.
 */
export const fetchDailyNotices = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/daily_notices`);
    return response.data.notices || [];
  } catch (error) {
    console.error("Error fetching daily notices:", error);
    throw error; // Re-throw to be handled by the calling component
  }
};

