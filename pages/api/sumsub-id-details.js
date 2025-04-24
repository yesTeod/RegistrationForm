import crypto from 'crypto';
import fetch from 'node-fetch';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'Missing user ID' });
    }
    
    // Your Sumsub credentials
    const APP_TOKEN = process.env.SUMSUB_APP_TOKEN;
    const SECRET_KEY = process.env.SUMSUB_SECRET_KEY;
    
    // Base URL
    const SUMSUB_BASE_URL = 'https://api.sumsub.com';
    
    // First get the applicant ID from external user ID
    const applicantUrl = `${SUMSUB_BASE_URL}/resources/applicants?externalUserId=${encodeURIComponent(userId)}`;
    
    // Sign request
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = crypto
      .createHmac('sha256', SECRET_KEY)
      .update(timestamp + 'GET' + '/resources/applicants?externalUserId=' + encodeURIComponent(userId))
      .digest('hex');
    
    const applicantResponse = await fetch(applicantUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-App-Token': APP_TOKEN,
        'X-App-Access-Sig': signature,
        'X-App-Access-Ts': timestamp
      }
    });
    
    if (!applicantResponse.ok) {
      console.error('Error fetching applicant:', await applicantResponse.text());
      return res.status(applicantResponse.status).json({ error: 'Failed to fetch applicant' });
    }
    
    const applicantData = await applicantResponse.json();
    
    if (!applicantData.totalItems || applicantData.totalItems === 0) {
      return res.status(404).json({ error: 'Applicant not found' });
    }
    
    const applicantId = applicantData.items[0].id;
    
    // Now get the info docs (ID details)
    const infoUrl = `${SUMSUB_BASE_URL}/resources/applicants/${applicantId}/info`;
    
    const infoSignature = crypto
      .createHmac('sha256', SECRET_KEY)
      .update(timestamp + 'GET' + '/resources/applicants/' + applicantId + '/info')
      .digest('hex');
    
    const infoResponse = await fetch(infoUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-App-Token': APP_TOKEN,
        'X-App-Access-Sig': infoSignature,
        'X-App-Access-Ts': timestamp
      }
    });
    
    if (!infoResponse.ok) {
      console.error('Error fetching applicant info:', await infoResponse.text());
      return res.status(infoResponse.status).json({ error: 'Failed to fetch applicant info' });
    }
    
    const infoData = await infoResponse.json();
    
    // Extract relevant ID data from the response
    const idData = {
      firstName: infoData.firstName || infoData.info?.firstName,
      lastName: infoData.lastName || infoData.info?.lastName,
      middleName: infoData.middleName || infoData.info?.middleName,
      number: infoData.idNumber || infoData.info?.idNumber,
      validUntil: infoData.idExpiry || infoData.info?.idExpiry
    };
    
    return res.status(200).json({ idData });
    
  } catch (error) {
    console.error('Error fetching ID details:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}