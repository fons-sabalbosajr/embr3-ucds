// src/api/universeService.js
import axios from "axios";
import { API_BASE_URL, API_BASE } from "../config/api";

/**
 * Checks the user's authentication status.
 * @returns {Promise<object>} The user's auth data if successful.
 * @throws Will throw an error if authentication fails or status is not "Success".
 */
export const checkUserAuth = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/check-auth`, {
      withCredentials: true,
    });
    if (response.data && response.data.status === "Success") {
      return response.data;
    } else {
      // Throw the response data or a specific error message
      throw response.data || new Error("Authentication check failed: Status not Success or no data received.");
    }
  } catch (error) {
    // If the error object from axios has response.data, throw that, otherwise throw the original error
    if (error.response && error.response.data) {
      throw error.response.data;
    }
    throw error;
  }
};

/**
 * Fetches data validation issues.
 * @returns {Promise<object>} The data issues.
 */
export const fetchDataValidationIssues = async () => {
  try {
    const response = await axios.post(`${API_BASE}/check-data`);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw error.response.data;
    }
    throw error;
  }
};

/**
 * Fetches duplicate data issues.
 * @returns {Promise<object>} The duplicate issues.
 */
export const fetchDuplicateDataIssues = async () => {
  try {
    const response = await axios.get(`${API_BASE}/ucds/duplicates`);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw error.response.data;
    }
    throw error;
  }
};

/**
 * Logs out the current user.
 * @returns {Promise<object>} The response data from the logout endpoint.
 */
export const logoutUserService = async () => { // Renamed to avoid conflict if Universe.jsx has a logoutUser function
  try {
    const response = await axios.post(`${API_BASE_URL}/logout`, {}, {
      withCredentials: true,
    });
    return response.data;
  } catch (error) {
    // The calling component might want to log this but proceed with client-side logout
    if (error.response && error.response.data) {
      throw error.response.data;
    }
    throw error;
  }
};

// Re-export for consumers that previously imported API_URL from this module
export { API_BASE_URL };
