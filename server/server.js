const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcrypt");
const session = require("express-session");
const { MongoClient, ObjectId, GridFSBucket } = require("mongodb");
const fs = require("fs");
const path = require("path");
const { PDFDocument, rgb } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
const zlib = require("zlib");
const dotenv = require("dotenv").config();
const multer = require("multer");
const MongoStore = require("connect-mongo");
const cron = require("node-cron");
const nodemailer = require("nodemailer"); // Nodemailer for sending emails
const crypto = require("crypto"); // Crypto for generating a reset token
const { OpenAI } = require("openai");
const bodyParser = require("body-parser");

const app = express();
const router = express.Router();
app.use(bodyParser.json());
const PORT = process.env.PORT || 8081;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Function to capitalize the first letter of each word
function capitalizeFirstLetter(input) {
  return input
    .toLowerCase() // Convert the entire string to lowercase
    .split("_") // Split by underscore to handle multi-word names
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1)) // Capitalize the first letter of each word
    .join("_"); // Rejoin with underscores
}

// Function to generate a random password of specified length
function generateRandomPassword(length) {
  const charset =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let password = "";
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    password += charset[randomIndex];
  }
  return password;
}

//////////////////////////////////////////////////////////////////////////////////////////
const allowedOrigins = ["http://localhost:5173"];

// MongoDB connection setup
const mongoUri = process.env.MONGO_URI;
const client = new MongoClient(mongoUri, {
  ssl: true,
});

let db;
let userCollection;
let signUpCollection;
let loginStatusCollection;
let ucdsCollection;
let dailyNoticesCollection;
let postingCollection;
let reportdraftCollection;
let surveyCollection;
let activityLogsCollection;
let surveyLogCollection;
let survey2025Collection;
let ucdsLogCollection;
let healthcareCollection;
let chemicalCollection;
let tsdCollection;
let trcCollection;

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // Ensure this is true in production
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24,
      sameSite: "Lax", // 'Lax' during local development; 'None' with 'Secure' in production
    },
    store: MongoStore.create({
      mongoUrl: mongoUri,
      collectionName: "sessions",
      ttl: 14 * 24 * 60 * 60, // 14 days
    }),
  })
);

// Connect to MongoDB once when the server starts
async function connectToMongo() {
  try {
    await client.connect();
    console.log("Successfully connected to MongoDB!");
    db = client.db("universe-db");
    userCollection = db.collection("users");
    signUpCollection = db.collection("sign-up");
    loginStatusCollection = db.collection("login-status");
    ucdsCollection = db.collection("ucds-data");
    dailyNoticesCollection = db.collection("ucds-data");
    postingCollection = db.collection("postings");
    reportdraftCollection = db.collection("draft-reports");
    surveyCollection = db.collection("survey-data-2024");
    survey2025Collection = db.collection("survey-data-2025");
    activityLogsCollection = db.collection("app-logs");
    surveyLogCollection = db.collection("survey-log");
    ucdsLogCollection = db.collection("ucds-log");
    projectTypeCollection = db.collection("project_type");
    healthcareCollection = db.collection("ucds-data-healthcare");
    chemicalCollection = db.collection("ucds-data-chemicals");
    tsdCollection = db.collection("ucds-data-tsd");
    trcCollection = db.collection("ucds-data-trc");

    app.locals.ucdsCollection = ucdsCollection;
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    throw error;
  }
}

connectToMongo().catch((error) => {
  console.error("Error during MongoDB connection:", error);
  process.exit(1);
});

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

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.options("*", cors(corsOptions));
app.use(cookieParser());
app.use(express.json());
app.set("trust proxy", 1);

///////////////////////////////////////  AI HELPER  WITHIN THE ENTIRE UCDS  ///////////////////////////////////////////////////

app.use("/api", router);

// Utility function to check if a value is a placeholder
const isPlaceholder = (value) => {
  // Ensure the value is a string before calling toLowerCase
  if (typeof value !== "string") return false;

  const placeholders = ["---", "n/a", "test", "null", "none", "undefined"];
  return placeholders.includes(value.toLowerCase());
};

// Utility function to check if a value is expired
const isExpired = (expiryDate) => {
  const currentDate = new Date();
  return new Date(expiryDate) < currentDate;
};

// Utility function to check if a value is missing or placeholder
const isMissingOrPlaceholder = (value) => {
  const placeholders = ["---", "n/a", "test", "null", "none", "undefined"];
  return value === undefined || value === null || placeholders.includes(value);
};

// Local data validation logic
async function validateData(records) {
  const issues = [];

  records.forEach((record) => {
    const id_no = record.id_no; // ID No for precise identification of issues

    // Expiry checks for permits
    if (isExpired(record.pto_expiration)) {
      issues.push(`${id_no} - PTO Expiration Date is expired`);
    }
    if (isExpired(record.wwd_expiration)) {
      issues.push(`${id_no} - WWDP Expiration Date is expired`);
    }
    if (isExpired(record.haz_issued)) {
      issues.push(`${id_no} - Hazardous Material Issued Date is expired`);
    }

    // GENERAL INFO - Check for missing or placeholder values
    if (isMissingOrPlaceholder(record.name)) {
      issues.push(`${id_no} - Missing 'Company Name'`);
    }
    if (isMissingOrPlaceholder(record.title)) {
      issues.push(`${id_no} - Missing 'Title'`);
    }
    if (isMissingOrPlaceholder(record.industry_type)) {
      issues.push(`${id_no} - Missing 'Industry Type'`);
    }
    if (isMissingOrPlaceholder(record.industry_subtype)) {
      issues.push(`${id_no} - Missing 'Industry Subtype'`);
    }
    if (isMissingOrPlaceholder(record.industry_class)) {
      issues.push(`${id_no} - Missing 'Industry Classification'`);
    }
    if (isMissingOrPlaceholder(record.psic_code)) {
      issues.push(`${id_no} - Missing 'PSIC Code'`);
    }
    if (isMissingOrPlaceholder(record.cong_district)) {
      issues.push(`${id_no} - Missing 'Congressional District'`);
    }
    if (isMissingOrPlaceholder(record.address)) {
      issues.push(`${id_no} - Missing 'Address'`);
    }
    if (isMissingOrPlaceholder(record.street)) {
      issues.push(`${id_no} - Missing 'Street'`);
    }
    if (isMissingOrPlaceholder(record.brgy)) {
      issues.push(`${id_no} - Missing 'Barangay'`);
    }
    if (isMissingOrPlaceholder(record.city)) {
      issues.push(`${id_no} - Missing 'City'`);
    }
    if (isMissingOrPlaceholder(record.province)) {
      issues.push(`${id_no} - Missing 'Province'`);
    }

    // MBU - Check for missing or placeholder values
    if (isMissingOrPlaceholder(record.mbu_area)) {
      issues.push(`${id_no} - Missing 'MBU Area'`);
    }
    if (isMissingOrPlaceholder(record.waterbody)) {
      issues.push(`${id_no} - Missing 'Water Body'`);
    }
    if (isMissingOrPlaceholder(record.emp_no_total)) {
      issues.push(`${id_no} - Missing 'Total Employees'`);
    }
    if (isMissingOrPlaceholder(record.wwtftype)) {
      issues.push(`${id_no} - Missing 'WWTF Type'`);
    }
    if (isMissingOrPlaceholder(record.bod)) {
      issues.push(`${id_no} - Missing 'BOD'`);
    }
    if (isMissingOrPlaceholder(record.long)) {
      issues.push(`${id_no} - Missing 'Longitude'`);
    }
    if (isMissingOrPlaceholder(record.lat)) {
      issues.push(`${id_no} - Missing 'Latitude'`);
    }

    // FOCAL PERSON - Check for missing or placeholder values
    if (isMissingOrPlaceholder(record.iis_no)) {
      issues.push(`${id_no} - Missing 'IIS Number'`);
    }
    if (isMissingOrPlaceholder(record.section_incharged)) {
      issues.push(`${id_no} - Missing 'Section In Charge'`);
    }
    if (isMissingOrPlaceholder(record.handler)) {
      issues.push(`${id_no} - Missing 'Handler'`);
    }
    if (isMissingOrPlaceholder(record.monitoring_sched)) {
      issues.push(`${id_no} - Missing 'Monitoring Schedule'`);
    }
    if (isMissingOrPlaceholder(record.insp_type)) {
      issues.push(`${id_no} - Missing 'Inspection Type'`);
    }
    if (isMissingOrPlaceholder(record.date_monitored)) {
      issues.push(`${id_no} - Missing 'Date Monitored'`);
    }
    if (isMissingOrPlaceholder(record.date_routed)) {
      issues.push(`${id_no} - Missing 'Date Routed'`);
    }
    if (isMissingOrPlaceholder(record.date_signed)) {
      issues.push(`${id_no} - Missing 'Date Signed'`);
    }
    if (isMissingOrPlaceholder(record.days_dmds)) {
      issues.push(`${id_no} - Missing 'Days DMDs'`);
    }
    if (isMissingOrPlaceholder(record.days_dsdrs)) {
      issues.push(`${id_no} - Missing 'Days DSDRs'`);
    }
    if (isMissingOrPlaceholder(record.pismu_tracking)) {
      issues.push(`${id_no} - Missing 'PISMU Tracking'`);
    }
    if (isMissingOrPlaceholder(record.recommendations)) {
      issues.push(`${id_no} - Missing 'Recommendations'`);
    }

    // PERMITS - Check for missing or placeholder values
    if (isMissingOrPlaceholder(record.ecc_cnc)) {
      issues.push(`${id_no} - Missing 'ECC/CNC'`);
    }
    if (isMissingOrPlaceholder(record.permit_process)) {
      issues.push(`${id_no} - Missing 'Permit Process'`);
    }
    if (isMissingOrPlaceholder(record.date_amend)) {
      issues.push(`${id_no} - Missing 'Amendment Date'`);
    }
    if (isMissingOrPlaceholder(record.date_approved)) {
      issues.push(`${id_no} - Missing 'Date Approved'`);
    }
    if (isMissingOrPlaceholder(record.pto_code)) {
      issues.push(`${id_no} - Missing 'PTO Code'`);
    }
    if (isMissingOrPlaceholder(record.pto_issued)) {
      issues.push(`${id_no} - Missing 'PTO Issued Date'`);
    }
    if (isMissingOrPlaceholder(record.pto_expiration)) {
      issues.push(`${id_no} - Missing 'PTO Expiration Date'`);
    }
    if (isMissingOrPlaceholder(record.wwdp_code)) {
      issues.push(`${id_no} - Missing 'WWDP Code'`);
    }
    if (isMissingOrPlaceholder(record.wwdp_issued)) {
      issues.push(`${id_no} - Missing 'WWDP Issued Date'`);
    }
    if (isMissingOrPlaceholder(record.wwd_expiration)) {
      issues.push(`${id_no} - Missing 'WWDP Expiration Date'`);
    }
    if (isMissingOrPlaceholder(record.haz_id)) {
      issues.push(`${id_no} - Missing 'Hazardous Material ID'`);
    }
    if (isMissingOrPlaceholder(record.haz_issued)) {
      issues.push(`${id_no} - Missing 'Hazardous Material Issued Date'`);
    }
    if (isMissingOrPlaceholder(record.pco_no)) {
      issues.push(`${id_no} - Missing 'PCO Number'`);
    }
    if (isMissingOrPlaceholder(record.pco_name)) {
      issues.push(`${id_no} - Missing 'PCO Name'`);
    }
    if (isMissingOrPlaceholder(record.pco_validity)) {
      issues.push(`${id_no} - Missing 'PCO Validity'`);
    }

    // LEGAL - Check for missing or placeholder values
    if (isMissingOrPlaceholder(record.docket_no)) {
      issues.push(`${id_no} - Missing 'Docket Number'`);
    }
    if (isMissingOrPlaceholder(record.denr_pab_case_no)) {
      issues.push(`${id_no} - Missing 'DENR PAB Case Number'`);
    }
    if (isMissingOrPlaceholder(record.nov_date_issued)) {
      issues.push(`${id_no} - Missing 'NOV Date Issued'`);
    }
    if (isMissingOrPlaceholder(record.v_pd1586)) {
      issues.push(`${id_no} - Missing 'PD 1586'`);
    }
    if (isMissingOrPlaceholder(record.v_ra9275)) {
      issues.push(`${id_no} - Missing 'RA 9275'`);
    }
    if (isMissingOrPlaceholder(record.v_ra8749)) {
      issues.push(`${id_no} - Missing 'RA 8749'`);
    }
    if (isMissingOrPlaceholder(record.v_ra6969_haz)) {
      issues.push(`${id_no} - Missing 'RA 6969 (Hazardous)'`);
    }
    if (isMissingOrPlaceholder(record.v_ra6969_chem)) {
      issues.push(`${id_no} - Missing 'RA 6969 (Chemical)'`);
    }
    if (isMissingOrPlaceholder(record.tc_date_actual)) {
      issues.push(`${id_no} - Missing 'Actual TC Date'`);
    }
    if (isMissingOrPlaceholder(record.legal_officer)) {
      issues.push(`${id_no} - Missing 'Legal Officer'`);
    }
    if (isMissingOrPlaceholder(record.speaker_name)) {
      issues.push(`${id_no} - Missing 'Speaker Name'`);
    }
  });

  return issues;
}

