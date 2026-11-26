// More worker threads than libuv's default of four, set before anything uses
// the pool. Password checks (bcrypt) run there — a morning's worth of people
// signing in at once queued four at a time — and so does file access to the
// NAS, where one read stuck on an unreachable share holds a thread for tens
// of seconds. With four threads, four such reads stalled every sign-in.
process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || "16";

const os = require("os");
const http = require("http");
const cron = require("node-cron");

const app = require("./app");
const { connectToMongo, collections, client, getDb } = require("./config/db");
const { allowedOrigins } = require("./config/cors");
const setupSocket = require("./socket").setupSocket;

const PORT = process.env.PORT || 8081;

// Warm up a DB connection once at startup and seed the registries that the
// application assumes exist.
//
// Kept trying rather than exiting: on a network that drops for a minute the
// first attempt fails with "server selection timed out", and a process that
// exits then sits under the dev watcher as crashed until someone restarts it
// by hand. The HTTP server is already listening; requests answer 500 until
// the database is reachable, then everything works without a restart.
const RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 20_000, 30_000];
async function connectWithRetry(attempt = 0) {
  try {
    await connectToMongo();
    console.log("MongoDB connected");
    // Expired sessions go by themselves (see the session store in app.js).
    await getDb().collection("sessions").createIndex({ expires: 1 }, { expireAfterSeconds: 0 });
    await require("./services/yearService").ensureSeeded();
    await require("./shared/services/orgUnits").ensureIndexes();
    await require("./services/datasetService").ensureIndexes();
    await require("./services/menuItems").ensureIndexes();
    await require("./services/customTables").ensureIndexes();
    await require("./services/signInHistory").ensureIndexes();
    const erms = require("./modules/erms");
    if (erms.isEnabled()) {
      await erms.ensureIndexes();
      // The Document Portal's room: its indexes, then the clock that ends
      // approvals on time and seats the waiting line.
      const portal = require("./modules/portal");
      await portal.ensureIndexes();
      portal.start();
    }
    // Behind everything else, and nothing waits on it: the register's slowest
    // answers, ready before the first person asks.
    require("./controllers/ucdsController").warmRegisterCaches({ provinces: true }).catch((err) => console.warn(`[cache] could not warm the register answers: ${err.message}`));
  } catch (error) {
    const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
    console.error(`MongoDB connection failed (${error.name}: ${error.message}); retrying in ${delay / 1000}s.`);
    setTimeout(() => connectWithRetry(attempt + 1), delay);
  }
}
connectWithRetry();

// Helper function to calculate time since last activity
function calculateTimeAgo(date) {
  const diffMs = Date.now() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);

  if (diffMins < 60) return `active ${diffMins} min ago`;
  if (diffHours < 24) return `active ${diffHours} hr ago`;
  return "offline";
}

// Runs every 10 minutes.
//
// node-cron drops a tick that fires more than a second late and logs "missed
// execution". Startup (the Mongo connection, the DNS fallback, loading every
// module) keeps the event loop busy for longer than that, so a restart just
// before :x0 lost that run. A tick up to a minute late still runs, and a run
// never starts while the previous one is still writing.
cron.schedule("*/10 * * * *", async () => {
  // Nothing to update until the database is connected (see connectWithRetry).
  if (!collections.users) return;
  try {
    const users = await collections.users
      .find({ status: { $ne: "online" } }, { projection: { status: 1, lastLogout: 1 } })
      .toArray();

    // Write only the statuses that changed: most offline users already say
    // "offline", and rewriting them every ten minutes is wasted load on the cluster.
    const bulkOps = [];
    for (const user of users) {
      const updatedStatus = calculateTimeAgo(user.lastLogout);
      if (updatedStatus === user.status) continue;
      bulkOps.push({
        updateOne: {
          filter: { _id: user._id },
          update: { $set: { status: updatedStatus } },
        },
      });
    }

    if (bulkOps.length > 0) {
      await collections.users.bulkWrite(bulkOps, { ordered: false });
    }
  } catch (error) {
    console.error("Error updating user statuses:", error);
  }
}, { noOverlap: true, missedExecutionTolerance: 60_000 });

// Handle graceful shutdown
process.on("SIGINT", async () => {
  try {
    if (client) {
      await client.close();
      console.log("MongoDB connection closed");
    }
  } catch (e) {
    // ignore
  } finally {
    process.exit();
  }
});

const server = http.createServer(app);
// Keep an idle browser connection open for a minute, not Node's default five
// seconds. People pause longer than five seconds between screens, so each
// click opened a new connection — and a request sent just as the server
// closed an idle one failed outright. Headers must be allowed slightly longer.
server.keepAliveTimeout = 65 * 1000;
server.headersTimeout = 66 * 1000;
const io = setupSocket(server, allowedOrigins);
// Sign-ins and sign-outs reach open screens as they happen (services/presence.js).
require("./services/presence").attach(io);
// Notices to the person they concern, on their screens and devices (services/notifier.js).
require("./services/notifier").attach(io, app.locals.sessionStore);
connectToMongo().then(() => require("./services/notifier").ensureIndexes()).catch((err) => console.warn("[notifier] indexes:", err.message));
// Put the share passwords saved in Storage Configuration back into Windows, so
// whatever machine and account runs E-Universe can open the shares without
// anyone retyping them (services/nasContainers.js syncToWindows). In the
// background: listening does not wait for it. Logs container keys only.
connectToMongo()
  .then(() => require("./services/nasContainers").syncToWindows())
  .then(({ skipped, results }) => {
    if (skipped) return;
    const restored = results.filter((r) => r.ok).map((r) => r.key);
    const failed = results.filter((r) => !r.ok).map((r) => `${r.key} (${r.code}${r.with ? ` with ${r.with}` : ""})`);
    if (restored.length) console.log(`[NAS] Windows credentials restored: ${restored.join(", ")}`);
    if (failed.length) console.warn(`[NAS] Windows credentials not restored: ${failed.join(", ")}. Re-save them in Storage Configuration.`);
  })
  .catch((err) => console.warn("[NAS] credential restore skipped:", err.message));
// Watch the NAS bridge and push its state to open screens (see services/nasBridge.js).
connectToMongo().then(() => require("./services/nasBridge").start(io)).catch((err) => console.warn("[NAS bridge] not started:", err.message));
// The Progress Tracker: the Planning Unit's SharePoint working files, read
// while an activity season is open (see services/progressTracker).
connectToMongo().then(() => { const t = require("./services/progressTracker"); t.ensureIndexes().catch(() => {}); t.start(io); }).catch((err) => console.warn("[progress tracker] not started:", err.message));

server.listen(PORT, "0.0.0.0", () => {
  const nets = os.networkInterfaces();
  let networkUrl = null;
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) {
        networkUrl = `http://${net.address}:${PORT}`;
        break;
      }
    }
    if (networkUrl) break;
  }
  console.log(`Server running with Socket.IO`);
  // console.log(`  ➜ Local:   http://localhost:${PORT}`);
  // if (networkUrl) console.log(`  ➜ Network: ${networkUrl}`);
});
