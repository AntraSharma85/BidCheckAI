import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initDatabase } from './server/db.js';
import apiRoutes from './server/routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Initialize SQLite database and seed defaults
initDatabase();
console.log('[BidCheck AI] SQLite database initialized and persisted at ./data/bidcheck.db');

// Intended website origins for CORS (Requirement D.2)
const allowedOrigins = [
  process.env.APP_URL,
  'http://localhost:3000',
  'http://127.0.0.1:3000'
].filter(Boolean);

const isOriginAllowed = (origin) => {
  // Allow non-browser requests, same-origin, or sandboxed iframe origin ("null")
  if (!origin || origin === 'null') return true;

  const cleanOrigin = origin.replace(/\/+$/, '');

  // Configured allowed origins (e.g. APP_URL)
  if (allowedOrigins.some(o => o && o.replace(/\/+$/, '') === cleanOrigin)) {
    return true;
  }

  // Any Google Cloud Run domain across all regions and subdomains (e.g. ais-dev-*, ais-pre-*, *.run.app)
  if (/^https?:\/\/([a-zA-Z0-9\-_]+\.)*run\.app(:\d+)?$/i.test(cleanOrigin)) {
    return true;
  }

  // Local development
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(cleanOrigin)) {
    return true;
  }

  // Google AI Studio preview embedding domains
  if (/^https?:\/\/([a-zA-Z0-9\-_]+\.)*(googleusercontent\.com|aistudio\.google\.com|google\.com)(:\d+)?$/i.test(cleanOrigin)) {
    return true;
  }

  return false;
};

const corsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Disposition', 'Content-Length']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(cookieParser());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Prevent unhandled async errors from crashing the server
process.on('uncaughtException', (err) => {
  console.error('[BidCheck AI Server] Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[BidCheck AI Server] Unhandled promise rejection:', reason);
});

// Mount API routes
app.use('/api', apiRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Catch-all for unhandled /api/* endpoints to ensure they ALWAYS return JSON, never HTML
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.path}` });
});

app.all('/api', (req, res) => {
  res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.path}` });
});

// Global Error Handler (for Multer file limits, invalid file types, etc.)
app.use((err, req, res, next) => {
  if (err.name === 'MulterError') {
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  if (err.message && err.message.includes('Invalid file type')) {
    return res.status(400).json({ error: err.message });
  }
  if (err.message && err.message.includes('CORS policy violation')) {
    return res.status(403).json({ error: err.message });
  }
  console.error('[BidCheck AI Server Error]', err);
  res.status(500).json({ error: err.message || 'Internal server error occurred.' });
});

// Setup Vite middleware for development or serve built static files in production
async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
    console.log('[BidCheck AI] Vite middleware mounted in development mode');
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[BidCheck AI] Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[BidCheck AI] Fatal startup error:', err);
  process.exit(1);
});