// OpenAI API call function with retry logic
const callOpenAIWithRetry = async (prompt, retries = 3, delay = 1000) => {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content:
              "You are a helpful assistant for analyzing data integrity.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 1000,
      });
      return response.choices[0].message.content.trim();
    } catch (err) {
      if (err.status === 429 && attempt < retries) {
        console.warn(`Rate limited. Retrying in ${delay}ms...`);
        await new Promise((res) => setTimeout(res, delay));
        delay *= 2; // exponential backoff
      } else {
        throw err; // fall back to mock data if completely failed
      }
    }
  }
};

router.post("/check-data", async (req, res) => {
  try {
    // Ensure ucdsCollection exists in app.locals
    if (!req.app.locals.ucdsCollection) {
      return res
        .status(500)
        .json({ issues: ["Database collection not found."] });
    }

    // Fetch a small sample of data from MongoDB
    const sampleData = await req.app.locals.ucdsCollection.find().toArray();
    const compactData = sampleData.map((doc, index) => ({
      row: index + 1,
      ...doc,
    }));

    // Perform local validation
    const issues = await validateData(compactData);

    // Return the local issues found
    return res.json({ issues });
  } catch (error) {
    console.error("Error fetching or validating data:", error);
    return res.status(500).json({
      issues: ["Error occurred while validating data. Please try again later."],
    });
  }
});

router.get("/ucds/duplicates", async (req, res) => {
  try {
    // Ensure ucdsCollection exists in app.locals
    if (!req.app.locals.ucdsCollection) {
      return res.status(500).json({ error: "Database collection not found." });
    }

    const ucdsCollection = req.app.locals.ucdsCollection;

    // Aggregate to find duplicates
    const duplicates = await ucdsCollection
      .aggregate(
        [
          {
            $match: { ecc_cnc: { $exists: true, $ne: null } }, // Filter documents with non-null ecc_cnc
          },
          {
            $group: {
              _id: "$ecc_cnc", // Group by ecc_cnc
              idNos: { $push: "$id_no" }, // Collect all id_no values for each ecc_cnc
              count: { $sum: 1 }, // Count occurrences of each ecc_cnc
            },
          },
          {
            $match: {
              count: { $gt: 1 }, // Only include duplicates (count > 1)
            },
          },
          {
            $project: {
              _id: 0, // Exclude MongoDB `_id`
              ecc_cnc: "$_id", // Rename `_id` to ecc_cnc
              idNos: 1, // Include the array of id_no values
              count: 1, // Include the count of duplicates
            },
          },
        ],
        { allowDiskUse: true } // Enable disk usage for large datasets
      )
      .toArray();

    // Return the duplicates
    return res.status(200).json({ duplicates });
  } catch (error) {
    console.error("Error detecting duplicate ECC/CNC values:", error);
    return res.status(500).json({
      error: "An error occurred while detecting duplicate ECC/CNC values.",
    });
  }
});


module.exports = router;

///////////////////////////////////////  AI HELPER  WITHIN THE ENTIRE UCDS  ///////////////////////////////////////////////////

// Public Routes (e.g., Registration Route)
app.post("/register", async (req, res) => {
  const { name, division, position, email } = req.body;

  if (!name || !division || !position || !email) {
    return res.status(400).json({
      error: "Name, division/section, position, and email are required",
    });
  }

  try {
    const existingUser = await signUpCollection.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "Email already exists" });
    }

    const result = await signUpCollection.insertOne({
      name,
      division,
      position,
      email,
      status: "pending",
    });

    return res.status(201).json({
      status: "User registration submitted for approval",
      userId: result.insertedId,
    });
  } catch (error) {
    console.error("Error during registration:", error.message);
    return res
      .status(500)
      .json({ error: "An error occurred during registration" });
  }
});

const logActivity = async (req, res, next) => {
  const { method, path, body } = req;

  // Only log POST (add), PUT (update), PATCH (partial update), and GET (view) requests
  if (!["POST", "PUT", "PATCH", "GET"].includes(method)) {
    return next();
  }

  // Ensure the user is authenticated via session
  if (!req.session || !req.session.user) {
    return res.status(401).send("Unauthorized: No session found");
  }

  // Extract user information from the session
  const userId = req.session.user.userId;
  const username = req.session.user.username;

  // Determine action type and label
  let actionType;
  let actionLabel;
  let changes = null; // For logging changes

  // Determine collection based on route path
  let collectionName = "";
  if (path.includes("/survey/")) {
    collectionName = "survey-data";
  } else if (path.includes("/update-data/")) {
    collectionName = "ucds-data";
  } else if (path.includes("/postings/")) {
    collectionName = "postings";
  } else if (path.includes("/draft-reports/")) {
    collectionName = "draft-reports";
  } else if (path.includes("/users/")) {
    collectionName = "users";
  } else if (path.includes("/encode-logs/")) {
    collectionName = "encode-logs";
  } else if (path.includes("/sessions/")) {
    collectionName = "sessions";
  } else if (path.includes("/sign-up/")) {
    collectionName = "sign-up";
  } else {
    collectionName = null;
  }

  if (collectionName) {
    let filter;
    if (method === "PUT" || method === "PATCH") {
      const { id } = req.params;

      if (ObjectId.isValid(id)) {
        filter = { _id: new ObjectId(id) };
      } else if (!isNaN(id)) {
        filter = { id_no: parseInt(id, 10) };
      } else {
        console.error("Invalid ID format:", id);
        return next();
      }

      try {
        if (!client.topology.isConnected()) {
          await client.connect();
        }

        const collection = db.collection(collectionName);

        const originalData = await collection.findOne(filter);
        if (!originalData) {
          console.error("Original data not found for ID:", id);
          return next();
        }

        // Determine changes
        changes = {};
        for (let key in body) {
          if (body[key] !== originalData[key]) {
            changes[key] = {
              old: originalData[key],
              new: body[key],
            };
          }
        }

        actionType = method === "PUT" ? "Update Data" : "Patch";
        actionLabel = `Updated/Modify fields: ${JSON.stringify(changes)}`;
      } catch (error) {
        console.error("Error fetching original data:", error);
        return next(); // Exit on error
      }
    } else if (method === "POST") {
      actionType = "Added Data";
      actionLabel = `Added data: ${JSON.stringify(body)}`;
    } else if (method === "GET") {
      const { id } = req.params;

      if (id) {
        if (ObjectId.isValid(id)) {
          filter = { _id: new ObjectId(id) };
        } else if (!isNaN(id)) {
          filter = { id_no: parseInt(id, 10) };
        } else {
          console.error("Invalid ID format:", id);
          return next();
        }

        try {
          if (!client.topology.isConnected()) {
            await client.connect();
          }

          const collection = db.collection(collectionName);

          // Fetch the viewed data
          const viewedData = await collection.findOne(filter);
          if (!viewedData) {
            console.error("Viewed data not found for ID:", id);
            return next(); // Exit if viewed data not found
          }

          // Construct the action label with the name of the data
          const dataName = viewedData.project_title || "Unknown"; // Use 'project_title' as the name of the data
          actionLabel = `Viewed data: ${dataName}`;
        } catch (error) {
          console.error("Error fetching viewed data:", error);
          return next(); // Exit on error
        }
      } else {
        actionLabel = `Viewed data`;
      }
    }
  } else {
    // Fallback for paths that do not map to a known collection
    actionType = "Generic Action";
    actionLabel = `Performed action on path: ${path}`;
  }

  // Construct the activity log
  const activityLog = {
    userId: userId,
    username: username,
    method,
    path,
    actionType,
    actionLabel,
    requestData: body,
    timestamp: new Date(),
  };

  // Ensure connection to the database
  try {
    if (!client.topology.isConnected()) {
      await client.connect();
    }

    const activityLogsCollection = db.collection("app-logs");

    await activityLogsCollection.insertOne(activityLog);
    //console.log("Activity logged:", activityLog);
  } catch (error) {
    console.error("Error logging activity:", error);
  }

  next();
};

module.exports = logActivity;

//////////////////////////////////////////////////////////////////////////////////////////

const authenticateSession = (req, res, next) => {
  //console.log("Current session:", req.session);
  if (req.session && req.session.user) {
    return next();
  }
  //console.log("User not authenticated:", req.session);
  res.status(401).json({ message: "User not authenticated" });
};

app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    console.log("Username or password missing.");
    return res
      .status(400)
      .json({ error: "Username and password are required." });
  }

  try {
    const user = await userCollection.findOne({ username });

    if (!user) {
      //console.log("User not found:", username);
      return res.status(401).json({ error: "Invalid username or password." });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      //console.log("Password mismatch for user:", username);
      return res.status(401).json({ error: "Invalid username or password." });
    }

    // Set user session
    req.session.user = {
      userId: user._id.toString(),
      name: user.name,
      username: user.username,
      division: user.division,
      permission: user.permission,
      avatar: user.avatar,
      canGenerateData: user.canGenerateData || false,
      canManageData: user.canManageData || false,
      canViewAdminPanel: user.canViewAdminPanel || false,
      canViewDataHistory: user.canViewDataHistory || false,
      canAccessRangePicker: user.canAccessRangePicker || false,
      aurora: user.aurora || false,
      bataan: user.bataan || false,
      bulacan: user.bulacan || false,
      nuevaEcija: user.nuevaEcija || false,
      pampanga: user.pampanga || false,
      tarlac: user.tarlac || false,
      zambales: user.zambales || false,
    };

    //console.log("Session data after setting user:", req.session.user);

    // Update loginStatusCollection
    await loginStatusCollection.updateOne(
      { userId: user._id },
      {
        $set: {
          isLoggedIn: true,
          loginTime: new Date(),
          name: user.name,
          username: user.username,
          division: user.division,
          permission: user.permission,
        },
      },
      { upsert: true } // Create a new document if it doesn't exist
    );

    // Update user's online status
    await userCollection.updateOne(
      { username },
      { $set: { status: "online" } }
    );

    // Send success response
    return res.status(200).json({
      status: "success",
      username: user.username,
      permission: user.permission,
      canGenerateData: user.canGenerateData || false,
      canManageData: user.canManageData || false,
      canViewAdminPanel: user.canViewAdminPanel || false,
      canViewDataHistory: user.canViewDataHistory || false,
      canAccessRangePicker: user.canAccessRangePicker || false,
      aurora: user.aurora || false,
      bataan: user.bataan || false,
      bulacan: user.bulacan || false,
      nuevaEcija: user.nuevaEcija || false,
      pampanga: user.pampanga || false,
      tarlac: user.tarlac || false,
      zambales: user.zambales || false,
    });
  } catch (error) {
    console.error("Error during login:", error);
    return res.status(500).json({ error: "An unexpected error occurred." });
  }
});

// Password reset request endpoint
app.post("/request-password-reset", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email is required." });
  }

  try {
    // Find user by email
    const user = await userCollection.findOne({ email });

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(20).toString("hex");

    // Update user with reset token and expiration
    await userCollection.updateOne(
      { email },
      {
        $set: {
          resetToken,
          resetTokenExpiration: Date.now() + 3600000, // 1 hour expiration
        },
      }
    );

    // Create the reset link
    const resetLink = `http://localhost:5173/reset-password?token=${resetToken}`;

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER, // Sender's email (same as the one in .env)
        pass: process.env.EMAIL_PASS, // Sender's password (same as the one in .env)
      },
      tls: {
        rejectUnauthorized: false, // Allow TLS
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_USER, // Sender's email (same as the one in .env)
      to: user.email, // User's email to send the reset link
      subject: "Password Reset Request",
      html: `
        <html>
          <head>
            <style>
              body {
                font-family: Arial, sans-serif;
                background-color: #f4f4f4;
                padding: 20px;
              }
              .container {
                max-width: 600px;
                margin: 0 auto;
                background-color: #fff;
                padding: 30px;
                border-radius: 8px;
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
              }
              .header {
                text-align: center;
                margin-bottom: 20px;
              }
              .header img {
                width: 100px;
                height: 100px;
              }
              .content {
                font-size: 16px;
                color: #333;
                line-height: 1.6;
              }
              .content p {
                margin-bottom: 10px;
              }
              .reset-link {
                display: inline-block;
                background-color: #ccc;
                color: white;
                padding: 10px 20px;
                font-size: 16px;
                border-radius: 5px;
                text-decoration: none;
                margin-top: 20px;
              }
              .footer {
                text-align: center;
                margin-top: 40px;
                font-size: 12px;
                color: #888;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <img src="cid:logo" alt="Logo" />
              </div>
              <div class="content">
                <p>Hello ${user.name},</p>
                <p>We received a request to reset your password. Please click the button below to reset your password.</p>
                <a href="${resetLink}" class="reset-link">Reset Your Password</a>
                <p>If you did not request a password reset, please ignore this email.</p>
              </div>
              <div class="footer">
                <p>Environmental Management Bureau Region III</p>
                <p>Universe Central Database System</p>
              </div>
            </div>
          </body>
        </html>
      `,
      attachments: [
        {
          filename: "UCDSInformation.png",
          path: path.join(__dirname, "assets", "UCDSInformation.png"),
          cid: "logo", // same cid value as in the html img src
          contentDisposition: "inline", // ensures the image is embedded
          encoding: "base64", // optional: helps with encoding the image correctly
        },
      ],
    };
    // Send the email
    await transporter.sendMail(mailOptions);

    // Send success response
    return res.status(200).json({
      message: "Password reset email sent successfully.",
      status: "success",
      resetLink: `http://localhost:5173/reset-password?token=${resetToken}`, // Optionally, you can include the reset link for easy access
    });
  } catch (error) {
    console.error("Error during password reset request:", error);
    return res.status(500).json({ error: "An error occurred." });
  }
});

