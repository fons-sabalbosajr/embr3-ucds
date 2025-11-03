import axios from "axios";
import { API_BASE } from "../config/api";

export const fetchSurveyData = async (year, signal) => {
  const response = await fetch(`${API_BASE}/surveys/${year}`, {
    method: "GET",
    credentials: "include",
    signal,
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText);
  }
  return response.json();
};

export const updateSurveyRowColor = async (id, color) => {
  const response = await fetch(`${API_BASE}/surveys/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ color }),
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`Error updating row color for ID ${id}: ${response.statusText}`);
  }
  return response.json();
};

export const updateSurveyRecord = async (id_no, payload) => {
  const response = await axios.put(`${API_BASE}/survey/${id_no}`, payload);
  return response.data;
};