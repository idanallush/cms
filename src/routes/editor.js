import { Router } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireSiteAccess } from '../middleware/auth.js';
import * as store from '../storage/fileStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

router.get('/:siteId', requireSiteAccess, asyncHandler(async (req, res) => {
  const { siteId } = req.params;
  if (!(await store.siteExists(siteId))) {
    return res.status(404).send('<h1>Site not found</h1>');
  }
  res.sendFile(path.join(__dirname, '..', '..', 'public', 'editor.html'));
}));

export default router;
