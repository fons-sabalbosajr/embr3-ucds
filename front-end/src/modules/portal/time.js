import { useEffect, useState } from "react";

/** The time now, once a second while mounted — for the room's clocks. */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** 3725000 → "1:02:05"; past days, "2d 03:10:00". Never negative. */
export function countdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  const clock = h || d ? `${d ? pad(h) : h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  return d ? `${d}d ${clock}` : clock;
}

/** "in 12 min", "in about 3 h" — for estimates, where seconds would be false precision. */
export function roughly(ms) {
  const min = Math.max(1, Math.round(ms / 60000));
  if (min < 60) return `${min} min`;
  const h = min / 60;
  if (h < 24) return `${h < 10 ? h.toFixed(1).replace(/\.0$/, "") : Math.round(h)} h`;
  return `${Math.round(h / 24)} d`;
}

export const when = (iso) => (iso ? new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—");
