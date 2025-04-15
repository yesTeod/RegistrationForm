// api/extract-id.js
const express = require('express');
const bodyParser = require('body-parser');
const serverless = require('serverless-http');

const app = express();

// Increase the payload limit if needed
app.use(bodyParser.json({ limit: '10mb' }));

// Define a simple test route at the root
app.post('/', async (req, res) => {
  console.log("Received request:", req.method, req.url);
  return res.json({ name: "Test", idNumber: "12345", expiry: "01/01/2099" });
});

module.exports = serverless(app);
