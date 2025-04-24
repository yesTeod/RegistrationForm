import crypto from 'crypto';
import fetch from 'node-fetch';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { applicantId } = req.query;
    
    if (!applicantId) {
      return res.status(400).json({ error: 'Missing applicant ID' });
    }
    
    // Your Sumsub credentials
    const APP_TOKEN = process.env.SUMSUB_APP_TOKEN;
    const SECRET_KEY = process.env.SUMSUB_SECRET_KEY;
    
    // Base URL
    const SUMSUB_BASE_URL = 'https://api.sumsub.com';
    
    // URL to get applicant status
    const url = `${SUMSUB_BASE_URL}/resources/applicants/${applicantId}/status`;
    
    // Sign request
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = crypto
      .createHmac('sha256', SECRET_KEY)
      .update(timestamp + 'GET' + '/resources/applicants/' + applicantId + '/status')
      .digest('hex');
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-App-Token': APP_TOKEN,
        'X-App-Access-Sig': signature,
        'X-App-Access-Ts': timestamp
      }
    });
    
    if (!response.ok) {
      console.error('Error checking applicant status:', await response.text());
      return res.status(response.status).json({ error: 'Failed to check applicant status' });
    }
    
    const statusData = await response.json();
    
    return res.status(200).json(statusData);
    
  } catch (error) {
    console.error('Error checking Sumsub status:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}