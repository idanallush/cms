import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireSiteAccess } from '../middleware/auth.js';
import { processChat } from '../services/aiChat.js';

const router = Router();

// Process AI chat message
router.post('/:siteId/chat', requireSiteAccess, asyncHandler(async (req, res) => {
  const { siteId } = req.params;
  const { message } = req.body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: { message: 'Message is required' } });
  }

  if (message.length > 2000) {
    return res.status(400).json({ error: { message: 'Message too long (max 2000 characters)' } });
  }

  try {
    const result = await processChat(siteId, message.trim());
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: { message: `AI chat error: ${err.message}` } });
  }
}));

export default router;
