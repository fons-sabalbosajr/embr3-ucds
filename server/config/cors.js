function getAllowedOrigins() {
  const env = process.env.ALLOWED_ORIGINS;
  if (!env) return ["http://localhost:5173", "http://10.14.77.107:5173"];
  return env.split(",").map((s) => s.trim()).filter(Boolean);
}

const allowedOrigins = getAllowedOrigins();

const corsOptions = {
  origin: allowedOrigins,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "Origin",
    "Accept",
    "Cookie",
    "Set-Cookie",
  ],
  credentials: true,
  exposedHeaders: ["Set-Cookie"],
  preflightContinue: false,
};

module.exports = { getAllowedOrigins, allowedOrigins, corsOptions };
