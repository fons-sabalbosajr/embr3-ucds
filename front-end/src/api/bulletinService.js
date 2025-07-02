import axios from "axios";

const API_URL = "http://10.14.77.107:8081/api/postings";

/**
 * Fetches all postings, filters for active ones, and sorts them by creation date.
 * @returns {Promise<Array>} A promise that resolves to an array of active bulletins.
 */
export const fetchActiveBulletins = async () => {
  try {
    const response = await axios.get(API_URL);
    return response.data
      .filter((item) => item.status === "active")
      .sort((a, b) => new Date(b.createdDate) - new Date(a.createdDate));
  } catch (error) {
    console.error("Error fetching postings:", error);
    // Re-throw the error to be handled by the calling component
    throw error;
  }
};

/**
 * Marks a specific bulletin as read.
 * @param {string} id - The ID of the bulletin to update.
 * @returns {Promise<Object>} A promise that resolves to the response data.
 */
export const markBulletinAsRead = async (id) => {
  try {
    return await axios.patch(`${API_URL}/${id}`, { isRead: true });
  } catch (error) {
    console.error("Error marking bulletin as read:", error);
    throw error;
  }
};

/**
 * Updates a bulletin to not be shown again.
 * @param {string} id - The ID of the bulletin to update.
 * @returns {Promise<Object>} A promise that resolves to the response data.
 */
export const disableShowAgain = async (id) => {
  try {
    return await axios.patch(`${API_URL}/${id}`, { showAgain: false });
  } catch (error) {
    console.error("Error updating announcement status:", error);
    throw error;
  }
};

