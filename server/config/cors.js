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
    // This tab's session (see middleware/sessionToken.js).
    "X-Session-Token",
  ],
  credentials: true,
  exposedHeaders: ["Set-Cookie", "X-Session-Token"],
  preflightContinue: false,
};

module.exports = { getAllowedOrigins, allowedOrigins, corsOptions };
