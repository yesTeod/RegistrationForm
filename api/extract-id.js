// api/extract-id.js
const express = require('express');
const bodyParser = require('body-parser');
const Tesseract = require('tesseract.js');
const { Configuration, OpenAIApi } = require("openai");
const serverless = require('serverless-http');

const app = express();
app.use(bodyParser.json({ limit: '10mb' }));

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

app.post('/api/extract-id', async (req, res) => {
  const { image } = req.body;
  if (!image) {
    return res.status(400).json({ error: "Image data is required." });
  }

  const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
  const imgBuffer = Buffer.from(base64Data, 'base64');

  try {
    const { data: { text: ocrText } } = await Tesseract.recognize(imgBuffer, 'eng');
    const prompt = `Extract the ID details from the following text. 

OCR Text: ${ocrText}

JSON:`;

   const completion = await openai.createChatCompletion({
     model: "gpt-3.5-turbo",
     messages: [
       { role: "system", content: "You are an assistant that extracts ID details from OCR text." },
       { role: "user", content: prompt }
     ],
     temperature: 0,
     max_tokens: 150,
   });

   const responseText = completion.data.choices[0].message.content;
   let idDetails;
   try {
     idDetails = JSON.parse(responseText);
   } catch (jsonError) {
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