app.post("/reset-password", async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res
      .status(400)
      .json({ error: "Token and new password are required." });
  }

  try {
    // Find user by reset token
    const user = await userCollection.findOne({
      resetToken: token,
      resetTokenExpiration: { $gt: Date.now() }, // Ensure the token has not expired
    });

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired token." });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user's password and remove reset token
    await userCollection.updateOne(
      { _id: user._id },
      {
        $set: { password: hashedPassword },
        $unset: { resetToken: "", resetTokenExpiration: "" },
      }
    );

    return res.status(200).json({ message: "Password reset successful." });
  } catch (error) {
    console.error("Error during password reset:", error);
    return res
      .status(500)
      .json({ error: "An error occurred during password reset." });
  }
});

app.get("/auth-check", (req, res) => {
  if (req.session && req.session.user) {
    //console.log("User  is authenticated:", req.session.user);
    res.status(200).json({ isAuthenticated: true });
  } else {
    //console.log("User  is not authenticated.");
    res.status(401).json({ isAuthenticated: false });
  }
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

app.post("/logout", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ message: "You are not logged in" });
  }

  const userId = req.session.user.userId;

  try {
    const logoutTime = new Date();

    // Update loginStatusCollection to set isLoggedIn to false and record logoutTime
    await loginStatusCollection.updateOne(
      { userId: new ObjectId(userId) },
      {
        $set: {
          isLoggedIn: false,
          logoutTime: logoutTime,
        },
      }
    );

    req.session.destroy((err) => {
      if (err) {
        console.error("Error destroying session:", err);
        return res.status(500).json({ message: "Logout failed" });
      }

      res.clearCookie("connect.sid");
      res.status(200).json({ message: "Logout successful" });
    });
  } catch (error) {
    console.error("Error during logout:", error);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

cron.schedule("*/10 * * * *", async () => {
  // Runs every 10 minutes
  try {
    const users = await userCollection
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
      await userCollection.bulkWrite(bulkOps);
      //console.log("Updated user statuses based on last activity.");
    }
  } catch (error) {
    console.error("Error updating user statuses:", error);
  }
});

app.get("/api/current-user/avatar", authenticateSession, async (req, res) => {
  try {
    const user = await userCollection.findById(req.user.id);
    if (!user) {
      return res.status(404).send({ message: "User not found" });
    }
    res.json({ avatar: user.avatar, name: user.name });
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Internal Server Error" });
  }
});

// Protected route example
app.get("/protected-route", authenticateSession, (req, res) => {
  res.json({ message: "This is a protected route!" });
});

app.get("/check-auth", authenticateSession, (req, res) => {
  //console.log("Session data on check-auth:", req.session);
  res.status(200).json({
    status: "Success",
    userId: req.session.user.userId,
    name: req.session.user.name,
    username: req.session.user.username,
    division: req.session.user.division,
    permission: req.session.user.permission,
    avatar: req.session.user.avatar,
    canGenerateData: req.session.user.canGenerateData,
    canManageData: req.session.user.canManageData,
    canViewAdminPanel: req.session.user.canViewAdminPanel,
    canViewDataHistory: req.session.user.canViewDataHistory,
    canAccessRangePicker: req.session.user.canAccessRangePicker,
    aurora: req.session.user.aurora,
    bataan: req.session.user.bataan,
    bulacan: req.session.user.bulacan,
    nuevaEcija: req.session.user.nuevaEcija,
    pampanga: req.session.user.pampanga,
    tarlac: req.session.user.tarlac,
    zambales: req.session.user.zambales,
  });
});

app.post("/api/posting", logActivity, async (req, res) => {
  try {
    const { title, message, date, acknowledgement, iconType } = req.body;

    // Create a new document in the "posting" collection
    const postingCollection = db.collection("postings");
    const posting = await postingCollection.insertOne({
      title,
      message,
      date,
      acknowledgement,
      iconType,
      createdDate: new Date(),
    });

    res.status(201).send({ message: "Announcement saved successfully!" });
  } catch (error) {
    console.error("Error saving announcement:", error); // Detailed server-side error
    res.status(500).send({ message: "Error saving announcement" });
  }
});

// Configure multer to handle form-data without file upload
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Save draft report endpoint
app.post(
  "/save-draft-report",
  upload.single("pdfFile"),
  logActivity,
  async (req, res) => {
    try {
      const { reportInfo, user, date, fileName } = req.body;

      // Validate required fields
      if (!reportInfo || !user || !date) {
        return res.status(400).send({ message: "Missing required fields" });
      }

      // Parse and validate the data
      let parsedReportInfo;
      let parsedUser;
      try {
        parsedReportInfo = JSON.parse(reportInfo);
        parsedUser = JSON.parse(user);
      } catch (parseError) {
        return res.status(400).send({ message: "Invalid JSON format" });
      }

      // Validate fields within the parsed data
      const { id_no, name, title, ecc_cnc, address } = parsedReportInfo;
      if (!id_no || !name || !title || !ecc_cnc || !address) {
        return res.status(400).send({ message: "Incomplete reportInfo data" });
      }

      const parsedDate = new Date(date);
      if (isNaN(parsedDate.getTime())) {
        return res.status(400).send({ message: "Invalid date format" });
      }

      const draftReport = {
        user: parsedUser,
        date: parsedDate,
        reportInfo: { id_no, name, title, ecc_cnc, address },
        fileName: fileName || "", // Default to empty string if fileName is not provided
        pdfUrl: "", // No PDF URL as the file is not uploaded
      };

      await reportdraftCollection.insertOne(draftReport);
      res.status(200).send({ message: "Draft report saved successfully" });
    } catch (error) {
      console.error("Failed to save draft report:", error);
      res
        .status(500)
        .send({ message: "Failed to save draft report", error: error.message });
    }
  }
);

app.post(
  "/save-draft-report-survey",
  upload.single("pdfFile"),
  logActivity,
  async (req, res) => {
    try {
      // Extract the fields from req.body and req.file
      const { reportInfo, user, date, fileName } = req.body;

      // Validate required fields
      if (!reportInfo || !user || !date || !req.file) {
        return res.status(400).send({ message: "Missing required fields" });
      }

      // Parse and validate the data
      let parsedReportInfo;
      let parsedUser;
      try {
        parsedReportInfo = JSON.parse(reportInfo);
        parsedUser = JSON.parse(user);
      } catch (parseError) {
        return res.status(400).send({ message: "Invalid JSON format" });
      }

      // Validate fields within the parsed data
      const { id_no, name, title, iis_no, address } = parsedReportInfo;
      if (!id_no || !name || !title || !iis_no || !address) {
        return res.status(400).send({ message: "Incomplete reportInfo data" });
      }

      const parsedDate = new Date(date);
      if (isNaN(parsedDate.getTime())) {
        return res.status(400).send({ message: "Invalid date format" });
      }

      // Save the PDF file to the server
      const pdfFilePath = `uploads/${req.file.filename}`; // Specify where to save the uploaded file

      const draftReport = {
        user: parsedUser,
        date: parsedDate,
        reportInfo: { id_no, name, title, iis_no, address },
        fileName: fileName || "", // Default to empty string if fileName is not provided
        pdfUrl: pdfFilePath, // Store the path to the uploaded PDF
      };

      // Insert the draft report into the database
      await reportdraftCollection.insertOne(draftReport);
      res.status(200).send({ message: "Draft report saved successfully" });
    } catch (error) {
      console.error("Failed to save draft report:", error);
      res
        .status(500)
        .send({ message: "Failed to save draft report", error: error.message });
    }
  }
);

// Update color for a specific survey record
app.post(
  "/api/update-color",
  logActivity,
  authenticateSession,
  async (req, res) => {
    const { id_no, color } = req.body;

    if (!id_no || !color) {
      return res.status(400).send("Serial number and color are required.");
    }

    try {
      const result = await surveyCollection.updateOne(
        { id_no },
        { $set: { color } }
      );

      if (result.matchedCount === 0) {
        return res.status(404).send("Record not found.");
      }

      res.status(200).send("Color updated successfully.");
    } catch (error) {
      console.error("Error updating color:", error);
      res.status(500).send("Internal server error.");
    }
  }
);

app.post("/api/update-color-universe", async (req, res) => {
  const colorUpdates = req.body;

  if (!colorUpdates || !Array.isArray(colorUpdates)) {
    return res.status(400).send({ error: "Color updates are required." });
  }

  //console.log("Color updates:", colorUpdates);

  try {
    const results = await Promise.all(
      colorUpdates.map((update) => {
        //console.log("Updating document with id_no:", update.id_no);
        //console.log("Setting color to:", update.color);

        return ucdsCollection.updateOne(
          { id_no: update.id_no },
          { $set: { color: update.color } },
          { upsert: true }
        );
      })
    );

    //console.log("Update results:", results);

    const updatedCount = results.reduce(
      (acc, result) => acc + result.modifiedCount,
      0
    );
    const upsertedCount = results.reduce(
      (acc, result) => acc + result.upsertedCount,
      0
    );
    const matchedCount = results.reduce(
      (acc, result) => acc + result.matchedCount,
      0
    );

    if (updatedCount === 0 && upsertedCount === 0 && matchedCount === 0) {
      console.warn("No documents updated, upserted, or matched.");
      res
        .status(200)
        .send({ message: "No documents updated, upserted, or matched." });
    } else {
      res.status(200).send({
        message: `Colors updated or upserted for ${
          updatedCount + upsertedCount
        } document(s).`,
      });
    }
  } catch (error) {
    console.error("Error updating colors:", error);
    res.status(500).send({ error: "Internal server error." });
  }
});

app.post("/save-draft-report", upload.single("pdfFile"), async (req, res) => {
  try {
    // Parse JSON data from req.body
    const { reportInfo, user, date, fileName } = JSON.parse(req.body);

    // Create a new draft report document
    const newDraft = {
      user: { name: user.name },
      date: new Date(date),
      reportInfo: JSON.parse(reportInfo),
      fileName,
      pdfUrl: `pdfFiles/${fileName}`, // Adjust as needed
    };

    // Save the draft report to the database
    await reportdraftCollection.insertOne(newDraft);

    res.status(200).send({ message: "Draft report saved successfully" });
  } catch (error) {
    console.error("Error saving draft report:", error);
    res.status(500).send({ message: "Failed to save draft report" });
  }
});

app.post("/api/survey-log", async (req, res) => {
  try {
    const logEntry = req.body;
    await surveyLogCollection.insertOne(logEntry); // Assuming surveyLogCollection is defined
    res.status(200).send(logEntry);
  } catch (error) {
    console.error("Error saving log entry:", error);
    res.status(500).send("Error saving log entry");
  }
});

app.post("/api/ucds-log", async (req, res) => {
  try {
    const logEntry = req.body;
    await ucdsLogCollection.insertOne(logEntry);
    res.status(200).send(logEntry);
  } catch (error) {
    console.error("Error saving log entry:", error);
    res.status(500).send("Error saving log entry");
  }
});

//////////////////////////////////////////////////////////////////////////////////////////
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Set up storage for profile photos
const storagedp = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir); // Directory to save uploaded files
  },
  filename: (req, file, cb) => {
    const uniqueFilename = `${Date.now()}-${file.originalname}`; // Create a unique filename
    cb(null, uniqueFilename);
    console.log("Generated filename:", uniqueFilename);
  },
});

const storagenewdp = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/"); // Specify the directory to save the uploaded files
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + file.originalname; // Create a unique filename
    cb(null, uniqueSuffix); // Save the file with the unique name
  },
});

const uploaddp = multer({ storage: storagedp });
const uploadnewdp = multer({ storage: storagenewdp });

// Serve static files from the uploads directory
app.use("/uploads", express.static(uploadsDir));

app.post("/api/users/update", uploaddp.single("photo"), async (req, res) => {
  //console.log(req.file); // Log the uploaded file
  //console.log(req.body); // Log the request body

  try {
    const { username } = req.body; // Get username from request body
    const user = await userCollection.findOne({ username });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" }); // Handle missing file
    }

    //console.log('Filename:', req.file.filename); // Check if filename is defined

    // Save the accessible file URL to the user's document
    const filePath = `/uploads/${req.file.filename}`;
    //console.log('File path:', filePath); // Log the file path for debugging
    user.avatar = filePath;

    // Update the user document with the new avatar URL
    await userCollection.updateOne(
      { username },
      { $set: { avatar: filePath } }
    );

    res.status(200).json(user); // Return the updated user data as JSON
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Route to handle new user creation with file upload
app.post("/api/newusers", uploadnewdp.single("avatar"), async (req, res) => {
  const { name, email, division, status, password, username } = req.body;
  const avatarPath = req.file ? `/uploads/${req.file.filename}` : null; // Get the file path if uploaded

  // Input validation
  if (!name || !email || !division || !status || !password || !username) {
    //console.log("Validation error: Missing required fields");
    return res.status(400).json({
      error:
        "Required fields: name, email, division, status, password, username",
    });
  }

  try {
    // Check for existing email
    const existingUser = await userCollection.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "Email already exists" });
    }

    // Check for existing username
    const existingUsername = await userCollection.findOne({ username });
    if (existingUsername) {
      return res.status(400).json({ error: "Username already exists" });
    }

    // Hash password securely
    const password = await bcrypt.hash(password, 10);

    // Create user object with hashed password and provided username
    const newUser = {
      name,
      username,
      email,
      password, // Ensure to hash the password before saving
      division,
      permission: "viewer", // Default permission
      status: status || "offline", // Default status
      avatar: avatarPath,
      canAccessRangePicker: false,
      canGenerateData: false,
      canManageData: false,
      canViewAdminPanel: false,
      canViewDataHistory: false,
      designation: "n/a",
      office: "n/a",
      region: "n/a",
    };

    // Insert the new user document into MongoDB
    const insertResult = await userCollection.insertOne(newUser);

    if (insertResult.acknowledged && insertResult.insertedId) {
      return res.status(201).json({
        message: "User  created successfully",
        user: newUser,
      });
    } else {
      console.error("Error inserting user:", insertResult);
      return res.status(500).json({ error: "Failed to create user" });
    }
  } catch (error) {
    console.error("Error creating user:", error);
    return res.status(500).json({ error: "Failed to create user" });
  }
});

