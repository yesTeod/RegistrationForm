import crypto from 'crypto';

// Sumsub API base URL
const SUMSUB_API_URL = 'https://api.sumsub.com';

export default async function handler(req, res) {
  // Ensure this is a POST request (or adjust as needed)
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }

  const { SUMSUB_APP_TOKEN, SUMSUB_SECRET_KEY } = process.env;

  if (!SUMSUB_APP_TOKEN || !SUMSUB_SECRET_KEY) {
    console.error('Missing Sumsub environment variables');
    return res.status(500).json({ message: 'Server configuration error' });
  }

  // --- Generate Access Token ---
  try {
    // --- Configuration ---
    const levelName = 'id-and-liveness'; // The verification level name
    // Generate a unique external user ID for this session.
    // Ideally, link this to your internal user ID if the user is logged in
    // or use a persistent identifier you can map back later.
    // For this example, we'll use a timestamp-based ID.
    const externalUserId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const ttlInSecs = 600; // Token time-to-live: 10 minutes

    // --- Prepare Sumsub API Request ---
    const method = 'post';
    const path = `/resources/accessTokens?userId=${encodeURIComponent(externalUserId)}&ttlInSecs=${ttlInSecs}&levelName=${encodeURIComponent(levelName)}`;
    const url = SUMSUB_API_URL + path;
    const ts = Math.floor(Date.now() / 1000); // Current timestamp in seconds

    // --- Create Signature (HMAC SHA256) ---
    const hmac = crypto.createHmac('sha256', SUMSUB_SECRET_KEY);
    // The signature is based on: timestamp + HTTP method (uppercase) + URL path
    // Note: NO request body is included in the signature for this specific endpoint.
    const dataToSign = ts + method.toUpperCase() + path;
    hmac.update(dataToSign);
    const signature = hmac.digest('hex');

    // --- Debug Logging ---
    console.log('--- Sumsub Auth Debug Info ---');
    console.log('Timestamp (X-Request-Ts):', ts);
    console.log('App Token (X-App-Token):', SUMSUB_APP_TOKEN ? 'Provided' : 'MISSING!'); // Don't log the token itself
    console.log('Secret Key:', SUMSUB_SECRET_KEY ? 'Provided' : 'MISSING!'); // Check if the secret key is loaded
    console.log('Method for Signature:', method.toUpperCase());
    console.log('Path for Signature:', path);
    console.log('Data Signed:', dataToSign);
    console.log('Calculated Signature (X-Request-Sig):', signature);
    console.log('--- End Debug Info ---');

    // --- Make Request to Sumsub API ---
    const sumsubResponse = await fetch(url, {
      method: method,
      headers: {
        'Accept': 'application/json',
        'X-App-Token': SUMSUB_APP_TOKEN,
        'X-Request-Ts': ts.toString(),
        'X-Request-Sig': signature,
        // Content-Type is NOT required for this GET-like request even though method is POST
      },
       // Body is not needed as parameters are in the query string for this endpoint
    });

    // --- Handle Sumsub API Response ---
    if (!sumsubResponse.ok) {
      const errorText = await sumsubResponse.text();
      console.error(`Sumsub API Error (${sumsubResponse.status}): ${errorText}`);
      throw new Error(`Sumsub API request failed with status ${sumsubResponse.status}`);
    }

    const responseData = await sumsubResponse.json();

    // --- Send Token Back to Frontend ---
    res.status(200).json({ accessToken: responseData.token });

  } catch (error) {
    console.error('Error generating Sumsub access token:', error);
    res.status(500).json({ message: 'Failed to generate verification token', error: error.message });
  }
} 
