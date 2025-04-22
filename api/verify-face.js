import { RekognitionClient, CompareFacesCommand } from "@aws-sdk/client-rekognition";

// Default Node.js runtime (not Edge)
const client = new RekognitionClient({ region: process.env.AWS_REGION });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { idImage, selfie } = req.body;
    if (!idImage || !selfie) {
      return res.status(400).json({ error: 'Both idImage and selfie are required' });
    }

    // Decode Data URLs
    const [, baseId] = idImage.split(',');
    const [, baseSelfie] = selfie.split(',');
    const sourceBuffer = Buffer.from(baseId, 'base64');
    const targetBuffer = Buffer.from(baseSelfie, 'base64');

    // Prepare Rekognition command
    const command = new CompareFacesCommand({
      SourceImage: { Bytes: sourceBuffer },
      TargetImage: { Bytes: targetBuffer },
      SimilarityThreshold: 80,
    });

    // Call AWS Rekognition
    const response = await client.send(command);
    const match = Array.isArray(response.FaceMatches) && response.FaceMatches.length > 0;

    return res.status(200).json({ match });
  } catch (error) {
    console.error('verify-face error:', error);
    return res.status(500).json({ error: 'Face verification failed', details: error.message });
  }
}