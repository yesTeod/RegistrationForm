// api/extract-id.js
import { createWorker } from 'tesseract.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { image } = req.body;
  if (!image) {
    return res.status(400).json({ error: 'Image data is required.' });
  }
  
  try {
    // Create an OCR worker
    const worker = createWorker({
      logger: (m) => console.log(m), // optional, logs progress info
      // You can also specify paths if needed:
      // corePath: '/path/to/tesseract-core.wasm.js',
      // workerPath: '/path/to/tesseract-worker.js',
      // langPath: './lang-data'  // if you want to preload traineddata files from disk
    });
    
    await worker.load();
    await worker.loadLanguage('eng');
    await worker.initialize('eng');

    // Perform OCR; you can pass a Buffer or a base64 image string.
    const { data: { text: ocrText } } = await worker.recognize(image);

    await worker.terminate();

    // Here, you can construct a prompt for OpenAI and send it if needed.
    // For example, to extract more structured data, you might do:
    // const prompt = `Extract the ID details from the following text.
    //
    // OCR Text: ${ocrText}
    //
    // JSON:`;
    // And call your OpenAI API accordingly.
    
    // For now, return the OCR text:
    res.status(200).json({ ocrText });
  } catch (error) {
    console.error('OCR processing failed:', error);
    res.status(500).json({ error: 'OCR processing failed.' });
  }
}
