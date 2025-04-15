const express = require('express');
const serverless = require('serverless-http');

const app = express();
app.use(express.json({ limit: '10mb' }));

app.post('/', (req, res) => {
  console.log("Received request:", req.method, req.url);
  res.status(200).json({ name: "Test", idNumber: "12345", expiry: "01/01/2099" });
});

module.exports = serverless(app);
