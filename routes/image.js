import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import mime from 'mime';

const router = express.Router();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Multer config to upload images to /uploads
const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname),
});
const upload = multer({ storage });

function fileToBase64(filePath) {
  console.log('Processing file:', filePath);
  const extension = path.extname(filePath).toLowerCase();
  
  // Explicit MIME type mapping for common image formats
  const mimeTypeMap = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp'
  };
  
  const mimeType = mimeTypeMap[extension] || mime.getType(filePath) || 'image/jpeg';
  console.log('Detected MIME type:', mimeType);
  
  if (!fs.existsSync(filePath)) {
    throw new Error('File not found');
  }
  const data = fs.readFileSync(filePath).toString("base64");
  if (!data) {
    throw new Error('Failed to read file');
  }
  
  const result = { inlineData: { data, mimeType } };
  console.log('MIME type in result:', result.inlineData.mimeType);
  return result;
}

router.post('/analyze', upload.single('image'), async (req, res) => {
  try {
    const imageFile = req.file.path;
    console.log('Uploaded file:', req.file);
    
    const model = genAI.getGenerativeModel({ model: 'gemini-1.0-pro-vision-latest' });
    const image = fileToBase64(imageFile);

    console.log('Sending request to Gemini with MIME type:', image.inlineData.mimeType);

    const result = await model.generateContent([
      "Describe the content of this image in detail.",
      image
    ]);

    const response = await result.response;
    const text = response.text();

    fs.unlinkSync(imageFile); // Clean up uploaded file
    res.json({ description: text });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to analyze image' });
  }
});

export default router;
