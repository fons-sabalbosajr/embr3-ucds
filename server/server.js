const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { MongoClient } = require("mongodb");
const dotenv = require("dotenv").config();


const app = express();
const PORT = process.env.PORT || 8081;

// Middleware
app.use(express.json());
app.use(cors({
  origin: ["http://localhost:5173", "https://6651729de551d90008488c23--embr3-ucds.netlify.app/"],
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));
app.use(cookieParser());

// MongoDB connection setup
const mongoUri = process.env.MONGO_URI;
const client = new MongoClient(mongoUri, {
  //useNewUrlParser: true,
  //useUnifiedTopology: true,
  ssl: true,
});

let db;
let userCollection;

// Connect to MongoDB once when the server starts
async function connectToMongo() {
  try {
    await client.connect();
    console.log("Successfully connected to MongoDB!");
    db = client.db("universe-db");
    userCollection = db.collection("users");
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
  }
}

connectToMongo();

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not set. Check your environment variables.");
}

// Login Route
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  try {
    const user = await userCollection.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const token = jwt.sign(
      { email: user.email, name: user.name, userId: user._id },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
    });

    return res.status(200).json({ status: "success", token });
  } catch (error) {
    console.error("Error during login:", error.message);
    return res.status(500).json({ error: "An unexpected error occurred." });
  }
});

// Registration Route
app.post("/register", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: "Name, email, and password are required" });
  }
  try {
    const existingUser = await userCollection.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "Email already exists" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await userCollection.insertOne({ name, email, password: hashedPassword });
    return res.status(201).json({
      status: "User registered successfully",
      userId: result.insertedId,
    });
  } catch (error) {
    console.error("Error during registration:", error.message);
    return res.status(500).json({ error: "An error occurred during registration" });
  }
});

// Logout Route
app.get("/logout", async (req, res) => {
  try {
    res.clearCookie("token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
    });
    return res.json({
      status: "Logout Success",
      message: "You have been logged out.",
      redirect: "/login",
    });
  } catch (error) {
    console.error("Error during logout:", error.message);
    return res.status(500).json({ error: "An error occurred during logout." });
  }
});

// Check Authentication Route
app.get("/check-auth", async (req, res) => {
  try {
    const token = req.cookies.token;
    if (!token) {
      return res.status(401).json({ status: "Failure", error: "No token provided" });
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    return res.json({ status: "Success", name: decoded.name });
  } catch (error) {
    console.error("Error in check-auth:", error.message);
    return res.status(401).json({ status: "Failure", error: error.message });
  }
});


// Function to capitalize the first letter of each word
function capitalizeFirstLetter(input) {
  return input
    .toLowerCase() // Convert the entire string to lowercase
    .split("_") // Split by underscore to handle multi-word names
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1)) // Capitalize the first letter of each word
    .join("_"); // Rejoin with underscores
}

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
    const query = { province: new RegExp(`^${province}$`, 'i') };

    // Fetch data for the specified province
    const provinceData = await collection.find(query).toArray();

    if (provinceData.length === 0) {
      return res.status(404).json({ message: `No data found for ${province}.` });
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
      chemical_permit_subtype: doc.chemical_permit_subtype || "",
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
    return res.status(500).json({ error: "Failed to retrieve data. Please try again later." });
  }
});

app.put("/api/update-data/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const newData = req.body; // Assuming the updated data is sent in the request body

    // Ensure connection to the database
    if (!client.topology.isConnected()) {
      await client.connect();
    }

    const database = client.db("universe-db");
    const collection = database.collection("ucds-data");

    // Perform the update operation
    const result = await collection.updateOne(
      { id_no: parseInt(id) }, // Assuming id_no is the unique identifier
      { $set: newData }
    );

    if (result.modifiedCount === 1) {
      res.status(200).json({ message: "Data updated successfully" });
    } else {
      res.status(404).json({ error: "Data not found or no changes were made" });
    }
  } catch (error) {
    console.error("Error updating data:", error);
    res.status(500).json({ error: "Failed to update data. Please try again later." });
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