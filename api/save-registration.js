import { MongoClient } from "mongodb";
import bcrypt from 'bcrypt';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME;
const client = new MongoClient(uri);
const saltRounds = 10; // Cost factor for hashing

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    console.log("Connecting to MongoDB for save-registration...");
    await client.connect();
    
    // Use environment variable for database name
    const db = client.db(dbName);
    const collection = db.collection("user_verifications");

    console.log("Saving user data:", JSON.stringify(req.body));
    const { email, password } = req.body; // Destructure email and password

    if (!email || !password) {
      console.error("Email or password missing in request body");
      return res.status(400).json({ success: false, error: "Email and password are required" });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Prepare data for insertion (store only hashed password)
    const userData = {
      email: email,
      passwordHash: hashedPassword, // Store hash, not plain password
      status: 'pending', // Initial status before verification
      createdAt: new Date(),
    };

    await collection.insertOne(userData);

    console.log("User data saved successfully for email:", email);
    res.status(200).json({ success: true, email: email }); // Return email for potential use
  } catch (err) {
    console.error("Error saving registration:", err);
    res.status(500).json({ success: false, error: err.message });
  }
}
