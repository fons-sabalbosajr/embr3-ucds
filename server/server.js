const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcrypt");
const session = require("express-session");
const { MongoClient, ObjectId, GridFSBucket } = require("mongodb");
const fs = require("fs");
const path = require("path");
const { PDFDocument, rgb } = require("pdf-lib");
const dayjs = require('dayjs'); // For server-side date parsing
const customParseFormat = require('dayjs/plugin/customParseFormat'); // For "MMMM YYYY"
dayjs.extend(customParseFormat);
const fontkit = require("@pdf-lib/fontkit");
const zlib = require("zlib");
const dotenv = require("dotenv").config();
const multer = require("multer");
const MongoStore = require("connect-mongo");
const cron = require("node-cron");
const nodemailer = require("nodemailer"); // Nodemailer for sending emails
const crypto = require("crypto"); // Crypto for generating a reset token
const bodyParser = require("body-parser");

const app = express();
const router = express.Router();
app.use(bodyParser.json());
const PORT = process.env.PORT || 8081;

//#region FUNCTIONS

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

// Date parsing and expiry check utility functions (moved for wider use)
const parseDateStringForStats = (dateStrInput) => {
  if (!dateStrInput || typeof dateStrInput !== "string") {
    return null;
  }
  let originalTrimmedStr = dateStrInput.trim();

  // Check 1: YYYY-YYYY range (on original trimmed string, prioritized).
  // This regex `(\d{4})-(\d{4})` will find the first occurrence.
  const generalYearRangeMatch = originalTrimmedStr.match(/(\d{4})-(\d{4})/);
  if (generalYearRangeMatch) {
    const endYear = parseInt(generalYearRangeMatch[2], 10);
    if (endYear >= 1900 && endYear < 2100) {
      return new Date(endYear, 11, 31); // December 31st of the end year
    }
  }

  // Check 2: Non-date keywords (on the original trimmed string)
  const nonDateKeywords = [
    "n/a",
    "pending",
    "approval",
    "ongoing",
    "application",
    "for approval",
    "verification",
    "unknown",
    "none",
    "---",
    "not applicable",
    "coa no",
    "ref no",
    "dp-r03",
    "fla-",
    "lexie's farm",
    "in-process",
    "app. no",
    "for verification",
    "new designated pco",
    "contact person",
  ];
  if (
    nonDateKeywords.some((keyword) =>
      originalTrimmedStr.toLowerCase().includes(keyword)
    )
  ) {
    return null;
  }

  // Check 3: Other specific non-date patterns (on original trimmed string)
  if (/^#+$/.test(originalTrimmedStr)) return null;
  if (/^\d{1,2}\/\d{1,2}\/\-\d{4}$/.test(originalTrimmedStr)) return null; // e.g., "01/12/-2022"

  const lines = originalTrimmedStr.split(/[\n\r]/);
  let dateStr = lines[0].trim(); // `dateStr` is now first line only.
  let d = new Date(dateStr);
  if (d instanceof Date && !isNaN(d)) {
    const year = d.getFullYear();
    if (year > 1900 && year < 2100) {
      // Basic sanity check for year
      return d;
    }
  }

  const dmyMatch = dateStr.match(/^(\d{1,2})[/\-\.](\d{1,2})[/\-\.](\d{4})$/);
  if (dmyMatch) {
    const p1 = parseInt(dmyMatch[1], 10); // part1
    const p2 = parseInt(dmyMatch[2], 10); // part2
    const year = parseInt(dmyMatch[3], 10);

    if (year > 1900 && year < 2100) {
      // Try MM/DD/YYYY
      if (p1 >= 1 && p1 <= 12 && p2 >= 1 && p2 <= 31) {
        const testDate = new Date(year, p1 - 1, p2); // month is 0-indexed
        if (
          testDate.getFullYear() === year &&
          testDate.getMonth() === p1 - 1 &&
          testDate.getDate() === p2
        ) {
          return testDate;
        }
      }
      // Try DD/MM/YYYY
      if (p2 >= 1 && p2 <= 12 && p1 >= 1 && p1 <= 31) {
        const testDate = new Date(year, p2 - 1, p1); // month is 0-indexed
        if (
          testDate.getFullYear() === year &&
          testDate.getMonth() === p2 - 1 &&
          testDate.getDate() === p1
        ) {
          return testDate;
        }
      }
    }
  }

  // Attempt 3: "Month. Day, YYYY" e.g. "Oct. 26, 2022" or "October 26 2022"
  const monthDayYearMatch = dateStr.match(
    /^([A-Za-z]{3,})\.?\s*(\d{1,2}),?\s*(\d{4})$/i
  );
  if (monthDayYearMatch) {
    const cleanedForParse = `${monthDayYearMatch[1]} ${monthDayYearMatch[2]} ${monthDayYearMatch[3]}`;
    d = new Date(cleanedForParse);
    if (d instanceof Date && !isNaN(d)) {
      const year = d.getFullYear();
      if (year > 1900 && year < 2100) return d;
    }
  }

  // Attempt 4: Date followed by extraneous text (e.g., "YYYY-MM-DD some_text" or "MM/DD/YYYY some_text")
  const dateFollowedByTextMatch = dateStr.match(
    /^(\d{4}-\d{2}-\d{2}|\d{1,2}[/\-]\d{1,2}[/\-]\d{4})/
  );
  if (dateFollowedByTextMatch) {
    const extractedDateStr = dateFollowedByTextMatch[1];
    d = new Date(extractedDateStr);
    if (d instanceof Date && !isNaN(d)) {
      const year = d.getFullYear();
      if (year > 1900 && year < 2100) return d;
    }

    // Corrected regex for D/M/Y parsing from an extracted string part
    const dmyPatternForExtracted = /^(\d{1,2})[/\-\.](\d{1,2})[/\-\.](\d{4})$/;
    const dmyMatchForExtracted = extractedDateStr.match(dmyPatternForExtracted);
    if (dmyMatchForExtracted) {
      const p1 = parseInt(dmyMatchForExtracted[1], 10);
      const p2 = parseInt(dmyMatchForExtracted[2], 10);
      const year = parseInt(dmyMatchForExtracted[3], 10);
      if (year > 1900 && year < 2100) {
        // Try MM/DD/YYYY
        if (p1 >= 1 && p1 <= 12 && p2 >= 1 && p2 <= 31) {
          const testDate = new Date(year, p1 - 1, p2);
          if (
            testDate.getFullYear() === year &&
            testDate.getMonth() === p1 - 1 &&
            testDate.getDate() === p2
          )
            return testDate;
        }
        // Try DD/MM/YYYY
        if (p2 >= 1 && p2 <= 12 && p1 >= 1 && p1 <= 31) {
          const testDate = new Date(year, p2 - 1, p1);
          if (
            testDate.getFullYear() === year &&
            testDate.getMonth() === p2 - 1 &&
            testDate.getDate() === p1
          )
            return testDate;
        }
      }
    }
  }

  // Fallback: Try to extract any plausible 4-digit year from the original trimmed string
  // if other more specific parsers failed. This makes the year a stronger basis if full date is unclear.
  // This regex looks for a 4-digit number that looks like a year (19xx or 20xx).
  const yearMatch = originalTrimmedStr.match(/\b(19\d{2}|20\d{2})\b/);
  if (yearMatch && yearMatch[0]) {
    const extractedYear = parseInt(yearMatch[0], 10);
    // Ensure the year is within a reasonable range (e.g., 1900-2099)
    if (extractedYear >= 1900 && extractedYear < 2100) {
      return new Date(extractedYear, 11, 31); // Assume end of the extracted year (December 31st)
    }
  }

  return null; // If nothing could be reliably parsed
};

const isPermitExpired = (dateStrInput) => {
  const expiryDate = parseDateStringForStats(dateStrInput);
  if (!(expiryDate instanceof Date && !isNaN(expiryDate))) {
    return false;
  }
  const today = new Date();
  // Compare date parts only: an item expiring "on" date X is not expired until date X+1.
  const todayDateOnly = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );
  const expiryDateOnly = new Date(
    expiryDate.getFullYear(),
    expiryDate.getMonth(),
    expiryDate.getDate()
  );
  return todayDateOnly > expiryDateOnly;
};

const isPermitNearExpiry = (dateStrInput, nowDate) => {
  // Accept string, parse internally
  const expiryDate = parseDateStringForStats(dateStrInput); // Use existing robust parser
  if (!(expiryDate instanceof Date && !isNaN(expiryDate))) {
    return false;
  }
  const oneMonthBefore = new Date(expiryDate);
  oneMonthBefore.setMonth(oneMonthBefore.getMonth() - 1);

  const todayDateOnly = new Date(
    nowDate.getFullYear(),
    nowDate.getMonth(),
    nowDate.getDate()
  );
  const expiryDateOnly = new Date(
    expiryDate.getFullYear(),
    expiryDate.getMonth(),
    expiryDate.getDate()
  );

  // Near expiry if today is within the month leading up to expiry, inclusive, but not yet past.
  return (
    todayDateOnly >= oneMonthBefore &&
    todayDateOnly <= expiryDateOnly &&
    !(todayDateOnly > expiryDateOnly)
  );
};

// Helper function to build a flexible query for sort_key
function buildSortKeyQuery(idString) {
  if (typeof idString === "string" && idString.includes("-")) {
    const parts = idString.split("-");
    const prefix = parts[0];
    const numberPart = parts[1];
    if (prefix && numberPart && /^\d+$/.test(numberPart)) {
      // Ensure numberPart is numeric
      // Construct regex to match prefix, hyphen, any number of zeros (0*), then the numeric part.
      return {
        sort_key: { $regex: `^${prefix}-0*${numberPart}$`, $options: "i" },
      };
    }
  }
  // Fallback to direct match if not in expected "PREFIX-NUMBER" format,
  // if numberPart is not purely numeric, or if idString is not a string.
  return { sort_key: idString };
}

//#endregion functions setup

//#region DB CONNECTION
//////////////////////////////////////////////////////////////////////////////////////////
const allowedOrigins = ["http://localhost:5173", "http://10.14.77.100:5173"];

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
let archiveCollection;
let swmplanCollection;
let mrfCollection;
let slfCollection
let equipmentCollection;
let odsCollection;

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
    archiveCollection = db.collection("archive-data");
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
    swmplanCollection = db.collection("ucds-eswm-ten_swm_plan"); // Initialized SWM Plan collection
    swmplanCollection = db.collection("ucds-ewsm-ten_swm_plan");
    mrfCollection = db.collection("ucds-eswm-mrf");
    slfCollection = db.collection("ucds-eswm-slf");
    equipmentCollection = db.collection("ucds-eswm-equipment");
    odsCollection = db.collection("ucds-eswm-ods");

    app.locals.ucdsCollection = ucdsCollection;
    app.locals.swmplanCollection = swmplanCollection; // Made available if needed by other parts
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

//#endregion database connection

//#region AUTHENTICATION
app.use("/api", router);

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
              idNos: { $push: "$sort_key" }, // Collect all id_no values for each ecc_cnc
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

// Update multiple UCDS records
router.post("/ucds/update-duplicates", async (req, res) => {
  try {
    const ucdsCollection = req.app.locals.ucdsCollection;

    if (!ucdsCollection) {
      return res.status(500).json({ error: "Database collection not found." });
    }

    const updates = req.body.updates; // Expecting an array of updated records

    if (!Array.isArray(updates)) {
      return res.status(400).json({ error: "Invalid updates format." });
    }

    const updateOps = updates
      .map((update) => {
        const { id_no, ...rest } = update;

        if (!id_no) return null;

        return {
          updateOne: {
            filter: { id_no: id_no },
            update: { $set: rest },
          },
        };
      })
      .filter(Boolean); // Remove nulls if any

    if (updateOps.length === 0) {
      return res.status(400).json({ error: "No valid updates provided." });
    }

    const result = await ucdsCollection.bulkWrite(updateOps);
    return res
      .status(200)
      .json({ message: "Records updated successfully", result });
  } catch (error) {
    console.error("Error updating duplicates:", error);
    return res.status(500).json({ error: "Failed to update records." });
  }
});

