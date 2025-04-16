// Using node-fetch for API requests
import fetch from 'node-fetch';

// This is a Vercel Edge Function - better for long-running processes
export const config = {
  runtime: 'edge',
  regions: ['iad1'], // US East (N. Virginia)
};

export default async function handler(request) {
  // Only accept POST requests
  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Parse the request body
    const data = await request.json();
    const { image } = data;

    if (!image) {
      return new Response(
        JSON.stringify({ error: "Image data is required" }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Keep the original data URI format if it exists, or add it if it doesn't
    const base64Image = image.startsWith('data:image/') 
      ? image 
      : `data:image/jpeg;base64,${image}`;
    
    // Call OCR.space API
    const formData = {
      base64Image: base64Image,
      apikey: process.env.OCR_SPACE_API_KEY || 'helloworld',
      language: 'eng',
      isOverlayRequired: false,
      scale: true,
      OCREngine: 2, // More accurate engine
      detectOrientation: true, // Auto-detect image orientation
      filetype: 'jpg'  // Use lowercase 'jpg'
    };

    console.log('Sending request to OCR.space...');
    
    const ocrResponse = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(formData).toString()
    });
    
    if (!ocrResponse.ok) {
      throw new Error(`OCR API responded with status: ${ocrResponse.status}`);
    }

    const ocrResult = await ocrResponse.json();
    console.log('OCR Response:', JSON.stringify(ocrResult, null, 2));
    
    if (!ocrResult.IsErroredOnProcessing && ocrResult.ParsedResults && ocrResult.ParsedResults.length > 0) {
      const extractedText = ocrResult.ParsedResults[0].ParsedText;
      console.log("OCR Extracted Text:", extractedText);
      
      // Use updated function to extract name and father's name
      const nameDetails = extractNameFromText(extractedText);
      
      const idDetails = {
        name: nameDetails.name,
        fatherName: nameDetails.fatherName,
        idNumber: extractIdNumberFromText(extractedText),
        expiry: extractExpiryFromText(extractedText)
      };
      
      return new Response(
        JSON.stringify(idDetails),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } else {
      const errorMessage = ocrResult.ErrorMessage || ocrResult.ErrorDetails || "Unknown OCR processing error";
      console.error("OCR Processing Error:", errorMessage);
      return new Response(
        JSON.stringify({ 
          error: errorMessage, 
          name: "Not found", 
          fatherName: "Not found",
          idNumber: "Not found", 
          expiry: "Not found",
          debug: { 
            isErrored: ocrResult.IsErroredOnProcessing,
            hasResults: Boolean(ocrResult.ParsedResults),
            resultCount: ocrResult.ParsedResults?.length || 0
          }
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('Error processing request:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || "Processing error", 
        name: "Not found", 
        fatherName: "Not found",
        idNumber: "Not found", 
        expiry: "Not found" 
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// Helper function to extract the name and father's name from OCR text
function extractNameFromText(text) {
  // Split text into lines and clean them
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  
  // Common header/footer text to ignore
  const commonHeaders = [
    'european union',
    'identity card',
    'identification',
    'republic',
    'national',
    'card',
    'valid',
    'signature',
    'nationality',
    'birth',
    'issued',
    'expiry',
    'sex',
    'government',
    'authority'
  ];
  
  // First, try to find a pattern that uses s/o or d/o (son/daughter of)
  const fatherPattern = /([A-Za-z\s]{2,})\s+(?:s\/o|d\/o|S\/O|D\/O|son\s+of|daughter\s+of)\s+([A-Za-z\s]{2,})/i;
  const fullText = lines.join(' ');
  const fatherMatch = fullText.match(fatherPattern);
  if (fatherMatch) {
    const personName = fatherMatch[1].trim();
    const fatherName = fatherMatch[2].trim();
    // Ensure that neither value matches any common header keywords
    if (!commonHeaders.some(header => 
        personName.toLowerCase().includes(header) || 
        fatherName.toLowerCase().includes(header))) {
      return { name: personName, fatherName: fatherName };
    }
  }

  // If no s/o pattern was found, look for potential name lines in the first few entries
  let names = [];
  
  for (let i = 0; i < Math.min(7, lines.length); i++) {
    const line = lines[i];
    const lowerLine = line.toLowerCase();
    
    // Skip the line if it contains header words, only numbers, is too short, or contains date-like patterns
    if (commonHeaders.some(header => lowerLine.includes(header)) ||
        /^\d+$/.test(line) ||
        line.length < 3 ||
        /[0-9\/]/.test(line) ||
        /^[A-Z\s]+$/.test(line)) {
      continue;
    }
    
    // Check if the line looks like a valid name (starting with a capital letter)
    if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*$/.test(line)) {
      names.push(line);
      // Return as soon as you get two valid name lines (first is person's name, second is father's name)
      if (names.length === 2) {
        return { name: names[0], fatherName: names[1] };
      }
    }
  }
  
  // If only one valid name was found, return it and default father's name to "Not found"
  if (names.length === 1) {
    return { name: names[0], fatherName: "Not found" };
  }
  
  return { name: "Not found", fatherName: "Not found" };
}

function extractIdNumberFromText(text) {
  // Look for document number patterns
  const docPatterns = [
    /doc(?:ument)?\s*(?:no|number|#)?[:\s]*([A-Z0-9\-\/]+)/i,
    /card\s*(?:no|number|#)?[:\s]*([A-Z0-9\-\/]+)/i,
    /no[:\s]*([A-Z0-9\-\/]{6,})/i
  ];
  
  for (const pattern of docPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  // Alternative: look for sequences of digits and letters that could be document numbers
  const numberPattern = /\b[A-Z0-9\-\/]{6,}\b/g;
  const matches = text.match(numberPattern);
  if (matches) {
    // Filter out dates and other common number patterns
    const validMatches = matches.filter(match => 
      !/^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}$/.test(match) && // not a date
      !/^\d+$/.test(match) // not just a sequence of numbers
    );
    if (validMatches.length > 0) {
      return validMatches[0];
    }
  }
  
  return "Not found";
}

function extractExpiryFromText(text) {
  // Look for expiry date patterns
  const expiryRegex = /(?:expiry|expiration|exp|valid until)[:\s]*([\d\/\.\-]+)/i;
  const match = text.match(expiryRegex);
  if (match && match[1]) {
    return match[1].trim();
  }
  
  // Alternative: look for date patterns
  const datePatterns = text.match(/\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/g);
  if (datePatterns && datePatterns.length > 0) {
    // Usually the last date on an ID is the expiry
    return datePatterns[datePatterns.length - 1];
  }
  
  return "Not found";
}
