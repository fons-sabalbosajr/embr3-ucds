import axios from 'axios';

const API_BASE_URL = 'http://10.14.77.100:8081/api';

/**
 * Fetches detailed information for a record by its sort_key.
 * @param {string} sortKey - The sort_key of the record.
 * @returns {Promise<Object>} The record data.
 */
export const fetchRecordDetailsBySortKey = async (sortKey) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/ucds-data/${sortKey}`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching record details for sortKey ${sortKey}:`, error.response?.data || error.message);
    throw error;
  }
};

/**
 * Checks for existing logs by ECC/CNC number.
 * @param {string} eccCnc - The ECC/CNC number.
 * @returns {Promise<Array>} An array of existing logs.
 */
export const checkExistingLogsByEccCnc = async (eccCnc) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/ucds-log?ecc_cnc=${eccCnc}`);
    return response.data;
  } catch (error) {
    console.error(`Error checking existing logs for ecc_cnc ${eccCnc}:`, error.response?.data || error.message);
    throw error;
  }
};

/**
 * Fetches all UCDS logs.
 * @returns {Promise<Array>} An array of all UCDS logs.
 */
export const fetchAllUcdsLogs = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/ucds-log`);
    return response.data;
  } catch (error) {
    console.error('Error fetching all UCDS logs:', error.response?.data || error.message);
    throw error;
  }
};

/**
 * Creates a new UCDS log entry.
 * @param {Object} logData - The data for the log entry.
 * @returns {Promise<Object>} The response data from the server.
 */
export const createUcdsLogEntry = async (logData) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/ucds-log`, logData);
    return response.data;
  } catch (error) {
    console.error('Error creating UCDS log entry:', error.response?.data || error.message);
    throw error;
  }
};

/**
 * Updates UCDS data for a given sort_key.
 * @param {string} sortKey - The sort_key of the record to update.
 * @param {Object} dataToUpdate - The data to update.
 * @returns {Promise<Object>} The full response object from axios.
 */
export const updateUcdsDataBySortKey = async (sortKey, dataToUpdate) => {
  try {
    const response = await axios.put(`${API_BASE_URL}/update-data/${sortKey}`, dataToUpdate);
    return response; // Returning the full response as the original code checks response.status
  } catch (error) {
    console.error(`Error updating UCDS data for sortKey ${sortKey}:`, error.response?.data || error.message);
    throw error;
  }
};
