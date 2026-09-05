import axios from "axios";
import { API_BASE_URL } from "../config/api";

// The list of year containers is data, not a constant. Nothing in the
// front-end hard-codes a year; everything comes from these endpoints, and the
// backend only ever returns the containers the current user may enter.

export const fetchAuthorizedYears = async () => {
  const { data } = await axios.get(`${API_BASE_URL}/api/years`, { withCredentials: true });
  return data; // { role, canAccessAllYears, activeYear, years: [{ year, label, description }] }
};

export const selectYearContainer = async (year) => {
  const { data } = await axios.post(
    `${API_BASE_URL}/api/years/select`,
    { year },
    { withCredentials: true }
  );
  return data;
};

export const fetchActiveYear = async () => {
  const { data } = await axios.get(`${API_BASE_URL}/api/years/active`, { withCredentials: true });
  return data.activeYear;
};

export const clearYearContainer = async () => {
  await axios.post(`${API_BASE_URL}/api/years/clear`, {}, { withCredentials: true });
};

// --- Developer-only container management -----------------------------------

export const fetchAllYears = async () => {
  const { data } = await axios.get(`${API_BASE_URL}/api/admin/years`, { withCredentials: true });
  return data.years;
};

export const createYearContainer = async ({ year, label, description }) => {
  const { data } = await axios.post(
    `${API_BASE_URL}/api/admin/years`,
    { year, label, description },
    { withCredentials: true }
  );
  return data;
};

export const setYearContainerStatus = async (year, status) => {
  const { data } = await axios.patch(
    `${API_BASE_URL}/api/admin/years/${year}`,
    { status },
    { withCredentials: true }
  );
  return data;
};
