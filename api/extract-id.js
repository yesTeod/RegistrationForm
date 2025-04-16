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

    // Convert base64 string to raw base64 data by removing the header
    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
    
    // Call OCR.space API
    const ocrResponse = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: {
        'apikey': process.env.OCR_SPACE_API_KEY || 'helloworld', // Use 'helloworld' for free demo key
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        base64Image: base64Data,
        language: 'eng',
        isOverlayRequired: false,
        scale: true,
        OCREngine: 2, // More accurate engine
      })
    });
    
    const ocrResult = await ocrResponse.json();
    
    if (!ocrResult.IsErroredOnProcessing && ocrResult.ParsedResults && ocrResult.ParsedResults.length > 0) {
      const extractedText = ocrResult.ParsedResults[0].ParsedText;
      console.log("OCR Extracted Text:", extractedText);
      
      // Parse extracted text to find ID details
      // This is a simple implementation - you might need more sophisticated parsing logic
      const idDetails = {
        name: extractNameFromText(extractedText),
        idNumber: extractIdNumberFromText(extractedText),
        expiry: extractExpiryFromText(extractedText)
      };
      
      return new Response(
        JSON.stringify(idDetails),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } else {
      console.error("OCR Processing Error:", ocrResult.ErrorMessage || "Unknown error");
      return new Response(
        JSON.stringify({ 
          error: ocrResult.ErrorMessage || "OCR processing failed", 
          name: "Not found", 
          idNumber: "Not found", 
          expiry: "Not found" 
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('Error processing request:', error);
    return new Response(
      JSON.stringify({ 
        error: "Processing error", 
        name: "Not found", 
        idNumber: "Not found", 
        expiry: "Not found" 
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// Helper functions to extract ID details from OCR text
function extractNameFromText(text) {
  // Look for common name patterns
  // This is a simplified example - adjust based on your ID card format
  const nameRegex = /name[:\s]+([A-Za-z\s]+)/i;
  const match = text.match(nameRegex);
  if (match && match[1]) {
    return match[1].trim();
  }
  
  // If specific pattern fails, try to find the most likely name
  // This assumes the name is usually at the beginning of the ID
  const lines = text.split('\n').filter(line => line.trim());
  if (lines.length > 0 && !lines[0].includes('ID') && !lines[0].includes('CARD')) {
    return lines[0].trim();
  }
  
  return "Not found";
}

function extractIdNumberFromText(text) {
  // Look for ID number patterns (usually digits with possible separators)
  const idRegex = /(?:id|number|#)[:\s]*([A-Z0-9\-\/]+)/i;
  const match = text.match(idRegex);
  if (match && match[1]) {
    return match[1].trim();
  }
  
  // Alternative: look for sequences of digits that could be ID numbers
  const digitSequences = text.match(/\b\d{6,12}\b/g);
  if (digitSequences && digitSequences.length > 0) {
    return digitSequences[0];
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
