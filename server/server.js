const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const bcrypt = require("bcrypt");
const { MongoClient, ObjectId, GridFSBucket } = require("mongodb");
const fs = require("fs");
const path = require("path");
const { PDFDocument, rgb } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
const zlib = require("zlib");
const dotenv = require("dotenv").config();
const multer = require("multer");
const MongoStore = require("connect-mongo");

const app = express();
const PORT = process.env.PORT || 8081;

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

const allowedOrigins = [
  "https://jovial-trifle-8f0cce.netlify.app",
  "https://66bd94850d0bf56a0154d8ce--jovial-trifle-8f0cce.netlify.app",
  "http://localhost:5173",
];

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
    surveyCollection = db.collection("survey-data");
    activityLogsCollection = db.collection("app-logs");
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    throw error;
  }
}

connectToMongo().catch((error) => {
  console.error("Error during MongoDB connection:", error);
  process.exit(1);
});

// CORS configuration
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

app.use(cors(corsOptions, (req, res, next) => {
  console.log(`CORS request from ${req.headers.origin}`);
  next();
}));

// Apply CORS middleware
app.use(cors(corsOptions));

// Handle preflight requests
//app.options("*", cors(corsOptions));

// Apply middleware for cookies and JSON parsing
app.use(cookieParser());
app.use(express.json());


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

// Session setup
const sessionStore = MongoStore.create({
  mongoUrl: mongoUri,
  collectionName: "sessions",
});

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      secure: process.env.NODE_ENV === "production", // Use true if you have HTTPS
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    },
  })
);

const logActivity = async (req, res, next) => {
  const { method, path, body } = req;

  // Only log POST (add), PUT (update), PATCH (partial update), and GET (view) requests
  if (!["POST", "PUT", "PATCH", "GET"].includes(method)) {
    return next();
  }

  // Authentication check
  if (!req.session.user) {
    return res.status(401).send("Unauthorized: No session found");
  }

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
  } else if (path.includes("/ucds/")) {
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
    //console.warn("Unknown collection path:", path);
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

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res
      .status(400)
      .json({ error: "Username and password are required." });
  }

  try {
    const user = await userCollection.findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid username or password." });
    }

    // Set session user details
    req.session.user = {
      userId: user._id,
      username: user.username,
      permission: user.permission,
      name: user.name,
      division: user.division,
    };

    // Save login status
    const loginStatus = {
      userId: user._id,
      name: user.name,
      userName: user.username,
      isLoggedIn: true,
      loginTime: new Date(),
      division: user.division,
      permission: user.permission,
    };
    await loginStatusCollection.updateOne(
      { userId: user._id },
      { $set: loginStatus },
      { upsert: true }
    );

    return res
      .status(200)
      .json({ status: "success", permission: user.permission });
  } catch (error) {
    console.error("Error during login:", error);
    return res.status(500).json({ error: "An unexpected error occurred." });
  }
});

