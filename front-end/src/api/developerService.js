import axios from "axios";
import { API_BASE } from "../config/api";

const ax = axios.create({
  withCredentials: true,
});

// Field Configs
// Introspection + Import
// PDF Forms

// Activity Logs
export const getActivityLogs = async (params = {}) => {
  const res = await ax.get(`${API_BASE}/dev/activity-logs`, { params });
  return res.data;
};

export const updateActivityLog = async (id, data) => {
  const res = await ax.put(`${API_BASE}/dev/activity-logs/${id}`, data);
  return res.data;
};

export const deleteActivityLog = async (id) => {
  const res = await ax.delete(`${API_BASE}/dev/activity-logs/${id}`);
  return res.data;
};
