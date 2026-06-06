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
import { requireOwner } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { getStore } from './storage/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');
const app = express();
const PORT = process.env.PORT || 3500;

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({ credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '5mb' }));
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

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRouter);
app.use('/api/sites', sitesRouter);
app.use('/api/sites', publishRouter);
app.use('/api/sites', chatRouter);
app.use('/editor', editorRouter);

app.get('/login', (req, res) => {
  res.sendFile(path.join(publicDir, 'login.html'));
});

app.get('/login/:siteId', async (req, res) => {
  const { siteId } = req.params;
  const store = await getStore();
  if (!(await store.siteExists(siteId))) {
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
  .then(() => console.log('Storage initialized'))
  .catch(err => console.error('Storage init error:', err.message));

// Only listen when running directly (not on Vercel)
if (!process.env.VERCEL) {
  storageReady.then(() => {
    app.listen(PORT, () => {
      console.log(`Client CMS running on port ${PORT}`);
    });
  });
}

export default app;
