import { Router } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireSiteAccess } from '../middleware/auth.js';
import { verifyToken } from '../services/auth.js';
import * as store from '../storage/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const editorFile = path.join(__dirname, '..', '..', 'public', 'editor.html');
const router = Router();

// New format: /editor/?site=xxx or /editor/?site=xxx&key=ownerKey
router.get('/', asyncHandler(async (req, res) => {
  const siteId = req.query.site;
  if (!siteId) {
    return res.sendFile(editorFile);
  }
  if (!(await store.siteExists(siteId))) {
    return res.status(404).send('<h1>Site not found</h1>');
  }

  // Check access token in query
  const queryToken = req.query.token;
  if (queryToken) {
    const meta = await store.getMeta(siteId);
    if (meta && meta.accessToken === queryToken) {
      // Mark client as having accessed
      await store.updateMeta(siteId, { clientHasAccessed: true });
      return res.sendFile(editorFile);
    }
  }

  // Legacy ?key= parameter removed for security (password in URL leaks to logs/history).
  // Owner auth uses cookie-based login only.
  if (req.query.key) {
    return res.redirect(`/login`);
  }

  // Fall back to cookie auth
  const token = req.cookies?.cms_token;
  if (!token) {
    return res.redirect(`/login/${siteId}`);
  }
  try {
    const user = verifyToken(token);
    if (user.role === 'owner' || user.siteId === siteId) {
      // If client role, mark as accessed
      if (user.role === 'client') {
        await store.updateMeta(siteId, { clientHasAccessed: true });
      }
      return res.sendFile(editorFile);
    }
  } catch {}

  return res.redirect(`/login/${siteId}`);
}));

// Old format backward compat: /editor/:siteId
router.get('/:siteId', requireSiteAccess, asyncHandler(async (req, res) => {
  const { siteId } = req.params;
  if (!(await store.siteExists(siteId))) {
    return res.status(404).send('<h1>Site not found</h1>');
  }
  // Redirect to new format
  res.redirect(`/editor/?site=${siteId}`);
}));

export default router;
