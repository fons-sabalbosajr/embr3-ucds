// src/api/authService.js
import axios from "axios";

const API_URL = "http://10.14.77.107:8081"; // Define your API base URL

export const loginUser = async (username, password) => {
  try {
    const response = await axios.post(
      `${API_URL}/login`,
      {
        username: username,
        password: password,
      },
      {
        withCredentials: true,
      }
    );
    return response.data; // Return the data from the response
  } catch (error) {
    // It's often better to let the calling component handle the error
    // so it can update the UI accordingly.
    // You can choose to throw the error or a more specific error object.
    if (error.response && error.response.data) {
      throw error.response.data; // Throw the error response data
    }
    throw error; // Throw the original error if no response data
  }
};
