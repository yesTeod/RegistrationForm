// src/pages/api/sumsub-token.js

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { externalUserId, levelName, ttlInSecs = 600 } = req.body;
  if (!externalUserId || !levelName) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    // Call Sumsub SDK token endpoint
    // Build request payload
    const { externalUserId, levelName, ttlInSecs = 600, applicantIdentifiers, externalActionId } = req.body;
    const payload = {
      userId: externalUserId,
      levelName,
      ttlInSecs,
    };
    if (applicantIdentifiers) payload.applicantIdentifiers = applicantIdentifiers;
    if (externalActionId) payload.externalActionId = externalActionId;

    const sumsubRes = await fetch(
      'https://api.sumsub.com/resources/accessTokens/sdk',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-App-Token': process.env.SUMSUB_APP_TOKEN,
        },
        body: JSON.stringify(payload),
      }
    );

    if (!sumsubRes.ok) {
      const errData = await sumsubRes.json().catch(() => ({}));
      throw new Error(errData.description || `Sumsub error: ${sumsubRes.status}`);
    }

    const data = await sumsubRes.json();
    return res.status(200).json({ token: data.token, userId: data.userId });.json({ token: data.token, userId: data.userId });

  } catch (err) {
    console.error('Token generation error:', err);
    return res.status(500).json({ error: err.message });
  }
}
