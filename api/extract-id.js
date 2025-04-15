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
  // Bypass processing for test
  return res.json({ name: "Test", idNumber: "12345", expiry: "01/01/2099" });
});


module.exports = serverless(app);
