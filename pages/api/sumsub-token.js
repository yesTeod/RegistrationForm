import crypto from 'crypto';
import axios from 'axios';

// Your Sumsub credentials - these will be loaded from Vercel environment variables
const SUMSUB_APP_TOKEN = process.env.SUMSUB_APP_TOKEN;
const SUMSUB_SECRET_KEY = process.env.SUMSUB_SECRET_KEY;
const SUMSUB_BASE_URL = 'https://api.sumsub.com';

// Create a signature for Sumsub API requests
function createSignature(ts, method, endpoint, body) {
  const signature = crypto.createHmac('sha256', SUMSUB_SECRET_KEY);
  signature.update(ts + method + endpoint);
  
  if (body) {
    signature.update(body);
  }
  
  return signature.digest('hex');
}

// Make a signed request to Sumsub API
async function makeRequest(method, endpoint, body = null) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  
  const headers = {
    'X-App-Token': SUMSUB_APP_TOKEN,
    'X-App-Access-Sig': createSignature(timestamp, method, endpoint, body ? JSON.stringify(body) : ''),
    'X-App-Access-Ts': timestamp,
  };
  
  if (body) {
    headers['Content-Type'] = 'application/json';
  }
  
  try {
    const response = await axios({
      method,
      url: SUMSUB_BASE_URL + endpoint,
      headers,
      data: body,
    });
    
    return response.data;
  } catch (error) {
    console.error('Sumsub API error:', error.response?.data || error.message);
    throw new Error(error.response?.data?.description || 'Error communicating with verification service');
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const { externalUserId, levelName, ttlInSecs = 600 } = req.body;
    
    if (!externalUserId || !levelName) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    // Create access token
    const endpoint = `/resources/accessTokens?userId=${encodeURIComponent(externalUserId)}&levelName=${encodeURIComponent(levelName)}&ttlInSecs=${ttlInSecs}`;
    const tokenData = await makeRequest('POST', endpoint);
    
    return res.status(200).json({ token: tokenData.token });
  } catch (error) {
    console.error('Token generation error:', error);
    return res.status(500).json({ error: error.message || 'Failed to generate access token' });
  }
}