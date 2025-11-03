import axios from "axios";
import { API_BASE as API_BASE_URL } from "../config/api";

/**
 * Fetches a summary of permits from the API for the dashboard widget.
 * @param {number} currentPage - The current page number for pagination.
 * @param {number} pageSize - The number of items per page.
 * @param {string[]} allowedPrefixes - An array of province prefixes to filter by.
 * @returns {Promise<{data: Array, total: number}>} A promise that resolves to the permit data and total count.
 */
export const fetchPermitsSummary = async (currentPage, pageSize, allowedPrefixes) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/permits-summary`, {
      params: { page: currentPage, pageSize: pageSize, prefixes: allowedPrefixes.join(","), filterEstablishmentsByExpiryStatus: "true" },
    });
    return response.data;
  } catch (error) {
    console.error("Error fetching permit summary:", error);
    throw error; // Re-throw the error to allow the calling component to handle it
  }
};

/**
 * Fetches a detailed, filterable list of permits for the monitoring modal.
 * @param {object} params - The query parameters.
 * @param {number} params.currentPage - The current page number.
 * @param {number} params.pageSize - The number of items per page.
 * @param {string[]} params.selectedPrefixes - Array of province prefixes.
 * @param {string} params.debouncedSearchText - The search text.
 * @param {string[]} params.activePermitFilters - Array of permit status/type filters.
 * @returns {Promise<{data: Array, total: number}>} A promise that resolves to the permit data and total count.
 */
export const fetchPermitsForMonitoring = async ({
  currentPage,
  pageSize,
  selectedPrefixes,
  debouncedSearchText,
  activePermitFilters,
}) => {
  const prefixQuery = selectedPrefixes.join(",");
  const typesForApiQuery = activePermitFilters
    .filter((f) => f.startsWith("type_"))
    .map((f) => f.replace("type_", ""))
    .join(",");

  try {
    const response = await axios.get(`${API_BASE_URL}/permits-summary`, {
      params: {
        page: currentPage,
        pageSize: pageSize,
        prefixes: prefixQuery,
        searchText: debouncedSearchText,
        filterEstablishmentsByExpiryStatus: true,
        permitTypesFilter: typesForApiQuery,
      },
    });
    return response.data;
  } catch (error) {
    console.error("Error fetching permits for monitoring:", error);
    throw error;
  }
};

/**
 * Updates the expiry date and code of a specific permit.
 * @param {object} payload - The data for the update.
 * @param {string} payload.sort_key - The unique identifier of the establishment.
 * @param {string} payload.permitType - The type of permit to update (e.g., 'PTO').
 * @param {string} payload.newExpiryDate - The new expiry date in 'YYYY-MM-DD' format.
 * @param {string} payload.newPermitCode - The new permit code.
 * @returns {Promise<any>} A promise that resolves with the response from the API.
 */
export const updatePermitExpiry = async (payload) => {
  try {
    const response = await axios.put(
      `${API_BASE_URL}/permits-summary/update-expiry`,
      payload
    );
    return response.data;
  } catch (error) {
    console.error("Error updating permit expiry:", error);
    // Pass along more detailed error info from the server if available
    throw error.response?.data || error;
  }
};
