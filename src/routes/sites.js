import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as ctrl from '../controllers/sites.js';

const router = Router();

router.post('/ingest', asyncHandler(ctrl.ingestSite));
router.get('/:siteId', asyncHandler(ctrl.getSite));
router.get('/:siteId/content', asyncHandler(ctrl.getContent));
router.put('/:siteId/content', asyncHandler(ctrl.updateContent));
router.get('/:siteId/versions', asyncHandler(ctrl.listVersions));
router.post('/:siteId/rollback/:versionId', asyncHandler(ctrl.rollback));
router.get('/:siteId/preview', asyncHandler(ctrl.preview));

export default router;