router.post("/archive-data", async (req, res) => {
  const { id_no } = req.body;

  if (!id_no || typeof id_no !== "string" || id_no.trim() === "") {
    console.error("Invalid or missing id_no in the request body.");
    return res
      .status(400)
      .json({ message: "Invalid or missing id_no in the request body." });
  }

  //console.log(`Attempting to archive record with id_no: ${id_no}`);

  const session = client.startSession(); // Start a MongoDB session for the transaction

  try {
    await session.withTransaction(async () => {
      // Find the record in ucds-data
      const record = await ucdsCollection.findOne(
        { id_no: { $regex: `^${id_no.trim()}$`, $options: "i" } }, // Case-insensitive match
        { session } // Use the session for the transaction
      );

      if (!record) {
        console.error(`Record with id_no: ${id_no} not found in ucds-data.`);
        throw new Error(`Record with id_no: ${id_no} not found in ucds-data.`);
      }

      //console.log(`Record found: ${JSON.stringify(record)}`);

      // Insert the record into archive-data
      const archiveResult = await archiveCollection.insertOne(record, {
        session,
      });
      if (!archiveResult.acknowledged) {
        console.error("Failed to archive the record.");
        throw new Error("Failed to archive the record.");
      }

      //console.log(`Record successfully archived: ${JSON.stringify(archiveResult)}`);

      // Delete the record from ucds-data
      const deleteResult = await ucdsCollection.deleteOne(
        { _id: record._id }, // Use the unique _id field for deletion
        { session }
      );

      if (deleteResult.deletedCount === 0) {
        console.error(
          `Failed to delete the record from ucds-data. id_no: ${id_no}`
        );
        throw new Error(
          "Failed to delete the record from ucds-data after archiving."
        );
      }

      //console.log(`Record successfully deleted from ucds-data: ${JSON.stringify(deleteResult)}`);
    });

    // If the transaction completes successfully
    res
      .status(201)
      .json({ message: "Record successfully transferred to archive-data." });
  } catch (error) {
    console.error("Error transferring record:", error);
    res
      .status(500)
      .json({ message: error.message || "Failed to transfer the record." });
  } finally {
    await session.endSession(); // End the session
  }
});

router.get("/ucds-data/:identifier", async (req, res) => {
  // Changed param name for clarity
  const { identifier } = req.params; // identifier will be the sort_key, e.g., "AU-00005"

  try {
    // First, try to find the record in ucds-data using the sort_key field
    const query = buildSortKeyQuery(identifier.trim()); // Use the utility function
    let record = await ucdsCollection.findOne(query);

    if (!record) {
      // If not found in ucds-data, try archive-data using sort_key
      record = await archiveCollection.findOne(query); // Use the same query for archive

      if (!record) {
        return res.status(404).json({
          message: `Record with identifier (sort_key): ${identifier} not found.`,
        });
      }

      // Optionally, you could indicate this is from the archive
      record.archived = true;
    }

    res.status(200).json(record);
  } catch (error) {
    console.error("Error fetching record by identifier (sort_key):", error);
    res.status(500).json({ message: "Error fetching record." });
  }
});

// Define these lists on the server, ideally matching or derived from client-side needs
const monthTypeFilterFieldsForServer = [
  'date_monitored', 'date_routed', 'date_signed', 'date_amended',
  'date_approved', 'pto_issued', 'pto_expiration', 'wwdp_issued',
  'wwdp_expiration', 'haz_issued', 'nov_issued', 'penalty_date',
  'resolution_issued'
];
const yearTypeFilterFieldsForServer = ['pco_validity'];

// New route to get distinct values for dropdown fields
router.get("/ucds-data/distinct-values", async (req, res) => {
  const { field } = req.query;

  if (!field) {
    return res.status(400).json({ error: "Field query parameter is required." });
  }
  
  // Expanded whitelist to include all fields that might need distinct values for filters
  const allowedFields = [
    'industry_type', 'industry_subtype', 'industry_class', 'psic_code',
    'mbu_area', 'waterbody', 'emp_total', 'wwtf_type', 'cong_district',
    'street', 'brgy', 'city', 'section_incharged', 'handler',
    'monitoring_sched', 'insp_type', 'pismu_tracking', 'title_status',
    'with_nov', 'pismu_count_month', 'permit_process', 'denr_pab_case_no', 'legal_officer', 
    'tc_commitment', 'province',
    ...monthTypeFilterFieldsForServer, // Add month fields
    ...yearTypeFilterFieldsForServer   // Add year fields
  ];

  if (!allowedFields.includes(field)) {
    return res.status(400).json({ error: `Field '${field}' not allowed for distinct value query.` });
  }

  try {
    if (!ucdsCollection) { // Ensure ucdsCollection is available
      return res.status(500).json({ error: "Database collection not found." });
    }
    // Fetch all distinct non-null, non-empty raw values for the field
    const distinctRawValues = await ucdsCollection.distinct(field, {
      [field]: { $exists: true, $ne: null, $ne: "" } 
    });

    let processedValues = [];

    if (monthTypeFilterFieldsForServer.includes(field)) {
      const uniqueMonths = new Set();
      distinctRawValues.forEach(val => {
        let date;
        if (val instanceof Date) {
          date = dayjs(val);
        } else if (typeof val === 'string') {
          // Try parsing with multiple formats, non-strict
          date = dayjs(val, ["YYYY-MM-DD", "M/D/YYYY", "MM/DD/YYYY", "YYYY-MM-DDTHH:mm:ss.SSSZ", dayjs.ISO_8601], false);
        } else {
          // If it's a number (timestamp) or other type, try to convert
          date = dayjs(val);
        }

        if (date.isValid()) {
          uniqueMonths.add(date.format('MMMM YYYY'));
        }
      });
      processedValues = Array.from(uniqueMonths).sort((a, b) => dayjs(a, 'MMMM YYYY').valueOf() - dayjs(b, 'MMMM YYYY').valueOf());
    } else if (yearTypeFilterFieldsForServer.includes(field)) {
      const uniqueYears = new Set();
      distinctRawValues.forEach(val => {
        let date;
        if (val instanceof Date) {
          date = dayjs(val);
        } else if (typeof val === 'string') {
          date = dayjs(val, ["YYYY-MM-DD", "M/D/YYYY", "MM/DD/YYYY", "YYYY-MM-DDTHH:mm:ss.SSSZ", dayjs.ISO_8601], false);
        } else {
          date = dayjs(val);
        }
        if (date.isValid()) {
          uniqueYears.add(date.format('YYYY'));
        }
      });
      processedValues = Array.from(uniqueYears).sort((a,b) => parseInt(a) - parseInt(b));
    } else {
      // General fields: convert to string and sort alphabetically
      processedValues = distinctRawValues.map(val => String(val)).sort((a, b) => String(a).localeCompare(String(b)));
    }
    res.status(200).json(processedValues); // Send array of processed strings
  } catch (error) {
    console.error(`Error fetching distinct values for field ${field}:`, error);
    res.status(500).send("Internal Server Error");
  }
});


module.exports = router;

