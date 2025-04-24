// server.js
const express = require('express');
const bodyParser = require('body-parser');
const Tesseract = require('tesseract.js');
const { Configuration, OpenAIApi } = require("openai");

const app = express();
app.use(bodyParser.json({ limit: '10mb' })); // Increase payload limit to support images

// Configure OpenAI using your secure API key from environment variables.
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY, // ensure this is set securely
});
const openai = new OpenAIApi(configuration);

// POST endpoint to extract ID details
app.post('/api/extract-id', async (req, res) => {
  const { image } = req.body;
  if (!image) {
    return res.status(400).json({ error: "Image data is required." });
  }

  // Remove the base64 data header if present (e.g., "data:image/png;base64,")
  const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
  const imgBuffer = Buffer.from(base64Data, 'base64');

  try {
    // Use Tesseract.js to perform OCR on the image buffer
    const { data: { text: ocrText } } = await Tesseract.recognize(imgBuffer, 'eng');
    
    // Build a prompt instructing OpenAI to extract the ID details.
    // Here, we expect a JSON response with keys: "name", "idNumber", and "expiry".
    const prompt = `Extract the ID details from the following text. 
Return the details in JSON with the keys "name", "idNumber", and "expiry". 
If any detail is missing, output "Not Found" for that field.

OCR Text:
${ocrText}

JSON:`;

    // Call OpenAI ChatCompletion API (using model gpt-3.5-turbo) with a deterministic setup.
    const completion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
         { role: "system", content: "You are an assistant that extracts ID details from OCR text." },
         { role: "user", content: prompt }
      ],
      temperature: 0,  // deterministic response
      max_tokens: 150,
    });

    // Retrieve and parse OpenAI's response.
    const responseText = completion.data.choices[0].message.content;
    let idDetails;
    try {
      idDetails = JSON.parse(responseText);
    } catch (jsonError) {
      // If JSON parsing fails, return an error (or attempt alternative parsing)
      return res.status(500).json({ 
        error: "Failed to parse ID details from OpenAI response.", 
        rawResponse: responseText 
      });
    }
    
    // Return the extracted details as JSON.
    res.json(idDetails);
    
  } catch (err) {
    console.error("Error processing image:", err);
    res.status(500).json({ error: "Failed to process image." });
  }
});

// Start the server on the specified port or default to 3000.
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
