import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sitesRouter from './routes/sites.js';
import authRouter from './routes/auth.js';
import editorRouter from './routes/editor.js';
import publishRouter from './routes/publish.js';
import chatRouter from './routes/chat.js';
import uploadRouter from './routes/upload.js';
import formsRouter from './routes/forms.js';
import { requireOwner } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { getStore } from './storage/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');
const app = express();
const PORT = process.env.PORT || 3500;

app.set('trust proxy', 1);

const isProduction = process.env.NODE_ENV === 'production';
const allowedOrigins = process.env.CMS_URL
  ? [process.env.CMS_URL]
  : isProduction
    ? []
    : ['http://localhost:3500', 'http://127.0.0.1:3500'];

// ── Public endpoints FIRST (before helmet/global CORS that restrict origins) ──
// Forms endpoint needs permissive CORS for cross-origin POST from published sites
app.use('/api/public/forms',
  cors({ origin: true, methods: ['POST', 'OPTIONS'], maxAge: 86400 }),
  express.json({ limit: '50kb' }),
  formsRouter
);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
      connectSrc: ["'self'"],
      frameSrc: ["'self'"],
      frameAncestors: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false,
}));
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(publicDir));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

app.get('/', (req, res) => {
  res.redirect('/login');
});

let storageInitialized = false;

app.get('/health', async (req, res) => {
  if (!storageInitialized) {
    return res.status(503).json({ status: 'initializing', timestamp: new Date().toISOString() });
  }
  if (process.env.MONGODB_URI) {
    try {
      const mongo = await import('./storage/mongoStore.js');
      if (!mongo.isConnected()) {
        return res.status(503).json({ status: 'db_disconnected', timestamp: new Date().toISOString() });
      }
    } catch {
      return res.status(503).json({ status: 'db_error', timestamp: new Date().toISOString() });
    }
  }
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Public endpoint for login page to get site display info
app.get('/api/public/site/:siteId', async (req, res) => {
  const { siteId } = req.params;
  const store = await getStore();
  const meta = await store.getMeta(siteId);
  if (!meta) return res.status(404).json({ error: { message: 'Not found' } });
  res.json({ name: meta.name, clientDisplayName: meta.clientDisplayName });
});

app.use('/api/auth', authRouter);
app.use('/api/sites', sitesRouter);
app.use('/api/sites', publishRouter);
app.use('/api/sites', chatRouter);
app.use('/api/sites', uploadRouter);
app.use('/editor', editorRouter);

app.get('/login', (req, res) => {
  res.sendFile(path.join(publicDir, 'login.html'));
});

app.get('/login/:siteId', async (req, res) => {
  const { siteId } = req.params;
  const storeInstance = await getStore();
  if (!(await storeInstance.siteExists(siteId))) {
    return res.status(404).send('<h1>Site not found</h1>');
  }
  res.sendFile(path.join(publicDir, 'login.html'));
});

app.get('/dashboard', requireOwner, (req, res) => {
  res.sendFile(path.join(publicDir, 'dashboard.html'));
});

app.get('/logout', (req, res) => {
  res.clearCookie('cms_token', { path: '/' });
  res.redirect('/login');
});

app.use(errorHandler);

// Initialize storage (connects to MongoDB if MONGODB_URI is set)
const storageReady = getStore()
  .then(() => {
    storageInitialized = true;
    console.log('Storage initialized');
  })
  .catch(err => {
    console.error('Storage init error:', err.message);
    storageInitialized = true;
  });

// Only listen when running directly (not on Vercel)
if (!process.env.VERCEL) {
  storageReady.then(() => {
    app.listen(PORT, () => {
      console.log(`Client CMS running on port ${PORT}`);
    });
  });
}

export default app;