// Logout route
app.post("/logout", logActivity, async (req, res) => {
  //console.log('Session before logout:', req.session); // Check if session.user exists
  try {
    if (!req.session || !req.session.user || !req.session.user.userId) {
      return res.status(400).json({ error: "No user session found." });
    }

    // Update login status in the database
    const userId = new ObjectId(req.session.user.userId); // Convert userId to ObjectId
    //console.log('User ID for logout:', userId);

    // Log the documents in loginStatusCollection
    const docs = await loginStatusCollection.find().toArray();
    //console.log('Documents in loginStatusCollection:', docs);

    const result = await loginStatusCollection.updateOne(
      { userId: userId },
      { $set: { isLoggedIn: false, logoutTime: new Date() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Login status not found." });
    }

    req.session.destroy((err) => {
      if (err) {
        console.error("Error during logout:", err);
        return res.status(500).json({ error: "Error destroying session." });
      }

      res.clearCookie("connect.sid");
      res.status(200).json({ status: "success" });
    });
  } catch (error) {
    console.error("Error during logout:", error);
    res.status(500).json({ error: "An unexpected error occurred." });
  }
});

// Check auth route
app.get("/check-auth", (req, res) => {
  // Debugging line
  //console.log('Session data:', req.session.user);

  if (req.session.user) {
    res.json({
      status: "Success",
      name: req.session.user.name || "Name not set",
      username: req.session.user.username || "Username not set",
      division: req.session.user.division || "Division not set",
      notifications: [], // Fetch or add your notifications logic here
      permissions: req.session.user.permission || [],
    });
  } else {
    res.status(401).send({ message: "User not authenticated" });
  }
});










const authenticateSession = (req, res, next) => {
  if (req.session.user) {
    req.user = req.session.user;
    next();
  } else {
    res.status(401).json({ error: "Unauthorized" });
  }
};

app.use(authenticateSession);

// POST /api/newusers - Create a new user with password encryption
app.post("/api/newusers", async (req, res) => {
  console.log("Received request:", req.body);

  const { name, email, division, status, password, username } = req.body;

  // Input validation
  if (!name || !email || !division || !status || !password || !username) {
    console.log("Validation error: Missing required fields");
    return res.status(400).json({
      error:
        "Required fields: name, email, division, status, password, username",
    });
  }

  try {
    // Check for existing email
    const existingUser = await userCollection.findOne({ email });
    if (existingUser) {
      console.log("Validation error: Email already exists");
      return res.status(400).json({ error: "Email already exists" });
    }

    // Check for existing username
    const existingUsername = await userCollection.findOne({ username });
    if (existingUsername) {
      console.log("Validation error: Username already exists");
      return res.status(400).json({ error: "Username already exists" });
    }

    // Hash password securely
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user object with hashed password and provided username
    const newUser = {
      name,
      username,
      email,
      password: hashedPassword,
      division,
      permission: "viewer", // Default permission
      status,
    };

    // Insert the new user document into MongoDB
    const insertResult = await userCollection.insertOne(newUser);

    if (insertResult.acknowledged && insertResult.insertedId) {
      console.log("User created successfully:", newUser);
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

    // Provide more informative error message based on the error type
    let errorMessage = "Failed to create user";
    if (error.name === "MongoError") {
      errorMessage = "Database error occurred";
    } else if (error.name === "BcryptError") {
      errorMessage = "Error during password hashing";
    } else if (error.message.includes("duplicate key error")) {
      errorMessage = "Duplicate key error occurred";
    }

    return res.status(500).json({ error: errorMessage });
  }
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

// Update color for a specific survey record
app.post("/api/update-color", logActivity, async (req, res) => {
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
});

// Update color for a specific survey record
app.post("/api/update-color-universe", logActivity, async (req, res) => {
  const { id_no, color } = req.body;

  if (!id_no || !color) {
    return res.status(400).send("Serial number and color are required.");
  }

  try {
    const result = await ucdsCollection.updateOne(
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
});

// Serve static files for uploaded avatars
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// API endpoint to upload avatar
app.post(
  "/api/profile/upload-avatar/:userId",
  upload.single("avatar"),
  async (req, res) => {
    const { userId } = req.params;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    try {
      // Construct the URL for the uploaded avatar
      const avatarUrl = `/uploads/avatars/${file.filename}`;

      // Update the user's avatar URL in the database
      await userCollection.updateOne(
        { _id: ObjectId(userId) },
        { $set: { avatar: avatarUrl } }
      );

      res
        .status(200)
        .json({ message: "Avatar updated successfully", avatarUrl });
    } catch (error) {
      console.error("Error updating avatar:", error);
      res.status(500).json({ error: "Failed to update avatar" });
    }
  }
);

// app.use(logActivity);
//////////////////////////////////////////////////////////////////////////////////////////

// Route to get draft reports
app.get("/api/draft-report", async (req, res) => {
  if (!reportdraftCollection) {
    return res.status(500).send("Database not initialized");
  }

  try {
    //console.log("Fetching draft reports...");
    const drafts = await reportdraftCollection.find().toArray();
    //console.log("Draft reports fetched:", drafts);
    res.json(drafts);
  } catch (error) {
    console.error("Error fetching draft reports:", error.message); // Log the error message
    res.status(500).send("Internal Server Error");
  }
});

app.get("/api/surveys", async (req, res) => {
  try {
    const surveys = await surveyCollection.find({}).toArray();
    res.json(surveys);
  } catch (error) {
    console.error("Error fetching survey data:", error);
    res.status(500).send("Internal Server Error");
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
  try {
    if (req.user) {
      // Ensure user object contains the necessary fields
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

  //console.log("Received Query Parameters:", selectedData);

  // Define field mappings based on field names from the PDF
  const fieldMapping = {
    title: "establishment_name",
    name: "contact_person", // Adjust field name as needed
    address: "establishment_address",
    industry_class: "establishment_industry_class",
    psic_code: "establishment_psic_code",
    emp_no_total: "emp_total",
    ecc_cnc: "establishment_ecc_cnc1",
    date_approved: "ecc_issued1",
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

  try {
    // Validate id_no format
    if (!parseInt(id)) {
      return res.status(400).send("Invalid id_no format");
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

    // Map provided values to PDF fields
    formFields.forEach((field) => {
      const fieldName = field.getName();
      const pdfFieldName = Object.keys(fieldMapping).find(
        (key) => fieldMapping[key] === fieldName
      );
      if (pdfFieldName) {
        const value = selectedData[pdfFieldName] || "";
        //console.log(`Setting field ${fieldName} to ${value}`); // Log field names and values
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
      `attachment; filename="ICIR-${selectedData.title || "Unknown"}.pdf"`
    );
    res.setHeader("Content-Encoding", "gzip");
    res.setHeader("Content-Length", compressedPdfBytes.length);
    res.send(compressedPdfBytes);
  } catch (error) {
    console.error("Error generating ICIR:", error);
    res.status(500).send("Failed to generate ICIR");
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

    // Debug log to trace the province value
    //console.log(`Querying data for province: ${province}`);

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
      remarks_recommendations: doc.remarks_recommendations,
      industry_class: doc.industry_class || "",
      remarks_recommendations: doc.remarks_recommendations || "",
      industry_type: doc.industry_type || "",
      industry_subtype: doc.industry_subtype || "",
      psic_code: doc.psic_code || "",
      proj_type: doc.proj_type || "",
      mbu_area: doc.mbu_area || "",
      waterbody: doc.waterbody || "",
      long: doc.long || "",
      lat: doc.lat || "",
      cong_district: doc.cong_district || "",
      street: doc.street || "",
      brgy: doc.brgy || "",
      city: doc.city || "",
      province: doc.province || "",
      emp_no_total: doc.emp_no_total || "",
      bod: doc.bod || "",
      fmr_section_incharged: doc.fmr_section_incharged || "",
      section_incharge: doc.section_incharge || "",
      handler: doc.handler || "",
      monitoring_sched: doc.monitoring_sched || "",
      iis_no: doc.iis_no || "",
      insp_type: doc.insp_type || "",
      report_type: doc.report_type || "",
      date_monitored: doc.date_monitored || "",
      date_routed: doc.date_routed || "",
      date_signed: doc.date_signed || "",
      days_dmds: doc.days_dmds || "",
      days_dsdrs: doc.days_dsdrs || "",
      pismu_tracking: doc.pismu_tracking || "",
      pd1586: doc.pd1586 || "",
      permit_process: doc.permit_process || "",
      date_amend: doc.date_amend || "",
      date_approved: doc.date_approved || "",
      ra8749: doc.ra8749 || "",
      pto_code: doc.pto_code || "",
      pto_issued: doc.pto_issued || "",
      pto_expiration: doc.pto_expiration || "",
      ra9275: doc.ra9275 || "",
      wwdp_code: doc.wwdp_code || "",
      wwdp_issued: doc.wwdp_issued || "",
      wwdp_expiration: doc.wwdp_expiration || "",
      ra6969: doc.ra6969 || "",
      haz_id: doc.haz_id || "",
      haz_issued: doc.haz_issued || "",
      tsd: doc.tsd || "",
      tsd_ref_no: doc.tsd_ref_no || "",
      tsd_expiration: doc.tsd_expiration || "",
      tp_trc: doc.tp_trc || "",
      tp_trc_ref_no: doc.tp_trc_ref_no || "",
      tp_trc_expiration: doc.tp_trc_expiration || "",
      chemical_permit: doc.chemical_permit || "",
      chemical_permit_type: doc.chemical_permit_type || "",
      chemical_permit_sub_type: doc.chemical_permit_sub_type || "",
      chem_permit_issued: doc.chem_permit_issued || "",
      chem_permit_exp: doc.chem_permit_exp || "",
      pco: doc.pco || "",
      pco_no: doc.pco_no || "",
      pco_name: doc.pco_name || "",
      pco_tel_no: doc.pco_tel_no || "",
      pco_validity: doc.pco_validity || "",
      docket_no: doc.docket_no || "",
      denr_pab_case_no: doc.denr_pab_case_no || "",
      date_forwarded: doc.date_forwarded || "",
      date_approved_clegal: doc.date_approved_clegal || "",
      days_dfda: doc.days_dfda || "",
      service_mode: doc.service_mode || "",
      nov_released: doc.nov_released || "",
      v_pd1586: doc.v_pd1586 || "",
      v_ra9275: doc.v_ra9275 || "",
      v_ra8749: doc.v_ra8749 || "",
      v_haz: doc.v_haz || "",
      v_tchem: doc.v_tchem || "",
      tc_date_sched: doc.tc_date_sched || "",
      tc_date_actual: doc.tc_date_actual || "",
      time: doc.time || "",
      legal_officer: doc.legal_officer || "",
      tc_commitment: doc.tc_commitment || "",
      pos_paper: doc.pos_paper || "",
      penalty: doc.penalty || "",
      amount: doc.amount || "",
      or_number: doc.or_number || "",
      tc_order_compliance: doc.tc_order_compliance || "",
      remarks: doc.remarks || "",
      resolution: doc.resolution || "",
      order: doc.order || "",
      order_status: doc.order_status || "",
      mbu_priority: doc.mbu_priority || "",
      mbu_survey: doc.mbu_survey || "",
      mbu_survey_request: doc.mbu_survey_request || "",
      dp_universe: doc.dp_universe || "",
    }));

    return res.status(200).json(formattedData);
  } catch (error) {
    console.error("Error retrieving data:", error);
    return res
      .status(500)
      .json({ error: "Failed to retrieve data. Please try again later." });
  }
});

// Define route to fetch user data
app.get("/api/users", async (req, res) => {
  try {
    const users = await userCollection.find().toArray(); // Fetch all users from the "user" collection
    res.json(users); // Return the users as JSON
  } catch (error) {
    console.error("Error fetching user data:", error);
    res.status(500).json({ error: "Internal Server Error" }); // Return 500 status code for internal server error
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
        { date_monitored: { $exists: true, $ne: "" } }, // Filter to ensure date_monitored exists and is not empty
        {
          projection: {
            date_monitored: 1,
            title: 1,
            address: 1,
            industry_class: 1,
            date_monitored: 1,
            date_routed: 1,
            date_signed: 1,
            iis_no: 1,
            section_incharge: 1,
            remarks_recommendation: 1,
            _id: 0,
          },
        } // Include only these fields
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

  //console.log(`Received request for id: ${id}`);

  // Validate id parameter
  if (!id || isNaN(id)) {
    return res.status(400).json({ error: "Valid ID parameter is required" });
  }

  try {
    // Convert id to a number
    const idNumber = parseInt(id, 10);

    // Query the database
    const data = await ucdsCollection.findOne({ id_no: idNumber });

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
    // Assuming the timestamp field is named 'timestamp'
    const logs = await activityLogsCollection
      .find()
      .sort({ timestamp: -1 }) // Sort in descending order
      .toArray();
    res.status(200).json(logs);
  } catch (error) {
    console.error("Error fetching logs:", error);
    res.status(500).json({ error: "An unexpected error occurred." });
  }
});

app.get("/api/logs-users", async (req, res) => {
  const username = req.query.username;

  if (!username) {
    return res
      .status(400)
      .json({ error: "Username query parameter is required." });
  }

  try {
    const user = await userCollection.findOne({ username });
    if (user) {
      // Assuming 'name' is the field you want to return
      res.status(200).json({ name: user.name });
    } else {
      res.status(404).json({ error: "User not found." });
    }
  } catch (error) {
    console.error("Error fetching user:", error);
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
    const userId = req.user.id;
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

//////////////////////////////////////////////////////////////////////////////////////////

//Update the data per provinces
app.put("/api/update-data/:id", logActivity, async (req, res) => {
  try {
    const { id } = req.params;
    const newData = req.body;

    //console.log(`Received update request for id ${id} with data:`, newData);

    // Ensure connection to the database
    if (!client.topology.isConnected()) {
      await client.connect();
    }

    const database = client.db("universe-db");
    const collection = database.collection("ucds-data");

    // console.log("Connected to MongoDB database");

    // Perform the update operation
    const result = await collection.updateOne(
      { id_no: parseInt(id) },
      { $set: newData }
    );

    //console.log("Update result:", result);

    if (result.modifiedCount === 1) {
      res.status(200).json({ message: "Data updated successfully" });
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

// Define an update endpoint for survey data
app.put("/api/survey/:id", logActivity, async (req, res) => {
  const { id } = req.params;
  const { survey_eia, survey_air, survey_water, survey_haz, survey_chem } =
    req.body;

  try {
    const result = await surveyCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          survey_eia,
          survey_air,
          survey_water,
          survey_haz,
          survey_chem,
        },
      }
    );

    if (result.modifiedCount > 0) {
      res.status(200).json({ message: "Update successful!" });
    } else {
      res.status(404).json({ message: "Record not found or no changes made" });
    }
  } catch (error) {
    console.error("Error updating record:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.put("/api/update-survey-data/:id", logActivity, async (req, res) => {
  try {
    const { id } = req.params;
    const newData = req.body;

    // Ensure connection to the database
    if (!client.topology.isConnected()) {
      await client.connect();
    }

    const database = client.db("universe-db");
    const collection = database.collection("survey-data");

    // Perform the update operation
    const result = await collection.updateOne(
      { id_no: parseInt(id) },
      { $set: newData }
    );

    // Check the result of the update operation
    if (result.modifiedCount === 1) {
      res.status(200).json({ message: "Data updated successfully" });
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

app.put("/api/postings/:id", authenticateSession, async (req, res) => {
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
});

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
