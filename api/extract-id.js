// api/extract-id.js
const express = require('express');
const bodyParser = require('body-parser');
const Tesseract = require('tesseract.js');
const { Configuration, OpenAIApi } = require("openai");
const serverless = require('serverless-http');

const app = express();
app.use(bodyParser.json({ limit: '10mb' }));

// Configure OpenAI using your secure API key from environment variables.
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

// Use a root route so that the file maps directly to /api/extract-id
app.post('/', async (req, res) => {
  const { image } = req.body;
  if (!image) {
    return res.status(400).json({ error: "Image data is required." });
  }

  // Remove base64 header and convert to Buffer
  const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
  const imgBuffer = Buffer.from(base64Data, 'base64');

  try {
    console.log("Starting OCR processing with Tesseract.js...");
    const startOCR = Date.now();
    const { data: { text: ocrText } } = await Tesseract.recognize(imgBuffer, 'eng');
    console.log("Tesseract OCR completed in:", Date.now() - startOCR, "ms");
    console.log("OCR Extracted Text:", ocrText);

    const prompt = `Extract the ID details from the following text.

OCR Text: ${ocrText}

JSON:`;
    console.log("Constructed prompt for OpenAI:", prompt);

    const startOpenAI = Date.now();
    const completion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are an assistant that extracts ID details from OCR text." },
        { role: "user", content: prompt }
      ],
      temperature: 0,
      max_tokens: 150,
    });
    console.log("OpenAI API call completed in:", Date.now() - startOpenAI, "ms");

    const responseText = completion.data.choices[0].message.content;
    console.log("OpenAI raw response:", responseText);

    let idDetails;
    try {
      idDetails = JSON.parse(responseText);
    } catch (jsonError) {
      console.error("Error parsing OpenAI response:", jsonError);
      return res.status(500).json({
        error: "Failed to parse ID details from OpenAI response.",
        rawResponse: responseText
      });
    }

    res.json(idDetails);
  } catch (err) {
    console.error("Error processing image:", err);
    res.status(500).json({ error: "Failed to process image." });
  }
});

module.exports = serverless(app);
