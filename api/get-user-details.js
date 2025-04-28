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
    console.log("Connected to MongoDB for get-user-detail");
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
      
      // Helper function to safely extract primitive value from potential Veriff object
      const extractValue = (field) => {
        if (field && typeof field === 'object' && field.hasOwnProperty('value')) {
          return field.value;
        }
        return field; // Return the field itself if it's not an object with 'value'
      };

      // Sanitize fields: Ensure null defaults and extract primitive values
      const sanitizedDetails = {
        _id: userDetails._id,
        email: userDetails.email,
        status: userDetails.status || 'unknown',
        verificationId: userDetails.verificationId || null,
        firstName: extractValue(userDetails.firstName) || null,
        lastName: extractValue(userDetails.lastName) || null,
        dateOfBirth: extractValue(userDetails.dateOfBirth) || null,
        documentType: extractValue(userDetails.documentType) || null,
        documentNumber: extractValue(userDetails.documentNumber) || null,
        documentExpiry: extractValue(userDetails.documentExpiry) || null, // Veriff often uses 'validUntil'
        documentCountry: extractValue(userDetails.documentCountry) || null,
        lastUpdated: userDetails.lastUpdated || null,
        createdAt: userDetails.createdAt || null,
      };

      console.log("Sanitized user details:", sanitizedDetails);
      
      return res.status(200).json(sanitizedDetails);
    } else {
      console.log(`User details not found for ${email}`);
      return res.status(404).json({ error: 'User not found' });
    }

  } catch (error) {
    console.error(`Error fetching user details for ${email}:`, error);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
} 
