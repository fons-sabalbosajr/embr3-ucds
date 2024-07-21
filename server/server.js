const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { MongoClient, ObjectId } = require("mongodb");
const fs = require("fs");
const path = require("path");
const { PDFDocument, rgb } = require("pdf-lib");
const zlib = require("zlib");
const dotenv = require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 8081;

// Allowed origins
const allowedOrigins = [
  "http://localhost:5173",
  "https://super-khapse-e8a332.netlify.app",
  "https://embr3-ucds.onrender.com",
  "https://embr3-ucds.render.com"
];

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: function (origin, callback) {
      console.log("Origin: ", origin);  // Log the origin for debugging
      if (allowedOrigins.includes(origin) || !origin) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Origin", "Accept"],
    credentials: true,
    preflightContinue: false,  // Ensure preflight requests are handled automatically
    optionsSuccessStatus: 204, // Response status code for successful OPTIONS requests
  })
);

// Middleware to handle OPTIONS requests
app.options('*', cors());

// MongoDB connection setup
const mongoUri = process.env.MONGO_URI;
const client = new MongoClient(mongoUri, {
  ssl: true,
});

let db;
let userCollection;
let loginStatusCollection;
let ucdsCollection;
let dailyNoticesCollection;
let postingCollection;

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
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    process.exit(1);
  }
}

connectToMongo().catch(console.error);

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not set. Check your environment variables.");
}

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

// Login Route
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res
      .status(400)
      .json({ error: "Username and password are required." });
  }

  try {
    // Fetch user from database
    const user = await userCollection.findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid username or password." });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        username: user.username,
        name: user.name,
        userId: user._id,
        division: user.division,
        permission: user.permission,
      },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    // Save login status to the login-status collection
    const loginStatus = {
      userId: user._id,
      name: user.name,
      userName: user.username,
      isLoggedIn: true,
      loginTime: new Date(),
    };
    await loginStatusCollection.insertOne(loginStatus);

    // Set HTTP-only cookie with token
    res.cookie("token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "None",
    });

    // Return success response with token and permissions
    return res
      .status(200)
      .json({ status: "success", token, permission: user.permission });
  } catch (error) {
    console.error("Error during login:", error.message);
    return res.status(500).json({ error: "An unexpected error occurred." });
  }
});

// Registration Route
app.post("/register", async (req, res) => {
  const { name, division, position, email } = req.body; // Updated to match frontend form fields

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
      status: "pending", // Assuming status is set to pending for admin approval
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

    if (insertResult.insertedCount === 1) {
      console.log("User created successfully:", insertResult.ops[0]);

      return res.status(201).json({
        message: "User created and status updated successfully",
        user: insertResult.ops[0],
      });
    } else {
      console.error("Error inserting user:", insertResult);
      return res
        .status(500)
        .json({ error: "Failed to create user", user: newUser });
    }
  } catch (error) {
    console.error("Error creating user:", error);

    // Provide more informative error message based on the error type
    let errorMessage = "Failed to create user";
    if (error.name === "MongoError") {
      errorMessage = "Database error occurred";
    } else if (error.name === "BcryptError") {
      errorMessage = "Error during password hashing";
    }

    return res.status(500).json({ error: errorMessage, user: req.body }); // Include the user data in the error response
  }
});

