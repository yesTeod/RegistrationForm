import { MongoClient } from 'mongodb';

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
    console.log("Connected to MongoDB for get-user-details");
    return db;
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error);
    await client.close(); 
    throw error;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const { email } = req.query;

  if (!email) {
    return res.status(400).json({ error: 'Email query parameter is required' });
  }

  console.log(`Fetching user details for email: ${email}`);

  try {
    const db = await connectToDatabase();
    const collection = db.collection('user_verifications');

    // Define the projection to exclude the passwordHash
    const projection = { passwordHash: 0 }; 

    const userDetails = await collection.findOne({ email: email }, { projection });

    if (userDetails) {
      console.log(`User details found for ${email}`);
      // Sanitize potentially null fields that might cause issues if not handled on frontend
      userDetails.status = userDetails.status || 'unknown';
      userDetails.verificationId = userDetails.verificationId || null;
      userDetails.firstName = userDetails.firstName || null;
      userDetails.lastName = userDetails.lastName || null;
      userDetails.dateOfBirth = userDetails.dateOfBirth || null;
      userDetails.documentType = userDetails.documentType || null;
      userDetails.documentNumber = userDetails.documentNumber || null;
      userDetails.documentExpiry = userDetails.documentExpiry || null;
      userDetails.documentCountry = userDetails.documentCountry || null;
      userDetails.lastUpdated = userDetails.lastUpdated || null;
      userDetails.createdAt = userDetails.createdAt || null;
      
      return res.status(200).json(userDetails);
    } else {
      console.log(`User details not found for ${email}`);
      return res.status(404).json({ error: 'User not found' });
    }

  } catch (error) {
    console.error(`Error fetching user details for ${email}:`, error);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
} 