const logActivity = async (req, res, next) => {
  const { method, path, body } = req;

  if (!["POST", "PUT", "PATCH", "GET"].includes(method)) {
    return next();
  }

  if (!req.session || !req.session.user) {
    return res.status(401).send("Unauthorized: No session found");
  }

  const userId = req.session.user.userId;
  const username = req.session.user.username;

  let actionType;
  let actionLabel;
  let changes = null;

  let collectionName = "";
  if (path.includes("/survey/")) {
    const year = body.year || "2025";
    collectionName = `survey-data-${year}`;
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
    const { id } = req.params;

    // Define filter logic based on ID type
    if (id) {
      if (/^[a-fA-F\d]{24}$/.test(id)) {
        filter = { _id: new ObjectId(id) };
      } else {
        filter = buildSortKeyQuery(id); // Use flexible sort_key query
      }
    }

    try {
      if (!client.topology.isConnected()) {
        await client.connect();
      }

      const collection = db.collection(collectionName);

      if (method === "PUT" || method === "PATCH") {
        const originalData = await collection.findOne(filter);
        if (!originalData) {
          console.warn("Original data not found for ID:", id);
          return next();
        }

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
      } else if (method === "POST") {
        actionType = "Added Data";
        actionLabel = `Added data: ${JSON.stringify(body)}`;
      } else if (method === "GET") {
        const viewedData = await collection.findOne(filter);
        if (!viewedData) {
          console.warn("Viewed data not found for ID:", id);
          return next();
        }

        const dataName = viewedData.project_title || "Unknown";
        actionType = "View";
        actionLabel = `Viewed data: ${dataName}`;
      }
    } catch (error) {
      console.error("Error during activity logging:", error);
      return next(); // Continue processing even if logging fails
    }
  } else {
    actionType = "Generic Action";
    actionLabel = `Performed action on path: ${path}`;
  }

  const activityLog = {
    userId,
    username,
    method,
    path,
    actionType,
    actionLabel,
    requestData: body,
    timestamp: new Date(),
  };

  try {
    if (!client.topology.isConnected()) {
      await client.connect();
    }

    const activityLogsCollection = db.collection("app-logs");
    await activityLogsCollection.insertOne(activityLog);
    // console.log("Activity logged:", activityLog);
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

//#endregion routes setup and authentication

//#region POST routes

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
    transporter.sendMail(mailOptions);

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
    const hashedPassword = await bcrypt.hash(password, 10); // Use a different variable name

    // Create user object with hashed password and provided username
    const newUser = {
      name,
      username,
      email,
      password: hashedPassword, // Use the hashed password here
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
        message: "User created successfully",
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

//#endregion

//#region GET routes

app.use("/uploads", express.static(uploadsDir));

//////////////////////////////////////////////////////////////////////////////////////////

//#region Permit Summary Helpers
const PERMITS_SUMMARY_DEFAULT_PAGE_SIZE = 10;

const isValidDate = (d) => d instanceof Date && !isNaN(d);

// Enhanced robust date parsing function
function parseDateString(dateStrInput) {
  if (!dateStrInput || typeof dateStrInput !== "string") {
    return null;
  }

  let dateStr = dateStrInput.trim(); // Use this for the YYYY-YYYY check as well

  // Prioritized Check for YYYY-YYYY range, similar to parseDateStringForStats
  // This regex `^(\d{4})-(\d{4})$` will match if the whole string is YYYY-YYYY.
  const yearRangeMatch = dateStr.match(/^(\d{4})-(\d{4})$/);
  if (yearRangeMatch) {
    const endYear = parseInt(yearRangeMatch[2], 10);
    if (endYear >= 1900 && endYear < 2100) {
      // Basic sanity check for year
      return new Date(endYear, 11, 31); // December 31st of the end year
    }
    // If year is out of sane range but pattern matched, consider it unparseable here.
    return null;
  }

  // 1. Handle obvious non-date strings
  const nonDateKeywords = [
    "n/a",
    "pending",
    "approval",
    "ongoing",
    "application",
    "for approval",
    "verification",
    "unknown",
    "none",
    "---",
    "not applicable",
    "coa no",
    "ref no",
    "dp-r03",
    "fla-",
    "lexie's farm",
    "in-process",
    "app. no",
    "for verification",
    "new designated pco",
    "contact person",
    // Add more keywords as needed based on your data
  ];
  if (
    nonDateKeywords.some((keyword) => dateStr.toLowerCase().includes(keyword))
  ) {
    return null;
  }
  if (/^#+$/.test(dateStr)) return null; // Handles "##########"
  // The YYYY-YYYY check above replaces the previous specific line: if (/^\d{4}-\d{4}$/.test(dateStr)) return null;
  if (/^\d{1,2}\/\d{1,2}\/\-\d{4}$/.test(dateStr)) return null; // Handles "01/12/-2022"

  // 2. If multiple lines, take the first line
  const lines = dateStr.split(/[\n\r]/);
  dateStr = lines[0].trim();

  // 3. Attempt direct parsing (handles YYYY-MM-DD, MM/DD/YYYY, "Month D, YYYY", "D-Month-YYYY")
  let d = new Date(dateStr);
  if (isValidDate(d)) {
    return d;
  }

  // 4. Attempt to parse DD/MM/YYYY by rearranging to MM/DD/YYYY
  const dmYMatch = dateStr.match(/^(\d{1,2})[/\-\.](\d{1,2})[/\-\.](\d{4})$/);
  if (dmYMatch) {
    const day = parseInt(dmYMatch[1], 10);
    const month = parseInt(dmYMatch[2], 10);
    const year = parseInt(dmYMatch[3], 10);
    if (day > 12 && month <= 12 && year > 1900 && year < 2100) {
      // Likely DD/MM/YYYY
      d = new Date(`${month}/${day}/${year}`);
      if (isValidDate(d)) return d;
    }
  }

  // 5. Handle cases like "Month. Day, YYYY" e.g. "Oct. 26, 2022" if direct parse failed
  const monthDotDayYearMatch = dateStr.match(
    /^([A-Za-z]{3,})\.?\s*(\d{1,2}),?\s*(\d{4})$/i
  );
  if (monthDotDayYearMatch) {
    const cleanedForParse = `${monthDotDayYearMatch[1]} ${monthDotDayYearMatch[2]} ${monthDotDayYearMatch[3]}`;
    d = new Date(cleanedForParse);
    if (isValidDate(d)) return d;
  }

  // 6. Handle dates followed by extraneous text (e.g., "YYYY-MM-DD some_text" or "MM/DD/YYYY some_text")
  const dateFollowedByTextMatch = dateStr.match(
    /^(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/
  );
  if (dateFollowedByTextMatch) {
    d = new Date(dateFollowedByTextMatch[1]);
    if (isValidDate(d)) return d;
  }

  return null; // Could not parse
}

const isNearExpiration = (expiryDate, nowDate) => {
  if (!isValidDate(expiryDate)) return false;
  const oneMonthBefore = new Date(expiryDate);
  oneMonthBefore.setMonth(oneMonthBefore.getMonth() - 1);
  return nowDate >= oneMonthBefore && nowDate <= expiryDate;
};

const IsExpired = (expiryDate, nowDate) => {
  if (!isValidDate(expiryDate)) return false;
  return nowDate > expiryDate;
};
//#endregion Permit Summary Helpers

app.get("/api/permits-summary", async (req, res) => {
  let {
    page = 1,
    pageSize = PERMITS_SUMMARY_DEFAULT_PAGE_SIZE,
    prefixes = "",
    searchText = "",
    filterEstablishmentsByExpiryStatus = "false", // Existing parameter
    permitTypesFilter = "", // New parameter for permit type filtering
  } = req.query;

  let currentPage = parseInt(page, 10);
  let pageSizeInt = parseInt(pageSize, 10);

  if (isNaN(currentPage) || currentPage < 1) {
    currentPage = 1;
  }
  if (isNaN(pageSizeInt) || pageSizeInt <= 0) {
    pageSizeInt = PERMITS_SUMMARY_DEFAULT_PAGE_SIZE;
  }

  const skip = (currentPage - 1) * pageSizeInt;
  const shouldFilterByExpiry = filterEstablishmentsByExpiryStatus === "true";

  try {
    const now = new Date();

    // Parse comma-separated prefixes from query
    const prefixList = prefixes
      .split(",")
      .map((p) => p.trim().toUpperCase())
      .filter((p) => p !== "");

    const mongoQuery = {};
    if (prefixList.length > 0) {
      mongoQuery.sort_key = {
        $regex: `^(${prefixList.join("|")})`,
        $options: "i",
      };
    }

    if (searchText) {
      const searchRegex = { $regex: searchText, $options: "i" };
      mongoQuery.$or = [
        { sort_key: searchRegex },
        { title: searchRegex },
        { name: searchRegex },
        { ecc_cnc: searchRegex },
      ];
    }

    // Fetch all records matching the basic query (search text, prefixes)
    const allMatchingRecords = await ucdsCollection
      .find(mongoQuery, {
        projection: {
          sort_key: 1,
          title: 1,
          name: 1,
          ecc_cnc: 1,
          pto_issued: 1,
          pto_code: 1,
          wwdp_issued: 1,
          wwdp_code: 1,
          pco_validity: 1,
          pco_no: 1,
        },
      })
      .toArray();

    let processedRecords = allMatchingRecords.map((record) => {
      const permits = [];

      if (record.pto_issued) {
        const issuedDate = parseDateString(record.pto_issued);
        if (isValidDate(issuedDate)) {
          const expiry = new Date(issuedDate);
          expiry.setFullYear(expiry.getFullYear() + 2); // PTO valid for 2 years from issuance
          permits.push({
            type: "PTO",
            code: record.pto_code || "",
            expiry,
            isNearExpiry: isNearExpiration(expiry, now),
            isExpired: IsExpired(expiry, now),
          });
        } else {
          //console.warn(`Invalid pto_issued date: ${record.pto_issued} for sort_key: ${record.sort_key}`);
        }
      }

      if (record.wwdp_issued) {
        const issuedDate = parseDateString(record.wwdp_issued);
        if (isValidDate(issuedDate)) {
          const expiry = new Date(issuedDate);
          expiry.setFullYear(expiry.getFullYear() + 1); // WWDP valid for 1 year from issuance
          permits.push({
            type: "WWDP",
            code: record.wwdp_code || "",
            expiry,
            isNearExpiry: isNearExpiration(expiry, now),
            isExpired: IsExpired(expiry, now),
          });
        } else {
          //console.warn(`Invalid wwdp_issued date: ${record.wwdp_issued} for sort_key: ${record.sort_key}`);
        }
      }

      if (record.pco_validity) {
        const validityDate = parseDateString(record.pco_validity);
        if (isValidDate(validityDate)) {
          // Assuming pco_validity is the actual expiry date of the PCO
          const expiry = validityDate;
          permits.push({
            type: "PCO",
            code: record.pco_no || "",
            expiry,
            isNearExpiry: isNearExpiration(expiry, now), // Pass 'now'
            isExpired: IsExpired(expiry, now),
          });
        } else {
        }
      }
      return {
        sort_key: record.sort_key,
        title: record.title || record.name || "Untitled",
        ecc_cnc: record.ecc_cnc || "",
        permits: permits, // Return all permits for this record
      };
    });

    // Filter out records with no valid permits (e.g. all expiry parsing failed)
    let finalRecordsToPaginate = processedRecords.filter(
      (rec) => rec.permits.length > 0
    );

    if (shouldFilterByExpiry) {
      finalRecordsToPaginate = finalRecordsToPaginate.filter((rec) =>
        rec.permits.some((p) => p.isExpired || p.isNearExpiry)
      );
    }
    const selectedPermitTypesArray = (permitTypesFilter || "")
      .split(",")
      .map((pt) => pt.trim().toUpperCase())
      .filter((pt) => pt !== "");

    if (selectedPermitTypesArray.length > 0) {
      finalRecordsToPaginate = finalRecordsToPaginate.filter((establishment) =>
        establishment.permits.some(
          (permit) =>
            (permit.isExpired || permit.isNearExpiry) &&
            selectedPermitTypesArray.includes(permit.type.toUpperCase())
        )
      );
    }

    const totalRecords = finalRecordsToPaginate.length;
    const dataToSend = finalRecordsToPaginate.slice(skip, skip + pageSizeInt);

    res.json({
      data: dataToSend,
      total: totalRecords,
    });
  } catch (err) {
    console.error("Error in /api/permits-summary:", err);
    res.status(500).send("Internal Server Error");
  }
});

const permitKeyToFieldMap = {
  ecc_cnc: {
    queryField: "ecc_cnc",
    dateField: "date_approved",
    validityYears: 5,
    isDateAnExpiry: false,
    displayName: "ECC/CNC",
  },
  pto_code: {
    queryField: "pto_code",
    dateField: "pto_expiration",
    isDateAnExpiry: true,
    displayName: "PTO",
  },
  wwdp_code: {
    queryField: "wwdp_code",
    dateField: "wwdp_expiration",
    isDateAnExpiry: true,
    displayName: "WWDP",
  },
  haz_id: {
    queryField: "haz_id",
    dateField: "haz_issued",
    validityYears: 1,
    isDateAnExpiry: false,
    displayName: "HWG ID",
  }, // Assuming 1 year validity
  pco_no: {
    queryField: "pco_no",
    dateField: "pco_validity",
    isDateAnExpiry: true,
    displayName: "PCO",
  },
};

router.get("/ucds/permit-expiry-breakdown/:permitKey", async (req, res) => {
  const { permitKey } = req.params;
  const permitConfig = permitKeyToFieldMap[permitKey];

  if (!permitConfig) {
    return res.status(400).json({ error: "Invalid permit key." });
  }

  try {
    if (!ucdsCollection) {
      return res.status(500).json({ error: "Database collection not found." });
    }

    // Keywords for PTO application stages (defined here for use in counts and exclusion)
    const ptoOngoingKeywordsRegex = /\b(In-process|In process|On Process|ON GOING)\b/i;
    const ptoApplicationKeywordsRegex = /\b(App(\.\s*No\.?)?|Application(\s*No\.?|lication\sNumber)?)\b/i;

    // --- Count for different statuses ---
    // Count for blank permits (where the permit field is null or empty)
    const blankCount = await ucdsCollection.countDocuments({
      $or: [
        { [permitConfig.queryField]: null },
        { [permitConfig.queryField]: "" },
      ],
    });

    // Count for Ongoing Process (only for PTO)
    let ongoingProcessCount = 0; // Initialize for all types
    if (['pto_code', 'wwdp_code', 'haz_id'].includes(permitKey)) { // Apply to PTO, WWDP, HAZ_ID
        ongoingProcessCount = await ucdsCollection.countDocuments({ [permitConfig.queryField]: { $regex: ptoOngoingKeywordsRegex } });
    }

    // Count for Applications (only for PTO)
    let applicationCount = 0; // Initialize for all types
    let applicationStagesCount = 0; // For combined count
    if (['pto_code', 'wwdp_code', 'haz_id'].includes(permitKey)) { // Apply to PTO, WWDP, HAZ_ID
        applicationCount = await ucdsCollection.countDocuments({ [permitConfig.queryField]: { $regex: ptoApplicationKeywordsRegex } });
        // Combine counts for the new card
        applicationStagesCount = ongoingProcessCount + applicationCount;
    };
    // Fetch records that *have* the permit code for expiry status calculation
    const recordsWithPermitCode = await ucdsCollection
      .find(
        { [permitConfig.queryField]: { $exists: true, $ne: null, $ne: "" } },
        { projection: { _id: 1, [permitConfig.dateField]: 1 } } // Only need the date field
      )
      .toArray();

    // Filter out records that are counted as Ongoing Process or Application
    const recordsForExpiryCalculation = recordsWithPermitCode.filter(record => {
        if (['pto_code', 'wwdp_code', 'haz_id'].includes(permitKey)) { // Apply to PTO, WWDP, HAZ_ID
            const ptoCodeValue = String(record[permitConfig.queryField] || "").trim();
            return !ptoCodeValue.match(ptoOngoingKeywordsRegex) && !ptoCodeValue.match(ptoApplicationKeywordsRegex);
        }
        return true; // Include all records for other permit types
    });

    let expiredCount = 0;
    let nearExpiryCount = 0;
    let notExpiredCount = 0;
    const now = new Date();
    
    recordsForExpiryCalculation.forEach((record) => {
      const dateValue = record[permitConfig.dateField];
      let actualExpiryDate = null;
      const parsedDate = parseDateStringForStats(dateValue); // Use the robust parser

      if (parsedDate instanceof Date && !isNaN(parsedDate)) {
        if (permitConfig.isDateAnExpiry) {
          actualExpiryDate = parsedDate;
        } else if (permitConfig.validityYears) {
          actualExpiryDate = new Date(parsedDate);
          actualExpiryDate.setFullYear(
            actualExpiryDate.getFullYear() + permitConfig.validityYears
          );
        }
      }

      if (actualExpiryDate) {
        // Pass actualExpiryDate (as Date object) to isPermitExpired and isPermitNearExpiry
        // These functions expect a string, so we format it. Or modify them to accept Date.
        // For now, let's format to string that parseDateStringForStats can handle.
        const expiryDateString = actualExpiryDate.toISOString().split("T")[0];

        if (isPermitExpired(expiryDateString)) {
          // isPermitExpired already uses parseDateStringForStats
          expiredCount++;
        } else if (isPermitNearExpiry(expiryDateString, now)) {
          // isPermitNearExpiry also uses parseDateStringForStats
          nearExpiryCount++;
        } else {
          notExpiredCount++;
        }
      }
    });

    let responsePayload = {
      permitKey: permitKey,
      displayName: permitConfig.displayName,
      expired: expiredCount,
      nearExpiry: nearExpiryCount,
      notExpired: notExpiredCount,
      blank: blankCount, // Add the blank count
      totalWithPermit: recordsForExpiryCalculation.length, // Count of records used for expiry check
    };

    if (['pto_code', 'wwdp_code', 'haz_id'].includes(permitKey)) { // Apply to PTO, WWDP, HAZ_ID
      // Send the combined count
      responsePayload.applicationStages = applicationStagesCount;
    }

    res.json(responsePayload);
  } catch (error) {
    console.error(`Error fetching expiry breakdown for ${permitKey}:`, error);
    res
      .status(500)
      .json({ error: `Failed to fetch expiry breakdown for ${permitKey}.` });
  }
});

router.get("/ucds/list-all-industries", async (req, res) => {
  try {
    if (!ucdsCollection) {
      return res.status(500).json({ error: "Database collection not found." });
    }
    // Define the fields you want to project for the "All Industries" view.
    // These should correspond to the commonInitialColumns in Breakdown.jsx.
    const projectionFields = {
      sort_key: 1,
      name: 1,
      title: 1,
      _id: 1, // Important for rowKey in Ant Design Table
      // Optionally add a few more general fields if desired:
      province: 1,
      city: 1,
      brgy: 1,
      ecc_cnc: 1, // As an example of a permit field
    };
    const allIndustries = await ucdsCollection
      .find({})
      .project(projectionFields)
      .sort({ sort_key: 1 }) // Default sort, adjust as needed
      .toArray();
    res.json(allIndustries);
  } catch (error) {
    console.error("Error fetching all industries:", error);
    res.status(500).json({ message: "Server error while fetching all industries." });
  }
});

router.get("/ucds/list-all-industries", async (req, res) => {
  try {
    if (!ucdsCollection) {
      return res.status(500).json({ error: "Database collection not found." });
    }
    // Define the fields you want to project for the "All Industries" view.
    // These should correspond to the commonInitialColumns in Breakdown.jsx.
    const projectionFields = {
      sort_key: 1,
      name: 1,
      title: 1,
      _id: 1, // Important for rowKey in Ant Design Table
      // Optionally add a few more general fields if desired:
      province: 1,
      city: 1,
      brgy: 1,
      ecc_cnc: 1, // As an example of a permit field
    };
    const allIndustries = await ucdsCollection
      .find({})
      .project(projectionFields)
      .sort({ sort_key: 1 }) // Default sort, adjust as needed
      .toArray();
    res.json(allIndustries);
  } catch (error) {
    console.error("Error fetching all industries:", error);
    res.status(500).json({ message: "Server error while fetching all industries." });
  }
});

router.get("/ucds/ecc-cnc-subtypes-breakdown", async (req, res) => {
  try {
    if (!ucdsCollection) {
      return res.status(500).json({ error: "Database collection not found." });
    }

    const eccManualPromise = ucdsCollection.countDocuments({
      permit_process: { $regex: /^ECC Manual$/i },
    });
    const eccOnlinePromise = ucdsCollection.countDocuments({
      permit_process: { $regex: /^ECC Online$/i },
    });
    const eccCoCombinedPromise = ucdsCollection.countDocuments({
      permit_process: { $in: [/^ECC CO$/i, /^ECC \(EMB CO\)$/i] },
    });
    const cncManualPromise = ucdsCollection.countDocuments({
      permit_process: { $regex: /^CNC Manual$/i },
    });
    const cncOnlinePromise = ucdsCollection.countDocuments({
      permit_process: { $regex: /^CNC Online$/i },
    });
    const cncCoPromise = ucdsCollection.countDocuments({
      permit_process: { $regex: /^CNC CO$/i },
    });

    const [eccManual, eccOnline, eccCO, cncManual, cncOnline, cncCO] =
      await Promise.all([
        eccManualPromise,
        eccOnlinePromise,
        eccCoCombinedPromise,
        cncManualPromise,
        cncOnlinePromise,
        cncCoPromise,
      ]);

    // Count records with blank or null ecc_cnc
    const blankEccCnc = await ucdsCollection.countDocuments({
      $or: [{ ecc_cnc: null }, { ecc_cnc: "" }],
    });

    res.json({
      eccManual,
      eccOnline,
      eccCO,
      cncManual,
      cncOnline,
      cncCO,
      blankEccCnc,
    });
  } catch (error) {
    console.error("Error fetching ECC/CNC subtypes breakdown:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch ECC/CNC subtypes breakdown." });
  }
});

router.get("/ucds/dashboard-stats", async (req, res) => {
  try {
    if (!ucdsCollection) {
      return res.status(500).json({ error: "Database collection not found." });
    }
    const { permitTypeFilterKey } = req.query; // Expecting keys like 'ecc_cnc', 'pto_code', etc.

    const totalIndustries = await ucdsCollection.countDocuments({});
    const mainQueryConditions = {};

    // Fetch counts for general permit categories
    const eccPromise = ucdsCollection.countDocuments({
      ecc_cnc: { $exists: true, $ne: null, $ne: "" },
    });
    const ptoPromise = ucdsCollection.countDocuments({
      pto_code: { $exists: true, $ne: null, $ne: "" },
    });
    const wwdpPromise = ucdsCollection.countDocuments({
      wwdp_code: { $exists: true, $ne: null, $ne: "" },
    });
    const hwgPromise = ucdsCollection.countDocuments({
      haz_id: { $exists: true, $ne: null, $ne: "" },
    });
    const pcoPromise = ucdsCollection.countDocuments({
      pco_no: { $exists: true, $ne: null, $ne: "" },
    });

    const [
      resolvedEccCount,
      resolvedPtoCount,
      resolvedWwdpCount,
      resolvedHwgCount,
      resolvedPcoCount,
    ] = await Promise.all([
      eccPromise,
      ptoPromise,
      wwdpPromise,
      hwgPromise,
      pcoPromise,
    ]);

    const permitBreakdown = {
      ecc: resolvedEccCount,
      pto: resolvedPtoCount,
      wwdp: resolvedWwdpCount,
      hwg: resolvedHwgCount,
      pco: resolvedPcoCount,
    };

    const sectionBreakdownResults = await ucdsCollection
      .aggregate([
        // Optional initial match stage if permitTypeFilterKey is provided
        ...(permitTypeFilterKey && permitKeyToFieldMap[permitTypeFilterKey]
          ? [
              {
                $match: {
                  [permitKeyToFieldMap[permitTypeFilterKey].queryField]: {
                    $exists: true,
                    $ne: null,
                    $ne: "",
                  },
                },
              },
            ]
          : []),
        {
          $match: {
            section_incharged: { $exists: true, $ne: null, $ne: "" },
          },
        },
        {
          $project: {
            sections: {
              $split: [{ $ifNull: ["$section_incharged", ""] }, ","],
            },
          },
        },
        { $unwind: "$sections" },
        {
          $project: {
            section: {
              $trim: {
                input: {
                  $toUpper: {
                    $replaceAll: {
                      input: "$sections",
                      find: " ",
                      replacement: "_",
                    },
                  },
                },
              },
            },
          },
        },
        { $match: { section: { $nin: ["N/A", "NONE", "", null] } } }, // Added null to $nin
        { $group: { _id: "$section", count: { $sum: 1 } } },
        { $project: { _id: 0, section: "$_id", count: 1 } },
        { $sort: { count: -1 } },
      ])
      .toArray();

    const projectStatusResults = await ucdsCollection
      .aggregate([
        // Optional initial match stage if permitTypeFilterKey is provided for project status
        ...(permitTypeFilterKey && permitKeyToFieldMap[permitTypeFilterKey]
          ? [
              {
                $match: {
                  [permitKeyToFieldMap[permitTypeFilterKey].queryField]: {
                    $exists: true,
                    $ne: null,
                    $ne: "",
                  },
                },
              },
            ]
          : []),
        { $match: { title_status: { $exists: true, $ne: null, $ne: "" } } }, // Existing match for title_status
        {
          $project: {
            status: {
              $toUpper: {
                $trim: { input: { $ifNull: ["$title_status", ""] } },
              },
            },
          },
        }, // Corrected: $ifNull is input to $trim
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ])
      .toArray();

    const projectStatusBreakdown = {
      operational: 0,
      nonOperational: 0,
      notOperational: 0,
      notYetMonitored: 0,
      other: 0,
    };
    projectStatusResults.forEach((item) => {
      if (item._id === "OPERATIONAL")
        projectStatusBreakdown.operational = item.count;
      else if (item._id === "NON-OPERATIONAL")
        projectStatusBreakdown.nonOperational = item.count;
      else if (item._id === "NOT OPERATIONAL")
        projectStatusBreakdown.notOperational = item.count;
      else if (item._id === "")
        projectStatusBreakdown.notYetMonitored = item.count;
      else if (item._id && item._id !== "N/A" && item._id !== "NONE")
        projectStatusBreakdown.other += item.count;
    });

    // For industriesWithAnyPermit and industriesWithAtLeastOneExpiredPermit
    const industriesCursor = ucdsCollection.find(
      {},
      {
        projection: {
          _id: 1,
          ecc_cnc: 1,
          pto_code: 1,
          wwdp_code: 1,
          haz_id: 1,
          pco_no: 1,
          pto_expiration: 1,
          wwdp_expiration: 1,
          pco_validity: 1,
        },
      }
    );

    const industriesWithAnyPermitSet = new Set();
    const industriesWithExpiredPermitSet = new Set();

    await industriesCursor.forEach((item) => {
      if (
        item.ecc_cnc ||
        item.pto_code ||
        item.wwdp_code ||
        item.haz_id ||
        item.pco_no
      ) {
        industriesWithAnyPermitSet.add(item._id.toString());
      }
      if (
        isPermitExpired(item.pto_expiration) ||
        isPermitExpired(item.wwdp_expiration) ||
        isPermitExpired(item.pco_validity)
      ) {
        industriesWithExpiredPermitSet.add(item._id.toString());
      }
    });

    res.json({
      totalIndustries,
      industriesWithAnyPermit: industriesWithAnyPermitSet.size,
      industriesWithAtLeastOneExpiredPermit:
        industriesWithExpiredPermitSet.size,
      permitBreakdown,
      sectionBreakdown: sectionBreakdownResults,
      projectStatusBreakdown,
    });
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    res.status(500).json({ error: "Failed to fetch dashboard statistics." });
  }
});

app.get("/api/ucds/list-by-ecc-cnc-subtype", async (req, res) => {
  try {
    const { subtypeLabel } = req.query; // Expecting "ECC Manual", "ECC Online", etc.

    if (!subtypeLabel) {
      return res
        .status(400)
        .json({ message: "subtypeLabel query parameter is required." });
    }

    const query = {};

    if (subtypeLabel === "Blank ECC/CNC") {
      query.$or = [{ ecc_cnc: null }, { ecc_cnc: "" }];
    } else {
      // Existing logic for permit_process
      query.permit_process = { $regex: `^${subtypeLabel}$`, $options: "i" };
    }

    // Fields to select, similar to what Breakdown.jsx expects
    const selectedFields = {
      sort_key: 1,
      name: 1,
      title: 1,
      ecc_cnc: 1,
      permit_process: 1,
      date_approved: 1,
      date_amended: 1,
      iis_no_2024: 1, // Add iis_no_2024
      iis_no_2025: 1, // Add iis_no_2025
      brgy: 1,
      city: 1,
      province: 1,
      _id: 1, // Or whatever your unique identifier is, if not _id for rowKey
    };

    const industries = await ucdsCollection
      .find(query)
      .project(selectedFields)
      .sort({ sort_key: 1 })
      .toArray(); // Corrected to use ucdsCollection and MongoDB driver syntax

    res.json(industries);
  } catch (error) {
    console.error("Error fetching ECC/CNC subtype breakdown:", error);
    res
      .status(500)
      .json({ message: "Server error while fetching breakdown data." });
  }
});

app.get("/api/ucds/list-by-permit-status", async (req, res) => {
  try {
    const { permitKey, status } = req.query;

    const permitConfig = permitKeyToFieldMap[permitKey];

    if (!permitConfig) {
      return res.status(400).json({ message: "Invalid permitKey." });
    }
    if (
      ![
        "Expired",
        "Near Expiry",
        "Not Expired",
        "Blank",
        "Ongoing Process",
        "Application", // Keep individual statuses for direct fetching if ever needed
        "Application Stages", // New combined status
        "All" // New status to fetch all records for a permit type
      ].includes(status)
    ) {
      return res.status(400).json({ message: "Invalid status." });
    }

    // Base fields needed for the table regardless of permit type
    const baseProjection = {
      sort_key: 1,
      name: 1,
      title: 1,
      _id: 1,
    };

    // Permit-specific fields to project
    const permitSpecificProjection = {};
    if (permitConfig.queryField)
      permitSpecificProjection[permitConfig.queryField] = 1; // e.g., pto_code
    if (permitConfig.dateField)
      permitSpecificProjection[permitConfig.dateField] = 1; // e.g., pto_expiration

    // Add other relevant fields based on permitKey that are not covered by queryField or dateField
    if (permitKey === "pto_code") {
      permitSpecificProjection["pto_issued"] = 1;
      permitSpecificProjection["iis_no_2024"] = 1; // Add IIS 2024 for PTO
      permitSpecificProjection["iis_no_2025"] = 1; // Add IIS 2025 for PTO
      permitSpecificProjection["brgy"] = 1; // Add Barangay for PTO
      permitSpecificProjection["city"] = 1; // Add City for PTO
      permitSpecificProjection["province"] = 1; // Add Province for PTO
    } else if (permitKey === "wwdp_code") {
      permitSpecificProjection["wwdp_issued"] = 1;
      permitSpecificProjection["iis_no_2024"] = 1;
      permitSpecificProjection["iis_no_2025"] = 1;
      permitSpecificProjection["brgy"] = 1;
      permitSpecificProjection["city"] = 1;
      permitSpecificProjection["province"] = 1;
    } else if (permitKey === "pco_no") {
      permitSpecificProjection["pco_name"] = 1; // pco_validity is already permitConfig.dateField
      permitSpecificProjection["iis_no_2024"] = 1;
      permitSpecificProjection["iis_no_2025"] = 1;
      permitSpecificProjection["brgy"] = 1;
      permitSpecificProjection["city"] = 1;
      permitSpecificProjection["province"] = 1;
    }
    // For haz_id, haz_issued is already permitConfig.dateField

    const projectionFields = { ...baseProjection, ...permitSpecificProjection };
    let industriesToReturn = [];

    if (status === "Blank") {
      industriesToReturn = await ucdsCollection
        .find(
          {
            $or: [
              { [permitConfig.queryField]: null },
              { [permitConfig.queryField]: "" },
            ],
          },
          { projection: projectionFields }
        )
        .sort({ sort_key: 1 })
        .toArray();
    } else if (['pto_code', 'wwdp_code', 'haz_id'].includes(permitKey) && status === "Ongoing Process") {
      const ptoOngoingKeywordsRegex =
        /\b(In-process|In process|On Process|ON GOING)\b/i; // Added "ON GOING"
      industriesToReturn = await ucdsCollection
        .find(
          { [permitConfig.queryField]: { $regex: ptoOngoingKeywordsRegex } },
          { projection: projectionFields }
        )
        .sort({ sort_key: 1 })
        .toArray();
    } else if (['pto_code', 'wwdp_code', 'haz_id'].includes(permitKey) && status === "Application") {
      const ptoApplicationKeywordsRegex =
        /\b(App(\.\s*No\.?)?|Application(\s*No\.?|lication\sNumber)?)\b/i; // Made more flexible
      // Ensure these are not also "Ongoing Process" if there's overlap in keywords, though unlikely with current regex.
      // For simplicity, assuming keywords are distinct enough or "Ongoing Process" takes precedence if both match.
      industriesToReturn = await ucdsCollection
        .find(
          {
            [permitConfig.queryField]: { $regex: ptoApplicationKeywordsRegex },
          },
          { projection: projectionFields }
        )
        .sort({ sort_key: 1 })
        .toArray();
    } else if (['pto_code', 'wwdp_code', 'haz_id'].includes(permitKey) && status === "Application Stages") {
      // Fetch records matching EITHER ongoing OR application keywords
      const ptoOngoingKeywordsRegex = /\b(In-process|In process|On Process|ON GOING)\b/i;
      const ptoApplicationKeywordsRegex = /\b(App(\.\s*No\.?)?|Application(\s*No\.?|lication\sNumber)?)\b/i;
      industriesToReturn = await ucdsCollection
        .find(
          { $or: [
              { [permitConfig.queryField]: { $regex: ptoOngoingKeywordsRegex } },
              { [permitConfig.queryField]: { $regex: ptoApplicationKeywordsRegex } }
          ]},
          { projection: projectionFields }
        )
        .sort({ sort_key: 1 })
        .toArray();
    } else if (status === "All" && permitConfig.queryField) {
      // Fetch all records that have the specified permitKey (e.g., all PTOs)
      industriesToReturn = await ucdsCollection
        .find(
          { [permitConfig.queryField]: { $exists: true, $ne: null, $ne: "" } },
          { projection: projectionFields }
        )
        .sort({ sort_key: 1 })
        .toArray();
    } else {
      const allRecordsWithPermit = await ucdsCollection
        .find(
          { [permitConfig.queryField]: { $exists: true, $ne: null, $ne: "" } },
          { projection: projectionFields }
        )
        .toArray();

      const now = new Date();
      // Define these regex patterns here as well, as they are used in this scope
      const ptoOngoingKeywordsRegex = /\b(In-process|In process|On Process|ON GOING)\b/i;
      const ptoApplicationKeywordsRegex = /\b(App(\.\s*No\.?)?|Application(\s*No\.?|lication\sNumber)?)\b/i;


      allRecordsWithPermit.forEach((record) => {
        const ptoCodeValue = String(record[permitConfig.queryField] || "").trim(); // Used for PTO, WWDP, HAZ_ID application check

        // Skip records that are in application/ongoing stages for expiry calculations
        if (['pto_code', 'wwdp_code', 'haz_id'].includes(permitKey) && (ptoCodeValue.match(ptoOngoingKeywordsRegex) || ptoCodeValue.match(ptoApplicationKeywordsRegex))) {
          return;
        }

        const dateValue = record[permitConfig.dateField];
        let actualExpiryDate = null;
        const parsedDate = parseDateStringForStats(dateValue);

        if (parsedDate instanceof Date && !isNaN(parsedDate)) {
          if (permitConfig.isDateAnExpiry) {
            actualExpiryDate = parsedDate;
          } else if (permitConfig.validityYears) {
            actualExpiryDate = new Date(parsedDate);
            actualExpiryDate.setFullYear(
              actualExpiryDate.getFullYear() + permitConfig.validityYears
            );
          }
        }

        if (actualExpiryDate) {
          const expiryDateString = actualExpiryDate.toISOString().split("T")[0];
          const isCurrentlyExpired = isPermitExpired(expiryDateString);
          const isCurrentlyNearExpiry = isPermitNearExpiry(
            expiryDateString,
            now
          );

          if (status === "Expired" && isCurrentlyExpired) {
            industriesToReturn.push(record);
          } else if (
            status === "Near Expiry" &&
            isCurrentlyNearExpiry &&
            !isCurrentlyExpired
          ) {
            industriesToReturn.push(record);
          } else if (
            status === "Not Expired" &&
            !isCurrentlyExpired &&
            !isCurrentlyNearExpiry
          ) {
            industriesToReturn.push(record);
          }
        }
      });
      industriesToReturn.sort((a, b) =>
        (String(a.sort_key) || "").localeCompare(String(b.sort_key) || "")
      );
    }

    res.json(industriesToReturn);
  } catch (error) {
    console.error("Error fetching permit status breakdown:", error);
    res.status(500).json({
      message: "Server error while fetching permit status breakdown data.",
    });
  }
});

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

app.get("/api/ucds-data", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 20;
    const skip = (page - 1) * pageSize;

    const mongoQuery = {};
    let queryConditions = [];

    // Define fields for global search. Expand this list as needed.
    const globalSearchFields = [
      "name",
      "title",
      "ecc_cnc",
      "sort_key",
      "address",
      "industry_class",
      "section_incharged",
      "handler",
      "remarks",
      "province",
      "city",
      "brgy",
      "psic_code",
      "pco_name",
      "legal_officer",
      "title_status",
      // Add any other fields you want to be included in the global text search
    ];


    // 1. Handle Global Search (if present)
    if (req.query.search) {
      const searchTermTrimmed = String(req.query.search).trim();
      if (searchTermTrimmed) {
        const orConditions = globalSearchFields.map((sField) => {
          if (sField === "sort_key") {
            const parts = searchTermTrimmed.split("-");
            if (parts.length === 2 && parts[0] && /^\d+$/.test(parts[1])) {
              const prefix = parts[0];
              const numberPart = parts[1];
              return { [sField]: { $regex: `^${prefix}-0*${numberPart}$`, $options: "i" } };
            } else {
              return { [sField]: { $regex: searchTermTrimmed, $options: "i" } };
            }
          } else {
            return { [sField]: { $regex: searchTermTrimmed, $options: "i" } };
          }
        });
        if (orConditions.length > 0) {
          queryConditions.push({ $or: orConditions });
        }
      }
    }

    // Define fields that are handled as specific top-level filters
    // and should not be re-processed by the column filter loop.
    const topLevelFilterKeys = [
      'search', 'page', 'pageSize', 
      'projectStatus', 'sectionFilter', 'permitTypeKey', 'filterExpired',
      'province' // Province is handled as a top-level filter from global dropdown
    ];


    const { projectStatus, sectionFilter, permitTypeKey, filterExpired } =
      req.query;

    // The generic loop "for (const key in req.query)" that previously attempted to handle
    // some column filters has been removed. Its responsibilities are now correctly
    // handled by the dedicated global search logic, the columnFilterableFields.forEach loop,
    // and the specific top-level filter handlers (projectStatus, sectionFilter, etc.).

    // 2. Handle Column-Specific Filters
    const columnFilterableFields = [
      // This list should contain ALL fields that can be filtered from the client table.
      // It's used to iterate and check req.query for corresponding filter values.
      'sort_key', 'name', 'title', 'long', 'lat', 'bod', 'address',
      'iis_no_2024', 'iis_no_2025', 'days_dmds', 'days_drds', 'remarks',
      'ecc_cnc', 'pco_no', 'pto_code', 'wwdp_code', 'haz_id', 'pco_name',
      'docket_no', 'v_pd1586', 'v_ra9275', 'v_ra8749', 'v_ra6969_haz',
      'v_ra6969_tchem', 'tc_date_actual', 'tc_compliance_link', 'pos_paper',
      'amount', 'or_number', 'other_tc_remarks', 'order_issued', 'order_status',
      'date_monitored', 'date_routed', 'date_signed', 'date_amended', // Was month
      'date_approved', 'pto_issued', 'pto_expiration', 'wwdp_issued', // Was month
      'wwdp_expiration', 'haz_issued', 'nov_issued', 'penalty_date', // Was month
      'resolution_issued', 'pco_validity', 'province', 'industry_type', 'industry_subtype', // Was year/general
      'industry_class', 'psic_code', 'mbu_area', 'waterbody', 'emp_total',
      'wwtf_type', 'cong_district', 'street', 'brgy', 'city', 'section_incharged',
      'handler', 'monitoring_sched', 'insp_type', 'pismu_tracking', 'title_status',
      'with_nov', 'pismu_count_month', 'permit_process', 'denr_pab_case_no',
      'legal_officer', 'tc_commitment' // All these were general dropdowns
    ];

    const inputTypeFilterFields = [
      // All fields that should be treated with a regex text search.
      'sort_key', 'name', 'title', 'long', 'lat', 'bod', 'address',
      'iis_no_2024', 'iis_no_2025', 'days_dmds', 'days_drds', 'remarks',
      'ecc_cnc', 'pco_no', 'pto_code', 'wwdp_code', 'haz_id', 'pco_name',
      'docket_no', 'v_pd1586', 'v_ra9275', 'v_ra8749', 'v_ra6969_haz',
      'v_ra6969_tchem', 'tc_date_actual', 'tc_compliance_link', 'pos_paper',
      'amount', 'or_number', 'other_tc_remarks', 'order_issued', 'order_status',
      // Add previously month-type fields
      'date_monitored', 'date_routed', 'date_signed', 'date_amended',
      'date_approved', 'pto_issued', 'pto_expiration', 'wwdp_issued',
      'wwdp_expiration', 'haz_issued', 'nov_issued', 'penalty_date',
      'resolution_issued',
      // Add previously year-type fields
      'pco_validity',
      // Add previously general-dropdown-type fields
      'industry_type', 'industry_subtype', 'industry_class', 'psic_code',
      'mbu_area', 'waterbody', 'emp_total', 'wwtf_type', 'cong_district',
      'street', 'brgy', 'city', 'section_incharged', 'handler',
      'monitoring_sched', 'insp_type', 'pismu_tracking', 'title_status',
      'with_nov', 'pismu_count_month', 'permit_process', 'denr_pab_case_no',
      'legal_officer', 'tc_commitment', 'province'
    ];

    const monthTypeFilterFields = [
      'date_monitored', 'date_routed', 'date_signed', 'date_amended',
      'date_approved', 'pto_issued', 'pto_expiration', 'wwdp_issued',
      'wwdp_expiration', 'haz_issued', 'nov_issued', 'penalty_date',
      'resolution_issued' 
      // These fields are now in inputTypeFilterFields. This array can be emptied
      // or the logic below adjusted if no fields will match this anymore.
    ];

    const yearTypeFilterFields = ['pco_validity'];
    // Similar to monthTypeFilterFields, 'pco_validity' is now in inputTypeFilterFields.
    columnFilterableFields.forEach(field => {
       if (req.query[field] && req.query[field].length > 0 && !topLevelFilterKeys.includes(field)) {
        const filterValues = Array.isArray(req.query[field]) ? req.query[field] : [req.query[field]];

        const firstFilterValue = String(filterValues[0]).trim();
        let handledBySpecificLogic = false;

        if (field === 'sort_key') {
          const parts = firstFilterValue.split("-");
          if (parts.length === 2 && parts[0] && /^\d+$/.test(parts[1])) {
            const prefix = parts[0];
            const numberPart = parts[1];
            queryConditions.push({
              [field]: { $regex: `^${prefix}-0*${numberPart}$`, $options: "i" }
            });
            handledBySpecificLogic = true;
          }
        }

        if (!handledBySpecificLogic) {
          if (inputTypeFilterFields.includes(field)) {
            queryConditions.push({ [field]: { $regex: firstFilterValue, $options: "i" } });
          // The following 'else if' blocks for monthTypeFilterFields and yearTypeFilterFields
          // will likely not be hit if these arrays are empty or their fields moved to inputTypeFilterFields.
          } else if (monthTypeFilterFields.includes(field)) {
            const targetMonth = dayjs(firstFilterValue, "MMMM YYYY");
            if (targetMonth.isValid()) {
              const startDate = targetMonth.startOf('month').toDate();
              const endDate = targetMonth.endOf('month').toDate();
              queryConditions.push({ [field]: { $gte: startDate, $lte: endDate } });
            }
          } else if (yearTypeFilterFields.includes(field)) {
            const targetYear = dayjs(firstFilterValue, "YYYY");
            if (targetYear.isValid()) {
              const startDate = targetYear.startOf('year').toDate();
              const endDate = targetYear.endOf('year').toDate();
              queryConditions.push({ [field]: { $gte: startDate, $lte: endDate } });
            }
          } else { 
            // This 'else' block would previously handle general dropdowns.
            // Since they are now intended to be text inputs and moved to inputTypeFilterFields,
            // this block might only catch fields in columnFilterableFields but not in any specific type list.
            // For consistency with "input filter type", consider if these should also be regex.
            // However, if they are not in inputTypeFilterFields, this $in will perform an exact match.
            queryConditions.push({ [field]: { $in: filterValues.map(val => String(val).trim()) } });
          }
        }
      }
    });

    if (projectStatus) {
      const statusKey = projectStatus.toLowerCase(); // Ensure consistency
      if (statusKey === "operational") {
        queryConditions.push({ title_status: { $regex: /^OPERATIONAL$/i } });
      } else if (statusKey === "nonoperational") {
        // Matched to client's 'nonOperational'
        queryConditions.push({
          title_status: { $regex: /^NON-OPERATIONAL$/i },
        });
      } else if (statusKey === "notoperational") {
        // Matched to client's 'notOperational'
        queryConditions.push({
          title_status: { $regex: /^NOT OPERATIONAL$/i },
        });
      } else if (statusKey === "notyetmonitored") {
        // Matched to client's 'notYetMonitored'
        queryConditions.push({ title_status: { $in: ["", null] } });
      } else if (statusKey === "other") {
        queryConditions.push({
          title_status: {
            $nin: [
              "OPERATIONAL",
              "NON-OPERATIONAL",
              "NOT OPERATIONAL",
              "",
              null,
              "N/A",
              "NONE", // Case-sensitive values as stored or normalized in DB
            ],
            $exists: true, // Ensure the field exists
            $ne: "N/A", // Explicitly exclude "N/A" if it's stored as uppercase
            $ne: "NONE", // Explicitly exclude "NONE"
          },
        });
      }
    }

    // Handle sectionIncharged filter
    if (
      sectionFilter &&
      typeof sectionFilter === "string" &&
      sectionFilter.trim() !== ""
    ) {
      // This regex will find the sectionFilter as a whole word or part of a comma-separated list
      queryConditions.push({
        section_incharged: { $regex: sectionFilter.trim(), $options: "i" },
      });
    }

    // Handle permitTypeKey filter
    if (
      permitTypeKey &&
      typeof permitTypeKey === "string" &&
      permitTypeKey.trim() !== ""
    ) {
      const fieldToFilter = permitTypeKey.trim(); // The value of permitTypeKey is the field name
      queryConditions.push({
        [fieldToFilter]: { $exists: true, $ne: null, $ne: "" },
      });
    }

    // Handle top-level province filter (from global dropdown)
    const { province: queryProvince } = req.query;
    if (queryProvince && typeof queryProvince === 'string' && queryProvince.trim() !== "" && queryProvince.trim().toLowerCase() !== "all provinces") {
      queryConditions.push({ province: { $regex: `^${queryProvince.trim()}$`, $options: "i" } });
    }

    if (queryConditions.length > 0) {
      mongoQuery.$and = queryConditions;
    }

    // console.log("Executing MongoDB Query:", JSON.stringify(mongoQuery, null, 2)); // For debugging
    let surveys;
    let total;

    if (filterExpired === "true") {
      const allMatchingRecords = await ucdsCollection
        .find(mongoQuery)
        .toArray();

      const recordsWithExpiredPermits = allMatchingRecords.filter(
        (record) =>
          isPermitExpired(record.pto_expiration) ||
          isPermitExpired(record.wwdp_expiration) ||
          isPermitExpired(record.pco_validity)
      );

      total = recordsWithExpiredPermits.length;

      // Sort the filtered records
      recordsWithExpiredPermits.sort((a, b) => {
        const getSortParts = (sortKeyStr) => {
          const sKey = String(sortKeyStr || "");
          if (!sKey.includes("-")) return { prefix: sKey, num: 0 };
          const parts = sKey.split("-");
          return { prefix: parts[0], num: parseInt(parts[1], 10) || 0 };
        };
        const partsA = getSortParts(a.sort_key);
        const partsB = getSortParts(b.sort_key);
        if (partsA.prefix < partsB.prefix) return -1;
        if (partsA.prefix > partsB.prefix) return 1;
        return partsA.num - partsB.num;
      });

      surveys = recordsWithExpiredPermits.slice(skip, skip + pageSize);
    } else {
      total = await ucdsCollection.countDocuments(mongoQuery);
      const pipeline = [];

      // 1. Initial Match based on filters from request query
      if (Object.keys(mongoQuery).length > 0) {
        pipeline.push({ $match: mongoQuery });
      }

      // 2. Add fields for sorting by sort_key (prefix and numeric part)
      pipeline.push(
        {
          $addFields: {
            // Ensure sort_key is not null before splitting, default to empty string
            _temp_sort_key: { $ifNull: ["$sort_key", ""] },
          },
        },
        {
          $addFields: {
            _sort_key_parts: { $split: ["$_temp_sort_key", "-"] },
          },
        },
        {
          $addFields: {
            _sort_key_prefix: {
              // Use the first part as prefix, or the whole key if no hyphen
              $cond: {
                if: {
                  $gt: [{ $size: { $ifNull: ["$_sort_key_parts", []] } }, 0],
                }, // Check if _sort_key_parts is not null and has elements
                then: { $arrayElemAt: ["$_sort_key_parts", 0] },
                else: "$_temp_sort_key",
              },
            },
            _sort_key_number_str: {
              // Use the second part as number string if it exists
              $cond: {
                if: {
                  $gt: [{ $size: { $ifNull: ["$_sort_key_parts", []] } }, 1],
                },
                then: { $arrayElemAt: ["$_sort_key_parts", 1] },
                else: null,
              },
            },
          },
        },
        {
          $addFields: {
            _sort_key_number: {
              // Convert numeric string part to integer
              $convert: {
                input: "$_sort_key_number_str", // Input can be null
                to: "int",
                onError: null, // If conversion fails (e.g., "ABC"), treat as null
                onNull: null, // If input is null (no numeric part), treat as null
              },
            },
          },
        }
      );

      // 3. Sort stage
      pipeline.push({ $sort: { _sort_key_prefix: 1, _sort_key_number: 1 } });

      // 4. Pagination stages (must be after sorting)
      pipeline.push({ $skip: skip });
      pipeline.push({ $limit: pageSize });

      // 5. Project stage to remove temporary sort fields (optional, but good practice)
      pipeline.push({
        $project: {
          _temp_sort_key: 0,
          _sort_key_parts: 0,
          _sort_key_prefix: 0,
          _sort_key_number_str: 0,
          _sort_key_number: 0,
        },
      });

      surveys = await ucdsCollection
        .aggregate(pipeline, { allowDiskUse: true })
        .toArray();
    }

    res.status(200).json({ data: surveys, total });
  } catch (error) {
    console.error("Error fetching UCDS data:", error);
    res.status(500).send("Internal Server Error");
  }
});

// API endpoint for SWM Plan data
app.get("/api/swm-plan-data", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 20;
    const skip = (page - 1) * pageSize;

    const mongoQuery = {};
    let queryConditions = [];

    // Global search for SWM Plans (adjust fields as per your swmplanCollection schema)
    const globalSearchFieldsSWM = [
      "lguName", // Assuming field for LGU Name
      "province",
      "planId", // Assuming a unique ID field for the plan
      "status", // Assuming a status field
      "remarks"
    ];

    if (req.query.search) {
      const searchTermTrimmed = String(req.query.search).trim();
      if (searchTermTrimmed) {
        const orConditions = globalSearchFieldsSWM.map((sField) => ({
          [sField]: { $regex: searchTermTrimmed, $options: "i" },
        }));
        if (orConditions.length > 0) {
          queryConditions.push({ $or: orConditions });
        }
      }
    }

    // Column-specific filters for SWM Plans
    // Adjust these fields based on your swmplanCollection schema and client-side table columns
    const columnFilterableFieldsSWM = [
      "lguName", "province", "status", "yearSubmitted", "yearApproved", "planId", "remarks"
    ];

    columnFilterableFieldsSWM.forEach(field => {
      if (req.query[field] && req.query[field].length > 0 && !['search', 'page', 'pageSize'].includes(field)) {
        const filterValues = Array.isArray(req.query[field]) ? req.query[field] : [req.query[field]];
        const firstFilterValue = String(filterValues[0]).trim();
        if (firstFilterValue) {
          // Assuming all column filters are text-based for SWM Plan for now
          queryConditions.push({ [field]: { $regex: firstFilterValue, $options: "i" } });
        }
      }
    });

    // Specific top-level filters (e.g., province, status)
    if (req.query.province && typeof req.query.province === 'string' && req.query.province.trim() !== "" && req.query.province.trim().toLowerCase() !== "all provinces") {
      queryConditions.push({ province: { $regex: `^${req.query.province.trim()}$`, $options: "i" } });
    }
    if (req.query.planStatus && typeof req.query.planStatus === 'string' && req.query.planStatus.trim() !== "") {
      queryConditions.push({ status: { $regex: `^${req.query.planStatus.trim()}$`, $options: "i" } }); // Assuming 'status' field for plan status
    }


    if (queryConditions.length > 0) {
      mongoQuery.$and = queryConditions;
    }

    if (!swmplanCollection) {
      return res.status(500).json({ error: "SWM Plan collection not initialized." });
    }

    const total = await swmplanCollection.countDocuments(mongoQuery);
    // Basic sort, adjust as needed (e.g., by lguName, submissionDate)
    const plans = await swmplanCollection
      .find(mongoQuery)
      .sort({ lguName: 1 }) // Example sort
      .skip(skip)
      .limit(pageSize)
      .toArray();

    res.status(200).json({ data: plans, total });

  } catch (error) {
    console.error("Error fetching SWM Plan data:", error);
    res.status(500).send("Internal Server Error");
  }
});

