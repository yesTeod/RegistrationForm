import { MongoClient } from 'mongodb';
import bcrypt from 'bcrypt';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME;
const client = new MongoClient(uri);

let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb) {
    return cachedDb;
  }
  try {
    await client.connect();
    const db = client.db(dbName);
    cachedDb = db;
    console.log("Connected to MongoDB for login");
    return db;
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error);
    await client.close(); 
    throw error;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required' });
  }

  console.log(`Login attempt for email: ${email}`);

  try {
    const db = await connectToDatabase();
    const collection = db.collection('user_verifications');

    const user = await collection.findOne({ email: email });

    if (!user) {
      console.log(`Login failed: Email not found - ${email}`);
      // Return a specific status or code to indicate email not found
      return res.status(404).json({ success: false, code: 'EMAIL_NOT_FOUND', error: 'Email not registered' });
    }

    // Compare the provided password with the stored hash
    const match = await bcrypt.compare(password, user.passwordHash);

    if (match) {
      console.log(`Login successful for: ${email}`);
      // Login successful
      // Return minimal success, maybe the user's current status
      return res.status(200).json({ success: true, email: user.email, status: user.status });
    } else {
      console.log(`Login failed: Incorrect password for ${email}`);
      // Incorrect password
      return res.status(401).json({ success: false, code: 'INCORRECT_PASSWORD', error: 'Incorrect password' });
    }

  } catch (error) {
    console.error(`Login error for ${email}:`, error);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
} 