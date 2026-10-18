import { useEffect, useRef, useState } from "react";
import { Button, Card, Empty, Space, Spin, Tag, Typography } from "antd";
import { CloseOutlined, EnvironmentOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getPublicFirm, getPublicPoints, getVizFirm, getVizPoints } from "./progressService";
import { KIND_LABEL, n, unitLabel } from "./palette";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// The Data Visualization tab's map (Developer only): every firm with
// coordinates, a dot in its province's colour, on Leaflet with CARTO's
// OpenStreetMap basemap (light or dark with the app).
//
// Built for thousands of dots: the map is made once; the dots are drawn on a
// single canvas (no element per dot); a new filter swaps the layer rather
// than the map. Hover a dot for its serial; click it for a floating card with
// the firm — fetched then, so the map's own data stays small.
// ---------------------------------------------------------------------------

const REGION_III = [15.35, 120.75];
// The basemap. With a MapTiler key — sent by the server from its .env
// (MAPTILER_KEY), or set in the front end's own .env (VITE_MAPTILER_KEY) —
// MapTiler's maps, whose dashboard counts the use and limits the key to our
// website. Without one: CARTO's free OpenStreetMap tiles (no account).
const BUILD_KEY = import.meta.env.VITE_MAPTILER_KEY;
const OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const basemapFor = (key) =>
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
const PERMITS = ["ecc", "pto", "wwdp", "haz", "chemical", "tsd", "trc", "pco"];

/** The floating card: the firm behind a dot (on the public link, what and where only). */
function FirmCard({ serial, at, onClose, colourOf, token }) {
  const { data: firm, isLoading, error } = useQuery({
    queryKey: token ? ["public-progress", token, "firm", serial] : ["admin", "progress-tracker", "viz-firm", serial],
    queryFn: () => (token ? getPublicFirm(token, serial) : getVizFirm(serial)),
    staleTime: 5 * 60 * 1000,
  });
  return (
    <Card
      size="small"
      className="dv-float"
      style={{ left: at.x, top: at.y }}
      title={
        <Space size={6}>
          <i className="dv-float-dot" style={{ background: colourOf(firm?.unit) }} />
          <span>{serial}</span>
          {firm && <Text type="secondary" style={{ fontSize: 12 }}>{unitLabel(firm.unit)}</Text>}
        </Space>
      }
      extra={<Button type="text" size="small" icon={<CloseOutlined />} onClick={onClose} aria-label="Close" />}
    >
      {isLoading ? (
        <Spin size="small" />
      ) : error ? (
        <Text type="secondary">{error?.response?.data?.message || "The firm could not be read."}</Text>
      ) : token ? (
        <div className="dv-float-body">
          <div className="dv-float-title">{firm.title || "—"}</div>
          <div className="dv-float-line">
            <EnvironmentOutlined /> {[firm.city, firm.province].filter(Boolean).join(", ") || "—"}
          </div>
          {firm.industry && <Text type="secondary" style={{ fontSize: 12 }}>{firm.industry}</Text>}
          <Space size={[4, 4]} wrap style={{ margin: "4px 0" }}>
            {firm.holds.length ? firm.holds.map((k) => <Tag key={k} style={{ marginInlineEnd: 0 }}>{KIND_LABEL[k] || k}</Tag>) : <Text type="secondary">No permit encoded.</Text>}
          </Space>
          <div>{firm.source === "erms" ? <Tag color="green">Added from ERMS</Tag> : firm.source === "ecconline" ? <Tag color="blue">Added from ECC Online</Tag> : <Tag>Baseline</Tag>}</div>
        </div>
      ) : (
        <div className="dv-float-body">
          <div className="dv-float-title">{firm.title || "—"}</div>
          {firm.name && <div className="dv-float-line">{firm.name}</div>}
          {firm.address && (
            <div className="dv-float-line">
              <EnvironmentOutlined /> {firm.address}
            </div>
          )}
          {firm.industry && <Text type="secondary" style={{ fontSize: 12 }}>{firm.industry}</Text>}
          <div className="dv-float-permits">
            {PERMITS.filter((k) => firm[k]).map((k) => (
              <div key={k}>
                <Text type="secondary">{KIND_LABEL[k] || k}</Text>
                <span>{firm[k]}</span>
              </div>
            ))}
            {!PERMITS.some((k) => firm[k]) && <Text type="secondary">No permit encoded.</Text>}
          </div>
          <div>{firm.source === "erms" ? <Tag color="green">Added from ERMS</Tag> : firm.source === "ecconline" ? <Tag color="blue">Added from ECC Online</Tag> : <Tag>Baseline</Tag>}</div>
        </div>
      )}
    </Card>
  );
}

