import { createWorker } from 'tesseract.js';
import { Configuration, OpenAIApi } from 'openai';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  
  const { image } = req.body;
  if (!image) {
    return res.status(400).json({ error: "Image data is required." });
  }

  // Remove header and convert base64 string to Buffer.
  const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
  const imgBuffer = Buffer.from(base64Data, 'base64');

  try {
    console.log('Starting OCR processing with Tesseract.js using createWorker...');

    // Create and configure the worker with explicit asset paths.
    const worker = createWorker({
      logger: (m) => console.log(m),
      workerPath: 'https://unpkg.com/tesseract.js@2.1.5/dist/worker.min.js',
      corePath: 'https://unpkg.com/tesseract.js-core@2.1.1/tesseract-core.wasm.js',
    });

    const startOCR = Date.now();
    await worker.load();
    await worker.loadLanguage('eng');
    await worker.initialize('eng');
    const { data: { text: ocrText } } = await worker.recognize(imgBuffer);
    await worker.terminate();
    console.log('Tesseract OCR completed in:', Date.now() - startOCR, 'ms');
    console.log('OCR Output:', ocrText);

    // Construct prompt for OpenAI.
    const prompt = `Extract the ID details from the following text.

OCR Text: ${ocrText}

JSON:`;
    console.log('Constructed prompt:', prompt);

    // Configure and initialize OpenAI.
    const configuration = new Configuration({
      apiKey: process.env.OPENAI_API_KEY,
    });
    const openai = new OpenAIApi(configuration);
    
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
    console.log('OpenAI API call completed in:', Date.now() - startOpenAI, 'ms');

    const responseText = completion.data.choices[0].message.content;
    console.log('OpenAI raw response:', responseText);

    let idDetails;
    try {
      idDetails = JSON.parse(responseText);
    } catch (jsonError) {
      console.error('Error parsing JSON from OpenAI:', jsonError);
      return res.status(500).json({
        error: "Failed to parse ID details from OpenAI response.",
        rawResponse: responseText,
      });
    }

    res.status(200).json(idDetails);
  } catch (err) {
    console.error('Error processing image:', err);
    res.status(500).json({ error: "Failed to process image." });
  }
}
