const os = require("os");
const http = require("http");
const cron = require("node-cron");

const app = require("./app");
const { connectToMongo, collections, client } = require("./config/db");
const { allowedOrigins } = require("./config/cors");
const setupSocket = require("./socket").setupSocket;

const PORT = process.env.PORT || 8081;

// Warm up a DB connection once at startup and seed the registries that the
// application assumes exist.
connectToMongo()
  .then(() => require("./services/yearService").ensureSeeded())
  .then(() => require("./shared/services/orgUnits").ensureIndexes())
  .then(() => {
    const erms = require("./modules/erms");
    return erms.isEnabled() ? erms.ensureIndexes() : null;
  })
  .catch((error) => {
    console.error("Error during MongoDB connection:", error);
    process.exit(1);
  });

// Helper function to calculate time since last activity
function calculateTimeAgo(date) {
  const diffMs = Date.now() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);

  if (diffMins < 60) return `active ${diffMins} min ago`;
  if (diffHours < 24) return `active ${diffHours} hr ago`;
  return "offline";
}

cron.schedule("*/10 * * * *", async () => {
  // Runs every 10 minutes
  try {
    const users = await collections.users
      .find({ status: { $ne: "online" } })
      .toArray();

    const bulkOps = users.map((user) => {
      const updatedStatus = calculateTimeAgo(user.lastLogout);
      return {
        updateOne: {
          filter: { _id: user._id },
          update: { $set: { status: updatedStatus } },
        },
      };
    });

    if (bulkOps.length > 0) {
      await collections.users.bulkWrite(bulkOps);
    }
  } catch (error) {
    console.error("Error updating user statuses:", error);
  }
});

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
setupSocket(server, allowedOrigins);

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