export default function FirmMap({ scope, colourOf, dark, token = null, mapKey = null }) {
  const key = mapKey || BUILD_KEY || null;
  const box = useRef(null);
  const map = useRef(null);
  const tiles = useRef(null);
  const dots = useRef(null);
  const renderer = useRef(null);
  const [picked, setPicked] = useState(null); // { serial, at: { x, y } }
  const { data, isLoading, error } = useQuery({
    queryKey: token ? ["public-progress", token, "points", scope] : ["admin", "progress-tracker", "viz-points", scope],
    queryFn: () => (token ? getPublicPoints(token, scope === "all" ? null : scope) : getVizPoints(scope === "all" ? null : scope)),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    placeholderData: (prev) => prev,
  });

  // The map, once.
  useEffect(() => {
    if (!box.current) return undefined;
    const m = L.map(box.current, { center: REGION_III, zoom: 8, preferCanvas: true, worldCopyJump: false, zoomControl: true });
    renderer.current = L.canvas({ padding: 0.5, tolerance: 4 });
    dots.current = L.layerGroup().addTo(m);
    m.on("movestart zoomstart", () => setPicked(null));
    map.current = m;
    // The tab may have been hidden while it was made: size it once shown.
    const fix = setTimeout(() => m.invalidateSize(), 150);
    return () => {
      clearTimeout(fix);
      m.remove();
      map.current = null;
    };
  }, []);

  // The basemap follows the app's light or dark mode, and the key when it arrives.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const base = basemapFor(key);
    tiles.current?.remove();
    tiles.current = L.tileLayer(dark ? base.dark : base.light, { attribution: base.attribution, subdomains: base.subdomains, maxZoom: 19, detectRetina: base.retina }).addTo(m);
    tiles.current.bringToBack();
  }, [dark, key]);

  // The dots: one canvas, swapped when the filter changes.
  useEffect(() => {
    const m = map.current;
    if (!m || !data) return;
    dots.current.clearLayers();
    setPicked(null);
    const bounds = [];
    for (const [lat, lng, i, serial] of data.points) {
      const unit = data.units[i];
      const dot = L.circleMarker([lat, lng], { renderer: renderer.current, radius: 4.5, weight: 1, color: dark ? "#1f1f1f" : "#ffffff", fillColor: colourOf(unit), fillOpacity: 0.88 });
      dot.bindTooltip(`${serial} · ${unitLabel(unit)}`, { direction: "top", offset: [0, -4] });
      dot.on("click", (e) => {
        const p = m.latLngToContainerPoint(e.latlng);
        const w = box.current?.clientWidth || 600;
        const h = box.current?.clientHeight || 460;
        setPicked({ serial, at: { x: Math.min(Math.max(8, p.x + 12), w - 300), y: Math.min(Math.max(8, p.y - 20), h - 260) } });
      });
      dots.current.addLayer(dot);
      bounds.push([lat, lng]);
    }
    if (bounds.length) m.fitBounds(bounds, { padding: [24, 24], maxZoom: 11, animate: false });
    else m.setView(REGION_III, 8);
  }, [data, colourOf, dark]);

  return (
    <div className="dv-map">
      <div className="dv-legend">
        {(data?.units || []).map((u) => (
          <span key={u}>
            <i style={{ background: colourOf(u) }} />
            {unitLabel(u)}
          </span>
        ))}
      </div>
      <div className="dv-map-wrap">
        <div ref={box} className="dv-map-canvas" role="region" aria-label="Map of the firms" />
        {isLoading && !data && (
          <div className="dv-map-loading">
            <Spin />
          </div>
        )}
        {picked && <FirmCard serial={picked.serial} at={picked.at} onClose={() => setPicked(null)} colourOf={colourOf} token={token} />}
      </div>
      {error && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="The map's points could not be loaded." />}
      {data && (
        <Text type="secondary" className="dv-note">
          {data.total ? `${n(data.points.length)} firms with coordinates${data.sampled ? `, of ${n(data.total)} (evenly sampled)` : ""}. Click a dot for the firm.` : "No coordinates read yet: the firms appear after the next look at the files."}
        </Text>
      )}
    </div>
  );
}
