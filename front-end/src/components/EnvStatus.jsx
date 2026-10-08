import React from "react";
import { API_BASE_URL, SOCKET_URL } from "../config/api";

const isProd = import.meta.env.MODE === "production";

export default function EnvStatus() {
  if (isProd) return null;
  const boxStyle = {
    position: "fixed",
    left: 12,
    bottom: 12,
    zIndex: 9999,
    padding: "8px 12px",
    background: "rgba(2, 132, 199, 0.1)",
    border: "1px solid rgba(2, 132, 199, 0.35)",
    borderRadius: 8,
    color: "#0369a1",
    fontSize: 12,
    maxWidth: 360,
    backdropFilter: "blur(4px)",
  };
  const mono = {
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  };

  return (
    <></>
  );
}
