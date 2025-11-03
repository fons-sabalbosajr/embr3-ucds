import axios from "axios";
import { API_BASE } from "../../config/api";

/**
 * Fetches dashboard statistics for SWM Plans.
 * @returns {Promise<Object>} The SWM Plan statistics data.
 */
export const fetchSWMPlanDashboardStats = async () => {
  try {
  const response = await axios.get(`${API_BASE}/swm-plan-stats`);
    return response.data;
  } catch (error) {
    console.error("Error fetching SWM Plan dashboard stats:", error);
    throw error; // Re-throw to allow caller to handle
  }
};

/**
 * Fetches SWM Plan data with pagination, search, and filters.
 * @param {number} page - Current page number.
 * @param {number} pageSize - Number of items per page.
 * @param {string} search - Search term.
 * @param {string|null} province - Province filter.
 * @param {string|null} planStatus - SWM Plan status filter.
 * @param {Object} columnFilters - Object containing column-specific filters.
 * @returns {Promise<{data: Array, total: number}>} The SWM Plan data and total count.
 */
export const fetchSWMPlanData = async (
  page = 1,
  pageSize = 20,
  search = "",
  province = null,
  planStatus = null,
  columnFilters = {}
) => {
  try {
  const res = await axios.get(`${API_BASE}/swm-plan-data`, {
      params: {
        page,
        pageSize,
        search,
        province,
        planStatus,
        ...columnFilters,
      },
    });
    // Ensure unique key for Ant Design Table
    return {
      data: res.data.data.map(item => ({ ...item, key: item._id || item.planId })),
      total: res.data.total
    };
  } catch (error) {
    console.error("Failed to fetch SWM Plan data:", error);
    throw error; // Re-throw to allow caller to handle
  }
};

/**
 * Updates a single SWM Plan record.
 * @param {string} identifier - The ID of the SWM Plan to update (e.g., _id).
 * @param {Object} payload - The data to update.
 * @returns {Promise<Object>} The updated SWM Plan record.
 */
export const updateSWMPlanRecord = async (identifier, payload) => {
  try {
  const response = await axios.put(`${API_BASE}/update-swm-plan-data/${identifier}`, payload);
    return response.data;
  } catch (error) {
    console.error(`Failed to update SWM Plan record with ID ${identifier}:`, error);
    throw error; // Re-throw to allow caller to handle
  }
};
