// ---------------------------------------------------------------------------
// The basemap under every map in the application (the progress tracker's
// firm map, the Monitoring Plan's establishment map).
//
// With a MapTiler key — sent by the server from its .env (MAPTILER_KEY), or
// set in the front end's own .env (VITE_MAPTILER_KEY) — MapTiler's maps, whose
// dashboard counts the use and limits the key to our website. Without one:
// CARTO's free OpenStreetMap tiles (no account).
// ---------------------------------------------------------------------------

export const BUILD_MAP_KEY = import.meta.env.VITE_MAPTILER_KEY;
export const REGION_III = [15.35, 120.75];

const OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export const basemapFor = (key) =>
  key
    ? {
        light: `https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=${encodeURIComponent(key)}`,
        dark: `https://api.maptiler.com/maps/dataviz-dark/256/{z}/{x}/{y}.png?key=${encodeURIComponent(key)}`,
        attribution: `<a href="https://www.maptiler.com/copyright/">&copy; MapTiler</a> ${OSM}`,
        subdomains: "abc",
        retina: false,
      }
    : {
        light: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
        dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        attribution: `${OSM} &copy; <a href="https://carto.com/attributions">CARTO</a>`,
        subdomains: "abcd",
        retina: true,
      };
