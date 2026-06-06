import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireSiteAccess } from '../middleware/auth.js';
import { publishToVercel, getPublishStatus } from '../services/publisher.js';

const router = Router();

// Publish site to Vercel
router.post('/:siteId/publish', requireSiteAccess, asyncHandler(async (req, res) => {
  const { siteId } = req.params;

  const result = await publishToVercel(siteId);

  res.json({
    success: true,
    url: result.url,
    deploymentId: result.deploymentId,
    publishedAt: result.publishedAt,
  });
}));

// Get publish status
router.get('/:siteId/publish', requireSiteAccess, asyncHandler(async (req, res) => {
  const { siteId } = req.params;
  const status = await getPublishStatus(siteId);

  if (!status) {
    return res.status(404).json({ error: { message: 'Site not found' } });
  }

  res.json(status);
}));

export default router;
