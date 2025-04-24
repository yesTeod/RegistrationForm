import crypto from 'crypto';
import fetch from 'node-fetch';

// Protect this with proper authentication middleware in production
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, levelName, ttlInSecs } = req.body;
    
    if (!userId || !levelName) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    // Your Sumsub credentials - store these securely in environment variables
    const APP_TOKEN = process.env.SUMSUB_APP_TOKEN;
    const SECRET_KEY = process.env.SUMSUB_SECRET_KEY;
    
    // Base URL
    const SUMSUB_BASE_URL = 'https://api.sumsub.com';
    
    // Create applicant if not exists or get existing one
    const externalUserId = userId;
    const applicantUrl = `${SUMSUB_BASE_URL}/resources/applicants?externalUserId=${encodeURIComponent(externalUserId)}`;
    
    // Sign request
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = crypto
      .createHmac('sha256', SECRET_KEY)
      .update(timestamp + 'GET' + '/resources/applicants?externalUserId=' + encodeURIComponent(externalUserId))
      .digest('hex');
    
    // Check if applicant exists
    const applicantResponse = await fetch(applicantUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-App-Token': APP_TOKEN,
        'X-App-Access-Sig': signature,
        'X-App-Access-Ts': timestamp
      }
    });
    
    let applicantId;
    
    if (applicantResponse.ok) {
      const applicantData = await applicantResponse.json();
      
      if (applicantData.totalItems > 0) {
        // Applicant exists
        applicantId = applicantData.items[0].id;
      } else {
        // Create new applicant
        const createApplicantUrl = `${SUMSUB_BASE_URL}/resources/applicants`;
        const createBody = JSON.stringify({
          externalUserId: externalUserId,
          requiredIdDocs: {
            docSets: [
              {
                idDocSetType: 'IDENTITY',
                types: ['PASSPORT', 'ID_CARD', 'DRIVERS', 'RESIDENCE_PERMIT'],
                subTypes: []
              }
            ]
          }
        });
        
        const createSignature = crypto
          .createHmac('sha256', SECRET_KEY)
          .update(timestamp + 'POST' + '/resources/applicants' + createBody)
          .digest('hex');
        
        const createResponse = await fetch(createApplicantUrl, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'X-App-Token': APP_TOKEN,
            'X-App-Access-Sig': createSignature,
            'X-App-Access-Ts': timestamp
          },
          body: createBody
        });
        
        if (!createResponse.ok) {
          const errorData = await createResponse.json();
          console.error('Error creating applicant:', errorData);
          return res.status(createResponse.status).json({ error: 'Failed to create applicant' });
        }
        
        const newApplicant = await createResponse.json();
        applicantId = newApplicant.id;
      }
    } else {
      console.error('Error checking applicant:', await applicantResponse.text());
      return res.status(applicantResponse.status).json({ error: 'Failed to check applicant' });
    }
    
    // Now generate an access token for this applicant
    const tokenUrl = `${SUMSUB_BASE_URL}/resources/accessTokens?userId=${encodeURIComponent(externalUserId)}&ttlInSecs=${ttlInSecs || 1200}&levelName=${encodeURIComponent(levelName)}`;
    
    const tokenSignature = crypto
      .createHmac('sha256', SECRET_KEY)
      .update(timestamp + 'POST' + '/resources/accessTokens?userId=' + encodeURIComponent(externalUserId) + '&ttlInSecs=' + (ttlInSecs || 1200) + '&levelName=' + encodeURIComponent(levelName))
      .digest('hex');
    
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'X-App-Token': APP_TOKEN,
        'X-App-Access-Sig': tokenSignature,
        'X-App-Access-Ts': timestamp
      }
    });
    
    if (!tokenResponse.ok) {
      console.error('Error generating token:', await tokenResponse.text());
      return res.status(tokenResponse.status).json({ error: 'Failed to generate access token' });
    }
    
    const tokenData = await tokenResponse.json();
    
    // Return the token to the client
    return res.status(200).json({ 
      token: tokenData.token,
      applicantId: applicantId
    });
    
  } catch (error) {
    console.error('Error generating Sumsub token:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}