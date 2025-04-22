// in verify-face.js
import {
  RekognitionClient,
  DetectFacesCommand,
  CompareFacesCommand
} from "@aws-sdk/client-rekognition";

const client = new RekognitionClient({ region: process.env.AWS_REGION });

async function hasFace(buffer) {
  const resp = await client.send(
    new DetectFacesCommand({ Image: { Bytes: buffer }, Attributes: ["DEFAULT"] })
  );
  return Array.isArray(resp.FaceDetails) && resp.FaceDetails.length > 0;
}

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

    // strip DataURL prefix
    const [, baseId] = idImage.split(',');
    const [, baseSelfie] = selfie.split(',');
    const sourceBuffer = Buffer.from(baseId, 'base64');
    const targetBuffer = Buffer.from(baseSelfie, 'base64');

    // 1) Check for face in ID image
    if (!await hasFace(sourceBuffer)) {
      return res.status(400).json({ error: 'No face detected in ID image' });
    }

    // 2) Check for face in selfie
    if (!await hasFace(targetBuffer)) {
      return res.status(400).json({ error: 'No face detected in selfie' });
    }

    // 3) Now compare
    const compare = new CompareFacesCommand({
      SourceImage: { Bytes: sourceBuffer },
      TargetImage: { Bytes: targetBuffer },
      SimilarityThreshold: 80
    });
    const { FaceMatches } = await client.send(compare);
    const match = Array.isArray(FaceMatches) && FaceMatches.length > 0;

    return res.status(200).json({ match });
  } catch (err) {
    // Distinguish real parameter errors from “no face” cases
    if (err.name === 'InvalidParameterException') {
      return res
        .status(400)
        .json({ error: 'Invalid parameters in face comparison', details: err.message });
    }
    console.error('verify-face error:', err);
    return res.status(500).json({ error: 'Face verification failed', details: err.message });
  }
}
