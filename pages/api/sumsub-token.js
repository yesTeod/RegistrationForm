// pages/api/sumsub-token.js

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { externalUserId, levelName, ttlInSecs = 600 } = req.body;
  if (!externalUserId || !levelName) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    // Call Sumsub SDK token endpoint
    const sumsubRes = await fetch(
      'https://api.sumsub.com/resources/accessTokens/sdk',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-App-Token': process.env.SUMSUB_APP_TOKEN,
        },
        body: JSON.stringify({
          userId: externalUserId,
          levelName,
          ttlInSecs,
        }),
      }
    );

    if (!sumsubRes.ok) {
      const errData = await sumsubRes.json().catch(() => ({}));
      throw new Error(errData.description || `Sumsub error: ${sumsubRes.status}`);
    }

    const data = await sumsubRes.json();
    return res.status(200).json({ token: data.token, userId: data.userId });

  } catch (err) {
    console.error('Token generation error:', err);
    return res.status(500).json({ error: err.message });
  }
}
