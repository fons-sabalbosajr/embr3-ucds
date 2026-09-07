import axios from "axios";
import { API_BASE } from "../config/api";

const client = axios.create({ baseURL: API_BASE, withCredentials: true });

export const ORG_UNIT_TYPES = ["office", "division", "section", "unit"];

export const listOrgUnits = async ({ includeInactive = false } = {}) => {
  const { data } = await client.get("/org-units", { params: { includeInactive } });
  return data.orgUnits || [];
};

export const createOrgUnit = async (payload) => {
  const { data } = await client.post("/org-units", payload);
  return data.orgUnit;
};

export const updateOrgUnit = async ({ id, ...changes }) => {
  const { data } = await client.patch(`/org-units/${id}`, changes);
  return data.orgUnit;
};

export const addOrgUnitAlias = async ({ code, alias }) => {
  const { data } = await client.post(`/org-units/${code}/aliases`, { alias });
  return data.orgUnit;
};

/**
 * The API answers a failed Zod check with { code, message, errors: [{field,
 * message}] }. Flatten that into one readable line for a toast.
 */
export const describeApiError = (error, fallback = "Something went wrong.") => {
  const data = error?.response?.data;
  if (!data) return error?.message || fallback;
  if (Array.isArray(data.errors) && data.errors.length) {
    return data.errors.map((e) => `${e.field}: ${e.message}`).join("; ");
  }
  return data.message || fallback;
};
