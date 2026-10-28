import { useEffect, useRef } from "react";
import { Button, Empty, Space, Typography } from "antd";
import { ExportOutlined, SearchOutlined } from "@ant-design/icons";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { BUILD_MAP_KEY, basemapFor } from "../../../shared/mapBasemap";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// One establishment on the map, from the Monitoring Plan's Industry Details.
//
// Its encoded latitude and longitude, pinned on the same basemap as the
// progress tracker's map, with links to open the spot in Google Maps or
// OpenStreetMap. A pair typed the wrong way round (longitude in the latitude
// column — common in the old workbooks) is read the right way. With no usable
// coordinates, the address is searched in Google Maps instead.
//
// Loaded on first use (Province.jsx lazy-loads it), so the register's page
// does not carry Leaflet.
// ---------------------------------------------------------------------------

// Region III, generously (as VERA's register check reads it).
const REGION = { lat: [14.3, 16.7], lng: [119.5, 122.4] };
const num = (v) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const inside = (v, [lo, hi]) => v != null && v >= lo && v <= hi;

/** The record's point as [lat, lng], swapped back if entered the wrong way round; null if none. */
function pointOf(record) {
  const lat = num(record?.lat);
  const lng = num(record?.long);
  if (lat == null || lng == null) return null;
  if (inside(lat, REGION.lat) && inside(lng, REGION.lng)) return { lat, lng, note: null };
  if (inside(lng, REGION.lat) && inside(lat, REGION.lng)) return { lat: lng, lng: lat, note: "The latitude and longitude are encoded the wrong way round; shown here the right way." };
  if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng, note: "These coordinates are outside Region III — check them against the address." };
  return null;
}

const addressOf = (r) => [r?.street, r?.brgy || r?.barangay, r?.city, String(r?.province || "").replace(/_/g, " ")].filter((s) => s && String(s).trim()).join(", ") || r?.address || "";

export default function EstablishmentMap({ record, dark = false }) {
  const box = useRef(null);
  const point = pointOf(record);
  const title = record?.title || record?.name || record?.sort_key || "";
  const address = addressOf(record);
  const searchUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([title, address].filter(Boolean).join(", "))}`;

  useEffect(() => {
    if (!box.current || !point) return undefined;
    const base = basemapFor(BUILD_MAP_KEY);
    const map = L.map(box.current, { center: [point.lat, point.lng], zoom: 16, zoomControl: true });
    L.tileLayer(dark ? base.dark : base.light, { attribution: base.attribution, subdomains: base.subdomains, maxZoom: 19, detectRetina: base.retina }).addTo(map);
    L.circleMarker([point.lat, point.lng], { radius: 9, weight: 3, color: "#ffffff", fillColor: "#d4380d", fillOpacity: 0.95 })
      .bindTooltip(title, { direction: "top", offset: [0, -8], permanent: true })
      .addTo(map);
    // The window was still opening when the map was made: size it once shown.
    const fix = setTimeout(() => map.invalidateSize(), 200);
    return () => {
      clearTimeout(fix);
      map.remove();
    };
  }, [point?.lat, point?.lng, dark, title]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!point) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <Space direction="vertical" size={4}>
            <span>No coordinates are encoded for this establishment.</span>
            {address && <Text type="secondary">{address}</Text>}
          </Space>
        }
      >
        <Button type="primary" icon={<SearchOutlined />} href={searchUrl} target="_blank" rel="noopener noreferrer">
          Search the address in Google Maps
        </Button>
      </Empty>
    );
  }

  return (
    <Space direction="vertical" size={8} style={{ width: "100%" }}>
      <div ref={box} style={{ height: 420, width: "100%", borderRadius: 8, overflow: "hidden" }} role="region" aria-label={`Map of ${title}`} />
      {point.note && <Text type="warning" style={{ fontSize: 12.5 }}>{point.note}</Text>}
      <Space wrap style={{ justifyContent: "space-between", width: "100%" }}>
        <Text type="secondary" style={{ fontSize: 12.5 }}>
          {address ? `${address} · ` : ""}
          <span style={{ fontFamily: "monospace" }}>
            {point.lat.toFixed(6)}, {point.lng.toFixed(6)}
          </span>
        </Text>
        <Space size={6}>
          <Button size="small" icon={<ExportOutlined />} href={`https://www.google.com/maps/search/?api=1&query=${point.lat},${point.lng}`} target="_blank" rel="noopener noreferrer">
            Google Maps
          </Button>
          <Button size="small" icon={<ExportOutlined />} href={`https://www.openstreetmap.org/?mlat=${point.lat}&mlon=${point.lng}#map=17/${point.lat}/${point.lng}`} target="_blank" rel="noopener noreferrer">
            OpenStreetMap
          </Button>
        </Space>
      </Space>
    </Space>
  );
}
