const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

// Must run before any DNS resolution (Mongo SRV lookup, mail, SMB).
require("./config/dns").configureDns();

// pdf-lib's "Trying to parse invalid object" lines, one per damaged object in
// a scan, counted into one line a minute (shared/services/pdfWarnings).
require("./shared/services/pdfWarnings").install();

const MongoStore = require("connect-mongo");
const { client, DB_NAME } = require("./config/db");

const authRoutes = require("./routes/authRoutes");
const postingRoutes = require("./routes/postingRoutes");
const draftReportRoutes = require("./routes/draftReportRoutes");
const logRoutes = require("./routes/logRoutes");
const ucdsRoutes = require("./routes/ucdsRoutes");
const usersRoutes = require("./routes/usersRoutes");
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
  apiLimiter,
  expensiveLimiter,
  warnAboutCookieConfig,
  warnAboutEnvFormatting,
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
// First, so a route's time includes the session read and everything after it.
app.use(require("./shared/middleware/requestTiming").requestTiming);
app.use(securityHeaders());

assertSessionSecret();
warnAboutEnvFormatting();
warnAboutCookieConfig();
require('./services/secrets').warnAboutSecretKey();
// Load any credentials saved through Admin Settings before the first request.
// Until this resolves the environment is used, which is the prior behaviour.
require('./services/nasStorage')
  .refreshConfig()
  .then(() => require('./services/nasStorage').warnAboutNasConfig())
  .catch(() => require('./services/nasStorage').warnAboutNasConfig());

// Use the shared Mongo client for the session store to avoid a second pool.
//
// The client itself, not a promise of a connection, and no index built here:
// the store keeps one promise for its whole life, made of the connection and
// that index, with nothing to catch it. A link dropping at that moment (5 Nov
// 2026) rejected it with no handler, which ends the process, and it would have
// stayed rejected, with sessions failing until a restart. This way each session
// read fails or succeeds by itself, and the driver connects when it needs to.
// server.js builds the index, and tries again if the link drops.
const sessionStore = MongoStore.create({
  client,
  autoRemove: "disabled",
  // Named, not taken from the URI's path, so sessions live beside the users
  // they belong to whichever database MONGO_DB_NAME selects.
  dbName: DB_NAME,
  collectionName: "sessions",
  ttl: 14 * 24 * 60 * 60,
  // Re-save an unchanged session at most every 10 minutes, not on every
  // request. Without it each API call was a read and a write on Atlas — a
  // free tier with an operations-per-second limit, shared with six other
  // applications — so the session store alone grew with every user and
  // every poll. A session changed by the request is still saved at once.
  touchAfter: 10 * 60,
});

// A tab that carries its own session token is answered by that session, not
// the cookie's — one sign-in per tab. See middleware/sessionToken.js.
const { sessionFromToken, offerSessionToken } = require("./middleware/sessionToken");
app.use(sessionFromToken);
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: sessionCookieOptions(),
    store: sessionStore,
  })
);
app.use(offerSessionToken);
// The socket server reads sessions from the same store (services/notifier.js).
app.locals.sessionStore = sessionStore;

require("./middleware/auth").assertAuthNotBypassed();

app.use(cors({ origin: allowedOrigins, credentials: true, exposedHeaders: corsOptions.exposedHeaders }));
app.options("*", cors(corsOptions));
app.use(cookieParser());
// JSON responses from the register are large and highly compressible; gzip
// cuts them roughly five-fold on the wire, which matters more than the CPU it
// costs when hundreds of people open the same screen.
app.use(require("compression")());
// A bulk update of the register is the biggest legitimate body. Anything
// larger is a mistake or an attack, and parsing it would cost memory first.
//
// Parsed only while the request stream is still readable. A request whose
// body has already gone — the browser aborted it, a tab closed mid-sign-out,
// a proxy cut the connection — reaches body-parser with a closed stream, and
// raw-body answers "stream is not readable" as a 500 on a route that never
// needed a body (POST /logout was the one seen). Such a request proceeds
// with an empty body instead, and the route decides what that means.
const jsonParser = express.json({ limit: "2mb" });
// One exception: a Planning Unit table's Excel export carries the table as the
// page shows it (up to 10,000 rows), so its body may be larger.
const exportParser = express.json({ limit: "20mb" });
const EXPORT_PATH = /^\/api\/ucds\/custom-tables\/[^/]+\/export\.xlsx$/;
app.use((req, res, next) => (!req.readable ? next() : EXPORT_PATH.test(req.path) ? exportParser(req, res, next) : jsonParser(req, res, next)));
// General per-account budget for the API; the expensive tier is applied per
// route where a request scans or aggregates a whole collection.
app.use(["/api", "/ucds", "/ucds-data", "/check-data", "/archive-data"], apiLimiter);

app.use(authRoutes);
app.use(postingRoutes);
app.use(draftReportRoutes);
app.use(logRoutes);
// Admin Settings › Audit Logs, by sub-application (services/auditLog.js).
app.use(require("./routes/auditRoutes"));
app.use(ucdsRoutes);
app.use(usersRoutes);
app.use(pdfRoutes);
app.use(fileRoutes);
app.use(nasRoutes);
app.use(healthRoutes);
app.use(developerRoutes);
app.use(yearRoutes);
app.use(require("./routes/datasetRoutes"));
// VERA, the in-app assistant (services/vera, controllers/veraController.js).
app.use(require("./routes/veraRoutes"));
app.use(require("./routes/progressTrackerRoutes"));
app.use(require("./routes/notificationRoutes"));
app.use(orgUnitRoutes);

// Cross-domain routes. The establishment→records panel lives here rather than
// in the ERMS module because it hangs off a UCDS screen and must keep working
// when ERMS is switched off.
// An ERMS unit the Developer has taken down (Admin Settings › ERMS Units)
// answers 503 to everyone else — its screens, uploads and documents, here
// and in the UCDS establishment panel below (services/ermsAvailability).
app.use(require("./services/ermsAvailability").guard);

app.use(require("./modules/ucds").routes);

// The ERMS records module. Registered last so it cannot shadow an existing
// UCDS path, and only when enabled — turning the flag off removes the routes
// entirely, which is the rollback for the whole module.
const erms = require("./modules/erms");
if (erms.isEnabled()) {
  app.use(erms.routes);
  // The Document Portal: anyone signed in asks for a Records scan and reads
  // it there once the Records Unit approves (modules/portal).
  app.use(require("./modules/portal").routes);
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
