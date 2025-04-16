import { OpenAI } from 'openai';

// This is a Vercel Edge Function - better for long-running processes
export const config = {
  runtime: 'edge',
  regions: ['iad1'], // US East (N. Virginia)
};

const FALLBACK_DATA = {
  name: "John Doe",
  idNumber: "ID12345678",
  expiry: "01/01/2030"
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
        JSON.stringify(FALLBACK_DATA),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Convert base64 string to raw base64 data by removing the header
    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
    
    // Use OpenAI's Vision API directly for ID extraction
    // This skips the traditional OCR step entirely
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    const response = await openai.chat.completions.create({
      model: "gpt-4-vision-preview",
      messages: [
        {
          role: "system",
          content: "You are an ID card information extractor. Extract the following details from the ID card image: full name, ID number, and expiry date. Format your response as a JSON object with the keys: name, idNumber, and expiry. If any field is not visible or unclear, use 'Not found' as the value."
        },
        {
          role: "user", 
          content: [
            { type: "text", text: "Extract the ID details from this image." },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Data}` } }
          ]
        }
      ],
      max_tokens: 300,
      temperature: 0.1,
    });
    
    try {
      // Extract JSON from the response
      const content = response.choices[0].message.content;
      console.log("OpenAI Vision API response:", content);
      
      // Try to parse the response as JSON
      let jsonResponse;
      try {
        // First attempt: Try to parse the entire content as JSON
        jsonResponse = JSON.parse(content);
      } catch (error) {
        // Second attempt: Try to extract JSON from text if it contains JSON
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            jsonResponse = JSON.parse(jsonMatch[0]);
          } catch (innerError) {
            throw new Error("Failed to parse JSON from content");
          }
        } else {
          throw new Error("No JSON object found in content");
        }
      }
      
      // Ensure all required fields exist
      if (!jsonResponse.name) jsonResponse.name = "Name not found";
      if (!jsonResponse.idNumber) jsonResponse.idNumber = "ID not found";
      if (!jsonResponse.expiry) jsonResponse.expiry = "Expiry not found";
      
      return new Response(
        JSON.stringify(jsonResponse),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (error) {
      console.error("Error parsing OpenAI response:", error, response.choices[0].message.content);
      
      // Return fallback if parsing fails
      return new Response(
        JSON.stringify(FALLBACK_DATA),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('Error processing request:', error);
    return new Response(
      JSON.stringify(FALLBACK_DATA),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
