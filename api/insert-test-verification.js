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
  // Only allow GET requests for simplicity
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  // Extract email from query parameters
  const { email, status = 'approved' } = req.query;

  if (!email) {
    return res.status(400).json({ error: 'Email query parameter is required' });
  }

  console.log(`Creating test verification record for email: ${email} with status: ${status}`);

  try {
    const db = await connectToDatabase();
    const collection = db.collection('user_verifications');

    // Create a test record with the requested email and status
    const testData = {
      email: email,
      status: status,
      verificationId: `test-${Date.now()}`,
      lastUpdated: new Date(),
      firstName: 'Test',
      lastName: 'User',
      documentType: 'PASSPORT',
      documentNumber: 'TEST123456',
      documentExpiry: '2030-01-01'
    };

    console.log("Inserting test data:", JSON.stringify(testData, null, 2));
    
    // Insert into database (or update if exists)
    const result = await collection.updateOne(
      { email: email },
      { $set: testData },
      { upsert: true }
    );

    // Confirm it was inserted correctly
    const savedRecord = await collection.findOne({ email: email });
    
    return res.status(200).json({ 
      message: 'Test verification record created successfully',
      recordExists: !!savedRecord,
      insertResult: result,
      data: savedRecord
    });

  } catch (error) {
    console.error(`Error creating test verification for ${email}:`, error);
    return res.status(500).json({ 
      error: 'Internal Server Error',
      message: error.message 
    });
  }
} 