app.post("/api/ucds/add-establishment", async (req, res) => {
  try {
    const {
      id_no,
      title,
      name,
      address,
      ecc_cnc,
      industry_class,
      remarks,
      industry_type,
      industry_subtype,
      psic_code,
      mbu_area,
      waterbody,
      long,
      lat,
      cong_district,
      street,
      brgy,
      city,
      province,
      emp_total,
      wwtf_type,
      bod,
      section_incharged,
      handler,
      monitoring_sched,
      iis_no,
      iis_no_2025,
      insp_type,
      date_monitored,
      date_routed,
      date_signed,
      days_dmds,
      days_drds,
      pismu_tracking,
      title_status,
      with_nov,
      permit_process,
      date_amended,
      date_approved,
      pto_code,
      pto_issued,
      pto_expiration,
      wwdp_code,
      wwdp_issued,
      wwdp_expiration,
      haz_id,
      haz_issued,
      pco_no,
      pco_name,
      pco_validity,
      docket_no,
      denr_pab_case_no,
      nov_issued,
      v_pd1586,
      v_ra9275,
      v_ra8749,
      v_ra6969_haz,
      v_ra6969_tchem,
      tc_date_actual,
      legal_officer,
      tc_compliance_link,
      pos_paper,
      penalty_date,
      amount,
      or_number,
      tc_commitment,
      other_tc_remarks,
      resolution_issued,
      order_issued,
      order_status,
      current_user, // New field: Name of the current user
      division, // New field: Division
    } = req.body;

    if (!name || !title || !province || !ecc_cnc) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Check for duplicate ECC_CNC before inserting
    const existingRecord = await ucdsCollection.findOne({ ecc_cnc });

    if (existingRecord) {
      return res.status(409).json({
        message: "Duplicate entry found",
        details: existingRecord,
      });
    }

    const newEntry = {
      id_no,
      title,
      name,
      address,
      ecc_cnc,
      industry_class,
      remarks,
      industry_type,
      industry_subtype,
      psic_code,
      mbu_area,
      waterbody,
      long,
      lat,
      cong_district,
      street,
      brgy,
      city,
      province,
      emp_total,
      wwtf_type,
      bod,
      section_incharged,
      handler,
      monitoring_sched,
      iis_no,
      iis_no_2025,
      insp_type,
      date_monitored,
      date_routed,
      date_signed,
      days_dmds,
      days_drds,
      pismu_tracking,
      title_status,
      with_nov,
      permit_process,
      date_amended,
      date_approved,
      pto_code,
      pto_issued,
      pto_expiration,
      wwdp_code,
      wwdp_issued,
      wwdp_expiration,
      haz_id,
      haz_issued,
      pco_no,
      pco_name,
      pco_validity,
      docket_no,
      denr_pab_case_no,
      nov_issued,
      v_pd1586,
      v_ra9275,
      v_ra8749,
      v_ra6969_haz,
      v_ra6969_tchem,
      tc_date_actual,
      legal_officer,
      tc_compliance_link,
      pos_paper,
      penalty_date,
      amount,
      or_number,
      tc_commitment,
      other_tc_remarks,
      resolution_issued,
      order_issued,
      order_status,
      createdBy: current_user, // Store the user who added the record
      division,
      dateAdded: new Date(), // Store the date of creation
    };

    const result = await ucdsCollection.insertOne(newEntry);
    res.status(201).json({
      message: "Establishment added successfully",
      id: result.insertedId,
    });
  } catch (error) {
    console.error("Error adding establishment:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.use("/uploads", express.static(uploadsDir));

//////////////////////////////////////////////////////////////////////////////////////////

app.get("/api/draft-report", async (req, res) => {
  try {
    const drafts = await reportdraftCollection.find().toArray();
    res.json(drafts);
  } catch (error) {
    console.error("Error fetching draft reports:", error);
    res.status(500).send({ message: "Error fetching draft reports" });
  }
});

app.get("/api/firm-count", async (req, res) => {
  try {
    // Ensure connection to the database
    if (!client.topology.isConnected()) {
      await client.connect();
    }

    const database = client.db("universe-db");
    const collection = database.collection("ucds-data");

    // Get the total count of documents in the collection
    const count = await collection.countDocuments();

    return res.status(200).json({ count, updatedFirms: 0 }); // Return the total count
  } catch (error) {
    console.error("Error retrieving firm count:", error);
    return res.status(500).json({ error: "Failed to retrieve firm count." });
  }
});

// API for loading surveys based on the year (e.g., /api/surveys/2025)
app.get("/api/surveys/:year", async (req, res) => {
  try {
    const { year } = req.params; // Get year from URL parameter
    let collection;

    // Only allow valid years: 2024 or 2025
    if (year === "2024") {
      collection = db.collection("survey-data-2024");
    } else if (year === "2025") {
      collection = db.collection("survey-data-2025");
    } else {
      return res.status(400).json({ error: "Invalid survey year" });
    }

    // Fetch all surveys from the selected year
    const surveys = await collection.find({}).toArray();
    res.status(200).json(surveys);
  } catch (error) {
    console.error("Error fetching survey data:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/api/surveys/last-id/:year", async (req, res) => {
  try {
    const { year } = req.params;

    let collection;
    if (year === "2024") {
      collection = db.collection("survey-data-2024");
    } else if (year === "2025") {
      collection = db.collection("survey-data-2025");
    } else {
      console.error("Invalid survey year requested:", year);
      return res.status(400).json({ error: "Invalid survey year" });
    }

    // Fetch the last record sorted by id_no in descending order
    const lastSurvey = await collection
      .find({})
      .sort({ id_no: -1 }) // Sort by id_no in descending order
      .limit(1) // Get only the last record
      .toArray();

    if (lastSurvey.length === 0) {
      return res.status(404).json({ error: "No survey data found" });
    }

    // Send the id_no of the last survey
    res.status(200).json({ lastIdNo: lastSurvey[0].id_no });
  } catch (error) {
    console.error("Error fetching last id_no:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/api/ucds", async (req, res) => {
  try {
    const surveys = await ucdsCollection.find({}).toArray();
    res.status(200).json(surveys);
  } catch (error) {
    console.error("Error fetching survey data:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/api/ucds/next-id", async (req, res) => {
  try {
    const { province } = req.query;

    // If no province is selected, return a placeholder ID
    if (!province) {
      return res.status(200).json({ nextIdNo: "No ID assigned yet" });
    }

    // Define province prefixes
    const provincePrefixes = {
      Aurora: "AU-",
      Bataan: "BA-",
      Bulacan: "BU-",
      Nueva_Ecija: "NE-",
      Pampanga: "PA-",
      Tarlac: "TA-",
      Zambales: "ZA-",
    };

    const prefix = provincePrefixes[province];

    if (!prefix) {
      return res.status(400).json({ error: "Invalid province" });
    }

    // Fetch the highest ID for the given province
    const surveys = await ucdsCollection.find({ province }).toArray();
    const maxIdNo = surveys.reduce((max, survey) => {
      const match = survey.id_no.match(/\d+$/); // Extract last number from ID
      const idNo = match ? parseInt(match[0], 10) : 0;
      return idNo > max ? idNo : max;
    }, 0);

    const nextIdNo = maxIdNo + 1;
    const formattedId = `${prefix}${nextIdNo}`;

    res.status(200).json({ nextIdNo: formattedId });
  } catch (error) {
    console.error("Error fetching next id_no:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Search by name
app.get("/api/ucds/search-name", async (req, res) => {
  const query = req.query.query;
  try {
    const regex = new RegExp(query, "i"); // Case-insensitive search
    const results = await ucdsCollection.find({ name: regex }).toArray();

    // Create a map to count occurrences of each unique name
    const nameCounts = results.reduce((acc, item) => {
      const name = item.name.toString();
      if (acc[name]) {
        acc[name]++;
      } else {
        acc[name] = 1;
      }
      return acc;
    }, {});

    // Convert the map to an array of objects
    const uniqueNames = Object.keys(nameCounts).map((key) => ({
      keyword: key,
      count: nameCounts[key],
    }));

    res.status(200).json(uniqueNames);
  } catch (error) {
    console.error("Error searching names:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Search by title
app.get("/api/ucds/search-title", async (req, res) => {
  const query = req.query.query;
  try {
    const regex = new RegExp(query, "i"); // Case-insensitive search
    const results = await ucdsCollection.find({ title: regex }).toArray();

    // Create a map to count occurrences of each unique title
    const titleCounts = results.reduce((acc, item) => {
      const title = item.title.toString();
      if (acc[title]) {
        acc[title]++;
      } else {
        acc[title] = 1;
      }
      return acc;
    }, {});

    // Convert the map to an array of objects
    const uniqueTitles = Object.keys(titleCounts).map((key) => ({
      keyword: key,
      count: titleCounts[key],
    }));

    res.status(200).json(uniqueTitles);
  } catch (error) {
    console.error("Error searching titles:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Search by industry class
app.get("/api/ucds/search-industry-class", async (req, res) => {
  const query = req.query.query;
  try {
    const regex = new RegExp(query, "i"); // Case-insensitive search
    const results = await ucdsCollection
      .find({ industry_class: regex })
      .toArray();

    // Create a map to count occurrences of each unique industry class
    const industryClassCounts = results.reduce((acc, item) => {
      const industry_class = item.industry_class.toString();
      if (acc[industry_class]) {
        acc[industry_class]++;
      } else {
        acc[industry_class] = 1;
      }
      return acc;
    }, {});

    // Convert the map to an array of objects
    const uniqueIndustryClasses = Object.keys(industryClassCounts).map(
      (key) => ({
        keyword: key,
        count: industryClassCounts[key],
      })
    );

    res.status(200).json(uniqueIndustryClasses);
  } catch (error) {
    console.error("Error searching industry classes:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/api/ucds/search-ecc-cnc", async (req, res) => {
  const query = req.query.query;
  try {
    const regex = new RegExp(query, "i"); // Case-insensitive search
    const results = await ucdsCollection.find({ ecc_cnc: regex }).toArray();

    // Create a map to count occurrences of each unique ECC CNC
    const eccCncCounts = results.reduce((acc, item) => {
      const ecc_cnc = item.ecc_cnc.toString();
      if (acc[ecc_cnc]) {
        acc[ecc_cnc]++;
      } else {
        acc[ecc_cnc] = 1;
      }
      return acc;
    }, {});

    // Convert the map to an array of objects
    const uniqueEccCncs = Object.keys(eccCncCounts).map((key) => ({
      keyword: key,
      count: eccCncCounts[key],
    }));

    res.status(200).json(uniqueEccCncs);
  } catch (error) {
    console.error("Error searching ECC CNCs:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/api/ucds/check-duplicate", async (req, res) => {
  const query = req.query.query;
  if (!query) {
    return res.status(400).json({ error: "Query parameter is required" });
  }

  try {
    const regex = new RegExp(`^${query}$`, "i"); // Exact match, case-insensitive
    const duplicateEntry = await ucdsCollection.findOne({ ecc_cnc: regex });

    if (duplicateEntry) {
      return res.status(200).json({
        duplicate: true,
        details: {
          id: duplicateEntry._id,
          ecc_cnc: duplicateEntry.ecc_cnc,
          name: duplicateEntry.name || "N/A",
          title: duplicateEntry.title || "N/A",
          province: duplicateEntry.province || "N/A",
        },
      });
    } else {
      return res.status(200).json({ duplicate: false });
    }
  } catch (error) {
    console.error("Error checking duplicate ECC CNC:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/api/ucds/search-pto-code", async (req, res) => {
  const query = req.query.query;
  try {
    const regex = new RegExp(query, "i"); // Case-insensitive search
    const results = await ucdsCollection.find({ pto_code: regex }).toArray();

    // Create a map to count occurrences of each unique PTO code
    const ptoCodeCounts = results.reduce((acc, item) => {
      const pto_code = item.pto_code.toString();
      if (acc[pto_code]) {
        acc[pto_code]++;
      } else {
        acc[pto_code] = 1;
      }
      return acc;
    }, {});

    // Convert the map to an array of objects
    const uniquePtoCodes = Object.keys(ptoCodeCounts).map((key) => ({
      keyword: key,
      count: ptoCodeCounts[key],
    }));

    res.status(200).json(uniquePtoCodes);
  } catch (error) {
    console.error("Error searching PTO codes:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/api/ucds/search-wwdp-code", async (req, res) => {
  const query = req.query.query;
  try {
    const regex = new RegExp(query, "i"); // Case-insensitive search
    const results = await ucdsCollection.find({ wwdp_code: regex }).toArray();

    // Create a map to count occurrences of each unique WWDP code
    const wwdpCodeCounts = results.reduce((acc, item) => {
      const wwdp_code = item.wwdp_code.toString();
      if (acc[wwdp_code]) {
        acc[wwdp_code]++;
      } else {
        acc[wwdp_code] = 1;
      }
      return acc;
    }, {});

    // Convert the map to an array of objects
    const uniqueWwdpCodes = Object.keys(wwdpCodeCounts).map((key) => ({
      keyword: key,
      count: wwdpCodeCounts[key],
    }));

    res.status(200).json(uniqueWwdpCodes);
  } catch (error) {
    console.error("Error searching WWDP codes:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/api/ucds/search-haz-id", async (req, res) => {
  const query = req.query.query;
  try {
    const regex = new RegExp(query, "i"); // Case-insensitive search
    const results = await ucdsCollection.find({ haz_id: regex }).toArray();

    // Create a map to count occurrences of each unique HAZ ID
    const hazIdCounts = results.reduce((acc, item) => {
      const haz_id = item.haz_id.toString();
      if (acc[haz_id]) {
        acc[haz_id]++;
      } else {
        acc[haz_id] = 1;
      }
      return acc;
    }, {});

    // Convert the map to an array of objects
    const uniqueHazIds = Object.keys(hazIdCounts).map((key) => ({
      keyword: key,
      count: hazIdCounts[key],
    }));

    res.status(200).json(uniqueHazIds);
  } catch (error) {
    console.error("Error searching HAZ IDs:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/api/ucds/search-pco-no", async (req, res) => {
  const query = req.query.query;
  try {
    const regex = new RegExp(query, "i"); // Case-insensitive search
    const results = await ucdsCollection.find({ pco_no: regex }).toArray();

    // Create a map to count occurrences of each unique PCO number
    const pcoNoCounts = results.reduce((acc, item) => {
      const pco_no = item.pco_no.toString();
      if (acc[pco_no]) {
        acc[pco_no]++;
      } else {
        acc[pco_no] = 1;
      }
      return acc;
    }, {});

    // Convert the map to an array of objects
    const uniquePcoNos = Object.keys(pcoNoCounts).map((key) => ({
      keyword: key,
      count: pcoNoCounts[key],
    }));

    res.status(200).json(uniquePcoNos);
  } catch (error) {
    console.error("Error searching PCO numbers:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/api/ucds/search-pco-name", async (req, res) => {
  const query = req.query.query;
  try {
    const regex = new RegExp(query, "i"); // Case-insensitive search
    const results = await ucdsCollection.find({ pco_name: regex }).toArray();

    // Create a map to count occurrences of each unique PCO name
    const pcoNameCounts = results.reduce((acc, item) => {
      const pco_name = item.pco_name.toString();
      if (acc[pco_name]) {
        acc[pco_name]++;
      } else {
        acc[pco_name] = 1;
      }
      return acc;
    }, {});

    // Convert the map to an array of objects
    const uniquePcoNames = Object.keys(pcoNameCounts).map((key) => ({
      keyword: key,
      count: pcoNameCounts[key],
    }));

    res.status(200).json(uniquePcoNames);
  } catch (error) {
    console.error("Error searching PCO names:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/api/survey/:id_no", async (req, res) => {
  const id_no = req.params.id_no;
  const surveyRecord = await surveyCollection.findOne({ id_no });

  if (surveyRecord && surveyRecord.docket_no) {
    res.json({ docket_no: surveyRecord.docket_no });
  } else {
    // If no data is found, set a timeout to stop sending updates after 1 minute
    const timeoutId = setTimeout(() => {
      res.status(404).json({ error: "Not found" });
    }, 10000); // 1 minute

    // Try to fetch the data again after a short delay
    setTimeout(async () => {
      const surveyRecord = await surveyCollection.findOne({ id_no });
      if (surveyRecord && surveyRecord.docket_no) {
        res.json({ docket_no: surveyRecord.docket_no });
        clearTimeout(timeoutId);
      }
    }, 2000); // 2 seconds
  }
});

app.get("/api/files/:filename", async (req, res) => {
  try {
    const filename = req.params.filename;
    const bucket = new GridFSBucket(db, { bucketName: "pdfFiles" });

    const downloadStream = bucket.openDownloadStreamByName(filename);

    downloadStream.on("error", (error) => {
      console.error("Error fetching file:", error);
      res.status(500).send("Error fetching file");
    });

    downloadStream.pipe(res);
  } catch (error) {
    console.error("Error serving file:", error);
    res.status(500).send("Error serving file");
  }
});

app.get("/current-user", async (req, res) => {
  console.log("req.user:", req.user);
  try {
    if (req.user) {
      const user = await userCollection.findOne({
        _id: new ObjectId(req.user.userId),
      });

      if (user) {
        res.json({
          _id: user._id,
          name: user.name,
          username: user.username,
          email: user.email,
          division: user.division,
          permission: user.permission,
          status: user.status,
          avatar: user.avatar, // Ensure the avatar object is included
        });
      } else {
        res.status(404).send({ message: "User not found" });
      }
    } else {
      res.status(401).send({ message: "User not authenticated" });
    }
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).send({ message: "Error fetching user data" });
  }
});

// GENERATION OF ICIR FORM PDF AS PRIMARY INFORMATION
app.get("/generate-icir/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // Validate id_no format
    if (!parseInt(id)) {
      return res.status(400).send("Invalid id_no format");
    }

    // Find record by id_no from ucds-data collection
    const record = await ucdsCollection.findOne({ id_no: parseInt(id) });

    // Handle if record not found
    if (!record) {
      return res.status(404).send("Record not found");
    }

    // Load existing PDF template
    const pdfPath = path.join(__dirname, "tmp", "icir-form.pdf");
    const pdfBuffer = await fs.promises.readFile(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBuffer);

    // Register fontkit
    pdfDoc.registerFontkit(fontkit);

    // Load custom font
    const fontPath = path.join(__dirname, "fonts", "arial.ttf");
    const fontBytes = await fs.promises.readFile(fontPath);
    const customFont = await pdfDoc.embedFont(fontBytes);

    const form = pdfDoc.getForm();
    const formFields = form.getFields();

    formFields.forEach((field) => {
      switch (field.getName()) {
        case "establishment_name":
          field.setText(`${record.title || ""}`);
          field.updateAppearances(customFont);
          break;
        case "establishment_address":
          field.setText(`${record.address || ""}`);
          field.updateAppearances(customFont);
          break;
        case "establishment_industry_class":
          field.setText(`${record.industry_class || ""}`);
          field.updateAppearances(customFont);
          break;
        case "establishment_psic_code":
          field.setText(`${record.psic_code || ""}`);
          field.updateAppearances(customFont);
          break;
        case "establishment_ecc_cnc1":
          field.setText(`${record.ecc_cnc || ""}`);
          field.updateAppearances(customFont);
          break;
        case "ecc_issued1":
          field.setText(`${record.date_approved || ""}`);
          field.updateAppearances(customFont);
          break;
        case "establishment_pto_code":
          field.setText(`${record.pto_code || ""}`);
          field.updateAppearances(customFont);
          break;
        case "pto_issued":
          field.setText(`${record.pto_issued || ""}`);
          field.updateAppearances(customFont);
          break;
        case "pto_exp":
          field.setText(`${record.pto_expiration || ""}`);
          field.updateAppearances(customFont);
          break;
        case "establishment_wwdp_code":
          field.setText(`${record.wwdp_code || ""}`);
          field.updateAppearances(customFont);
          break;
        case "wwdp_issued":
          field.setText(`${record.wwdp_issued || ""}`);
          field.updateAppearances(customFont);
          break;
        case "wwdp_expiration":
          field.setText(`${record.wwdp_expiration || ""}`);
          field.updateAppearances(customFont);
          break;
        default:
          console.log(`Unknown field: ${field.getName()}`);
      }
    });

    // Send the modified PDF file to the client
    const pdfBytes = await pdfDoc.save();
    const compressedPdfBytes = zlib.gzipSync(pdfBytes);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="ICIR-${record.title}.pdf"`
    );
    res.setHeader("Content-Encoding", "gzip");
    res.setHeader("Content-Length", compressedPdfBytes.length);
    res.send(compressedPdfBytes);
  } catch (error) {
    console.error("Error generating ICIR:", error);
    res.status(500).send("Failed to generate ICIR");
  }
});

// GENERATION OF CUSTOM ICIR FORM PDF AS PRIMARY INFORMATION
app.get("/generate-custom-icir/:id", async (req, res) => {
  const { id } = req.params;
  const selectedData = req.query;

  // Step 1: Validate the id format (alphanumeric and hyphen allowed)
  const idPattern = /^[A-Za-z0-9\-]+$/;
  if (!idPattern.test(id)) {
    return res.status(400).send("Invalid id format");
  }

  //console.log("Received ID:", id); // Log the ID received in the URL
  //console.log("Received Query Parameters:", selectedData); // Log query params

  // Step 2: Field mappings for form fields
  const fieldMapping = {
    title: "establishment_name",
    name: "contact_person",
    address: "establishment_address",
    industry_class: "establishment_industry_class",
    psic_code: "establishment_psic_code",
    emp_total: "emp_total",
    bod: "bod_loading",
    wwtf_type: "wwtf_type",
    ecc_cnc: "establishment_ecc_cnc1",
    pco_no: "pco_accreditation",
    pco_validity: "pco_validity",
    date_approved: "ecc_issued1",
    date_amended: "ecc_expiration1",
    haz_id: "establishment_haz_id",
    haz_issued: "haz_issued",
    pto_code: "establishment_pto_code",
    pto_issued: "pto_issued",
    pto_expiration: "pto_expiration",
    wwdp_code: "establishment_wwdp_code",
    wwdp_issued: "wwdp_issued",
    wwdp_expiration: "wwdp_expiration",
    long: "longitude",
    lat: "latitude",
    handler: "inspector1",
  };

  // Step 3: Load the PDF template and custom font
  try {
    // Load existing PDF template
    const pdfPath = path.join(__dirname, "tmp", "icir-form.pdf");
    const pdfBuffer = await fs.promises.readFile(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBuffer);

    // Register fontkit
    pdfDoc.registerFontkit(fontkit);

    // Load custom font (Arial, adjust if the font file path is incorrect)
    const fontPath = path.join(__dirname, "fonts", "arial.ttf");
    if (!fs.existsSync(fontPath)) {
      return res.status(500).send("Custom font file not found");
    }
    const fontBytes = await fs.promises.readFile(fontPath);
    const customFont = await pdfDoc.embedFont(fontBytes);

    // Step 4: Populate form fields with selected data
    const form = pdfDoc.getForm();
    const formFields = form.getFields();

    formFields.forEach((field) => {
      const fieldName = field.getName();
      const pdfFieldName = Object.keys(fieldMapping).find(
        (key) => fieldMapping[key] === fieldName
      );

      if (pdfFieldName) {
        const value = selectedData[pdfFieldName] || ""; // Default to empty string if not provided
        console.log(`Filling field: ${fieldName} with value: ${value}`);

        // Check the field type and set the text or value accordingly
        if (field.constructor.name === "PDFTextField") {
          field.setText(value);
          field.updateAppearances(customFont);
        } else if (field.constructor.name === "PDFCheckBox") {
          // Handle checkbox (or radio button) field, if applicable
          const isChecked = value.toLowerCase() === "true" || value === "1"; // Adjust based on your data
          field.check(isChecked);
        } else if (field.constructor.name === "PDFRadioButton") {
          // Handle radio button field, if applicable
          const options = field.getOptions(); // Get all options (if any)
          if (options.includes(value)) {
            field.select(value); // Select the option based on your data
          }
        }
      }
    });

    // Step 5: Send the generated PDF to the client
    const pdfBytes = await pdfDoc.save();
    const compressedPdfBytes = zlib.gzipSync(pdfBytes);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="ICIR-${selectedData.title || "Unknown"}.pdf"`
    );
    res.setHeader("Content-Encoding", "gzip");
    res.setHeader("Content-Length", compressedPdfBytes.length);
    res.send(compressedPdfBytes);
  } catch (error) {
    console.error("Error generating ICIR:", error);
    if (error.stack) {
      console.error(error.stack); // Log detailed error stack for debugging
    }
    res.status(500).send("Failed to generate ICIR");
  }
});

//GENERATION OF SURVEY FORM PDF AS PRIMARY INFORMATION
app.get("/generate-survey-report/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // Validate id_no format
    if (!parseInt(id)) {
      return res.status(400).send("Invalid id_no format");
    }

    // Find record by id_no from ucds-data collection
    const record = await surveyCollection.findOne({ id_no: parseInt(id) });

    // Handle if record not found
    if (!record) {
      return res.status(404).send("Record not found");
    }

    // Load existing PDF template
    const pdfPath = path.join(__dirname, "tmp", "survey-form.pdf");
    const pdfBuffer = await fs.promises.readFile(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBuffer);

    // Register fontkit
    pdfDoc.registerFontkit(fontkit);

    // Load custom font
    const fontPath = path.join(__dirname, "fonts", "arial.ttf");
    const fontBytes = await fs.promises.readFile(fontPath);
    const customFont = await pdfDoc.embedFont(fontBytes);

    const form = pdfDoc.getForm();
    const formFields = form.getFields();

    formFields.forEach((field) => {
      switch (field.getName()) {
        case "establishment_name":
          field.setText(`${record.project_title || ""}`);
          field.updateAppearances(customFont);
          break;
        case "plant_address":
          field.setText(`${record.address || ""}`);
          field.updateAppearances(customFont);
          break;
        case "main_address":
          field.setText(`${record.address || ""}`);
          field.updateAppearances(customFont);
          break;
        case "nature_business":
          field.setText(`${record.industry_class || ""}`);
          field.updateAppearances(customFont);
          break;
        case "longitude":
          field.setText(`${record.long || ""}`);
          field.updateAppearances(customFont);
          break;
        case "latitude":
          field.setText(`${record.lat || ""}`);
          field.updateAppearances(customFont);
          break;
        default:
          console.log(`Unknown field: ${field.getName()}`);
      }
    });

    // Send the modified PDF file to the client
    const pdfBytes = await pdfDoc.save();
    const compressedPdfBytes = zlib.gzipSync(pdfBytes);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="ICIR-${record.title}.pdf"`
    );
    res.setHeader("Content-Encoding", "gzip");
    res.setHeader("Content-Length", compressedPdfBytes.length);
    res.send(compressedPdfBytes);
  } catch (error) {
    console.error("Error generating Survey Report:", error);
    res.status(500).send("Failed to generate Survey Report");
  }
});

// GENERATION OF CUSTOM SURVEY REPORT FORM PDF AS PRIMARY INFORMATION
app.get("/generate-custom-survey-report/:id", async (req, res) => {
  const { id } = req.params;
  const selectedData = req.query;

  // Define field mappings based on field names from the PDF
  const fieldMapping = {
    project_title: "establishment_name",
    industry_class: "nature_business",
    long: "longitude",
    lat: "latitude",
  };

  try {
    // Validate id_no format
    if (!parseInt(id)) {
      return res.status(400).send("Invalid id_no format");
    }

    // Load existing PDF template
    const pdfPath = path.join(__dirname, "tmp", "survey-form.pdf");
    const pdfBuffer = await fs.promises.readFile(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBuffer);

    // Register fontkit
    pdfDoc.registerFontkit(fontkit);

    // Load custom font
    const fontPath = path.join(__dirname, "fonts", "arial.ttf");
    const fontBytes = await fs.promises.readFile(fontPath);
    const customFont = await pdfDoc.embedFont(fontBytes);

    const form = pdfDoc.getForm();
    const formFields = form.getFields();

    // Map provided values to PDF fields
    formFields.forEach((field) => {
      const fieldName = field.getName();

      // Special handling for plant_address and main_address
      if (fieldName === "plant_address") {
        const value = selectedData["address"] || ""; // Use the same 'address' value for both fields
        field.setText(value);
        field.updateAppearances(customFont);
      }

      // For other fields based on the fieldMapping
      const pdfFieldName = Object.keys(fieldMapping).find(
        (key) => fieldMapping[key] === fieldName
      );
      if (pdfFieldName) {
        const value = selectedData[pdfFieldName] || "";
        field.setText(value);
        field.updateAppearances(customFont);
      }
    });

    // Send the modified PDF file to the client
    const pdfBytes = await pdfDoc.save();
    const compressedPdfBytes = zlib.gzipSync(pdfBytes);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="SURVEY REPORT-${
        selectedData.project_title || "Unknown"
      }.pdf"`
    );
    res.setHeader("Content-Encoding", "gzip");
    res.setHeader("Content-Length", compressedPdfBytes.length);
    res.send(compressedPdfBytes);
  } catch (error) {
    console.error("Error generating Survey Report:", error);
    res.status(500).send("Failed to generate Survey Report");
  }
});

// Check the online users and load
app.get("/api/online_users", authenticateSession, async (req, res) => {
  if (!loginStatusCollection || !userCollection) {
    console.error("Collections are not initialized.");
    return res.status(500).json({ error: "Collections are not initialized." });
  }

  try {
    const onlineUsers = await loginStatusCollection.find().toArray();

    const formattedOnlineUsers = await Promise.all(
      onlineUsers.map(async (user) => {
        const userDoc = await userCollection.findOne({ name: user.name });
        const avatar = userDoc ? userDoc.avatar : null;
        return {
          userId: user.userId,
          userName: user.userName,
          name: user.name,
          isLoggedIn: user.isLoggedIn,
          loginTime: user.loginTime,
          logoutTime: user.logoutTime,
          avatar: avatar,
        };
      })
    );

    res.status(200).json({ onlineUsers: formattedOnlineUsers });
  } catch (error) {
    console.error("Error fetching online users:", error);
    res
      .status(500)
      .json({ error: "An error occurred while fetching online users." });
  }
});

//get the data per provinces from the server
app.get("/api/get-province-data", async (req, res) => {
  try {
    // Ensure connection to the database
    if (!client.topology.isConnected()) {
      await client.connect();
    }

    const database = client.db("universe-db");
    const collection = database.collection("ucds-data");

    // Validate the input and ensure province parameter is provided
    const provinceQuery = req.query.province;
    if (!provinceQuery) {
      return res.status(400).json({ error: "Province parameter is required." });
    }

    // Capitalize the first letter of each word in the province name
    const province = capitalizeFirstLetter(provinceQuery);

    // Create a case-insensitive regex query for the specified province
    const query = { province: new RegExp(`^${province}$`, "i") };

    // Fetch data for the specified province
    const provinceData = await collection.find(query).toArray();

    if (provinceData.length === 0) {
      return res
        .status(404)
        .json({ message: `No data found for ${province}.` });
    }

    // Sort the data by Serial_No
    provinceData.sort((a, b) => (a.id_no || 0) - (b.id_no || 0));

    // Format the fetched data for the response
    const formattedData = provinceData.map((doc) => ({
      id_no: doc.id_no,
      title: doc.title,
      name: doc.name,
      address: doc.address,
      ecc_cnc: doc.ecc_cnc,
      industry_class: doc.industry_class,
      remarks: doc.remarks || "",
      industry_type: doc.industry_type || "",
      industry_subtype: doc.industry_subtype || "",
      psic_code: doc.psic_code || "",
      mbu_area: doc.mbu_area || "",
      waterbody: doc.waterbody || "",
      long: doc.long || "",
      lat: doc.lat || "",
      cong_district: doc.cong_district || "",
      street: doc.street || "",
      brgy: doc.brgy || "",
      city: doc.city || "",
      province: doc.province || "",
      emp_total: doc.emp_total || "",
      wwtf_type: doc.wwtf_type || "",
      bod: doc.bod || "",
      section_incharged: doc.section_incharged || "",
      handler: doc.handler || "",
      monitoring_sched: doc.monitoring_sched || "",
      iis_no: doc.iis_no || "",
      iis_no_2025: doc.iis_no_2025 || "",
      insp_type: doc.insp_type || "",
      date_monitored: doc.date_monitored || "",
      date_routed: doc.date_routed || "",
      date_signed: doc.date_signed || "",
      days_dmds: doc.days_dmds || "",
      days_drds: doc.days_drds || "",
      pismu_tracking: doc.pismu_tracking || "",
      title_status: doc.title_status || "",
      with_nov: doc.with_nov || "",
      permit_process: doc.permit_process || "",
      date_amended: doc.date_amended || "",
      date_approved: doc.date_approved || "",
      pto_code: doc.pto_code || "",
      pto_issued: doc.pto_issued || "",
      pto_expiration: doc.pto_expiration || "",
      wwdp_code: doc.wwdp_code || "",
      wwdp_issued: doc.wwdp_issued || "",
      wwdp_expiration: doc.wwdp_expiration || "",
      haz_id: doc.haz_id || "",
      haz_issued: doc.haz_issued || "",
      pco_no: doc.pco_no || "",
      pco_name: doc.pco_name || "",
      pco_validity: doc.pco_validity || "",
      docket_no: doc.docket_no || "",
      denr_pab_case_no: doc.denr_pab_case_no || "",
      nov_issued: doc.nov_issued || "",
      v_pd1586: doc.v_pd1586 || "",
      v_ra9275: doc.v_ra9275 || "",
      v_ra8749: doc.v_ra8749 || "",
      v_ra6969_haz: doc.v_ra6969_haz || "",
      v_ra6969_tchem: doc.v_ra6969_tchem || "",
      tc_date_actual: doc.tc_date_actual || "",
      legal_officer: doc.legal_officer || "",
      tc_compliance_link: doc.tc_compliance_link || "",
      pos_paper: doc.pos_paper || "",
      penalty_date: doc.penalty_date || "",
      amount: doc.amount || "",
      or_number: doc.or_number || "",
      tc_commitment: doc.commitment || "",
      other_tc_remarks: doc.other_tc_remarks || "",
      resolution_issued: doc.resolution || "",
      order_issued: doc.order || "",
      order_status: doc.order_status || "",
      color: doc.color || "",
    }));

    return res.status(200).json(formattedData);
  } catch (error) {
    console.error("Error retrieving data:", error);
    return res
      .status(500)
      .json({ error: "Failed to retrieve data. Please try again later." });
  }
});

//get the data per provinces from the server
app.get("/api/extract-province-data", async (req, res) => {
  try {
    // Ensure connection to the database
    if (!client.topology.isConnected()) {
      await client.connect();
    }

    const database = client.db("universe-db");
    const collection = database.collection("ucds-data");

    await collection.createIndex({ description: "text" });
    const { province, keyword, startDate, endDate } = req.query;

    let query = {};

    if (keyword) {
      query.$text = { $search: keyword };
    }

    if (startDate && endDate) {
      query.date_approved = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    if (province && province !== "All") {
      const provinceCapitalized = capitalizeFirstLetter(province);
      query.province = new RegExp(`^${provinceCapitalized}$`, "i");
    }

    // Fetch data for the specified province
    const provinceData = await collection.find(query).toArray();

    if (provinceData.length === 0) {
      return res
        .status(404)
        .json({ message: `No data found for ${province}.` });
    }

    // Sort the data by Serial_No
    provinceData.sort((a, b) => (a.id_no || 0) - (b.id_no || 0));

    // Format the fetched data for the response
    const formattedData = provinceData.map((doc) => ({
      id_no: doc.id_no,
      title: doc.title,
      name: doc.name,
      address: doc.address,
      ecc_cnc: doc.ecc_cnc,
      industry_class: doc.industry_class,
      remarks: doc.remarks_recommendations || "",
      industry_type: doc.industry_type || "",
      industry_subtype: doc.industry_subtype || "",
      psic_code: doc.psic_code || "",
      mbu_area: doc.mbu_area || "",
      waterbody: doc.waterbody || "",
      long: doc.long || "",
      lat: doc.lat || "",
      cong_district: doc.cong_district || "",
      street: doc.street || "",
      brgy: doc.brgy || "",
      city: doc.city || "",
      province: doc.province || "",
      emp_total: doc.emp_total || "",
      wwtf_type: doc.wwtf_type || "",
      bod: doc.bod || "",
      section_incharged: doc.section_incharged || "",
      handler: doc.handler || "",
      monitoring_sched: doc.monitoring_sched || "",
      iis_no: doc.iis_no || "",
      iis_no_2025: doc.iis_no_2025 || "",
      insp_type: doc.insp_type || "",
      date_monitored: doc.date_monitored || "",
      date_routed: doc.date_routed || "",
      date_signed: doc.date_signed || "",
      days_dmds: doc.days_dmds || "",
      days_drds: doc.days_drds || "",
      pismu_tracking: doc.pismu_tracking || "",
      title_status: doc.title_status || "",
      with_nov: doc.with_nov || "",
      permit_process: doc.permit_process || "",
      date_amended: doc.date_amended || "",
      date_approved: doc.date_approved || "",
      pto_code: doc.pto_code || "",
      pto_issued: doc.pto_issued || "",
      pto_expiration: doc.pto_expiration || "",
      wwdp_code: doc.wwdp_code || "",
      wwdp_issued: doc.wwdp_issued || "",
      wwdp_expiration: doc.wwdp_expiration || "",
      haz_id: doc.haz_id || "",
      haz_issued: doc.haz_issued || "",
      pco_no: doc.pco_no || "",
      pco_name: doc.pco_name || "",
      pco_validity: doc.pco_validity || "",
      docket_no: doc.docket_no || "",
      denr_pab_case_no: doc.denr_pab_case_no || "",
      nov_issued: doc.nov_issued || "",
      v_pd1586: doc.v_pd1586 || "",
      v_ra9275: doc.v_ra9275 || "",
      v_ra8749: doc.v_ra8749 || "",
      v_ra6969_haz: doc.v_ra6969_haz || "",
      v_ra6969_tchem: doc.v_ra6969_tchem || "",
      tc_date_actual: doc.tc_date_actual || "",
      legal_officer: doc.legal_officer || "",
      tc_compliance_link: doc.tc_compliance_link || "",
      pos_paper: doc.pos_paper || "",
      penalty_date: doc.penalty_date || "",
      amount: doc.amount || "",
      or_number: doc.or_number || "",
      tc_commitment: doc.commitment || "",
      other_tc_remarks: doc.other_tc_remarks || "",
      resolution_issued: doc.resolution || "",
      order_issued: doc.order || "",
      order_status: doc.order_status || "",
      color: doc.color || "",
    }));

    return res.status(200).json(formattedData);
  } catch (error) {
    console.error("Error retrieving data:", error);
    return res
      .status(500)
      .json({ error: "Failed to retrieve data. Please try again later." });
  }
});

app.get("/api/users", async (req, res) => {
  const { username } = req.query; // Get the username from the query parameters
  //console.log("Querying for username:", username); // Log the queried username
  try {
    const query = username ? { username } : {};
    const users = await userCollection.find(query).toArray();

    if (username && users.length === 0) {
      return res.status(404).json({ message: "User  not found" });
    }

    res.json(users);
  } catch (error) {
    console.error("Error fetching user data:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Fetch all login statuses
app.get("/api/login-status", async (req, res) => {
  try {
    const loginStatuses = await loginStatusCollection.find({}).toArray();
    res.json(loginStatuses);
  } catch (error) {
    console.error("Error fetching login statuses:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

//generate a random password
app.get("/api/generate-password", (req, res) => {
  const password = generateRandomPassword(8);
  res.json({ password });
});

// Define route to fetch signup data
app.get("/api/sign-up", async (req, res) => {
  try {
    const users = await signUpCollection.find().toArray(); // Fetch all users from the "user" collection
    res.json(users); // Return the users as JSON
  } catch (error) {
    console.error("Error fetching user data:", error);
    res.status(500).json({ error: "Internal Server Error" }); // Return 500 status code for internal server error
  }
});

app.get("/api/user/avatar", async (req, res) => {
  try {
    const name = req.query.name;
    if (!name) {
      return res.status(400).json({ error: "Name parameter is required" }); // Return 400 if name is not provided
    }

    const user = await userCollection.findOne({ username: name }); // Ensure field name matches your database schema
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const avatar = user.avatar; // Ensure the field name matches your schema
    if (avatar) {
      res.json({ avatar });
    } else {
      res.status(404).json({ error: "Avatar not found" }); // Handle case where avatar field is missing
    }
  } catch (error) {
    console.error("Error fetching user avatar:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Example API endpoint to fetch monitored dates
app.get("/api/monitored_dates", async (req, res) => {
  try {
    const monitoredDates = await ucdsCollection
      .find({
        title: { $exists: true, $ne: "" },
        date_monitored: { $exists: true, $ne: "" },
      })
      .project({ title: 1, date_monitored: 1 })
      .toArray();

    res.status(200).json({ monitoredDates });
  } catch (error) {
    console.error("Error fetching monitored dates:", error);
    res
      .status(500)
      .json({ error: "An error occurred while fetching monitored dates." });
  }
});

app.get("/api/daily_notices", async (req, res) => {
  try {
    const notices = await dailyNoticesCollection
      .find(
        { date_monitored: { $exists: true, $ne: "" } },
        {
          projection: {
            date_monitored: 1,
            title: 1,
            address: 1,
            industry_class: 1,
            date_routed: 1,
            date_signed: 1,
            iis_no: 1,
            section_incharge: 1,
            fmr_section_incharged: 1, // Ensure these fields are included
            handler: 1,
            monitoring_sched: 1,
            insp_type: 1,
            remarks_recommendation: 1,
            _id: 0,
          },
        }
      )
      .toArray();

    res.json({ notices });
  } catch (error) {
    console.error("Error fetching daily notices:", error);
    res
      .status(500)
      .json({ error: "An error occurred while fetching daily notices." });
  }
});

app.get("/api/postings", async (req, res) => {
  try {
    const postings = await postingCollection.find().toArray();
    res.json(postings);
  } catch (error) {
    console.error("Error fetching postings data:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/api/ucds-data/:id", async (req, res) => {
  const { id } = req.params;

  // Validate id parameter
  if (
    !id ||
    (!id.startsWith("AU-") &&
      !id.startsWith("BA-") &&
      !id.startsWith("BU-") &&
      !id.startsWith("NE-") &&
      !id.startsWith("PA-") &&
      !id.startsWith("TA-") &&
      !id.startsWith("ZA-"))
  ) {
    return res
      .status(400)
      .json({ error: "Valid ID parameter with a correct prefix is required" });
  }

  try {
    // Strip the prefix and convert the remaining part to a number
    const idNumber = parseInt(id.replace(/[A-Za-z-]/g, ""), 10); // Remove letters and dashes

    if (isNaN(idNumber)) {
      return res.status(400).json({ error: "Invalid ID number" });
    }

    // Query the database
    const data = await ucdsCollection.findOne({ id_no: idNumber });

    if (!data) {
      return res.status(404).json({ error: "Data not found" });
    } else {
      return res.json(data);
    }
  } catch (error) {
    console.error("Error fetching data:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/api/survey-data/:id", async (req, res) => {
  const { id } = req.params;

  //console.log(`Received request for id: ${id}`);

  // Validate id parameter
  if (!id || isNaN(id)) {
    return res.status(400).json({ error: "Valid ID parameter is required" });
  }

  try {
    // Convert id to a number
    const idNumber = parseInt(id, 10);

    // Query the database
    const data = await surveyCollection.findOne({ id_no: idNumber });

    //console.log(`Data found: ${JSON.stringify(data)}`);

    if (!data) {
      return res.status(404).json({ error: "Data not found" });
    } else {
      return res.json(data);
    }
  } catch (error) {
    console.error("Error fetching data:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/api/logs", async (req, res) => {
  try {
    const username = req.query.username;
    const permission = req.query.permission;
    let filter = {};

    if (username) {
      filter.username = username;
    }

    if (permission === "admin" || permission === "developer") {
      // No filter for admin and developer users
    } else {
      filter.actionType = { $nin: ["Generic Action", "Patch"] };
    }

    // Count the total number of logs
    const totalLogs = await activityLogsCollection.countDocuments(filter);

    //console.log(`Total logs: ${totalLogs}`);

    // Fetch all logs from the collection that match the filter
    const cursor = activityLogsCollection.find(filter).batchSize(1000);
    const logs = await cursor.toArray();

    res.status(200).json(logs);
  } catch (error) {
    console.error("Error fetching logs:", error);
    res.status(500).json({ error: "An unexpected error occurred." });
  }
});

// API endpoint to get the encoded and updated firms count for the current user
app.get("/api/firm-count", authenticateSession, async (req, res) => {
  try {
    const userId = req.user.id;
    const encodedCount = await ucdsCollection.countDocuments({
      userId: new ObjectId(userId),
    });
    const updatedCount = await surveyCollection.countDocuments({
      userId: new ObjectId(userId),
    });

    res.json({
      encodedFirms: encodedCount,
      updatedFirms: updatedCount,
    });
  } catch (error) {
    console.error("Error fetching firm counts:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// API endpoint to get recent activity data for the current user
app.get("/api/recent-activity", authenticateSession, async (req, res) => {
  try {
    if (!req.session.user || !req.session.user.userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId = req.session.user.userId;
    const recentActivity = await ucdsCollection
      .find({ userId: new ObjectId(userId) })
      .sort({ timestamp: -1 })
      .limit(5)
      .toArray();

    res.json(recentActivity);
  } catch (error) {
    console.error("Error fetching recent activity:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/api/survey-log", async (req, res) => {
  const { iis_no } = req.query;
  try {
    // If iis_no is provided, filter by it; otherwise, return all logs
    const query = iis_no ? { newValue: { $regex: iis_no, $options: "i" } } : {};

    const logs = await surveyLogCollection.find(query).toArray();

    if (logs.length === 0) {
      //console.log("No logs found for the provided iis_no or no logs available.");
      return res.status(200).json([]); // Return an empty array if no logs are found
    } else {
      //console.log("Fetched logs from database:", logs); // Log the fetched logs
      return res.status(200).json(logs); // Return the fetched logs
    }
  } catch (error) {
    console.error("Error fetching survey logs:", error);
    return res.status(500).send("Internal Server Error");
  }
});

app.get("/api/ucds-log", async (req, res) => {
  const { ecc_cnc } = req.query;
  try {
    // If iis_no is provided, filter by it; otherwise, return all logs
    const query = ecc_cnc
      ? { newValue: { $regex: ecc_cnc, $options: "i" } }
      : {};

    const logs = await ucdsLogCollection.find(query).toArray();

    if (logs.length === 0) {
      return res.status(200).json([]);
    } else {
      return res.status(200).json(logs); // Return the fetched logs
    }
  } catch (error) {
    console.error("Error fetching survey logs:", error);
    return res.status(500).send("Internal Server Error");
  }
});

// Get the latest transaction ID from the survey-log collection
app.get("/api/get-latest-transaction-id", async (req, res) => {
  try {
    const database = client.db("universe-db");
    const collection = database.collection("survey-log");

    const latestTransactionId = await collection
      .find()
      .sort({ transactionID: -1 })
      .limit(1)
      .toArray();

    if (latestTransactionId.length > 0) {
      const transactionId = latestTransactionId[0].transactionID;
      const id = parseInt(transactionId.replace("TRX-", ""));
      res.status(200).json({ transactionId: id });
    } else {
      res.status(200).json({ transactionId: 0 }); // Return 0 if no documents are found
    }
  } catch (error) {
    console.error("Error getting latest transaction ID:", error);
    res.status(500).json({ error: "Failed to get latest transaction ID" });
  }
});

app.get("/api/project_type", async (req, res) => {
  const { industry_class } = req.query;

  try {
    const projectData = await projectTypeCollection.findOne({
      industry_class: industry_class,
    });

    if (projectData) {
      res.status(200).json(projectData);
    } else {
      res
        .status(404)
        .json({ message: "No project type found for this industry class" });
    }
  } catch (error) {
    console.error("Error fetching project data:", error);
    res
      .status(500)
      .json({ error: "An error occurred while fetching project data." });
  }
});

// Endpoint to get longitude and latitude data from ucdsCollection
app.get("/api/ucds", async (req, res) => {
  try {
    const data = await ucdsCollection
      .find({}, { projection: { lat: 1, long: 1, name: 1, _id: 0 } })
      .toArray();
    res.json(data);
  } catch (error) {
    console.error("Error fetching data from ucdsCollection:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// API endpoint to get the total count of UCDs
app.get("/api/ucds/count", async (req, res) => {
  try {
    const count = await ucdsCollection.countDocuments(); // Get the total count of documents
    res.json(count); // Send the count as a JSON response
  } catch (error) {
    console.error("Error fetching UCD count:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/api/healthcare", async (req, res) => {
  try {
    const healthcareData = await healthcareCollection.find({}).toArray();
    res.status(200).json(healthcareData);
  } catch (error) {
    console.error("Error fetching healthcare data:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/api/chemicals", async (req, res) => {
  try {
    const chemicalData = await chemicalCollection.find({}).toArray();
    res.status(200).json(chemicalData);
  } catch (error) {
    console.error("Error fetching chemical data:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/api/tsd", async (req, res) => {
  try {
    const tsdData = await tsdCollection.find({}).toArray();
    res.status(200).json(tsdData);
  } catch (error) {
    console.error("Error fetching chemical data:", error);
    res.status(500).send("Internal Server Error");
  }
});

//Update the data per provinces
app.put("/api/update-data/:id", logActivity, async (req, res) => {
  try {
    const { id } = req.params;
    const newData = req.body;
    const updatedBy = req.body.updated_by; // Assuming you pass the user who updated the data

    // Ensure connection to the database
    if (!client.topology.isConnected()) {
      await client.connect();
    }

    const database = client.db("universe-db");
    const collection = database.collection("ucds-data");

    // Fetch the existing document before updating
    const oldDocument = await collection.findOne({ id_no: parseInt(id) });

    if (!oldDocument) {
      return res.status(404).json({ error: "Data not found" });
    }

    // Perform the update operation
    const result = await collection.updateOne(
      { id_no: parseInt(id) },
      { $set: newData }
    );

    if (result.modifiedCount === 1) {
      // If the update was successful, create an audit log
      const updatedDocument = await collection.findOne({ id_no: parseInt(id) });

      // Create an audit log to track changes
      const auditLog = {
        updated_by: updatedBy,
        updated_at: new Date(),
        ecc_cnc: newData.ecc_cnc, // Include the ecc_cnc if relevant to your data
        changes: [],
      };

      // Compare old and new data to find changes
      Object.keys(newData).forEach((key) => {
        if (oldDocument[key] !== newData[key]) {
          auditLog.changes.push({
            field: key,
            old_value: oldDocument[key],
            new_value: newData[key],
          });
        }
      });

      // Return the audit log in the response
      res.status(200).json(auditLog);
    } else if (result.matchedCount === 1 && result.modifiedCount === 0) {
      res.status(200).json({ message: "No changes were made to the data" });
    } else {
      res.status(404).json({ error: "Data not found or no changes were made" });
    }
  } catch (error) {
    console.error("Error updating data:", error);
    res
      .status(500)
      .json({ error: "Failed to update data. Please try again later." });
  }
});

app.put("/api/update-healthcare/:id", logActivity, async (req, res) => {
  try {
    const { id } = req.params;
    const newData = req.body; // This should contain the updated data
    const updatedBy = req.body.updated_by; // Assuming the user who updated the data is passed

    // Ensure connection to the database
    if (!client.topology.isConnected()) {
      await client.connect();
    }

    const database = client.db("universe-db");
    const collection = database.collection("ucds-data-healthcare");

    // Fetch the existing document before updating
    const oldDocument = await collection.findOne({ id_no: parseInt(id) });

    if (!oldDocument) {
      return res.status(404).json({ error: "Healthcare data not found" });
    }

    // Perform the update operation
    const result = await collection.updateOne(
      { id_no: parseInt(id) },
      { $set: newData }
    );

    if (result.modifiedCount === 1) {
      // If the update was successful, create an audit log
      const updatedDocument = await collection.findOne({ id_no: parseInt(id) });

      // Create an audit log to track changes
      const auditLog = {
        updated_by: updatedBy,
        updated_at: new Date(),
        changes: [],
      };

      // Compare old and new data to find changes
      Object.keys(newData).forEach((key) => {
        if (oldDocument[key] !== newData[key]) {
          auditLog.changes.push({
            field: key,
            old_value: oldDocument[key],
            new_value: newData[key],
          });
        }
      });

      // Save audit log into a separate collection (optional)
      const auditCollection = database.collection("audit-log");
      await auditCollection.insertOne(auditLog);

      res
        .status(200)
        .json({ message: "Healthcare data updated successfully", auditLog });
    } else if (result.matchedCount === 1 && result.modifiedCount === 0) {
      res
        .status(200)
        .json({ message: "No changes were made to the healthcare data" });
    } else {
      res
        .status(404)
        .json({ error: "Healthcare data not found or no changes were made" });
    }
  } catch (error) {
    console.error("Error updating healthcare data:", error);
    res.status(500).json({
      error: "Failed to update healthcare data. Please try again later.",
    });
  }
});

app.put("/api/update-chemical/:id", logActivity, async (req, res) => {
  try {
    const { id } = req.params;
    const newData = req.body; // This should contain the updated data
    const updatedBy = req.body.updated_by; // Assuming the user who updated the data is passed

    // Ensure connection to the database
    if (!client.topology.isConnected()) {
      await client.connect();
    }

    const database = client.db("universe-db");
    const collection = database.collection("ucds-data-chemicals");

    // Fetch the existing document before updating
    const oldDocument = await collection.findOne({ id_no: parseInt(id) });

    if (!oldDocument) {
      return res.status(404).json({ error: "Chemical data not found" });
    }

    // Perform the update operation
    const result = await collection.updateOne(
      { id_no: parseInt(id) },
      { $set: newData }
    );

    if (result.modifiedCount === 1) {
      // If the update was successful, create an audit log
      const updatedDocument = await collection.findOne({ id_no: parseInt(id) });

      // Create an audit log to track changes
      const auditLog = {
        updated_by: updatedBy,
        updated_at: new Date(),
        changes: [],
      };

      // Compare old and new data to find changes
      Object.keys(newData).forEach((key) => {
        if (oldDocument[key] !== newData[key]) {
          auditLog.changes.push({
            field: key,
            old_value: oldDocument[key],
            new_value: newData[key],
          });
        }
      });

      // Save audit log into a separate collection (optional)
      const auditCollection = database.collection("audit-log");
      await auditCollection.insertOne(auditLog);

      res
        .status(200)
        .json({ message: "Chemical data updated successfully", auditLog });
    } else if (result.matchedCount === 1 && result.modifiedCount === 0) {
      res
        .status(200)
        .json({ message: "No changes were made to the chemical data" });
    } else {
      res
        .status(404)
        .json({ error: "Chemical data not found or no changes were made" });
    }
  } catch (error) {
    console.error("Error updating chemicale data:", error);
    res.status(500).json({
      error: "Failed to update chemical data. Please try again later.",
    });
  }
});

app.put("/api/update-tsd/:id", logActivity, async (req, res) => {
  try {
    const { id } = req.params;
    const newData = req.body; // This should contain the updated data
    const updatedBy = req.body.updated_by; // Assuming the user who updated the data is passed

    // Ensure connection to the database
    if (!client.topology.isConnected()) {
      await client.connect();
    }

    const database = client.db("universe-db");
    const collection = database.collection("ucds-data-tsd");

    // Fetch the existing document before updating
    const oldDocument = await collection.findOne({ id_no: parseInt(id) });

    if (!oldDocument) {
      return res.status(404).json({ error: "TSD data not found" });
    }

    // Perform the update operation
    const result = await collection.updateOne(
      { id_no: parseInt(id) },
      { $set: newData }
    );

    if (result.modifiedCount === 1) {
      // If the update was successful, create an audit log
      const updatedDocument = await collection.findOne({ id_no: parseInt(id) });

      // Create an audit log to track changes
      const auditLog = {
        updated_by: updatedBy,
        updated_at: new Date(),
        changes: [],
      };

      // Compare old and new data to find changes
      Object.keys(newData).forEach((key) => {
        if (oldDocument[key] !== newData[key]) {
          auditLog.changes.push({
            field: key,
            old_value: oldDocument[key],
            new_value: newData[key],
          });
        }
      });

      // Save audit log into a separate collection (optional)
      const auditCollection = database.collection("audit-log");
      await auditCollection.insertOne(auditLog);

      res
        .status(200)
        .json({ message: "TSD data updated successfully", auditLog });
    } else if (result.matchedCount === 1 && result.modifiedCount === 0) {
      res.status(200).json({ message: "No changes were made to the tsd data" });
    } else {
      res
        .status(404)
        .json({ error: "TSD data not found or no changes were made" });
    }
  } catch (error) {
    console.error("Error updating tsd data:", error);
    res.status(500).json({
      error: "Failed to update tsd data. Please try again later.",
    });
  }
});

// Update users data from admin panel
app.put("/api/users/:id", logActivity, async (req, res) => {
  try {
    const { id } = req.params;
    const updatedUser = req.body;

    // Ensure the provided ID is a valid MongoDB ObjectId
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    // Extract avatar from the request body
    const { avatar } = updatedUser;

    // Exclude the _id and avatar fields from the general user update
    delete updatedUser._id;
    delete updatedUser.avatar; // Exclude avatar from general user update

    // Prepare the update operation for user data
    const updateOperation = { $set: updatedUser };

    // If there is an avatar URL in the request body, update it separately
    if (avatar) {
      // Update avatar URL for the user
      updateOperation.$set.avatar = avatar;
    }

    // Perform the general user update including the avatar, if provided
    const result = await userCollection.updateOne(
      { _id: new ObjectId(id) },
      updateOperation
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ message: "User updated successfully" });
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.put("/api/profile/update/:id", logActivity, async (req, res) => {
  try {
    const { id } = req.params;
    const updatedUser = req.body;

    // Ensure the provided ID is a valid MongoDB ObjectId
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    // Prepare the update operation for user data
    const updateOperation = { $set: updatedUser };

    // Perform the general user update
    const result = await userCollection.updateOne(
      { _id: new ObjectId(id) },
      updateOperation
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ message: "User updated successfully" });
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.put("/api/status/:id", logActivity, async (req, res) => {
  try {
    const { id } = req.params;

    // Ensure the provided ID is a valid MongoDB ObjectId
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    // Update status in 'sign-up' collection to the new status sent from the frontend
    const { status } = req.body;

    const updateResult = await signUpCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status } }
    );

    if (updateResult.matchedCount === 0) {
      return res
        .status(404)
        .json({ error: "User not found in sign-up collection" });
    }

    res.json({ message: "Status updated successfully in sign-up collection" });
  } catch (error) {
    console.error("Error updating status:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.put("/api/survey/:id", logActivity, async (req, res) => {
  const { id } = req.params;
  const update = req.body;

  try {
    // Fetch the current record by _id
    const currentRecord = await surveyCollection.findOne({
      _id: new ObjectId(id),
    });
    //console.log("Current Record Before Update:", currentRecord);

    if (!currentRecord) {
      return res.status(404).json({ message: "Record not found" });
    }

    // Update the record using _id
    const result = await surveyCollection.updateOne(
      { _id: new ObjectId(id) }, // Find by '_id'
      {
        $set: update,
      }
    );

    // Fetch the updated record
    const updatedRecord = await surveyCollection.findOne({
      _id: new ObjectId(id),
    });
    //console.log("Updated Record After Update:", updatedRecord);

    if (result.modifiedCount > 0) {
      return res.status(200).json({ message: "Update successful!" });
    } else {
      return res
        .status(404)
        .json({ message: "No changes made or record not found" });
    }
  } catch (error) {
    //console.error("Error updating record:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

app.put("/api/update-survey-data/:id", logActivity, async (req, res) => {
  try {
    const { id } = req.params;
    const newData = req.body;
    const iisNo = req.body.iis_no;
    const updatedBy = req.body.updated_by;

    const database = client.db("universe-db");

    // Extract year from iis_no (format: R3-YYYY-XXXXX)
    const match = iisNo.match(/R3-(\d{4})-/);
    const year = match ? match[1] : null;

    if (!year) {
      return res.status(400).json({ error: "Invalid iis_no format." });
    }

    // Determine collection based on extracted year
    const collectionName = `survey-data-${year}`;
    const collection = database.collection(collectionName);

    // Convert id to the correct type
    const recordId = isNaN(id) ? id.toString() : parseInt(id);

    // Retrieve the old document from the correct collection
    const oldDocument = await collection.findOne({ id_no: recordId });

    if (!oldDocument) {
      return res
        .status(404)
        .json({ error: `Record not found in ${collectionName}.` });
    }

    // Perform the update
    await collection.updateOne({ id_no: recordId }, { $set: newData });

    // Fetch the updated document
    const updatedDocument = await collection.findOne({ id_no: recordId });

    // Build the audit log
    const auditLog = {
      updated_by: updatedBy,
      updated_at: new Date(),
      iis_no: iisNo,
      changes: [],
    };

    // Compare old and new data
    Object.keys(newData).forEach((key) => {
      if (oldDocument[key] !== newData[key]) {
        auditLog.changes.push({
          field: key,
          old_value: oldDocument[key] || "N/A",
          new_value: newData[key] || "N/A",
        });
      }
    });

    console.log(`Audit Log for ${collectionName}:`, auditLog);

    // Return the audit log object in the response
    res.status(200).json(auditLog);
  } catch (error) {
    console.error("Error updating data:", error);
    res
      .status(500)
      .json({ error: "Failed to update data. Please try again later." });
  }
});

app.put(
  "/api/postings/:id",
  logActivity,
  authenticateSession,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { title, message, acknowledgement, iconType, date } = req.body;
      const updateResult = await postingCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            title,
            message,
            acknowledgement,
            iconType,
            createdDate: new Date(date), // Ensure date is handled correctly
          },
        }
      );

      if (updateResult.matchedCount === 0) {
        return res.status(404).json({ error: "Posting not found" });
      }

      res.json({ message: "Posting updated successfully" });
    } catch (error) {
      console.error("Error updating posting:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }
);

app.patch("/api/postings/:id", logActivity, async (req, res) => {
  try {
    const { id } = req.params;
    const { isRead, showAgain } = req.body;

    const updateFields = {};
    if (isRead !== undefined) updateFields.isRead = isRead;
    if (showAgain !== undefined) updateFields.showAgain = showAgain;

    await postingCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateFields }
    );
    res.json({ message: "Announcement updated" });
  } catch (error) {
    console.error("Error updating announcement:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.patch("/api/surveys/:id", async (req, res) => {
  const id = req.params.id;
  const color = req.body.color;

  try {
    const filter = { id_no: parseInt(id) };
    const update = { $set: { color } };

    const result = await surveyCollection.updateOne(filter, update);
    if (result.matchedCount === 0) {
      res.status(404).json({ message: "Survey not found" });
    } else {
      const survey = await surveyCollection.findOne(filter);
      res.json(survey);
    }
  } catch (error) {
    console.error("Error updating row color:", error.message);
    res.status(500).json({ message: "Error updating row color" });
  }
});

// Update user privileges API using email
app.patch("/api/users/:email/permissions", async (req, res) => {
  const { email } = req.params;
  // console.log("Received email:", email);
  // console.log("Request body:", req.body);

  const {
    canViewAdminPanel,
    canViewDataHistory,
    canManageData,
    canGenerateData,
    canAccessRangePicker,
  } = req.body;

  try {
    // Check if the user exists
    const user = await userCollection.findOne({ email: email });
    if (!user) {
      return res.status(404).json({ message: "User  not found" });
    }

    // Update the permissions
    const result = await userCollection.updateOne(
      { email: email },
      {
        $set: {
          canViewAdminPanel,
          canViewDataHistory,
          canManageData,
          canGenerateData,
          canAccessRangePicker,
        },
      }
    );

    // Check if any document was modified
    if (result.modifiedCount === 0) {
      return res.status(204).send(); // No content if no changes were made
    }

    res.status(200).json({ message: "User  permissions updated successfully" });
  } catch (error) {
    console.error("Error updating user permissions:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.patch("/api/users/:email/province-permissions", async (req, res) => {
  const { email } = req.params;
  const provincePermissions = req.body;

  try {
    // Check if the user exists
    const user = await userCollection.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User  not found" });
    }

    // Update the province permissions
    const result = await userCollection.updateOne(
      { email },
      {
        $set: provincePermissions, // Dynamically apply the provinces
      }
    );

    // Check if any document was modified
    if (result.modifiedCount === 0) {
      return res.status(204).json({ message: "No changes applied." });
    }

    res
      .status(200)
      .json({ message: "Province permissions updated successfully." });
  } catch (error) {
    console.error("Error updating province permissions:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/////////////////////////////////////////////////////////////////

app.delete("/api/postings/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await postingCollection.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Posting not found" });
    }

    res.json({ message: "Posting deleted successfully" });
  } catch (error) {
    console.error("Error deleting posting:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Assuming you have a user collection
app.delete("/api/remove-user/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await signUpCollection.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 1) {
      res.status(200).send({ message: "User removed successfully" });
    } else {
      res.status(404).send({ message: "User not found" });
    }
  } catch (error) {
    console.error("Error removing user:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

app.delete("/api/transaction/:transactionID", async (req, res) => {
  const { transactionID } = req.params;

  try {
    // Use transactionID directly in the query
    const result = await ucdsLogCollection.deleteOne({
      transactionID: transactionID,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    res.json({ message: "Transaction deleted successfully" });
  } catch (error) {
    console.error("Error deleting transaction:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.delete("/api/survey-transaction/:transactionID", async (req, res) => {
  const { transactionID } = req.params;

  try {
    // Use transactionID directly in the query
    const result = await surveyLogCollection.deleteOne({
      transactionID: transactionID,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    res.json({ message: "Transaction deleted successfully" });
  } catch (error) {
    console.error("Error deleting transaction:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/////////////////////////////////////////////////////////////////

// Start server
app.listen(8081, () => {
  console.log(`Server running on port ${PORT}`);
});

// Handle graceful shutdown
process.on("SIGINT", () => {
  if (client.isConnected()) {
    client.close();
    console.log("MongoDB connection closed");
  }
  process.exit();
});
