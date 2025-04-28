import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME;
const client = new MongoClient(uri);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    console.log("Connecting to MongoDB for save-registration...");
    await client.connect();
    
    // Use environment variable for database name
    const db = client.db(dbName);
    const collection = db.collection("user_verifications");

    console.log("Saving user data:", JSON.stringify(req.body));
    const data = req.body;
    await collection.insertOne(data);

    console.log("User data saved successfully");
    res.status(200).json({ success: true });
  } catch (err) {
    console.error("Error saving registration:", err);
    res.status(500).json({ success: false, error: err.message });
  }
}
