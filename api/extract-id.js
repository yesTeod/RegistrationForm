import { createWorker } from 'tesseract.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  
  const { image } = req.body;
  if (!image) {
    return res.status(400).json({ error: "Image data is required." });
  }

  // Remove the data header and convert the base64 string to a Buffer.
  const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
  const imgBuffer = Buffer.from(base64Data, 'base64');

  try {
    console.log('Starting OCR processing with Tesseract.js using createWorker...');
    
    // Initialize a new worker
    const worker = createWorker({
      // Optionally, set logger to see debug messages
      logger: (message) => console.log(message),
      // If needed, explicitly set paths (adjust the paths based on your deployment)
      // corePath: 'path/to/tesseract-core.wasm.js',
      // workerPath: 'path/to/worker.min.js',
      // langPath: 'path/to/lang-data',
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

    // Initialize the OpenAI API.
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

    // Return the extracted ID details.
    res.status(200).json(idDetails);
  } catch (err) {
    console.error('Error processing image:', err);
    res.status(500).json({ error: "Failed to process image." });
  }
}
