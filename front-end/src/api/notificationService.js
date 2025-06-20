// src/api/ucdsService.js
import axios from "axios";

const API_BASE_URL = "http://10.14.77.100:8081/api"; // Base URL for user-related endpoints

/**
 * Fetches a single UCDS record by its ID.
 * @param {string} id_no - The ID of the record to fetch.
 * @returns {Promise<Object|null>} A promise that resolves to the record data or null if not found/error.
 */
export const getUcdsRecordById = async (id_no) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/ucds-data/${id_no}`);
    return response.data;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      console.warn(
        `Record ${id_no} not found in ucds-data (possibly archived).`
      );
      return null;
    }
    console.error(
      `Error fetching UCDS record ${id_no}:`,
      error.response?.data || error.message
    );
    // Re-throw a more specific error or a generic one for the component to handle
    throw new Error(
      error.response?.data?.message || `Failed to fetch record ${id_no}.`
    );
  }
};

// --- Notification Service Functions (Merged) ---

/**
 * Example: Marks a specific notification as read.
 * @param {string} notificationId - The ID of the notification.
 * @returns {Promise<Object>} A promise that resolves to the server's response.
 * @throws {Error} If the API request fails.
 */
export const markNotificationAsRead = async (notificationId) => {
  try {
    // Example of what a call might look like:
    // const response = await axios.post(`${API_BASE_URL}/notifications/${notificationId}/read`);
    // return response.data;
    console.warn(
      `API call 'markNotificationAsRead' for ${notificationId} is a placeholder and not yet implemented.`
    );
    return Promise.resolve({
      success: true,
      message: `Notification ${notificationId} marked as read (mocked).`,
    });
  } catch (error) {
    console.error(
      `Error marking notification ${notificationId} as read:`,
      error
    );
    throw new Error(
      error.response?.data?.message || "Failed to mark notification as read."
    );
  }
};

/**
 * Updates duplicate UCDS records.
 * @param {Array<Object>} updates - An array of objects, each specifying an id_no and fields to update.
 * @returns {Promise<Object>} A promise that resolves to the server's response data.
 * @throws {Error} If the API request fails.
 */
export const updateUcdsDuplicates = async (updates) => {
  try {
    const response = await axios.post(
      `${API_BASE_URL}/ucds/update-duplicates`,
      { updates }
    );
    return response.data;
  } catch (error) {
    console.error("Error updating duplicate records:", error);
    throw new Error(
      error.response?.data?.message || "Failed to save changes to duplicates."
    );
  }
};

/**
 * Archives a UCDS record.
 * @param {string} id_no - The ID of the record to archive.
 * @returns {Promise<Object>} A promise that resolves to the server's response data.
 * @throws {Error} If the API request fails.
 */
export const archiveUcdsRecord = async (id_no) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/archive-data`, {
      id_no,
    });
    return response.data;
  } catch (error) {
    console.error(`Error archiving record ${id_no}:`, error);
    throw new Error(
      error.response?.data?.message ||
        `Failed to archive record ${id_no}. Server response: ${
          error.response?.data?.error || error.message
        }`
    );
  }
};
