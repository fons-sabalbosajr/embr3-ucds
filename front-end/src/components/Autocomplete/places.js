import Papa from "papaparse";
// Bundled with the code: they used to be fetched from /data/, which only the
// development server serves — a production build's lists were empty.
import provinceCsv from "../../../data/province.csv?raw";
import cityCsv from "../../../data/city.csv?raw";
import brgyCsv from "../../../data/brgy.csv?raw";

// ---------------------------------------------------------------------------
// Region III's provinces, cities / municipalities and barangays, for the
// Province, Municipality and Barangay dropdowns. A place is matched with
// capitals, spacing and underscores aside: the register writes
// "San_Fernando" where the lists have "San Fernando".
// ---------------------------------------------------------------------------

const rows = (csv) => Papa.parse(csv, { header: true, skipEmptyLines: true }).data;
const s = (v) => String(v ?? "").trim();
export const placeKey = (v) => s(v).replace(/_/g, " ").replace(/\s+/g, " ").toLowerCase();

const PROVINCES = rows(provinceCsv).map((r) => ({ id: s(r.Prov_ID), name: s(r.Province) })).filter((p) => p.name);
const CITIES = rows(cityCsv).map((r) => ({ provId: s(r.Prov_ID), id: s(r.City_ID), name: s(r.City) })).filter((c) => c.name);
const BARANGAYS = rows(brgyCsv).map((r) => ({ provId: s(r.Prov_ID), cityId: s(r.City_ID), name: s(r.Brgy) })).filter((b) => b.name);

const provinceOf = (name) => PROVINCES.find((p) => placeKey(p.name) === placeKey(name)) || null;
const cityOf = (province, name) => {
  const p = provinceOf(province);
  return p ? CITIES.find((c) => c.provId === p.id && placeKey(c.name) === placeKey(name)) || null : null;
};

export const provinceNames = () => PROVINCES.map((p) => p.name);

export const citiesOf = (province) => {
  const p = provinceOf(province);
  return p ? CITIES.filter((c) => c.provId === p.id).map((c) => c.name) : [];
};

export const barangaysOf = (province, city) => {
  const c = cityOf(province, city);
  return c ? [...new Set(BARANGAYS.filter((b) => b.provId === c.provId && b.cityId === c.id).map((b) => b.name))] : [];
};

/** Names as Select options; a stored value not on the list is kept, so it still shows. */
export const asOptions = (names, current) => {
  const list = names.map((n) => ({ value: n, label: n.replace(/_/g, " ") }));
  if (current && !names.some((n) => n === current)) list.unshift({ value: current, label: String(current).replace(/_/g, " ") });
  return list;
};
