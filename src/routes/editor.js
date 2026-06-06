import { Router } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as store from '../storage/fileStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

router.get('/:siteId', asyncHandler(async (req, res) => {
  const { siteId } = req.params;
  if (!(await store.siteExists(siteId))) {
    return res.status(404).send('<h1>Site not found</h1>');
  }
  const meta = await store.getMeta(siteId);
  const editorHtml = path.join(__dirname, '..', '..', 'public', 'editor.html');
  res.sendFile(editorHtml);
}));

export default router;
