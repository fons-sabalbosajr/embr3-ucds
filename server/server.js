const express = require("express");
const os = require("os");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv").config();

// Must run before any DNS resolution (Mongo SRV lookup, mail, SMB).
require("./config/dns").configureDns();

const MongoStore = require("connect-mongo");
const cron = require("node-cron");
const { connectToMongo, collections, client } = require("./config/db");

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
const ermsRoutes = require("./routes/ermsRoutes");
const healthRoutes = require("./routes/healthRoutes");
const developerRoutes = require("./routes/developerRoutes");
const yearRoutes = require("./routes/yearRoutes");

const app = express();
const PORT = process.env.PORT || 8081;


const { allowedOrigins, corsOptions } = require('./config/cors');

// MongoDB connection string (kept for other consumers if needed)
const mongoUri = process.env.MONGO_URI;

// Use shared Mongo client for session store to avoid a separate pool
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
    cookie: {
      secure: false,
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24,
      sameSite: "Lax",
    },
    store: sessionStore,
  })
);

// Warm up a DB connection once at startup
connectToMongo()
  .then(() => require("./services/yearService").ensureSeeded())
  .catch((error) => {
    console.error("Error during MongoDB connection:", error);
    process.exit(1);
  });

require("./middleware/auth").warnIfAuthBypassed();

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.options("*", cors(corsOptions));
app.use(cookieParser());
app.use(express.json());
app.set("trust proxy", 1);

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
app.use(ermsRoutes);
app.use(healthRoutes);
app.use(developerRoutes);
app.use(yearRoutes);

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
      //console.log("Updated user statuses based on last activity.");
    }
  } catch (error) {
    console.error("Error updating user statuses:", error);
  }
});

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Serve static files from the uploads directory
app.use("/uploads", express.static(uploadsDir));

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

const http = require("http");
const setupSocket = require("./socket").setupSocket;

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
  const localUrl = `http://localhost:${PORT}`;
  console.log(`Server running with Socket.IO`);
  // console.log(`  ➜ Local:   ${localUrl}`);
  // if (networkUrl) console.log(`  ➜ Network: ${networkUrl}`);
});
