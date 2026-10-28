import axios from "axios";
import { API_BASE } from "../../../config/api";

// The Planning Unit's own tables (server services/customTables.js).
const client = axios.create({ baseURL: `${API_BASE}/ucds/custom-tables`, withCredentials: true });

export const readTable = async (id) => (await client.get(`/${id}`)).data;
export const saveColumns = async (id, columns) => (await client.put(`/${id}/columns`, { columns })).data.columns;
export const addRows = async (id, rows) => (await client.post(`/${id}/rows`, { rows })).data;
export const updateRow = async (id, rowId, values) => (await client.patch(`/${id}/rows/${rowId}`, { values })).data.row;
export const deleteRows = async (id, ids) => (await client.post(`/${id}/rows/delete`, { ids })).data;

// VERA builds the table from the register (server services/vera/tableBuilder.js).
export const getBuilderCatalog = async (id) => (await client.get(`/${id}/vera/catalog`)).data;
export const draftWithVera = async (id, request) => (await client.post(`/${id}/vera/draft`, { request }, { timeout: 3 * 60 * 1000 })).data;
export const previewBuild = async (id, spec) => (await client.post(`/${id}/vera/preview`, { spec }, { timeout: 3 * 60 * 1000 })).data;
export const buildTable = async (id, { spec, refresh }) => (await client.post(`/${id}/vera/build`, refresh ? { refresh: true } : { spec }, { timeout: 5 * 60 * 1000 })).data;

/** The table as shown, as an Excel file the browser saves. */
export const exportTable = async (id, { headers, rows, totals }) => {
  const res = await client.post(`/${id}/export.xlsx`, { headers, rows, totals }, { responseType: "blob", timeout: 5 * 60 * 1000 });
  const name = /filename="([^"]+)"/.exec(res.headers["content-disposition"] || "")?.[1] || "table.xlsx";
  const url = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return Number(res.headers["x-export-rows"]) || rows.length;
};
