import { RekognitionClient, DetectFacesCommand } from "@aws-sdk/client-rekognition";

const client = new RekognitionClient({ region: process.env.AWS_REGION });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'Image data is required' });
    }

    // Decode Data URL
    const [, base] = image.split(',');
    const buffer = Buffer.from(base, 'base64');

    // Call Rekognition DetectFaces
    const command = new DetectFacesCommand({ Image: { Bytes: buffer }, Attributes: ["DEFAULT"] });
    const response = await client.send(command);
    const faceDetected = Array.isArray(response.FaceDetails) && response.FaceDetails.length > 0;

    return res.status(200).json({ faceDetected });
  } catch (err) {
    console.error('detect-face error:', err);
    return res.status(500).json({ error: 'Face detection failed', details: err.message });
  }
}