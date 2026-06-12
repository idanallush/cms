import { Router } from 'express';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import * as store from '../storage/index.js';

const router = Router();

// Rate limit: 10 submissions per IP per minute
const formLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  handler: (req, res) => {
    // Return 200 so bots don't learn rate limit behavior
    res.status(200).json({ ok: true });
  },
});

function hashIp(ip) {
  return crypto.createHash('sha256').update(ip || 'unknown').digest('hex').slice(0, 16);
}

// POST /api/public/forms/:siteId — public, no auth
router.post('/:siteId', formLimiter, async (req, res) => {
  try {
    const { siteId } = req.params;
    const body = req.body;

    // Basic validation
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Invalid body' });
    }

    const { fields, pageUrl } = body;

    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
      return res.status(400).json({ error: 'fields must be an object' });
    }

    // Max 30 fields
    const fieldKeys = Object.keys(fields);
    if (fieldKeys.length > 30) {
      return res.status(400).json({ error: 'Too many fields' });
    }

    // Truncate values, sanitize
    const cleanFields = {};
    for (const [key, val] of Object.entries(fields)) {
      const cleanKey = String(key).slice(0, 100);
      const cleanVal = String(val ?? '').slice(0, 2000);
      // Skip empty honeypot-named fields that are intentionally empty
      cleanFields[cleanKey] = cleanVal;
    }

    // Honeypot check: if _hp field has value, mark as spam
    const isSpam = !!cleanFields._hp;
    // Remove honeypot field from stored data
    delete cleanFields._hp;

    // Verify site exists
    if (!(await store.siteExists(siteId))) {
      // Return 200 even for invalid sites (don't leak site existence)
      return res.status(200).json({ ok: true });
    }

    await store.createSubmission({
      siteId,
      fields: cleanFields,
      pageUrl: String(pageUrl || '').slice(0, 500),
      ipHash: hashIp(req.ip),
      isSpam,
      isRead: false,
      createdAt: new Date(),
    });

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[forms.submit] Error:', err.message);
    // Always return 200 to not leak info
    res.status(200).json({ ok: true });
  }
});

export default router;
