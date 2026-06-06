import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as authService from '../services/auth.js';
import * as store from '../storage/index.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many login attempts. Try again in 15 minutes.' } },
});

router.post('/login/owner', loginLimiter, asyncHandler(async (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: { message: 'Password is required' } });
  }

  if (!authService.verifyOwnerPassword(password)) {
    console.warn(`[${new Date().toISOString()}] Failed owner login from ${req.ip}`);
    return res.status(401).json({ error: { message: 'Invalid password' } });
  }

  const token = authService.createToken({ role: 'owner', siteId: null }, '7d');
  authService.setAuthCookie(res, token);
  res.json({ success: true, role: 'owner' });
}));

router.post('/login/client', loginLimiter, asyncHandler(async (req, res) => {
  const { siteId, password } = req.body;
  if (!siteId || !password) {
    return res.status(400).json({ error: { message: 'siteId and password are required' } });
  }

  const meta = await store.getMeta(siteId);
  if (!meta) {
    return res.status(404).json({ error: { message: 'Site not found' } });
  }

  if (!meta.clientPasswordHash) {
    return res.status(403).json({ error: { message: 'Client access not configured for this site' } });
  }

  const valid = await authService.verifyPassword(password, meta.clientPasswordHash);
  if (!valid) {
    console.warn(`[${new Date().toISOString()}] Failed client login for site ${siteId} from ${req.ip}`);
    return res.status(401).json({ error: { message: 'Invalid password' } });
  }

  const token = authService.createToken({ role: 'client', siteId }, '24h');
  authService.setAuthCookie(res, token);
  res.json({ success: true, role: 'client', siteId });
}));

router.post('/logout', (req, res) => {
  authService.clearAuthCookie(res);
  res.json({ success: true });
});

router.get('/me', (req, res) => {
  const token = req.cookies?.cms_token;
  if (!token) {
    return res.json({ authenticated: false });
  }
  try {
    const user = authService.verifyToken(token);
    res.json({ authenticated: true, role: user.role, siteId: user.siteId });
  } catch {
    res.json({ authenticated: false });
  }
});

export default router;
