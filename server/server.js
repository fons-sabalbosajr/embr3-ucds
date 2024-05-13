const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const app = express();
const { MongoClient, ServerApiVersion } = require("mongodb");
const dotenv = require("dotenv").config();

app.use(express.json());
app.use(
  cors({
    origin: ["http://localhost:5173"],
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.use(cookieParser());

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not set. Check your environment variables.");
}

// MongoDB connection setup
const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
  throw new Error("MONGO_URI is not set. Check your environment variables.");
}
const client = new MongoClient(mongoUri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let userCollection;

// Connect to MongoDB once when the server starts
client
  .connect()
  .then(() => {
    console.log("Successfully connected to MongoDB!");

    // Access the specific collection and set it globally
    const db = client.db("universe-db"); // Change to your database name
    userCollection = db.collection("users");
  })
  .catch((err) => {
    console.error("Error connecting to MongoDB Server:", err);
  });

app.get("/cors", (req, res) => {
  res.send("CORS is working!");
});

// Login Route
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  // Validate input
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  try {
    if (!userCollection) {
      throw new Error("MongoDB collection is not initialized.");
    }

    // Find the user by email
    const user = await userCollection.findOne({ email });

    if (!user) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    // Check if the password is correct
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    // Sign a JWT with user details
    const token = jwt.sign(
      { email: user.email, name: user.name, userId: user._id },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    // Set the JWT as an HTTP-only cookie for security
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // Secure cookies only in production
      sameSite: "Strict", // Mitigate CSRF
    });

    // Return a success response with the JWT token
    return res.status(200).json({ status: "success", token });
  } catch (error) {
    console.error("Error during login:", error.message); // Detailed error logging
    return res.status(500).json({
      error:
        "An unexpected error occurred during login. Please try again later.",
    });
  }
});

// Registration endpoint
app.post("/register", async (req, res) => {
  const { name, email, password } = req.body;

  // Basic validation
  if (!name || !email || !password) {
    return res
      .status(400)
      .json({ error: "Name, email, and password are required" });
  }

  if (password.length < 8) {
    return res
      .status(400)
      .json({ error: "Password must be at least 8 characters long" });
  }

  try {
    // Check if email already exists
    const existingUser = await userCollection.findOne({ email });

    if (existingUser) {
      return res.status(400).json({ error: "Email already exists" });
    }

    // Hash the password with a reasonable salt round
    const hashedPassword = await bcrypt.hash(password, 10); // 10 is a common salt round

    // Insert the new user into the "users" collection
    const result = await userCollection.insertOne({
      name,
      email,
      password: hashedPassword,
    });

    return res.status(201).json({
      status: "User registered successfully",
      userId: result.insertedId,
    });
  } catch (error) {
    console.error("Error during registration:", error.message);
    return res
      .status(500)
      .json({ error: "An error occurred during registration" });
  }
});

// Endpoint to check authentication
app.get("/check-auth", (req, res) => {
  try {
    const token = req.cookies.token; // Get the JWT from cookies

    if (!token) {
      return res
        .status(401)
        .json({ status: "Failure", error: "No token provided" });
    }

    // Verify the JWT
    const decoded = jwt.verify(token, JWT_SECRET);

    return res.json({ status: "Success", name: decoded.name }); // If successful
  } catch (error) {
    console.error("Error in check-auth:", error.message);
    return res.status(401).json({ status: "Failure", error: error.message });
  }
});

// Logout endpoint
app.get("/logout", async (req, res) => {
  try {
    // Clear the JWT token cookie
    res.clearCookie("token", {
      httpOnly: true, // Ensures the cookie is only accessible by the server
      secure: process.env.NODE_ENV === "production", // Use secure flag in production
      sameSite: "Strict", // Mitigates CSRF attacks
    });

    // Optional: If you have user sessions in MongoDB, clear them
    const userEmail = req.user?.email; // Assuming JWT middleware sets req.user
    if (userEmail) {
      // If you manage sessions, delete them for the current user
      await sessionCollection.deleteMany({ email: userEmail }); // Clear user sessions in the database
    }

    // Indicate successful logout and provide redirect information
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

app.listen(8081, () => {
  console.log("Server running on port 8081");
});