// API endpoint for SWM Plan dashboard statistics
app.get("/api/swm-plan-stats", async (req, res) => {
  try {
    if (!swmplanCollection) {
      return res.status(500).json({ error: "SWM Plan collection not initialized." });
    }

    const totalPlans = await swmplanCollection.countDocuments({});

    // Example: Breakdown by plan status (assuming a 'status' field)
    const statusBreakdown = await swmplanCollection.aggregate([
      { $match: { status: { $exists: true, $ne: null, $ne: "" } } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
      { $project: { _id: 0, status: "$_id", count: 1 } },
      { $sort: { count: -1 } }
    ]).toArray();

    // Example: Breakdown by province
    const provinceBreakdown = await swmplanCollection.aggregate([
      { $match: { province: { $exists: true, $ne: null, $ne: "" } } },
      { $group: { _id: "$province", count: { $sum: 1 } } },
      { $project: { _id: 0, province: "$_id", count: 1 } },
      { $sort: { count: -1 } }
    ]).toArray();
    
    // Example: Count of plans submitted this year (assuming 'submissionDate' field)
    const currentYear = new Date().getFullYear();
    const plansSubmittedThisYear = await swmplanCollection.countDocuments({
        submissionDate: { // Assuming 'submissionDate' is a Date object
            $gte: new Date(`${currentYear}-01-01T00:00:00.000Z`),
            $lt: new Date(`${currentYear + 1}-01-01T00:00:00.000Z`)
        }
    });

    res.json({
      totalPlans,
      statusBreakdown, // e.g., [{status: "Approved", count: 50}, {status: "Submitted", count: 30}]
      provinceBreakdown, // e.g., [{province: "Pampanga", count: 20}, {province: "Bulacan", count: 15}]
      plansSubmittedThisYear 
      // Add more stats as needed
    });

  } catch (error) {
    console.error("Error fetching SWM Plan dashboard stats:", error);
    res.status(500).json({ error: "Failed to fetch SWM Plan dashboard statistics." });
  }
});

// API endpoint for updating SWM Plan data
app.put("/api/update-swm-plan-data/:id", logActivity, async (req, res) => { // Assuming logActivity middleware is generic enough
  try {
    const { id } = req.params; // Assuming id is MongoDB _id
    const newData = req.body;

    if (!swmplanCollection) {
      return res.status(500).json({ error: "SWM Plan collection not initialized." });
    }
    if (!ObjectId.isValid(id)) {
        return res.status(400).json({ error: "Invalid ID format for SWM Plan." });
    }

    const { _id, ...updatePayload } = newData; // Exclude _id from the payload itself

    const result = await swmplanCollection.updateOne({ _id: new ObjectId(id) }, { $set: updatePayload });

    if (result.matchedCount === 0) return res.status(404).json({ error: "SWM Plan not found." });
    if (result.modifiedCount === 0) return res.status(200).json({ message: "No changes made to the SWM Plan." });

    // TODO: Add detailed logging to a specific SWM plan log collection if needed, similar to ucds-log
    res.status(200).json({ message: "SWM Plan updated successfully." });

  } catch (error) {
    console.error("Error updating SWM Plan data:", error);
    res.status(500).json({ error: "Failed to update SWM Plan data." });
  }
});

app.get("/api/ucds-data/by-sort-key/:sort_key", async (req, res) => {
  const { sort_key } = req.params;

  try {
    // Fetch the data from the ucdsCollection based on sort_key (case-insensitive)
    let data = await ucdsCollection.findOne({
      sort_key: { $regex: `^${sort_key.trim()}$`, $options: "i" },
    });

    if (!data) {
      // If not found in ucds-data, try archive-data using sort_key
      data = await archiveCollection.findOne({
        sort_key: { $regex: `^${sort_key.trim()}$`, $options: "i" },
      });

      if (!data) {
        return res
          .status(404)
          .json({ message: `Data not found for sort_key: ${sort_key}` });
      }
      // Indicate that this record was found in the archive
      data.archived = true;
    }

    res.status(200).json(data);
  } catch (error) {
    console.error(`Error fetching data by sort_key (${sort_key}):`, error);
    res.status(500).json({ message: "Error fetching record by sort_key." });
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

// GET endpoint for survey dashboard statistics
app.get("/api/survey-dashboard-stats/:year", async (req, res) => {
  try {
    const { year } = req.params;
    let surveyMonitoringCollection;

    if (year === "2024") {
      surveyMonitoringCollection = db.collection("survey-data-2024");
    } else if (year === "2025") {
      surveyMonitoringCollection = db.collection("survey-data-2025");
    } else {
      return res.status(400).json({ error: "Invalid survey year provided." });
    }

    if (!surveyMonitoringCollection) {
      return res.status(500).json({ error: `Survey collection for year ${year} not found or initialized.` });
    }

    const totalSurveys = await surveyMonitoringCollection.countDocuments({});

    const projectTypeBreakdown = await surveyMonitoringCollection.aggregate([
      { $match: { project_type: { $exists: true, $ne: null, $ne: "" } } },
      { $group: { _id: "$project_type", count: { $sum: 1 } } },
      { $project: { _id: 0, type: "$_id", count: 1 } },
      { $sort: { count: -1 } }
    ]).toArray();

    const provinceBreakdown = await surveyMonitoringCollection.aggregate([
      { $match: { province: { $exists: true, $ne: null, $ne: "" } } },
      { $group: { _id: "$province", count: { $sum: 1 } } },
      { $project: { _id: 0, province: "$_id", count: 1 } },
      { $sort: { count: -1 } }
    ]).toArray();

    const eiaSurveyCount = await surveyMonitoringCollection.countDocuments({ survey_eia: true });
    const mbuAreaSurveyCount = await surveyMonitoringCollection.countDocuments({ mbu_area: true });
    // Example: Count for "Completed" status_survey
    // const completedSurveyCount = await surveyMonitoringCollection.countDocuments({ status_survey: "Completed" });


    res.status(200).json({
      totalSurveys,
      projectTypeBreakdown,
      provinceBreakdown,
      eiaSurveyCount,
      mbuAreaSurveyCount,
      // completedSurveyCount, // Add other stats as needed
    });

  } catch (error) {
    console.error("Error fetching survey dashboard stats:", error);
    res.status(500).json({
      error: "Failed to fetch survey dashboard statistics.",
      details: error.message
    });
  }
});

// GET endpoint for survey monitoring data (e.g., from survey-data-2025)
app.get("/api/surveys-monitoring-data/:year", async (req, res) => {
  try {
    const { year } = req.params;
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 20;
    const skip = (page - 1) * pageSize;

    let surveyMonitoringCollection;
    if (year === "2024") {
      surveyMonitoringCollection = db.collection("survey-data-2024");
    } else if (year === "2025") {
      surveyMonitoringCollection = db.collection("survey-data-2025");
    } else {
      return res.status(400).json({ error: "Invalid survey year provided." });
    }

    if (!surveyMonitoringCollection) {
      return res.status(500).json({ error: `Survey collection for year ${year} not found or initialized.` });
    }

    const mongoQuery = {};
    let queryConditions = [];

    // Define fields for global search in survey data
    const surveyGlobalSearchFields = [
      "id_no",
      "project_title", // Assuming this field exists
      "name", // If company name is stored in 'name'
      "industry_class",
      "address",
      "province",
      "city",
      "brgy",
      // Add other relevant survey fields for global search
    ];

    if (req.query.search) {
      const searchTermTrimmed = String(req.query.search).trim();
      if (searchTermTrimmed) {
        const orConditions = surveyGlobalSearchFields.map((sField) => ({
          [sField]: { $regex: searchTermTrimmed, $options: "i" },
        }));
        if (orConditions.length > 0) {
          queryConditions.push({ $or: orConditions });
        }
      }
    }

    // Handle top-level province filter
    if (req.query.province && typeof req.query.province === 'string' && req.query.province.trim() !== "" && req.query.province.trim().toLowerCase() !== "all provinces") {
      queryConditions.push({ province: { $regex: `^${req.query.province.trim()}$`, $options: "i" } });
    }
    
    // Handle survey status filter (example)
    if (req.query.status && typeof req.query.status === 'string' && req.query.status.trim() !== "") {
        queryConditions.push({ status_survey: { $regex: `^${req.query.status.trim()}$`, $options: "i" } }); // Assuming 'status_survey' field
    }

    // Handle Column-Specific Filters (all as text search for simplicity)
    // Client should send filter key matching dataIndex of the column
    const surveyColumnFilterableFields = [ // Match these with baseColumns dataIndex in monitoring_survey.jsx
        'id_no', 'project_title', 'industry_class', 'address', 'province', 
        'city', 'brgy', 'lat', 'long', 'date_surveyed', 'status_survey', 'remarks_survey'
    ];

    surveyColumnFilterableFields.forEach(field => {
      if (req.query[field] && req.query[field].length > 0 && !['search', 'page', 'pageSize', 'province', 'status'].includes(field)) {
        const filterValue = Array.isArray(req.query[field]) ? String(req.query[field][0]).trim() : String(req.query[field]).trim();
        if (filterValue) {
          queryConditions.push({ [field]: { $regex: filterValue, $options: "i" } });
        }
      }
    });


    if (queryConditions.length > 0) {
      mongoQuery.$and = queryConditions;
    }

    const total = await surveyMonitoringCollection.countDocuments(mongoQuery);
    // Basic sort by id_no, assuming it's a numeric or sortable string. Adjust if needed.
    const surveys = await surveyMonitoringCollection
      .find(mongoQuery)
      .sort({ id_no: 1 }) // Or any other relevant sort key for surveys
      .skip(skip)
      .limit(pageSize)
      .toArray();

    res.status(200).json({ data: surveys, total });
  } catch (error) {
    console.error("Error fetching survey monitoring data:", error);
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
      sort_key: doc.sort_key || "",
      helper_column: doc.helper_column || "",
      helper_count: doc.helper_count || "",
      title: doc.title || "",
      name: doc.name || "",
      address: doc.address || "",
      ecc_cnc: doc.ecc_cnc || "",
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
      iis_no_2024: doc.iis_no_2024 || "",
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
      pismu_count_month: doc.pismu_count_month || "",
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
      sort_key: doc.sort_key || "",
      helper_column: doc.helper_column || "",
      helper_count: doc.helper_count || "",
      title: doc.title || "",
      name: doc.name || "",
      address: doc.address || "",
      ecc_cnc: doc.ecc_cnc || "",
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
      iis_no_2024: doc.iis_no_2024 || "",
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
      pismu_count_month: doc.pismu_count_month || "",
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

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

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

// GET /api/user/details?username=merlinda
app.get("/api/user/details", async (req, res) => {
  const { username } = req.query;

  if (!username) {
    return res.status(400).json({ message: "Username is required" });
  }

  try {
    const user = await userCollection.findOne(
      { username },
      {
        projection: {
          password: 0, // Never send hashed passwords to client
        },
      }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user);
  } catch (error) {
    console.error("Error retrieving user details:", error);
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
    // Match logs where ecc_cnc matches (case-insensitive)
    const query = ecc_cnc
      ? { ecc_cnc: { $regex: ecc_cnc, $options: "i" } }
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

// Endpoint to get industry details by class name, matching frontend request
app.get("/api/industry-details-by-class", async (req, res) => {
  const { className } = req.query; // Frontend sends 'className'

  if (!className) {
    return res
      .status(400)
      .json({ error: "className query parameter is required." });
  }

  try {
    if (!projectTypeCollection) {
      console.error(
        "projectTypeCollection is not initialized in /api/industry-details-by-class"
      );
      return res.status(500).json({
        error:
          "Server configuration error: projectTypeCollection not available.",
      });
    }

    // Query using 'industry_class' field in the collection, with the value from 'className'
    const industryDetails = await projectTypeCollection.findOne({
      industry_class: className,
    });

    if (industryDetails) {
      // Return the whole document. Frontend expects fields like industry_type, industry_subtype, psic_code
      // Ensure these fields exist in your projectTypeCollection documents.
      res.status(200).json(industryDetails);
    } else {
      res
        .status(404)
        .json({ message: `No industry details found for class: ${className}` });
    }
  } catch (error) {
    console.error(
      `Error fetching industry details for class ${className}:`,
      error
    );
    res
      .status(500)
      .json({ error: "An error occurred while fetching industry details." });
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

//#endregion

//#region UPDATE Data
//Update the data per provinces
app.put("/api/update-data/:id", logActivity, async (req, res) => {
  try {
    const { id } = req.params; // id like "BU-201" or ObjectId string
    const newData = req.body;
    // Use authenticated user from session as the person who updated
    const updatedBy =
      req.session && req.session.user
        ? req.session.user.username
        : "Unknown User";

    if (!client.topology.isConnected()) {
      await client.connect();
    }

    const database = client.db("universe-db");
    const collection = database.collection("ucds-data");
    const logsCollection = database.collection("ucds-log");

    // Build query for the document to update
    let query = {};
    if (/^[a-fA-F0-9]{24}$/.test(id)) {
      query = { _id: new ObjectId(id) };
    } else {
      query = buildSortKeyQuery(id); // Use flexible sort_key query
    }

    // Fetch old document
    const oldDocument = await collection.findOne(query);
    if (!oldDocument) {
      return res.status(404).json({ error: "Data not found" });
    }

    // Update the document with new data
    const result = await collection.updateOne(query, { $set: newData });

    if (result.modifiedCount === 1) {
      // Generate incrementing transactionID for the log
      const latestLog = await logsCollection
        .find({})
        .sort({ transactionID: -1 })
        .limit(1)
        .toArray();

      let newTransactionNumber = 1;
      if (latestLog.length && latestLog[0].transactionID) {
        const lastTxnNum = parseInt(
          latestLog[0].transactionID.replace("TRXM-", ""),
          10
        );
        if (!isNaN(lastTxnNum)) {
          newTransactionNumber = lastTxnNum + 1;
        }
      }
      const transactionID = `TRXM-${newTransactionNumber
        .toString()
        .padStart(4, "0")}`;

      // Prepare audit log entry with only changed fields
      const changes = [];
      Object.keys(newData).forEach((key) => {
        if (oldDocument[key] !== newData[key]) {
          changes.push({
            field: key,
            old_value: oldDocument[key],
            new_value: newData[key],
          });
        }
      });

      const logEntry = {
        transactionID,
        transactionDate: new Date().toLocaleString("en-US", { hour12: true }),
        actionType: "Modified",
        ecc_cnc: newData.ecc_cnc || oldDocument.ecc_cnc,
        userActed: updatedBy,
        dateActed: new Date().toLocaleString("en-US", { hour12: true }),
        changes,
      };

      // Insert audit log entry
      await logsCollection.insertOne(logEntry);

      // Respond success with audit log info
      res.status(200).json(logEntry);
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

// PUT endpoint to update survey monitoring data
app.put("/api/surveys-monitoring-data/:year/:id", async (req, res) => {
  try {
    const { year, id } = req.params; // id is expected to be MongoDB _id string
    const newData = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid survey record ID format." });
    }

    let surveyMonitoringCollection;
    if (year === "2024") {
      surveyMonitoringCollection = db.collection("survey-data-2024");
    } else if (year === "2025") {
      surveyMonitoringCollection = db.collection("survey-data-2025");
    } else {
      return res.status(400).json({ error: "Invalid survey year provided." });
    }

     if (!surveyMonitoringCollection) {
      return res.status(500).json({ error: `Survey collection for year ${year} not found or initialized.` });
    }

    // Exclude _id from $set payload if it's present in newData
    const { _id, ...updatePayload } = newData;

    const result = await surveyMonitoringCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updatePayload }
    );

    if (result.matchedCount === 0) return res.status(404).json({ error: "Survey record not found." });
    if (result.modifiedCount === 0) return res.status(200).json({ message: "No changes made to the survey record." });

    res.status(200).json({ message: "Survey record updated successfully." });
  } catch (error) {
    console.error("Error updating survey monitoring data:", error);
    res.status(500).json({ error: "Failed to update survey record." });
  }
});

// Bulk update UCDS records
router.put("/ucds-data/bulk-update", logActivity, async (req, res) => {
  try {
    const updatesArray = req.body.updates; // Expecting an array of { _id: "...", changes: { field1: value1, ... } }

    if (!Array.isArray(updatesArray) || updatesArray.length === 0) {
      return res.status(400).json({ error: "Invalid or empty updates array." });
    }

    if (!ucdsCollection) {
      return res.status(500).json({ error: "Database collection not found." });
    }

    const bulkOps = updatesArray
      .map((item) => {
        if (
          !item._id ||
          !ObjectId.isValid(item._id) ||
          !item.changes ||
          Object.keys(item.changes).length === 0
        ) {
          // Log invalid item but don't stop the whole batch
          console.warn("Invalid item in bulk update:", item);
          return null; // Will be filtered out
        }
        return {
          updateOne: {
            filter: { _id: new ObjectId(item._id) },
            update: { $set: item.changes },
          },
        };
      })
      .filter((op) => op !== null); // Remove any null operations from invalid items

    if (bulkOps.length === 0) {
      return res
        .status(400)
        .json({ error: "No valid update operations to perform." });
    }

    const result = await ucdsCollection.bulkWrite(bulkOps);

    // TODO: Enhance logging for bulk updates in ucds-log collection if needed.
    // This would involve iterating through each successful update in `result`
    // and creating individual log entries, similar to the single update logic.

    res.status(200).json({
      message: `${result.modifiedCount} records updated successfully.`,
      result,
    });
  } catch (error) {
    console.error("Error during bulk update:", error);
    res.status(500).json({ error: "Failed to perform bulk update." });
  }
});

app.put("/api/revert-by-ecc", logActivity, async (req, res) => {
  try {
    const { ecc_cnc, field, oldValue, updated_by } = req.body;

    if (!ecc_cnc || !field || oldValue === undefined) {
      return res.status(400).json({
        error: "Missing required fields: ecc_cnc, field, or oldValue.",
      });
    }

    if (!client.topology.isConnected()) {
      await client.connect();
    }

    const db = client.db("universe-db");
    const dataCollection = db.collection("ucds-data");
    const logsCollection = db.collection("ucds-log"); // 👈 updated here

    const filter = { ecc_cnc: ecc_cnc };
    const originalDoc = await dataCollection.findOne(filter);

    if (!originalDoc) {
      return res.status(404).json({ error: "Document not found." });
    }

    // Update the document with the old value
    const update = {
      $set: {
        [field]: oldValue,
        updated_by,
        updated_at: new Date(),
      },
    };

    const result = await dataCollection.updateOne(filter, update);

    if (result.modifiedCount === 1) {
      // Log the revert operation in ucds-log
      const revertLog = {
        transactionID: `REVERT-${Date.now()}`,
        transactionDate: new Date().toLocaleString(),
        actionType: "Reverted",
        ecc_cnc,
        field,
        oldValue,
        newValue: originalDoc[field], // what it was before revert
        userActed: updated_by,
        dateActed: new Date().toLocaleString(),
      };

      await logsCollection.insertOne(revertLog);

      return res.status(200).json({ message: "Revert successful", revertLog });
    } else {
      return res.status(200).json({ message: "No changes were made" });
    }
  } catch (err) {
    console.error("Error in /api/revert-by-ecc:", err);
    res.status(500).json({ error: "Internal Server Error" });
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

// New route to get distinct values for dropdown fields
router.get("/ucds-data/distinct-dropdown-values", async (req, res) => {
  try {
    const distinctValues = {};
    // Define the fields for which you want to get distinct values for dropdowns
    // This list should ideally match or be derived from the client-side `dropdownFields`
    const fieldsForDropdowns = [
      "province",
      "industry_type",
      "industry_subtype",
      "industry_class",
      "waterbody",
      "wwtf_type",
      "monitoring_sched",
      // "date_monitored", "date_routed", "date_signed", // Dates might produce too many unique values for a dropdown
      "pismu_tracking",
      "title_status",
      "pismu_count_month",
      "legal_officer",
      // "nov_issued" // Consider if this is a date or a limited set of strings like Yes/No
    ];

    for (const field of fieldsForDropdowns) {
      // Fetch distinct, non-null, non-empty values and sort them
      const values = await ucdsCollection.distinct(field, {
        [field]: { $ne: null, $ne: "" },
      });
      // Ensure all values are strings for consistency in dropdowns
      distinctValues[field] = values
        .map(String)
        .sort((a, b) => a.localeCompare(b));
    }
    res.status(200).json(distinctValues);
  } catch (error) {
    console.error("Error fetching distinct dropdown values:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.put("/api/survey/:id", logActivity, async (req, res) => {
  const { id } = req.params;
  const update = req.body;
  const year = req.body.year || "2025";

  try {
    const collection = db.collection(`survey-data-${year}`);

    // Try both number and string for id_no
    let filter = [{ id_no: isNaN(id) ? id : parseInt(id, 10) }, { id_no: id }];

    // Try to find the record by id_no (number or string)
    let currentRecord = await collection.findOne(filter[0]);
    if (!currentRecord) {
      currentRecord = await collection.findOne(filter[1]);
    }

    if (!currentRecord) {
      return res.status(404).json({ message: "Record not found" });
    }

    // Update the record using the correct filter
    const result = await collection.updateOne(
      { _id: currentRecord._id },
      { $set: update }
    );

    if (result.modifiedCount > 0) {
      return res.status(200).json({ message: "Update successful!" });
    } else {
      return res.status(200).json({ message: "No changes made" });
    }
  } catch (error) {
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
      const updates = req.body;

      // Clean and remap updates
      const cleanUpdates = {};
      for (const key in updates) {
        if (updates[key] !== undefined) {
          if (key === "date") {
            cleanUpdates["createdDate"] = new Date(updates[key]);
          } else {
            cleanUpdates[key] = updates[key];
          }
        }
      }

      // Fetch current posting before update
      const currentPosting = await postingCollection.findOne({
        _id: new ObjectId(id),
      });
      if (!currentPosting) {
        return res.status(404).json({ error: "Posting not found" });
      }

      // Perform the update
      const updateResult = await postingCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: cleanUpdates }
      );

      // If status is changed, log it
      if (updates.status && updates.status !== currentPosting.status) {
        const auditEntry = {
          type: "PostingStatusChange",
          postingId: id,
          changedBy: req.session.user?.username || "unknown",
          oldStatus: currentPosting.status || "undefined",
          newStatus: updates.status,
          timestamp: new Date(),
        };

        await db.collection("activity_logs").insertOne(auditEntry);
      }

      res.json({ message: "Posting updated successfully" });
    } catch (error) {
      console.error("Error updating posting:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }
);

app.put("/api/permits-summary/update-expiry", async (req, res) => {
  const {
    sort_key,
    permitType,
    newExpiryDate,
    newPermitCode, // Added to receive the new permit code
  } = req.body;

  // newPermitCode can be undefined if only date is being updated, so not strictly required here.
  if (!sort_key || !permitType || !newExpiryDate) {
    return res.status(400).json({
      message:
        "Missing required fields: sort_key, permitType, or newExpiryDate.",
    });
  }

  try {
    let parsedNewExpiry;
    // Ensure "YYYY-MM-DD" strings are parsed as UTC midnight.
    // new Date("YYYY-MM-DD") already does this by specification.
    // Other formats might be parsed as local time by new Date().
    if (
      typeof newExpiryDate === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(newExpiryDate)
    ) {
      parsedNewExpiry = new Date(newExpiryDate); // Interprets as UTC midnight
    } else {
      parsedNewExpiry = new Date(newExpiryDate); // Fallback for other formats
    }

    if (!isValidDate(parsedNewExpiry)) {
      return res.status(400).json({
        message: "Invalid newExpiryDate format. Please use YYYY-MM-DD.",
      });
    }

    let fieldsToUpdate = {};

    if (permitType === "PTO") {
      const newIssueDate = new Date(parsedNewExpiry);
      newIssueDate.setFullYear(newIssueDate.getFullYear() - 2); // PTO expires 2 years from issue
      fieldsToUpdate["pto_issued"] = newIssueDate.toISOString().split("T")[0];
      if (newPermitCode !== undefined) {
        // Check if newPermitCode was provided
        fieldsToUpdate["pto_code"] = newPermitCode;
      }
    } else if (permitType === "WWDP") {
      const newIssueDate = new Date(parsedNewExpiry);
      newIssueDate.setFullYear(newIssueDate.getFullYear() - 1); // WWDP expires 1 year from issue
      fieldsToUpdate["wwdp_issued"] = newIssueDate.toISOString().split("T")[0];
      if (newPermitCode !== undefined) {
        fieldsToUpdate["wwdp_code"] = newPermitCode;
      }
    } else if (permitType === "PCO") {
      fieldsToUpdate["pco_validity"] = parsedNewExpiry
        .toISOString()
        .split("T")[0];
      if (newPermitCode !== undefined) {
        fieldsToUpdate["pco_no"] = newPermitCode;
      }
    } else {
      return res.status(400).json({ message: "Invalid permitType." });
    }

    const result = await ucdsCollection.updateOne(
      { sort_key: sort_key },
      { $set: fieldsToUpdate }
    );

    if (result.matchedCount === 0) {
      return res
        .status(404)
        .json({ message: `Record with sort_key ${sort_key} not found.` });
    }
    if (result.modifiedCount === 0) {
      return res
        .status(200)
        .json({ message: "No changes made to the permit expiry." });
    }

    // Optional: Log this update to ucds-log
    // const logEntry = { ... };
    // await ucdsLogCollection.insertOne(logEntry);

    res.status(200).json({ message: "Permit expiry updated successfully." });
  } catch (err) {
    console.error("Error updating permit expiry:", err);
    res
      .status(500)
      .json({ message: "Internal Server Error while updating permit expiry." });
  }
});

//#endregion

//#region PATCH Data
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

//#endregion

//#region DELETE Data
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

//#endregion

// Handle graceful shutdown
process.on("SIGINT", () => {
  if (client.isConnected()) {
    client.close();
    console.log("MongoDB connection closed");
  }
  process.exit();
});

const http = require("http");
const setupSocket = require("./socket").setupSocket; // Import setupSocket

const server = http.createServer(app);
setupSocket(server, allowedOrigins);

server.listen(8081, '0.0.0.0', () => {
  console.log(`Server running with Socket.IO and DB Port on port ${PORT}`);
});
