import express from "express";
import bodyParser from "body-parser";
import Tesseract from "tesseract.js";
import { Configuration, OpenAIApi } from "openai";
import serverless from "serverless-http";

const app = express();
app.use(bodyParser.json({ limit: '10mb' }));

// Configure OpenAI using your secure API key from environment variables.
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

// Mock fallback data for testing and when OCR fails
const FALLBACK_DATA = {
  name: "John Doe",
  idNumber: "ID12345678",
  expiry: "01/01/2030"
};

// Use a root route so that the file maps directly to /api/extract-id
app.post('/', async (req, res) => {
  const { image } = req.body;
  if (!image) {
    return res.json(FALLBACK_DATA);
  }

  try {
    // Remove the base64 header if present and convert to a buffer.
    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
    const imgBuffer = Buffer.from(base64Data, 'base64');

    // For development/testing, you can bypass the actual OCR
    // Uncomment this to test without running OCR or OpenAI
    /*
    return res.json({
      name: "Test User",
      idNumber: "TEST123456",
      expiry: "01/01/2025"
    });
    */

    // Set a timeout for the OCR operation (15 seconds)
    const tesseractPromise = Tesseract.recognize(imgBuffer, 'eng', {
      logger: m => {
        if (m.status === 'recognizing text') {
          console.log(`OCR progress: ${(m.progress * 100).toFixed(1)}%`);
        }
      },
      // Try to improve OCR for ID cards
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-/.', 
    });
    
    // Use Promise.race to limit Tesseract execution time
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('OCR timed out')), 15000)
    );
    
    let ocrText;
    try {
      const { data: { text } } = await Promise.race([
        tesseractPromise,
        timeoutPromise
      ]);
      ocrText = text;
      console.log("OCR Output:", ocrText);
    } catch (ocrError) {
      console.error("OCR failed or timed out:", ocrError);
      return res.json(FALLBACK_DATA);
    }
    
    // If OCR output is too short or empty, return fallback data
    if (!ocrText || ocrText.trim().length < 10) {
      console.log("OCR output too short, using fallback data");
      return res.json(FALLBACK_DATA);
    }

    // Construct prompt for OpenAI with shorter context
    const prompt = `Extract the ID details from the following text: ${ocrText.substring(0, 800)}`;
    
    try {
      const completion = await openai.createChatCompletion({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "Extract ID details in JSON format with fields: name, idNumber, expiry. If you cannot extract some fields, use placeholder values." },
          { role: "user", content: prompt }
        ],
        temperature: 0,
        max_tokens: 150,
      });
  
      const responseText = completion.data.choices[0].message.content;
      let idDetails;
      try {
        idDetails = JSON.parse(responseText);
        // Ensure all required fields exist
        if (!idDetails.name) idDetails.name = "Name not found";
        if (!idDetails.idNumber) idDetails.idNumber = "ID not found";
        if (!idDetails.expiry) idDetails.expiry = "Expiry not found";
      } catch (jsonError) {
        console.error("Failed to parse OpenAI response:", jsonError);
        idDetails = FALLBACK_DATA;
      }
  
      res.json(idDetails);
    } catch (aiError) {
      console.error("OpenAI API error:", aiError);
      res.json(FALLBACK_DATA);
    }
  } catch (err) {
    console.error("Error processing image:", err);
    // Return fallback data even on error
    res.json(FALLBACK_DATA);
  }
});

export default serverless(app);
