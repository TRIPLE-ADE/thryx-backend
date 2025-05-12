const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const multer = require('multer');
const fs = require('fs');
const cors = require('cors');
const dotenv = require('dotenv');
const { GoogleGenAI } = require('@google/genai');
const os = require('os');

dotenv.config();

const app = express();

// Restricting CORS to trusted origins to prevent unauthorized cross-origin requests
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://ed-tech-steel.vercel.app',
  'https://ed-tech-6r0b.onrender.com'
];

app.use(cors({
  origin: function (origin, callback) {
    // Allowing requests with no origin enables API testing tools and server-to-server calls
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'], 
  credentials: true
}));

// Setting high payload limits to support large file uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Ensuring upload directory exists to avoid runtime errors during file writes
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Using a memory threshold to avoid server crashes due to high memory usage
const MEMORY_THRESHOLD = 0.8; // 80% usage
let useMemoryStorage = true;

// Dynamically choosing storage type to balance speed (memory) and stability (disk)
const shouldUseMemoryStorage = (fileSize) => {
  try {
    const freeMem = os.freemem();
    const totalMem = os.totalmem();
    const memoryUsageRatio = 1 - (freeMem / totalMem);
    // Logging for operational visibility and troubleshooting
    console.log(`Memory stats - Free: ${Math.round(freeMem/1024/1024)}MB, ` +
                `Total: ${Math.round(totalMem/1024/1024)}MB, ` +
                `Usage: ${Math.round(memoryUsageRatio * 100)}%`);
    // Avoiding memory storage for large files or high memory pressure to prevent OOM
    if (fileSize > 15 * 1024 * 1024 || memoryUsageRatio > MEMORY_THRESHOLD) {
      console.log('Using disk storage due to file size or memory pressure');
      return false;
    }
    return true;
  } catch (error) {
    // Fallback to disk storage if system info is unavailable, for safety
    console.error('Error checking memory:', error);
    return false;
  }
};

// Disk storage is used as a fallback to prevent memory exhaustion
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const memoryStorage = multer.memoryStorage(); // Used for speed when safe

// This middleware adapts storage type per request to optimize resource usage
const adaptiveUpload = (req, res, next) => {
  const contentLength = req.headers['content-length'] ? 
                        parseInt(req.headers['content-length']) : 0;
  useMemoryStorage = shouldUseMemoryStorage(contentLength);
  const upload = multer({
    storage: useMemoryStorage ? memoryStorage : storage,
    limits: {
      fileSize: 50 * 1024 * 1024,
      files: 1 
    }
  }).single('file');
  upload(req, res, function (err) {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: `Multer error: ${err.message}` });
    } else if (err) {
      return res.status(500).json({ error: `Unknown error: ${err.message}` });
    }
    next();
  });
};

// API key is loaded from env for security and flexibility
const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

// Keeping logger and static middleware for debugging and static asset serving
app.use(logger('dev'));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Performance monitoring is included to help diagnose slow requests and resource issues
const performanceMonitoring = (req, res, next) => {
  const startTime = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms - ${res.get('Content-Length') || 0}`);
    if (req.originalUrl.includes('/upload') && req.file) {
      console.log(`Upload details: File size=${req.file.size}, Storage=${useMemoryStorage ? 'Memory' : 'Disk'}`);
    }
  });
  next();
};
app.use(performanceMonitoring);

// This endpoint uses adaptive storage to maximize reliability and efficiency for uploads
app.post('/upload', adaptiveUpload, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    let tempFilePath;
    const { mimetype, originalname } = req.file;
    if (useMemoryStorage) {
      // Writing buffer to disk only when needed to interface with downstream APIs
      tempFilePath = path.join(uploadsDir, `temp-${Date.now()}-${originalname}`);
      fs.writeFileSync(tempFilePath, req.file.buffer);
    } else {
      tempFilePath = req.file.path;
    }
    // Timeout is enforced to avoid hanging on slow or unresponsive external APIs
    const uploadPromise = ai.files.upload({
      file: tempFilePath,
      config: { mimeType: mimetype, displayName: originalname },
    });
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Gemini API upload timeout')), 180000);
    });
    const uploadedFile = await Promise.race([uploadPromise, timeoutPromise]);
    fs.unlinkSync(tempFilePath); // Always clean up temp files to avoid disk bloat
    res.json({
      message: 'File uploaded to Gemini Files API',
      metadata: uploadedFile,
    });
  } catch (err) {
    // Error handling includes cleanup to prevent orphaned files
    console.error('Upload error:', err);
    res.status(500).json({ 
      error: 'File upload failed', 
      details: err.message,
      storageType: useMemoryStorage ? 'memory' : 'disk'
    });
    if (req.file && !useMemoryStorage && req.file.path) {
      try { fs.unlinkSync(req.file.path); } catch (e) { console.error('Failed to clean up file:', e); }
    }
  }
});

module.exports = app; // Exporting app for use by the server entry point