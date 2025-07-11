// src/api/userService.js
import axios from "axios";

const API_URL = "http://10.14.77.107:8081/api"; // Base URL for user-related endpoints

/**
 * Fetches the list of online and offline users.
 * @returns {Promise<Object>} A promise that resolves to the server's response data.
 * @throws {Error} If the API request fails.
 */
export const getOnlineUsers = async () => {
  try {
    const response = await axios.get(`${API_URL}/online_users`);
    return response.data; // Assuming the server returns data directly in response.data
  } catch (error) {
    console.error("Error fetching online users:", error);
    // You might want to throw a more specific error or handle it differently
    throw new Error(
      error.response?.data?.message ||
        "Failed to fetch online users. Please try again."
    );
  }
};

export const fetchUserByUsername = async (username) => {
  try {
    const response = await fetch(`${API_URL}/users?username=${username}`);
    const data = await response.json();
    return data[0];
  } catch (error) {
    console.error("Error fetching user data:", error);
    throw error;
  }
};

export const fetchUserDetails = async (username) => {
  const res = await fetch(`${API_URL}/user/details?username=${username}`);
  if (!res.ok) throw new Error("Failed to fetch user details");
  return await res.json();
};

export const uploadUserPhoto = async (username, file) => {
  const formData = new FormData();
  formData.append("photo", file);
  formData.append("username", username);

  const res = await fetch(`${API_URL}/users/update`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || "Failed to update photo");
  }
  return await res.json();
};