app.post("/api/posting", async (req, res) => {
  try {
    const { title, message, date, acknowledgement, iconType, createdDate } =
      req.body;

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
    console.error(error);
    res.status(500).send({ message: "Error saving announcement" });
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

    // Load custom font
    const fontPath = path.join(__dirname, 'fonts', 'arial.ttf');
    const fontBytes = await fs.promises.readFile(fontPath);
    const customFont = await pdfDoc.embedFont(fontBytes);

    const form = pdfDoc.getForm();
    const formFields = form.getFields();

    // Update PDF fields with record data
    formFields.forEach((field) => {
      switch (field.getName()) {
        case "establishment_name":
          field.setText(record.title || "");
          field.updateAppearances(customFont);
          break;
        case "establishment_address":
          field.setText(record.address || "");
          field.updateAppearances(customFont);
          break;
        case "establishment_industry_class":
          field.setText(record.industry_class || "");
          field.updateAppearances(customFont);
          break;
        case "establishment_psic_code":
          field.setText(record.psic_code || "");
          field.updateAppearances(customFont);
          break;
        case "establishment_ecc_cnc1":
          field.setText(record.ecc_cnc || "");
          field.updateAppearances(customFont);
          break;
        case "ecc_issued1":
          field.setText(record.date_approved || "");
          field.updateAppearances(customFont);
          break;
        case "establishment_pto_code":
          field.setText(record.pto_code || "");
          field.updateAppearances(customFont);
          break;
        case "pto_issued":
          field.setText(record.pto_issued || "");
          field.updateAppearances(customFont);
          break;
        case "pto_exp":
          field.setText(record.pto_expiration || "");
          field.updateAppearances(customFont);
          break;
        case "establishment_wwdp_code":
          field.setText(record.wwdp_code || "");
          field.updateAppearances(customFont);
          break;
        case "wwdp_issued":
          field.setText(record.wwdp_issued || "");
          field.updateAppearances(customFont);
          break;
        case "wwdp_expiration":
          field.setText(record.wwdp_expiration || "");
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





app.get("/generate-custom-icir/:id", async (req, res) => {
  const { id } = req.params;

  const selectedData = req.query.fields.reduce((acc, field) => {
    acc[field] = req.query[field];
    return acc;
  }, {});

  const {
    establishmentName,
    establishmentAddress,
    establishmentIndustryClass,
    establishmentPsicCode,
    establishmentEccCnc1,
    eccIssued1,
    establishmentPtoCode,
    ptoIssued,
    ptoExp,
    establishmentWwdpCode,
    wwdpIssued,
    wwdpExpiration,
  } = selectedData;

  try {
    // Validate id_no format
    if (!parseInt(id)) {
      return res.status(400).send("Invalid id_no format");
    }

    // Load existing PDF template
    const pdfPath = path.join(__dirname, "tmp", "icir-form.pdf");
    const pdfBuffer = await fs.promises.readFile(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBuffer);

    const form = pdfDoc.getForm();
    const formFields = form.getFields();

    // Update PDF fields with provided values
    formFields.forEach((field) => {
      switch (field.getName()) {
        case "establishment_name":
          field.setText(establishmentName || "");
          break;
        case "establishment_address":
          field.setText(establishmentAddress || "");
          break;
        case "establishment_industry_class":
          field.setText(establishmentIndustryClass || "");
          break;
        case "establishment_psic_code":
          field.setText(establishmentPsicCode || "");
          break;
        case "establishment_ecc_cnc1":
          field.setText(establishmentEccCnc1 || "");
          break;
        case "ecc_issued1":
          field.setText(eccIssued1 || "");
          break;
        case "establishment_pto_code":
          field.setText(establishmentPtoCode || "");
          break;
        case "pto_issued":
          field.setText(ptoIssued || "");
          break;
        case "pto_exp":
          field.setText(ptoExp || "");
          break;
        case "establishment_wwdp_code":
          field.setText(establishmentWwdpCode || "");
          break;
        case "wwdp_issued":
          field.setText(wwdpIssued || "");
          break;
        case "wwdp_expiration":
          field.setText(wwdpExpiration || "");
          break;
      }
    });

    // Send the modified PDF file to the client
    const pdfBytes = await pdfDoc.save();
    const compressedPdfBytes = zlib.gzipSync(pdfBytes);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="ICIR-${establishmentName}.pdf"`
    );
    res.setHeader("Content-Encoding", "gzip");
    res.setHeader("Content-Length", compressedPdfBytes.length);
    res.send(compressedPdfBytes);
  } catch (error) {
    console.error("Error generating ICIR:", error);
    res.status(500).send("Failed to generate ICIR");
  }
});

// Logout Route
app.get("/logout", async (req, res) => {
  try {
    // Extract token from request headers or cookies
    const token = req.cookies.token;

    // Decode token to get user information
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
    const username = decodedToken.username;

    // Find and update the most recent document for the user
    await loginStatusCollection.findOneAndUpdate(
      { userName: username, isLoggedIn: true },
      { $set: { isLoggedIn: false, logoutTime: new Date() } },
      { sort: { loginTime: -1 } } // Sort by loginTime in descending order
    );

    // Clear authentication token from cookies
    res.clearCookie("token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
    });

    // Send logout success response
    return res.json({
      status: "Logout Success",
      message: "You have been logged out.",
      redirect: "/login",
    });
  } catch (error) {
    console.error("Error during logout:", error.message);

    // Send detailed error response
    return res.status(500).json({ error: "An error occurred during logout." });
  }
});

// Check Authentication Route
app.get("/check-auth", async (req, res) => {
  try {
    const token = req.cookies.token;
    if (!token) {
      return res
        .status(401)
        .json({ status: "Failure", error: "No token provided" });
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    return res.json({
      status: "Success",
      name: decoded.name,
      username: decoded.username,
      division: decoded.division,
    });
  } catch (error) {
    console.error("Error in check-auth:", error.message);
    return res.status(401).json({ status: "Failure", error: error.message });
  }
});

// Check the online users and load
app.get("/api/online_users", async (req, res) => {
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
    const user = await userCollection.findOne({ name }); // Find the user by name
    if (!user) {
      res.status(404).json({ error: "User not found" }); // Return 404 status code if user not found
    } else {
      const avatar = user.avatar; // Assuming the avatar is stored in the "avatar" field
      res.json({ avatar }); // Return the avatar as a JSON object
    }
  } catch (error) {
    console.error("Error fetching user avatar:", error);
    res.status(500).json({ error: "Internal Server Error" }); // Return 500 status code for internal server error
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
    const postings = await postingCollection.find().toArray(); // Fetch all postings from the "postings" collection
    res.json(postings); // Return the postings as JSON
  } catch (error) {
    console.error("Error fetching postings data:", error);
    res.status(500).json({ error: "Internal Server Error" }); // Return 500 status code for internal server error
  }
});

app.get("/api/ucds-data/:id", async (req, res) => {
  const { id } = req.params;
  console.log(`Received request for id: ${id}`);

  try {
    const data = await ucdsCollection.findOne({ id_no: id });
    console.log(`Data found: ${data}`);
    if (!data) {
      res.status(404).json({ error: "Data not found" });
    } else {
      res.json(data);
    }
  } catch (error) {
    console.error("Error fetching data:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
})

//Update the data per provinces
app.put("/api/update-data/:id", async (req, res) => {
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
app.put("/api/users/:id", async (req, res) => {
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

app.put("/api/status/:id", async (req, res) => {
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
