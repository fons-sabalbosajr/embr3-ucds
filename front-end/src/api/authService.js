// src/api/authService.js
import axios from "axios";
import { API_BASE_URL } from "../config/api";

export const loginUser = async (username, password, remember = false) => {
  try {
    const response = await axios.post(
        `${API_BASE_URL}/login`,
      {
        username: username,
        password: password,
        remember: remember === true,
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
