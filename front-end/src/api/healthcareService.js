import axios from "axios";
import { API_BASE } from "../config/api";

export const fetchHealthcareData = async () => {
  const response = await fetch(`${API_BASE}/healthcare`, {
    method: "GET",
    credentials: "include",
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText);
  }
  return response.json();
};