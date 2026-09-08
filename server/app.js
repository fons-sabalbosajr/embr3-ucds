const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

// Must run before any DNS resolution (Mongo SRV lookup, mail, SMB).
require("./config/dns").configureDns();

const MongoStore = require("connect-mongo");
const { connectToMongo, client } = require("./config/db");

const authRoutes = require("./routes/authRoutes");
const postingRoutes = require("./routes/postingRoutes");
const draftReportRoutes = require("./routes/draftReportRoutes");
const surveyRoutes = require("./routes/surveyRoutes");
const logRoutes = require("./routes/logRoutes");
const ucdsRoutes = require("./routes/ucdsRoutes");
const swmRoutes = require("./routes/swmRoutes");
const usersRoutes = require("./routes/usersRoutes");
const sectorRoutes = require("./routes/sectorRoutes");
const pdfRoutes = require("./routes/pdfRoutes");
const fileRoutes = require("./routes/fileRoutes");
const nasRoutes = require("./routes/nasRoutes");
const healthRoutes = require("./routes/healthRoutes");
const developerRoutes = require("./routes/developerRoutes");
const yearRoutes = require("./routes/yearRoutes");
const orgUnitRoutes = require("./routes/orgUnitRoutes");

const { allowedOrigins, corsOptions } = require("./config/cors");
const {
  sessionCookieOptions,
  assertSessionSecret,
  securityHeaders,
} = require("./config/security");
const { notFound, errorHandler } = require("./shared/middleware/errorHandler");

// ---------------------------------------------------------------------------
// The Express application, with no listener attached.
//
// Split out of server.js so tests can drive it with supertest without opening
// a port, starting the cron job, or standing up Socket.IO. server.js owns
// those and the actual listen().
// ---------------------------------------------------------------------------

const app = express();

// Must be set before the session middleware: it is what lets Express see
// Render's TLS termination and therefore issue a Secure cookie.
app.set("trust proxy", 1);
app.use(securityHeaders());

assertSessionSecret();

// Use the shared Mongo client for the session store to avoid a second pool.
const sessionStore = MongoStore.create({
  clientPromise: (async () => {
    await connectToMongo();
    return client;
  })(),
  collectionName: "sessions",
  ttl: 14 * 24 * 60 * 60,
});

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: sessionCookieOptions(),
    store: sessionStore,
  })
);

require("./middleware/auth").assertAuthNotBypassed();

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.options("*", cors(corsOptions));
app.use(cookieParser());
app.use(express.json());

app.use(authRoutes);
app.use(postingRoutes);
app.use(draftReportRoutes);
app.use(surveyRoutes);
app.use(logRoutes);
app.use(ucdsRoutes);
app.use(swmRoutes);
app.use(usersRoutes);
app.use(sectorRoutes);
app.use(pdfRoutes);
app.use(fileRoutes);
app.use(nasRoutes);
app.use(healthRoutes);
app.use(developerRoutes);
app.use(yearRoutes);
app.use(orgUnitRoutes);

// Cross-domain routes. The establishment→records panel lives here rather than
// in the ERMS module because it hangs off a UCDS screen and must keep working
// when ERMS is switched off.
app.use(require("./modules/ucds").routes);

// The ERMS records module. Registered last so it cannot shadow an existing
// UCDS path, and only when enabled — turning the flag off removes the routes
// entirely, which is the rollback for the whole module.
const erms = require("./modules/erms");
if (erms.isEnabled()) {
  app.use(erms.routes);
  console.log("ERMS module enabled");
}

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Serve static files from the uploads directory
app.use("/uploads", express.static(uploadsDir));

// Must come after every route: JSON 404 for unmatched /api paths, then the
// terminal error handler.
app.use(notFound);
app.use(errorHandler);

module.exports = app;
