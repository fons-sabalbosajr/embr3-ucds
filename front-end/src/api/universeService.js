// src/api/universeService.js
import axios from "axios";
import { API_BASE_URL, API_BASE } from "../config/api";

/**
 * The signed-in user's identity and full entitlement in one call:
 * { user, role, permission, domains, capabilities, provinceAccess, provinces,
 *   assignedYears, authorizedYears, activeYear }.
 *
 * Replaces deriving capabilities and province access from the loose fields on
 * /check-auth. The server is the only thing that decides any of it; the API
 * re-checks the same rules on every subsequent request.
 *
 * @returns {Promise<object>}
 */
export const fetchCurrentUser = async () => {
  try {
    const response = await axios.get(`${API_BASE}/auth/me`, {
      withCredentials: true,
    });
    if (response.data && response.data.status === "Success") {
      return response.data;
    }
    throw response.data || new Error("Could not resolve the current user.");
  } catch (error) {
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
