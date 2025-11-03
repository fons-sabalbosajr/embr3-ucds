import axios from "axios";
import { API_BASE } from "../config/api";

const ax = axios.create({
  withCredentials: true,
});

// Field Configs
export const getFieldConfigs = async (params = {}) => {
  const { module, q } = params;
  const res = await ax.get(`${API_BASE}/dev/field-configs`, { params: { module, q } });
  return res.data;
};

export const createFieldConfig = async (data) => {
  const res = await ax.post(`${API_BASE}/dev/field-configs`, data);
  return res.data;
};

export const updateFieldConfig = async (id, data) => {
  const res = await ax.put(`${API_BASE}/dev/field-configs/${id}`, data);
  return res.data;
};

export const deleteFieldConfig = async (id) => {
  const res = await ax.delete(`${API_BASE}/dev/field-configs/${id}`);
  return res.data;
};

// Introspection + Import
export const introspectUcdsFields = async () => {
  const res = await ax.get(`${API_BASE}/dev/introspect/ucds-data/fields`);
  return res.data;
};

export const importFieldConfigs = async (payload) => {
  const res = await ax.post(`${API_BASE}/dev/field-configs/import`, payload);
  return res.data;
};

// PDF Forms
export const getPdfForms = async () => {
  const res = await ax.get(`${API_BASE}/dev/pdf-forms`);
  return res.data;
};

export const uploadPdfForm = async (formData) => {
  const res = await ax.post(`${API_BASE}/dev/pdf-forms`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
};

export const deletePdfForm = async (id) => {
  const res = await ax.delete(`${API_BASE}/dev/pdf-forms/${id}`);
  return res.data;
};

export const pdfFormPreviewUrl = (id) => `${API_BASE}/dev/pdf-forms/file/${id}`;

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
