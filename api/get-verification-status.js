// TODO: Import necessary database client (e.g., Vercel KV, Postgres, Firestore client)
// Example for Vercel KV:
// import { kv } from '@vercel/kv'; 


import { MongoClient } from 'mongodb';
// MongoDB connection details from environment variables
const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME;
const client = new MongoClient(uri);

// Cache the database connection promise
let cachedDb = null;

// Function to connect to the database (reuses connection)
async function connectToDatabase() {
  if (cachedDb) {
    return cachedDb;
  }
  try {
    await client.connect();
    const db = client.db(dbName);
    cachedDb = db; // Cache the connection
    console.log("Connected to MongoDB");
    return db;
  } catch (error) {
      console.error("Failed to connect to MongoDB:", error);
      // Close client if connection failed during initialization
      await client.close(); 
      throw error; // Re-throw error to be caught by handler
  }
}

export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  // Extract email from query parameters
  const { email } = req.query;

  if (!email) {
    return res.status(400).json({ error: 'Email query parameter is required' });
  }

  console.log(`Fetching verification status for email: ${email}`);

  try {
    // --- MongoDB Query Logic --- 
    const db = await connectToDatabase();
    const collection = db.collection('user_verifications'); // Use the same collection name as the webhook

    const filter = { email: email }; // Find user by email
    const userVerification = await collection.findOne(filter);

    const userStatus = userVerification ? userVerification.status : null;
    // -------------------------

    if (userStatus) {
      // Found the status in the database
      console.log(`Status found for ${email}: ${userStatus}`);
      return res.status(200).json({ status: userStatus });
    } else {
      // Status not found for this email (webhook might not have arrived yet, or user doesn't exist)
      console.log(`Status not found for ${email} (in DB)`);
      // Return 404 so the frontend knows it's not found yet and can continue polling
      return res.status(404).json({ status: 'not_found' }); 
    }

  } catch (error) {
    console.error(`Error fetching verification status for ${email}:`, error);
    // Return a generic server error
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

// --- Helper function placeholder (replace with your actual DB logic) ---
// async function queryDatabaseForStatus(email) {
//   // Connect to your DB
//   // Query for the status based on email
//   // Return the status string (e.g., 'pending', 'approved', 'declined') or null/undefined if not found
//   console.log("(Placeholder) Querying DB for:", email);
//   return null; // Replace with actual implementation
// } 