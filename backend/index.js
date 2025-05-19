import express from 'express';
import multer from 'multer';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import mime from 'mime';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: 'uploads/' });

// Helper to convert file to base64 string
const fileToBase64 = (filePath) => {
  const data = fs.readFileSync(filePath);
  return data.toString('base64');
};

// Vision API wrapper
async function analyzeWithVisionAPI(base64Image, mimeType) {
  const visionURL = `https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_API_KEY}`;

  const requestBody = {
    requests: [
      {
        image: { content: base64Image },
        features: [
          { type: 'LABEL_DETECTION', maxResults: 10 },         // Object detection + tagging
          { type: 'TEXT_DETECTION' },                         // OCR
          { type: 'FACE_DETECTION' },                         // Face detection
          { type: 'SAFE_SEARCH_DETECTION' },                  // NSFW/moderation
        ],
      },
    ],
  };

  const response = await axios.post(visionURL, requestBody);
  return response.data.responses[0];
}

// Gemini API wrapper for advanced captioning and multilingual descriptions
async function analyzeWithGemini(base64Image, mimeType) {
  const geminiURL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const requestBody = {
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType,
              data: base64Image,
            },
          },
          {
            text: "Provide a detailed description of this image, generate accessibility-friendly alt text, and provide a caption in English and Spanish.",
          },
        ],
      },
    ],
  };

  const response = await axios.post(geminiURL, requestBody);
  return response.data.candidates[0].content.parts[0].text;
}

// Placeholder for emotion detection - stub example
function detectEmotions(faceAnnotations) {
  if (!faceAnnotations || faceAnnotations.length === 0) return [];

  return faceAnnotations.map((face, idx) => {
    // Using likelihood from Vision API face detection as rough proxy
    // Possible values: VERY_UNLIKELY, UNLIKELY, POSSIBLE, LIKELY, VERY_LIKELY
    // We'll mock emotion based on joyLikelihood
    const emotions = {
      joy: face.joyLikelihood,
      sorrow: face.sorrowLikelihood,
      anger: face.angerLikelihood,
      surprise: face.surpriseLikelihood,
    };
    return {
      faceIndex: idx,
      emotions,
    };
  });
}

// Basic product linking stub
function linkObjectsToProducts(labels) {
  // Here you’d typically call a product database or external API.
  // For demonstration, return dummy links for top 3 labels
  if (!labels) return [];
  return labels.slice(0, 3).map(label => ({
    object: label.description,
    confidence: label.score,
    productLink: `https://example.com/products/search?q=${encodeURIComponent(label.description)}`,
  }));
}

// API endpoint: analyze image(s)
app.post('/api/analyze', upload.array('images', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No images uploaded' });
    }

    const results = [];

    for (const file of req.files) {
      const filePath = file.path;
      const mimeType = mime.getType(filePath) || 'image/jpeg';
      const base64Image = fileToBase64(filePath);

      // Vision API Analysis
      const visionData = await analyzeWithVisionAPI(base64Image, mimeType);

      // Gemini Captioning
      const geminiDescription = await analyzeWithGemini(base64Image, mimeType);

      // Emotion detection from faces
      const emotions = detectEmotions(visionData.faceAnnotations);

      // Product linking
      const productLinks = linkObjectsToProducts(visionData.labelAnnotations);

      // Clean up temp file
      fs.unlinkSync(filePath);

      results.push({
        fileName: file.originalname,
        labels: visionData.labelAnnotations || [],
        textAnnotations: visionData.textAnnotations || [],
        faceAnnotations: visionData.faceAnnotations || [],
        safeSearchAnnotation: visionData.safeSearchAnnotation || {},
        geminiDescription,
        emotions,
        productLinks,
      });
    }

    res.json({ results });
  } catch (error) {
    console.error('Error processing images:', error.response?.data || error.message || error);
    res.status(500).json({ error: error.response?.data || error.message || 'Failed to analyze images' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
