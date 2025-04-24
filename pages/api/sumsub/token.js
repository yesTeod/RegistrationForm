import fetch from 'node-fetch';

export const config = {
  runtime: 'edge',
  regions: ['iad1'],
};

export default async function handler(request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const { email, phone, userId } = await request.json();
    const apiUrl = process.env.SUMSUB_API_URL || 'https://api.sumsub.com';
    const res = await fetch(`${apiUrl}/resources/accessTokens/sdk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-App-Token': process.env.SUMSUB_APP_TOKEN,
        'X-App-Access-Secret': process.env.SUMSUB_APP_SECRET,
      },
      body: JSON.stringify({
        applicantIdentifiers: { email, phone },
        userId,
        levelName: process.env.SUMSUB_LEVEL_NAME || 'basic-kyc-level',
        ttlInSecs: 3600,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return new Response(JSON.stringify({ error: err }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }

    const data = await res.json();
    return new Response(JSON.stringify({ token: data.token, userId: data.userId }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}