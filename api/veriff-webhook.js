import crypto from 'crypto';
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

// Helper function to read the raw body from the request
async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString(); // convert Buffer to string
    });
    req.on('end', () => {
      resolve(Buffer.from(body)); // Return as buffer for crypto
    });
    req.on('error', (err) => {
        reject(err);
    });
  });
}

// Disable Vercel's default body parsing for this route
export const config = {
    api: {
      bodyParser: false,
    },
};

export default async function handler(req, res) {
  // Add a log right at the start to confirm invocation
  console.log("--- VERIFF WEBHOOK HANDLER INVOKED ---"); 

  // Only allow POST requests
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  // Add detailed logging info for debugging
  console.log("==== VERIFF WEBHOOK DETAILS ====");
  console.log("Request headers:", JSON.stringify(req.headers));
  console.log("Request query:", JSON.stringify(req.query));
  console.log("Request method:", req.method);
  console.log("==============================");
  
  console.log("Veriff Webhook function invoked.");

  // Retrieve secret key from environment variables (handled by Vercel)
  const VERIFF_SECRET_KEY = process.env.VERIFF_SECRET_KEY;

  if (!VERIFF_SECRET_KEY) {
    console.error("FATAL ERROR: VERIFF_SECRET_KEY is not set in environment variables.");
    // Don't expose internal errors, just return a generic server error
    return res.status(500).send('Internal Server Error: Configuration missing');
  }

  try {
    // 1. Verify Signature
    const receivedSignature = req.headers['x-hmac-signature'];
    console.log(`Received Signature Header: ${receivedSignature}`); // Log received signature

    const rawBodyBuffer = await readRawBody(req);
    // Log the raw body (e.g., as base64) for comparison if needed
    console.log(`Raw Body Buffer (Base64): ${rawBodyBuffer.toString('base64')}`); 

    if (!receivedSignature || rawBodyBuffer.length === 0) {
      console.warn("Webhook missing signature or body.");
      return res.status(400).send('Bad Request: Missing signature or body');
    }

    const computedSignature = crypto
      .createHmac('sha256', VERIFF_SECRET_KEY)
      .update(rawBodyBuffer)
      .digest('hex');
      
    console.log(`Computed Signature: ${computedSignature}`); // Log computed signature

    if (computedSignature !== receivedSignature) {
      console.warn("Webhook signature mismatch.");
      // Log details before returning
      console.error(`Signature Mismatch Details: Received='${receivedSignature}', Computed='${computedSignature}', Key Hint='${VERIFF_SECRET_KEY ? VERIFF_SECRET_KEY.substring(0, 4) + "..." : "MISSING"}'`);
      return res.status(403).send('Forbidden: Invalid signature');
    }

    // 2. Process Payload (Body is already read as buffer, parse it as JSON)
    let payload;
    try {
        payload = JSON.parse(rawBodyBuffer.toString('utf-8'));
    } catch (parseError) {
        console.error("Failed to parse webhook JSON payload:", parseError);
        return res.status(400).send('Bad Request: Invalid JSON payload');
    }
    
    console.log("Webhook Payload (Verified):", JSON.stringify(payload, null, 2));
    console.log("Raw Payload for Debug:", JSON.stringify(payload, null, 2));

    // 3. Extract relevant information 
    const verificationId = payload.verification?.id;
    const status = payload.verification?.status;
    let vendorData = payload.verification?.vendorData; // User's email in our case

    if (!verificationId) {
      console.warn("Webhook payload missing verification ID");
    }
    
    if (!status) {
      console.warn("Webhook payload missing status");
    }

    if (!vendorData) {
      console.warn("Webhook payload missing vendorData.");
      // Try to see if the email is available in another field
      const possibleEmail = payload.verification?.person?.email || payload.verification?.additionalData?.email;
      if (possibleEmail) {
        console.log("Found potential email in alternative location:", possibleEmail);
        // Continue with this email instead
        vendorData = possibleEmail;
      } else {
        // Acknowledge receipt even if vendorData is missing, but log it.
        return res.status(200).send('OK - Acknowledged, but missing vendorData');
      }
    }

    console.log(`Processing webhook for verification ID: ${verificationId}, status: ${status}, email: ${vendorData}`);

    // --- MongoDB Update Logic --- 
    try {
        const db = await connectToDatabase();
        const collection = db.collection('user_verifications'); // Or your preferred collection name

        // Debug: Check if user already exists in database
        const existingUser = await collection.findOne({ email: vendorData });
        if (existingUser) {
          console.log(`User already exists in database with status: ${existingUser.status}`);
        } else {
          console.log(`No existing user found for email: ${vendorData}`);
        }

        const filter = { email: vendorData }; // Use email (vendorData) as the unique identifier
        
        // Prepare base update document
        const updateFields = { 
            status: status,
            verificationId: verificationId,
            lastUpdated: new Date(),
        };

        // Add extracted data if verification is approved (or potentially other relevant statuses)
        if (status === 'approved' && payload.verification) {
            const person = payload.verification.person;
            const document = payload.verification.document;

            if (person) {
                updateFields.firstName = person.firstName || null;
                updateFields.lastName = person.lastName || null;
                // Add other person fields as needed (e.g., dateOfBirth)
                updateFields.dateOfBirth = person.dateOfBirth || null;
            }
            if (document) {
                updateFields.documentType = document.type || null;
                updateFields.documentNumber = document.number || null;
                updateFields.documentExpiry = document.validUntil || null; // validUntil often means expiry
                updateFields.documentCountry = document.country || null;
                // Add other document fields as needed
            }
        }
        
        const updateDoc = {
          $set: updateFields,
        };
        const options = { upsert: true }; // Create document if it doesn't exist

        console.log(`Updating database for email: ${vendorData} with status: ${status}`);
        console.log(`Update document:`, JSON.stringify(updateDoc, null, 2));

        const result = await collection.updateOne(filter, updateDoc, options);
        console.log(
          `MongoDB update result for ${vendorData}: ${result.modifiedCount} modified, ${result.upsertedCount} upserted`
        );

        // Double-check update was successful by reading from database
        const updatedUser = await collection.findOne({ email: vendorData });
        if (updatedUser) {
          console.log(`Confirmation - User in database after update: ${JSON.stringify(updatedUser, null, 2)}`);
        } else {
          console.warn(`WARNING: User not found in database after update!`);
        }

    } catch (dbError) {
        console.error(`Database error processing webhook for ${vendorData}:`, dbError);
        // Decide if this should be a 500 error. If DB fails, Veriff might retry.
        // Returning 500 might be appropriate to signal a processing failure.
        return res.status(500).send('Internal Server Error: Database operation failed');
    }
    // -----------------------------

    // 4. Acknowledge Receipt
    res.status(200).send('OK');

  } catch (error) {
    console.error("Error processing Veriff webhook:", error);
    res.status(500).send('Internal Server Error');
  }
} 
